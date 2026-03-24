"use client"

// page.tsx (SSE 버전)
// MQTT WebSocket → SSE(/api/v1/events) + REST API 제어로 전환
// 외부(devtunnel :3000)에서도 실시간 데이터 수신 + 제어 가능

import { useState, useEffect, useCallback, useMemo } from "react"
import ProcessStatus from "./ProcessStatus"
import HousingValveMap from "./HousingValveMap"
import PumpCards from "./PumpCards"
import ControlBar from "./ControlBar"
import { AppState, InverterState, BoosterState, ProcessProgress, ValvePayload } from "./types"
import { calcPipeFlows, unwrapN8n } from "./valve-flows"

// ── 상수 ────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://10.0.1.2:3000"
const POLL_MS  = 5000

const INVERTER_COUNT = 6
const EMPTY_RELAY    = [0, 0, 0, 0, 0, 0, 0, 0]

// ── 초기 상태 ────────────────────────────────────────────────
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

// ── progress 파싱 ────────────────────────────────────────────
function parseProgress(raw: string): ProcessProgress | null {
  try {
    let json = JSON.parse(raw)
    if (typeof json.message === "string" && json.message.startsWith("{")) json = JSON.parse(json.message)
    else if (typeof json.payload === "string" && json.payload.startsWith("{")) json = JSON.parse(json.payload)
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
  } catch { return null }
}

// ── REST API 헬퍼 ────────────────────────────────────────────
async function apiPost(path: string, body: object): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return r.ok
  } catch { return false }
}

