"use client"

// mobile-final/page.tsx
// D-nature CMXF 모바일 UI — 미래지향적 미니멀 리디자인
//
// 화면 구조 (단일 스크롤):
//   [헤더]              — 앱명 + MQTT 상태 + 시각 (슬림)
//   [전체 공정 진행률]  — ProcessStatus
//   [하우징 밸브 P&ID]  — HousingValveMap SVG
//   [펌프 카드 그리드]  — PumpCards (3열)
//   [하단 고정]         — ControlBar (EMERGENCY STOP)
//
// MQTT / REST 로직은 기존과 100% 동일 유지

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import ProcessStatus from "./ProcessStatus"
import HousingValveMap from "./HousingValveMap"
import PumpCards from "./PumpCards"
import ControlBar from "./ControlBar"
import { ToastContainer, ToastItem, makeToastItem } from "./Toast"
import { AppState, InverterState, BoosterState, ProcessProgress, ValvePayload, ProcessMode } from "./types"
import { calcPipeFlows, unwrapN8n } from "./valve-flows"

// ============================================================
// 상수
// ============================================================
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://10.0.1.2:3000"
const POLL_MS  = 5000

const TOPICS = {
  VALVE_STATE:            "dnature/factory/zone1/valve/status/SIM_VALVE_01",
  INVERTER_STATE_GLOBAL:  "dnature/factory/zone1/inverter/state",
  PROCESS_PROGRESS:       "dnature/factory/zone1/inverter/progress",
  PROCESS_INPUT:          "dnature/factory/zone1/inverter/input",
  INVERTER_ERROR:         "dnature/factory/zone1/inverter/error",
  PUMP_SENSOR_WILDCARD:   "dnature/factory/zone1/pump/inverter+/sensor",
  PUMP_HEALTH_WILDCARD:   "dnature/factory/zone1/pump/inverter+/health",
  INVERTER_STATE:         (n: number) => `dnature/factory/zone1/pump/inverter${n}/state`,
  BOOSTER_STATE:          (n: number) => `dnature/factory/zone1/pump/booster${n}/state`,
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
// progress 파싱
// ============================================================
function parseProgress(raw: string): ProcessProgress | null {
  try {
    let json = JSON.parse(raw)
    if (typeof json.message === "string" && json.message.startsWith("{")) {
      json = JSON.parse(json.message)
    } else if (typeof json.payload === "string" && json.payload.startsWith("{")) {
      json = JSON.parse(json.payload)
    }
    const elapsed   = json.elapsed_time   != null ? parseFloat(String(json.elapsed_time))   : 0
    const remaining = json.remaining_time != null ? parseFloat(String(json.remaining_time)) : 0
    const total     = elapsed + remaining
    const pct       = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0

    // mode 파싱: "S" | "O" | "C" (없으면 undefined)
    const rawMode = json.mode ?? json.scenario_mode ?? json.process_mode
    const mode: ProcessMode | undefined =
      rawMode === "S" || rawMode === "O" || rawMode === "C" ? rawMode : undefined

    return {
      pct,
      processInfo:   json.process_info ?? json.message ?? json.status ?? "공정 실행 중",
      elapsedTime:   elapsed   > 0 ? elapsed   : undefined,
      remainingTime: remaining > 0 ? remaining : undefined,
      isRunning:     json.status === "running" || elapsed > 0,
      mode,
      rawMessage:    raw,
    }
  } catch {
    return null
  }
}

// ============================================================
// 헤더 (미니멀)
// ============================================================
function Header({
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
  const dotColor =
    mqttStatus === "connected"   ? "#22d3ee" :
    mqttStatus === "connecting"  ? "#fbbf24" :
    "#475569"

  const modeLabel = isManualMode
    ? "MANUAL"
    : currentValveMode >= 0
    ? `M${currentValveMode}`
    : null

  return (
    <div className="sticky top-0 z-40 border-b border-slate-800/40 bg-[#06080F]/90 px-4 py-2 backdrop-blur-lg">
      <div className="flex items-center justify-between">
        {/* 좌: 앱명 + 연결 도트 */}
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full transition-colors"
            style={{
              backgroundColor: dotColor,
              boxShadow: mqttStatus === "connected" ? `0 0 8px ${dotColor}60` : "none",
            }}
          />
          <span className="text-[13px] font-semibold tracking-tight text-slate-200">
            CMXF
          </span>
          {modeLabel && (
            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] font-medium text-slate-500">
              {modeLabel}
            </span>
          )}
        </div>

        {/* 우: 시각 */}
        <span className="font-mono text-[11px] tabular-nums text-slate-600">
          {currentTime}
        </span>
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
  const [toasts, setToasts]  = useState<ToastItem[]>([])
  const [extractionPct, setExtractionPct] = useState(0)
  const [housingPct, setHousingPct] = useState(0)

  const mqttRef = useRef<ReturnType<typeof import("./mqtt-ws-client")["getMqttClient"]> | null>(null)

  // ── 시각 업데이트 ──────────────────────────────────────────
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

  // ── REST API 폴링 보조 ────────────────────────────────────
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

  // ── extraction-engine / job-engine 폴링 (3s) ────────────
  useEffect(() => {
    const pollProgress = async () => {
      try {
        const [exR, jbR] = await Promise.all([
          fetch(`${API_BASE}/api/v1/extraction-engine`, { cache: "no-store" }),
          fetch(`${API_BASE}/api/v1/job-engine`,        { cache: "no-store" }),
        ])
        if (exR.ok) {
          const ex = await exR.json()
          const p = ex.progress ?? ex.data?.progress
          if (p != null) setExtractionPct(Math.min(100, Math.max(0, Number(p))))
        }
        if (jbR.ok) {
          const jb = await jbR.json()
          const p = jb.progress ?? jb.data?.progress
          if (p != null) setHousingPct(Math.min(100, Math.max(0, Number(p))))
        }
      } catch { /* 네트워크 오류 무시 */ }
    }
    pollProgress()
    const tid = setInterval(pollProgress, 3000)
    return () => clearInterval(tid)
  }, [])

  // ── MQTT 핸들러 ───────────────────────────────────────────
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

  const handleSensor = useCallback((id: number, raw: string) => {
    try {
      const d = JSON.parse(raw)
      // d = { full, empty, level, filling, fill_sec }
      const level = d.level != null ? parseFloat(String(d.level)) : NaN
      if (!isNaN(level)) {
        setState((prev) => ({
          ...prev,
          inverters: prev.inverters.map((inv) =>
            inv.id === id ? { ...inv, tankLevel: Math.min(100, Math.max(0, level)) } : inv
          ),
        }))
      }
    } catch { /* JSON 파싱 실패 — 무시 */ }
  }, [])

  const handleBoosterState = useCallback((id: 1 | 2, raw: string) => {
    let isOn = false
    try {
      const j = JSON.parse(raw)
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

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleMessage = useCallback(
    (topic: string, message: string) => {
      // 밸브 상태
      if (topic === TOPICS.VALVE_STATE) { handleValveState(message); return }

      // 인버터 마스터 상태 (inverter/state) — JSON 파싱 → ProcessProgress 업데이트
      if (topic === TOPICS.INVERTER_STATE_GLOBAL) {
        try {
          const d = JSON.parse(message)
          // 서버 응답 메시지 (reset 확인 등) — { msg, timestamp } 형식이면 무시
          if (d.msg !== undefined && d.active === undefined) return
          // d = { active, pump, mode, repeat_cur, repeat_max, paused, queue }
          const isRunning = d.active === true || d.active === 1
          const rawMode = d.mode
          const mode: import("./types").ProcessMode | undefined =
            rawMode === "S" || rawMode === "O" || rawMode === "C" || rawMode === "U"
              ? rawMode
              : undefined
          setState((prev) => {
            // 새 공정 시작(idle→running 전환)이면 pct 0으로 리셋, 아니면 이전 값 유지
            const prevRunning = prev.progress?.isRunning ?? false
            const pct = (isRunning && !prevRunning) ? 0 : (prev.progress?.pct ?? 0)
            return {
              ...prev,
              progress: {
                pct,
                processInfo: isRunning
                  ? `공정 실행 중 (펌프 ${d.pump ?? "?"}, ${d.repeat_cur ?? 0}/${d.repeat_max ?? 0}회)`
                  : "유휴",
                isRunning,
                mode,
                rawMessage: message,
              },
            }
          })
        } catch { /* JSON 파싱 실패 — 무시 */ }
        return
      }

      // 개별 인버터 펌프 상태
      const stateMatch = topic.match(/pump\/inverter(\d+)\/state$/)
      if (stateMatch) { handleInverterState(parseInt(stateMatch[1], 10), message); return }

      // 수위 센서 (와일드카드 PUMP_SENSOR_WILDCARD → inverterN/sensor)
      const sensorMatch = topic.match(/pump\/inverter(\d+)\/sensor$/)
      if (sensorMatch) { handleSensor(parseInt(sensorMatch[1], 10), message); return }

      // 건강 상태 (와일드카드 PUMP_HEALTH_WILDCARD → inverterN/health)
      const healthMatch = topic.match(/pump\/inverter(\d+)\/health$/)
      if (healthMatch) {
        const n = parseInt(healthMatch[1], 10)
        try {
          const d = JSON.parse(message)
          const healthMode: import("./types").InverterHealth["mode"] =
            d.mode === "wifi" || d.mode === "ble_only" || d.mode === "offline"
              ? d.mode
              : "offline"
          setState((prev) => ({
            ...prev,
            inverters: prev.inverters.map((inv) =>
              inv.id === n ? { ...inv, health: { mode: healthMode } } : inv
            ),
          }))
        } catch { /* JSON 파싱 실패 — 무시 */ }
        return
      }

      const boosterMatch = topic.match(/pump\/booster(\d+)\/state$/)
      if (boosterMatch) {
        handleBoosterState(parseInt(boosterMatch[1], 10) as 1 | 2, message)
        return
      }

      // 인버터 에러 — toast 알림 (최대 3개 스택)
      if (topic === TOPICS.INVERTER_ERROR) {
        const item = makeToastItem(message)
        setToasts((prev) => [item, ...prev].slice(0, 3))
        return
      }

      // 공정 진행률
      if (topic === TOPICS.PROCESS_PROGRESS) {
        const p = parseProgress(message)
        if (p) setState((prev) => ({ ...prev, progress: p }))
      }
    },
    [handleValveState, handleInverterState, handleSensor, handleBoosterState]
  )

  // ── MQTT 클라이언트 초기화 ────────────────────────────────
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
          client.subscribe(TOPICS.VALVE_STATE)
          for (let n = 1; n <= INVERTER_COUNT; n++) {
            client.subscribe(TOPICS.INVERTER_STATE(n))
          }
          client.subscribe(TOPICS.PUMP_SENSOR_WILDCARD)
          client.subscribe(TOPICS.PUMP_HEALTH_WILDCARD)
          client.subscribe(TOPICS.BOOSTER_STATE(1))
          client.subscribe(TOPICS.BOOSTER_STATE(2))
          client.subscribe(TOPICS.INVERTER_STATE_GLOBAL)
          client.subscribe(TOPICS.PROCESS_PROGRESS)
          client.subscribe(TOPICS.INVERTER_ERROR)
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

  // ── 긴급정지 ──────────────────────────────────────────────
  const handleEmergencyConfirm = useCallback(() => {
    const client = mqttRef.current
    if (client) {
      client.publish(TOPICS.PROCESS_INPUT, JSON.stringify({ command: "sr" }))
    }
    setEmergencyDone(true)
    setTimeout(() => setEmergencyDone(false), 4000)
  }, [])

  // ── 파이프 흐름 ───────────────────────────────────────────
  const pipeFlows = useMemo(
    () => calcPipeFlows(state.valveRelayState, state.boosters.some((b) => b.isOn)),
    [state.valveRelayState, state.boosters]
  )

  const mqttConnected = state.mqttStatus === "connected"

  return (
    <div className="min-h-screen bg-[#06080F] pb-24 text-slate-100">

      {/* 글로벌 스타일 */}
      <style jsx global>{`
        .glass-card {
          background: rgba(15, 23, 42, 0.5);
          border: 1px solid rgba(148, 163, 184, 0.06);
          border-radius: 16px;
          backdrop-filter: blur(12px);
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* 인버터 에러 toast 알림 */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* 긴급정지 토스트 */}
      {emergencyDone && (
        <div className="fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-xl border border-red-800/40 bg-red-950/90 px-5 py-2 font-mono text-[12px] font-semibold text-red-300 shadow-2xl backdrop-blur-lg">
          EMERGENCY STOP SENT
        </div>
      )}

      {/* 헤더 */}
      <Header
        mqttStatus={state.mqttStatus}
        currentTime={currentTime}
        isManualMode={state.isManualMode}
        currentValveMode={state.currentValveMode}
      />

      {/* 메인 콘텐츠 */}
      <main className="space-y-3 px-3 pt-3">
        <ProcessStatus
          progress={state.progress}
          inverters={state.inverters}
          boosters={state.boosters}
          extractionPct={extractionPct}
          housingPct={housingPct}
        />

        <HousingValveMap
          relayState={state.valveRelayState}
          pipeFlows={pipeFlows}
        />

        <PumpCards
          inverters={state.inverters}
          boosters={state.boosters}
        />
      </main>

      {/* 하단 긴급정지 */}
      <ControlBar
        mqttConnected={mqttConnected}
        onEmergencyStop={handleEmergencyConfirm}
      />
    </div>
  )
}
