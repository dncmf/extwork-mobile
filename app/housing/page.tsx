"use client"

// housing/page.tsx
// 하우징 밸브 P&ID 전체화면 페이지

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import HousingValveMap from "../HousingValveMap"
import ControlBar, { EmergencyModal } from "../ControlBar"
import { AppState, ValvePayload } from "../types"
import { calcPipeFlows, unwrapN8n } from "../valve-flows"

const TOPICS = {
  // 밸브 상태는 status 토픽에서 수신 (set_valve 는 명령 발행용)
  VALVE_STATE:   "dnature/factory/zone1/valve/status/SIM_VALVE_01",
  PROCESS_INPUT: "dnature/factory/zone1/inverter/input",
  BOOSTER_STATE: (n: number) => `dnature/factory/zone1/pump/booster${n}/state`,
}

const EMPTY_RELAY = [0, 0, 0, 0, 0, 0, 0, 0]

function makeInitialState() {
  return {
    mqttStatus: "disconnected" as AppState["mqttStatus"],
    valveRelayState: [...EMPTY_RELAY],
    currentValveMode: -1,
    isManualMode: false,
    boosters: [
      { id: 1 as const, isOn: false },
      { id: 2 as const, isOn: false },
    ],
  }
}

export default function HousingPage() {
  const router = useRouter()
  const [state, setState]             = useState(makeInitialState)
  const [showEmergency, setEmergency] = useState(false)
  const [emergencyDone, setEmergencyDone] = useState(false)
  const mqttRef = useRef<ReturnType<typeof import("../mqtt-ws-client")["getMqttClient"]> | null>(null)

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
      const boosterMatch = topic.match(/pump\/booster(\d+)\/state$/)
      if (boosterMatch) { handleBoosterState(parseInt(boosterMatch[1], 10) as 1 | 2, message) }
    },
    [handleValveState, handleBoosterState]
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
          client.subscribe(TOPICS.BOOSTER_STATE(1))
          client.subscribe(TOPICS.BOOSTER_STATE(2))
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

  const pipeFlows = useMemo(
    () => calcPipeFlows(state.valveRelayState, state.boosters.some((b) => b.isOn)),
    [state.valveRelayState, state.boosters]
  )

  const mqttConnected = state.mqttStatus === "connected"
  const dotClass =
    state.mqttStatus === "connected"  ? "bg-emerald-400" :
    state.mqttStatus === "connecting" ? "animate-pulse bg-yellow-400" : "bg-red-500"
  const statusText =
    state.mqttStatus === "connected"  ? "\uC5F0\uACB0\uB428" :
    state.mqttStatus === "connecting" ? "\uC5F0\uACB0 \uC911" : "\uC5F0\uACB0 \uB04A\uAE40"

  const modeLabel = state.isManualMode
    ? "\uC218\uB3D9 \uC81C\uC5B4"
    : state.currentValveMode >= 0
    ? `\uBAA8\uB4DC ${state.currentValveMode}`
    : "\u2014"

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
            <h1 className="text-[14px] font-black text-slate-100">{"\uD558\uC6B0\uC9D5 \uBC38\uBE0C P&ID"}</h1>
            <p className="text-[10px] text-slate-500">Housing Valve \u2014 V1 ~ V8</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {state.currentValveMode >= 0 && (
              <span className="rounded-md bg-indigo-900/50 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                {modeLabel}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <div className={`h-2 w-2 rounded-full ${dotClass}`} />
              <span className="text-[10px] text-slate-500">{statusText}</span>
            </div>
          </div>
        </div>
      </div>

      <main className="px-2 pt-3">
        <HousingValveMap
          relayState={state.valveRelayState}
          pipeFlows={pipeFlows}
        />
      </main>

      <ControlBar
        mqttConnected={mqttConnected}
        onEmergencyStop={() => setEmergency(true)}
      />
    </div>
  )
}