// ── 상태 헤더 ────────────────────────────────────────────────
function StatusHeader({
  mqttStatus, currentTime, isManualMode, currentValveMode,
}: {
  mqttStatus: AppState["mqttStatus"]
  currentTime: string
  isManualMode: boolean
  currentValveMode: number
}) {
  const dot =
    mqttStatus === "connected"    ? "bg-emerald-500"
    : mqttStatus === "connecting" ? "bg-yellow-500 animate-pulse"
    : "bg-red-500"
  const statusLabel =
    mqttStatus === "connected"    ? "실시간 연결됨"
    : mqttStatus === "connecting" ? "연결 중"
    : "연결 끊김"
  const modeLabel = isManualMode ? "수동 제어" : currentValveMode >= 0 ? `모드 ${currentValveMode}` : "—"

  return (
    <div className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 px-4 py-2.5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <div>
            <span className="text-[13px] font-black text-slate-100">D-nature CMXF</span>
            <span className={`ml-2 text-[10px] ${mqttStatus === "connected" ? "text-emerald-400" : "text-slate-500"}`}>
              {statusLabel}
            </span>
          </div>
        </div>
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

// ── 메인 페이지 ─────────────────────────────────────────────
export default function MobileFinalPage() {
  const [state, setState]      = useState<AppState>(makeInitialState)
  const [currentTime, setTime] = useState("")
  const [emergencyDone, setEmergencyDone] = useState(false)

  // ── 시각 업데이트 ──────────────────────────────────────────
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── REST 폴링 보조 (5초) ───────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/tank-data`, { cache: "no-store" })
        if (!r.ok) return
        const d = await r.json()
        const tanks: { id: number; level?: number; pumpStatus?: string }[] = d.tanks ?? []
        if (!tanks.length) return
        setState(prev => ({
          ...prev,
          inverters: prev.inverters.map(inv => {
            const t = tanks.find(x => x.id === inv.id)
            if (!t) return inv
            return { ...inv, tankLevel: t.level ?? inv.tankLevel, pumpStatus: t.pumpStatus ?? inv.pumpStatus }
          }),
        }))
      } catch { /* 무시 */ }
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [])

  // ── SSE 메시지 핸들러 ──────────────────────────────────────
  const handleMessage = useCallback((topic: string, payload: string) => {
    // 밸브 상태
    if (topic.includes("valve/status/")) {
      const parsed = unwrapN8n(payload)
      if (!parsed || typeof parsed !== "object") return
      const p = parsed as ValvePayload
      setState(prev => ({
        ...prev,
        valveRelayState:  Array.isArray(p.relay_state) ? p.relay_state.slice(0, 8) : prev.valveRelayState,
        currentValveMode: p.current_valve_mode ?? prev.currentValveMode,
        isManualMode:     p.relay_mode === "manual" || p.current_valve_mode === -1,
      }))
      return
    }

    // 인버터 상태
    const stateMatch = topic.match(/pump\/inverter(\d+)\/state$/)
    if (stateMatch) {
      let status = payload.trim()
      try { const j = JSON.parse(payload); if (typeof j.message === "string") status = j.message.trim() } catch {}
      const id = parseInt(stateMatch[1], 10)
      setState(prev => ({ ...prev, inverters: prev.inverters.map(inv => inv.id === id ? { ...inv, pumpStatus: status } : inv) }))
      return
    }

    // 탱크 수위
    const levelMatch = topic.match(/pump\/inverter(\d+)\/tank\d+_level$/)
    if (levelMatch) {
      let value = payload.trim()
      try { const j = JSON.parse(payload); if (typeof j.message === "string") value = j.message.trim() } catch {}
      const level = parseFloat(value)
      const id = parseInt(levelMatch[1], 10)
      if (!isNaN(level)) {
        setState(prev => ({ ...prev, inverters: prev.inverters.map(inv => inv.id === id ? { ...inv, tankLevel: Math.min(100, Math.max(0, level)) } : inv) }))
      }
      return
    }

    // 부스터 상태
    const boosterMatch = topic.match(/pump\/booster(\d+)\/state$/)
    if (boosterMatch) {
      let isOn = false
      try {
        const j = JSON.parse(payload)
        const inner = typeof j.message === "string" ? JSON.parse(j.message) : j
        isOn = inner.power === "ON" || inner.power === 1 || inner.power === true
      } catch { isOn = payload.trim() === "ON" }
      const id = parseInt(boosterMatch[1], 10)
      setState(prev => ({ ...prev, boosters: prev.boosters.map(b => b.id === id ? { ...b, isOn } : b) }))
      return
    }

    // 공정 진행
    if (topic.includes("inverter/output") || topic.includes("inverter/progress")) {
      const p = parseProgress(payload)
      if (p) setState(prev => ({ ...prev, progress: p }))
    }
  }, [])

  // ── SSE 연결 ───────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    import("./sse-client").then(({ getMqttClient }) => {
      if (!mounted) return
      const client = getMqttClient()

      const onStatus = (s: "connected" | "connecting" | "disconnected") => {
        if (!mounted) return
        setState(prev => ({ ...prev, mqttStatus: s }))
      }

      client.onStatus(onStatus)
      client.onMessage(handleMessage)

      setState(prev => ({ ...prev, mqttStatus: "connecting" }))
      client.connect()

      return () => {
        mounted = false
        client.offStatus(onStatus)
        client.offMessage(handleMessage)
      }
    })

    return () => { mounted = false }
  }, [handleMessage])

  // ── 부스터 제어 (REST) ─────────────────────────────────────
  const handleBoosterToggle = useCallback(async (id: number, nextOn: boolean) => {
    await apiPost("/api/v1/commands/pump", { type: "booster", id, power: nextOn ? "ON" : "OFF" })
  }, [])

  // ── 긴급정지 (REST) ────────────────────────────────────────
  const handleEmergencyConfirm = useCallback(async () => {
    await apiPost("/api/v1/commands/emergency-stop", { operator: "mobile", reason: "모바일 긴급정지" })
    setEmergencyDone(true)
    setTimeout(() => setEmergencyDone(false), 4000)
  }, [])

  // ── 파이프 흐름 계산 ───────────────────────────────────────
  const pipeFlows = useMemo(
    () => calcPipeFlows(state.valveRelayState, state.boosters.some(b => b.isOn)),
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

      <StatusHeader
        mqttStatus={state.mqttStatus}
        currentTime={currentTime}
        isManualMode={state.isManualMode}
        currentValveMode={state.currentValveMode}
      />

      <main className="space-y-4 px-3 pt-3">
        <ProcessStatus
          progress={state.progress}
          inverters={state.inverters}
          boosters={state.boosters}
        />
        <HousingValveMap
          relayState={state.valveRelayState}
          pipeFlows={pipeFlows}
        />
        <PumpCards
          inverters={state.inverters}
          boosters={state.boosters}
          onBoosterToggle={handleBoosterToggle}
        />
      </main>

      <ControlBar
        mqttConnected={mqttConnected}
        onEmergencyStop={handleEmergencyConfirm}
      />
    </div>
  )
}
