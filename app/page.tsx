"use client"

// mobile-final/page.tsx
// D-nature CMXF 모바일 UI — 완전 재구축 버전
//
// 화면 구조 (단일 스크롤):
//   [헤더]              — MQTT 연결 상태 + 현재 시각
//   [전체 공정 진행률]  — ProcessStatus (전체 바 + 순환추출/하우징 게이지)
//   [하우징 밸브 P&ID]  — HousingValveMap SVG 미니맵
//   [인버터/부스터 카드] — PumpCards (2열 그리드)
//   [하단 고정]         — ControlBar (EMERGENCY STOP)
//
// MQTT 토픽:
//   구독: valve/set_valve/SIM_VALVE_01, pump/inverterN/state, pump/inverterN/tankN_level
//         pump/boosterN/state, inverter/output, inverter/progress
//   발행: inverter/input  { command: "sr" }
//
// 데이터 전략:
//   - MQTT WebSocket 직접 구독 (mqtt-ws-client.ts 싱글톤)
//   - REST API 폴링 보조 (5초, /api/tank-data 폴백)

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import ProcessStatus from "./ProcessStatus"
import HousingValveMap from "./HousingValveMap"
import PumpCards from "./PumpCards"
import ControlBar from "./ControlBar"
import { AppState, InverterState, BoosterState, ProcessProgress, ValvePayload } from "./types"
import { calcPipeFlows, unwrapN8n } from "./valve-flows"

// ============================================================
// 상수
// ============================================================
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://10.0.1.2:3000"
const POLL_MS  = 5000

const TOPICS = {
  // 밸브 상태는 status 토픽에서 수신 (set_valve 는 명령 발행용)
  VALVE_STATE:      "dnature/factory/zone1/valve/status/SIM_VALVE_01",
  PROCESS_OUTPUT:   "dnature/factory/zone1/inverter/output",
  PROCESS_PROGRESS: "dnature/factory/zone1/inverter/progress",
  PROCESS_INPUT:    "dnature/factory/zone1/inverter/input",
  INVERTER_STATE:   (n: number) => `dnature/factory/zone1/pump/inverter${n}/state`,
  INVERTER_LEVEL:   (n: number) => `dnature/factory/zone1/pump/inverter${n}/tank${n}_level`,
  BOOSTER_STATE:    (n: number) => `dnature/factory/zone1/pump/booster${n}/state`,
}

const INVERTER_COUNT = 6
const EMPTY_RELAY    = [0, 0, 0, 0, 0, 0, 0, 0]

// ============================================================
// 초기 상태
// ============================================================
function makeInitialState(): AppState {
  return {
    mqttStatus:       "disconnected",
    valveRelayState:  [...EMPTY_RELAY],
    currentValveMode: -1,
    isManualMode:     false,
    inverters: Array.from({ length: INVERTER_COUNT }, (_, i) => ({
      id:         i + 1,
      pumpStatus: "OFF",
      tankLevel:  0,
    })),
    boosters: [
      { id: 1, isOn: false },
      { id: 2, isOn: false },
    ],
    progress: null,
  }
}

// ============================================================
// progress 파싱 — n8n 이중 래핑 자동 해제 후 파싱
// ============================================================
function parseProgress(raw: string): ProcessProgress | null {
  try {
    // unwrapN8n 은 valve-flows.ts 의 공통 함수이며 모듈 최상단에서 import 됨
    // 여기서는 직접 inline 해제 (parseProgress 는 순수 함수 유지)
    let json = JSON.parse(raw)
    // n8n 이중 래핑 해제: { topic, message: "..." } 또는 { topic, payload: "..." }
    if (typeof json.message === "string" && json.message.startsWith("{")) {
      json = JSON.parse(json.message)
    } else if (typeof json.payload === "string" && json.payload.startsWith("{")) {
      json = JSON.parse(json.payload)
    }
    const elapsed   = json.elapsed_time   != null ? parseFloat(String(json.elapsed_time))   : 0
    const remaining = json.remaining_time != null ? parseFloat(String(json.remaining_time)) : 0
    const total     = elapsed + remaining
    const pct       = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0

    return {
      pct,
      processInfo:   json.process_info ?? json.message ?? json.status ?? "공정 실행 중",
      elapsedTime:   elapsed   > 0 ? elapsed   : undefined,
      remainingTime: remaining > 0 ? remaining : undefined,
      isRunning:     json.status === "running" || elapsed > 0,
      rawMessage:    raw,
    }
  } catch {
    return null
  }
}

