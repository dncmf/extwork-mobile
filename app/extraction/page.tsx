"use client"

// extraction/page.tsx
// 순환추출 흐름 전체화면 페이지

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import ExtractionFlowMap from "../ExtractionFlowMap"
import ControlBar, { EmergencyModal } from "../ControlBar"
import { AppState, ProcessProgress, ValvePayload } from "../types"
import { unwrapN8n } from "../valve-flows"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://10.0.1.2:3000"
const POLL_MS = 5000

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
const EMPTY_RELAY = [0, 0, 0, 0, 0, 0, 0, 0]

function makeInitialState() {
  return {
    mqttStatus: "disconnected" as AppState["mqttStatus"],
    valveRelayState: [...EMPTY_RELAY],
    currentValveMode: -1,
    isManualMode: false,
    inverters: Array.from({ length: INVERTER_COUNT }, (_, i) => ({
      id: i + 1,
      pumpStatus: "OFF",
      tankLevel: 0,
    })),
    boosters: [
      { id: 1 as const, isOn: false },
      { id: 2 as const, isOn: false },
    ],
    progress: null as ProcessProgress | null,
  }
}

// parseProgress — n8n 이중 래핑 자동 해제 후 파싱
function parseProgress(raw: string): ProcessProgress | null {
  try {
    let json = JSON.parse(raw)
    // n8n 이중 래핑 해제: { topic, message: "..." }
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
      processInfo:   json.process_info ?? json.message ?? json.status ?? "\uACF5\uC815 \uC2E4\uD589 \uC911",
      elapsedTime:   elapsed   > 0 ? elapsed   : undefined,
      remainingTime: remaining > 0 ? remaining : undefined,
      isRunning:     json.status === "running" || elapsed > 0,
      rawMessage:    raw,
    }
  } catch {
    return null
  }
}

export default function ExtractionPage() {
  const router = useRouter()
  const [state, setState]             = useState(makeInitialState)
  const [showEmergency, setEmergency] = useState(false)
  const [emergencyDone, setEmergencyDone] = useState(false)
  const mqttRef = useRef<ReturnType<typeof import("../mqtt-ws-client")["getMqttClient"]> | null>(null)

  // REST API polling
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
            return { ...inv, tankLevel: t.level ?? inv.tankLevel, pumpStatus: t.pumpStatus ?? inv.pumpStatus }
          }),
        }))
      } catch { /* ignore */ }
    }
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  }, [])

  const handleValveState = useCallback((raw: string) => {
    const parsed = unwrapN8n(raw)
    if (!parsed || typeof parsed !== "object") return
    const p = parsed as ValvePayload
    const isManual   = p.relay_mode === "manual" || p.current_valve_mode === -1
    const relayState = Array.isArray(p.relay_state) ? p.relay_state.slice(0, 8) : [...EMPTY_RELAY]
    setState((prev) => ({
      ...prev,
      valveRelayState:  relayState,
      currentValveMode: p.current_valve_mode ?? prev.currentValveMode,
      isManualMode:     isManual,
    }))
  }, [])

  const handleInverterState = useCallback((id: number, raw: string) => {
    // n8n 이중 래핑: {"topic":"...","message":"1"} -> "1"
    let status = raw.trim()
    try {
      const j = JSON.parse(raw)
      if (typeof j.message === "string") status = j.message.trim()
    } catch { /* 단순 문자열 */ }
    setState((prev) => ({
      ...prev,
      inverters: prev.inverters.map((inv) =>
        inv.id === id ? { ...inv, pumpStatus: status } : inv
      ),
    }))
  }, [])

  const handleTankLevel = useCallback((id: number, raw: string) => {
    // n8n 이중 래핑: {"topic":"...","message":"채워지는중"} -> 문자열
    let value = raw.trim()
    try {
      const j = JSON.parse(raw)
      if (typeof j.message === "string") value = j.message.trim()
    } catch { /* 단순 문자열 */ }
    const level = parseFloat(value)
    if (!isNaN(level)) {
      setState((prev) => ({
        ...prev,
        inverters: prev.inverters.map((inv) =>
          inv.id === id ? { ...inv, tankLevel: Math.min(100, Math.max(0, level)) } : inv
        ),
      }))
    }
  }, [])

  const handleBoosterState = useCallback((id: 1 | 2, raw: string) => {
    // n8n 부스터 state 형식: {"device_id":"booster1","power":"ON","connected":true,...}
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
      boosters: prev.boosters.map((b) => b.id === id ? { ...b, isOn } : b),
    }))
  }, [])

  const handleMessage = useCallback(
    (topic: string, message: string) => {
      if (topic === TOPICS.VALVE_STATE) { handleValveState(message); return }
      const stateMatch  = topic.match(/pump\/inverter(\d+)\/state$/)
      if (stateMatch)  { handleInverterState(parseInt(stateMatch[1], 10), message); return }
      const levelMatch  = topic.match(/pump\/inverter(\d+)\/tank\d+_level$/)
      if (levelMatch)  { handleTankLevel(parseInt(levelMatch[1], 10), message); return }
      const boosterMatch = topic.match(/pump\/booster(\d+)\/state$/)
      if (boosterMatch) { handleBoosterState(parseInt(boosterMatch[1], 10) as 1 | 2, message); return }
      if (topic === TOPICS.PROCESS_OUTPUT || topic === TOPICS.PROCESS_PROGRESS) {
        const p = parseProgress(message)
        if (p) setState((prev) => ({ ...prev, progress: p }))
      }
    },
    [handleValveState, handleInverterState, handleTankLevel, handleBoosterState]
  )

  useEffect(() => {
    let mounted = true
    import("../mqtt-ws-client").then(({ getMqttClient }) => {
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

  const handleEmergencyConfirm = useCallback(() => {
    const client = mqttRef.current
    if (client) client.publish(TOPICS.PROCESS_INPUT, JSON.stringify({ command: "sr" }))
    setEmergency(false)
    setEmergencyDone(true)
    setTimeout(() => setEmergencyDone(false), 4000)
  }, [])

  const mqttConnected = state.mqttStatus === "connected"
  const dotClass =
    state.mqttStatus === "connected"  ? "bg-emerald-400" :
    state.mqttStatus === "connecting" ? "animate-pulse bg-yellow-400" : "bg-red-500"
  const statusText =
    state.mqttStatus === "connected"  ? "\uC5F0\uACB0\uB428" :
    state.mqttStatus === "connecting" ? "\uC5F0\uACB0 \uC911" : "\uC5F0\uACB0 \uB04A\uAE40"

  return (
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-100">
      <EmergencyModal
        isOpen={showEmergency}
        onConfirm={handleEmergencyConfirm}
        onCancel={() => setEmergency(false)}
      />
      {emergencyDone && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl border border-red-700 bg-red-900/90 px-5 py-2.5 text-sm font-bold text-red-200 shadow-xl">
          {"\uAE34\uAE09\uC815\uC9C0 \uBA85\uB839 \uC804\uC1A1 \uC644\uB8CC"}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 active:bg-slate-700"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <h1 className="text-[14px] font-black text-slate-100">{"\uC21C\uD658\uCD94\uCD9C \uD750\uB984"}</h1>
            <p className="text-[10px] text-slate-500">Extraction Flow P&amp;ID</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${dotClass}`} />
            <span className="text-[10px] text-slate-500">{statusText}</span>
          </div>
        </div>
      </div>

      <main className="px-2 pt-3">
        <ExtractionFlowMap
          relayState={state.valveRelayState}
          inverters={state.inverters}
          boosters={state.boosters}
          progress={state.progress}
        />
      </main>

      <ControlBar
        mqttConnected={mqttConnected}
        onEmergencyStop={() => setEmergency(true)}
      />
    </div>
  )
}