// ============================================================
// 상태 헤더
// ============================================================
function StatusHeader({
  mqttStatus,
  currentTime,
  isManualMode,
  currentValveMode,
}: {
  mqttStatus: AppState["mqttStatus"]
  currentTime: string
  isManualMode: boolean
  currentValveMode: number
}) {
  const dot =
    mqttStatus === "connected"
      ? "bg-emerald-500"
      : mqttStatus === "connecting"
      ? "bg-yellow-500 animate-pulse"
      : "bg-red-500"

  const statusLabel =
    mqttStatus === "connected"
      ? "연결됨"
      : mqttStatus === "connecting"
      ? "연결 중"
      : "연결 끊김"

  const modeLabel = isManualMode
    ? "수동 제어"
    : currentValveMode >= 0
    ? `모드 ${currentValveMode}`
    : "—"

  return (
    <div className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        {/* 좌측: 앱 제목 + MQTT 상태 */}
        <div className="flex items-center gap-2.5">
          <div className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <div>
            <span className="text-[13px] font-black text-slate-100">D-nature CMXF</span>
            <span className={`ml-2 text-[10px] ${
              mqttStatus === "connected" ? "text-emerald-400" : "text-slate-500"
            }`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* 우측: 밸브 모드 + 시각 */}
        <div className="flex items-center gap-3">
          {isManualMode && (
            <span className="rounded-md bg-amber-900/50 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              {modeLabel}
            </span>
          )}
          <span className="font-mono text-[11px] text-slate-500">{currentTime}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 메인 페이지
// ============================================================
export default function MobileFinalPage() {
  const [state, setState]    = useState<AppState>(makeInitialState)
  const [currentTime, setTime] = useState("")
  const [emergencyDone, setEmergencyDone] = useState(false)

  // MQTT 클라이언트는 클라이언트 사이드에서만 임포트
  const mqttRef = useRef<ReturnType<typeof import("./mqtt-ws-client")["getMqttClient"]> | null>(null)

  // ── 시각 업데이트 (1초) ──────────────────────────────────────
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        })
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── REST API 폴링 보조 (5초) ────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/tank-data`, { cache: "no-store" })
        if (!r.ok) return
        const d = await r.json()
        const tanks: { id: number; level?: number; pumpStatus?: string }[] = d.tanks ?? []
        if (tanks.length === 0) return
        setState((prev) => ({
          ...prev,
          inverters: prev.inverters.map((inv) => {
            const t = tanks.find((x) => x.id === inv.id)
            if (!t) return inv
            return {
              ...inv,
              tankLevel:  t.level     ?? inv.tankLevel,
              pumpStatus: t.pumpStatus ?? inv.pumpStatus,
            }
          }),
        }))
      } catch {
        // 네트워크 오류 무시
      }
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  // ── MQTT 핸들러 ─────────────────────────────────────────────
  const handleValveState = useCallback((raw: string) => {
    const parsed = unwrapN8n(raw)
    if (!parsed || typeof parsed !== "object") return
    const p = parsed as ValvePayload
    const isManual     = p.relay_mode === "manual" || p.current_valve_mode === -1
    const relayState   = Array.isArray(p.relay_state) ? p.relay_state.slice(0, 8) : [...EMPTY_RELAY]
    setState((prev) => ({
      ...prev,
      valveRelayState:  relayState,
      currentValveMode: p.current_valve_mode ?? prev.currentValveMode,
      isManualMode:     isManual,
    }))
  }, [])

  const handleInverterState = useCallback((id: number, raw: string) => {
    // n8n 이중 래핑: {"topic":"...","message":"1"} → "1"
    let status = raw.trim()
    try {
      const j = JSON.parse(raw)
      if (typeof j.message === "string") status = j.message.trim()
    } catch { /* 래핑 없는 단순 문자열 */ }
    setState((prev) => ({
      ...prev,
      inverters: prev.inverters.map((inv) =>
        inv.id === id ? { ...inv, pumpStatus: status } : inv
      ),
    }))
  }, [])

  const handleTankLevel = useCallback((id: number, raw: string) => {
    // n8n 이중 래핑: {"topic":"...","message":"채워지는중"} → 문자열 수위 처리
    let value = raw.trim()
    try {
      const j = JSON.parse(raw)
      if (typeof j.message === "string") value = j.message.trim()
    } catch { /* 래핑 없는 단순 문자열 */ }
    const level = parseFloat(value)
    if (!isNaN(level)) {
      setState((prev) => ({
        ...prev,
        inverters: prev.inverters.map((inv) =>
          inv.id === id ? { ...inv, tankLevel: Math.min(100, Math.max(0, level)) } : inv
        ),
      }))
    }
    // "채워지는중" 같은 문자열 수위는 현재 숫자 변환 불가 → 무시 (REST 폴링으로 보완)
  }, [])

  const handleBoosterState = useCallback((id: 1 | 2, raw: string) => {
    // n8n 부스터 state 형식: {"device_id":"booster1","power":"ON","connected":true,...}
    let isOn = false
    try {
      const j = JSON.parse(raw)
      // 직접 JSON 또는 이중 래핑 모두 처리
      const inner = typeof j.message === "string" ? JSON.parse(j.message) : j
      isOn = inner.power === "ON" || inner.power === 1 || inner.power === true
    } catch {
      isOn = raw.trim() === "ON"
    }
    setState((prev) => ({
      ...prev,
      boosters: prev.boosters.map((b) =>
        b.id === id ? { ...b, isOn } : b
      ),
    }))
  }, [])

  const handleMessage = useCallback(
    (topic: string, message: string) => {
      if (topic === TOPICS.VALVE_STATE) { handleValveState(message); return }

      const stateMatch = topic.match(/pump\/inverter(\d+)\/state$/)
      if (stateMatch) { handleInverterState(parseInt(stateMatch[1], 10), message); return }

      const levelMatch = topic.match(/pump\/inverter(\d+)\/tank\d+_level$/)
      if (levelMatch) { handleTankLevel(parseInt(levelMatch[1], 10), message); return }

      const boosterMatch = topic.match(/pump\/booster(\d+)\/state$/)
      if (boosterMatch) {
        handleBoosterState(parseInt(boosterMatch[1], 10) as 1 | 2, message)
        return
      }

      if (topic === TOPICS.PROCESS_OUTPUT || topic === TOPICS.PROCESS_PROGRESS) {
        const p = parseProgress(message)
        if (p) setState((prev) => ({ ...prev, progress: p }))
      }
    },
    [handleValveState, handleInverterState, handleTankLevel, handleBoosterState]
  )

  // ── MQTT 클라이언트 초기화 (클라이언트 사이드) ─────────────────
  useEffect(() => {
    let mounted = true

    import("./mqtt-ws-client").then(({ getMqttClient }) => {
      if (!mounted) return
      const client = getMqttClient()
      mqttRef.current = client

      const onStatus = (status: "connected" | "connecting" | "disconnected") => {
        if (!mounted) return
        setState((prev) => ({ ...prev, mqttStatus: status }))

        if (status === "connected") {
          // 전체 토픽 구독
          client.subscribe(TOPICS.VALVE_STATE)
          for (let n = 1; n <= INVERTER_COUNT; n++) {
            client.subscribe(TOPICS.INVERTER_STATE(n))
            client.subscribe(TOPICS.INVERTER_LEVEL(n))
          }
          client.subscribe(TOPICS.BOOSTER_STATE(1))
          client.subscribe(TOPICS.BOOSTER_STATE(2))
          client.subscribe(TOPICS.PROCESS_OUTPUT)
          client.subscribe(TOPICS.PROCESS_PROGRESS)
        }
      }

      client.onStatus(onStatus)
      client.onMessage(handleMessage)

      if (client.getStatus() === "disconnected") {
        setState((prev) => ({ ...prev, mqttStatus: "connecting" }))
        client.connect()
      } else {
        setState((prev) => ({ ...prev, mqttStatus: client.getStatus() }))
      }

      return () => {
        mounted = false
        client.offStatus(onStatus)
        client.offMessage(handleMessage)
      }
    })

    return () => { mounted = false }
  }, [handleMessage])

  // ── 부스터 펌프 ON/OFF 토글 ─────────────────────────────────
  const handleBoosterToggle = useCallback((id: number, nextOn: boolean) => {
    const client = mqttRef.current
    if (!client) return
    const topic = `dnature/factory/zone1/pump/booster${id}/command`
    client.publish(topic, JSON.stringify({ power: nextOn ? "ON" : "OFF" }))
  }, [])

  // ── 긴급정지 ────────────────────────────────────────────────
  // ControlBar 홀드 3초 완료 시 직접 호출됨 (모달 없음)
  const handleEmergencyConfirm = useCallback(() => {
    const client = mqttRef.current
    if (client) {
      client.publish(TOPICS.PROCESS_INPUT, JSON.stringify({ command: "sr" }))
    }
    setEmergencyDone(true)
    setTimeout(() => setEmergencyDone(false), 4000)
  }, [])

  // ── 파이프 흐름 계산 (메모이제이션) ──────────────────────────
  const pipeFlows = useMemo(
    () => calcPipeFlows(state.valveRelayState, state.boosters.some((b) => b.isOn)),
    [state.valveRelayState, state.boosters]
  )

  const mqttConnected = state.mqttStatus === "connected"

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-100">

      {/* 긴급정지 완료 토스트 */}
      {emergencyDone && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl border border-red-700 bg-red-900/90 px-5 py-2.5 text-sm font-bold text-red-200 shadow-xl">
          긴급정지 명령 전송 완료
        </div>
      )}

      {/* ── 헤더 ── */}
      <StatusHeader
        mqttStatus={state.mqttStatus}
        currentTime={currentTime}
        isManualMode={state.isManualMode}
        currentValveMode={state.currentValveMode}
      />

      {/* ── 메인 콘텐츠 ── */}
      <main className="space-y-4 px-3 pt-3">

        {/* 1. 공정 진행 상태 */}
        <ProcessStatus
          progress={state.progress}
          inverters={state.inverters}
          boosters={state.boosters}
        />

        {/* 2. 하우징 밸브 P&ID 미니맵 */}
        <HousingValveMap
          relayState={state.valveRelayState}
          pipeFlows={pipeFlows}
        />

        {/* 3. 인버터 + 부스터 펌프 카드 */}
        <PumpCards
          inverters={state.inverters}
          boosters={state.boosters}
          onBoosterToggle={handleBoosterToggle}
        />

      </main>

      {/* ── 하단 고정 긴급정지 ── */}
      <ControlBar
        mqttConnected={mqttConnected}
        onEmergencyStop={handleEmergencyConfirm}
      />
    </div>
  )
}
