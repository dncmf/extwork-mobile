"use client"

// D-nature CMXF 모바일 UI — 탭 네비게이션 리디자인
// 구조: 헤더(슬림) + 탭 콘텐츠(전체 화면) + 하단 탭바
// 탭: 공정 | 밸브 | 펌프 | 제어

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import ProcessStatus from "./ProcessStatus"
import HousingValveMap from "./HousingValveMap"
import PumpCards from "./PumpCards"
import BottomNav from "./BottomNav"
import { ToastContainer, ToastItem, makeToastItem } from "./Toast"
import {
  AppState, InverterState, BoosterState, ProcessProgress,
  ValvePayload, ProcessMode, TabId
} from "./types"
import { calcPipeFlows, unwrapN8n } from "./valve-flows"

// ============================================================
// 상수
// ============================================================
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://10.0.1.2:3000"

const TOPICS = {
  VALVE_STATE:           "dnature/factory/zone1/valve/status/SIM_VALVE_01",
  INVERTER_STATE_GLOBAL: "dnature/factory/zone1/inverter/state",
  PROCESS_PROGRESS:      "dnature/factory/zone1/inverter/progress",
  INVERTER_ERROR:        "dnature/factory/zone1/inverter/error",
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
    const rawMode   = json.mode ?? json.scenario_mode ?? json.process_mode
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
// 헤더
// ============================================================
function Header({
  mqttStatus,
  currentTime,
  activeTab,
  currentValveMode,
  isManualMode,
}: {
  mqttStatus:       AppState["mqttStatus"]
  currentTime:      string
  activeTab:        TabId
  currentValveMode: number
  isManualMode:     boolean
}) {
  const dotColor =
    mqttStatus === "connected"  ? "#22d3ee" :
    mqttStatus === "connecting" ? "#fbbf24" :
    "#475569"

  const TAB_TITLE: Record<TabId, string> = {
    process: "공정 현황",
    valve:   "밸브 맵",
    pump:    "펌프 상태",
    control: "제어",
  }

  const modeLabel = isManualMode
    ? "MANUAL"
    : currentValveMode >= 0
    ? `M${currentValveMode}`
    : null

  return (
    <div
      className="sticky top-0 z-40 px-4 py-2.5"
      style={{
        background: "rgba(6, 8, 15, 0.9)",
        borderBottom: "1px solid rgba(148,163,184,0.07)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: dotColor,
              boxShadow: mqttStatus === "connected" ? `0 0 8px ${dotColor}80` : "none",
              transition: "all 0.3s",
            }}
          />
          <span className="text-sm font-semibold tracking-tight text-slate-200">
            CMXF
          </span>
          <span style={{ color: "#475569", fontSize: "12px" }}>·</span>
          <span className="text-xs font-medium text-slate-400">
            {TAB_TITLE[activeTab]}
          </span>
          {modeLabel && (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[9px] font-medium"
              style={{
                background: "rgba(34,211,238,0.1)",
                color: "#22d3ee",
                border: "1px solid rgba(34,211,238,0.2)",
              }}
            >
              {modeLabel}
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] tabular-nums text-slate-600">
          {currentTime}
        </span>
      </div>
    </div>
  )
}

// ============================================================
// 제어 탭 — 공정 제어 + 긴급정지
// ============================================================
interface Sequence { id: number; name: string; description: string }
interface JobStatus {
  status: "idle" | "running" | "paused" | "completed" | "error"
  sequenceName?: string
  currentStepIndex?: number
  totalSteps?: number
  remainingSec?: number
}

function ControlTab({
  mqttStatus,
  progress,
  onEmergencyStop,
  emergencyDone,
}: {
  mqttStatus:    AppState["mqttStatus"]
  progress:      ProcessProgress | null
  onEmergencyStop: () => void
  emergencyDone: boolean
}) {
  const [confirm,     setConfirm]     = useState(false)
  const [sequences,   setSequences]   = useState<Sequence[]>([])
  const [selectedId,  setSelectedId]  = useState<number | null>(null)
  const [jobStatus,   setJobStatus]   = useState<JobStatus>({ status: "idle" })
  const [actionMsg,   setActionMsg]   = useState("")
  const [loading,     setLoading]     = useState(false)

  const isConnected = mqttStatus === "connected"
  const isRunning   = jobStatus.status === "running"
  const isPaused    = jobStatus.status === "paused"

  // 시퀀스 목록 로드
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/sequences`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setSequences(d.data.filter((s: Sequence & { is_active: number }) => s.is_active === 1))
      })
      .catch(() => {})
  }, [])

  // Job Engine 상태 폴링 (3s)
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/job-engine`, { cache: "no-store" })
        if (!r.ok) return
        const d = await r.json()
        if (d.success) {
          setJobStatus({
            status:           d.data.status,
            sequenceName:     d.data.sequenceName,
            currentStepIndex: d.data.currentStepIndex,
            totalSteps:       d.data.totalSteps,
            remainingSec:     d.data.remainingSec,
          })
        }
      } catch {}
    }
    poll()
    const tid = setInterval(poll, 3000)
    return () => clearInterval(tid)
  }, [])

  const callAction = async (action: string, extra?: object) => {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/api/v1/job-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      })
      const d = await r.json()
      setActionMsg(d.success ? "완료" : d.error ?? "오류")
    } catch {
      setActionMsg("서버 오류")
    }
    setLoading(false)
    setTimeout(() => setActionMsg(""), 2500)
  }

  const handleEmPress = () => {
    if (!confirm) { setConfirm(true); return }
    onEmergencyStop()
    setConfirm(false)
  }
  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(false), 3000)
    return () => clearTimeout(t)
  }, [confirm])

  const fmtSec = (sec?: number) => {
    if (!sec) return "--:--"
    const m = Math.floor(sec / 60), s = sec % 60
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
  }

  const statusColor = isRunning ? "#34d399" : isPaused ? "#fbbf24" : "#475569"
  const statusLabel = isRunning ? "실행 중" : isPaused ? "일시정지" : jobStatus.status === "completed" ? "완료" : "유휴"

  const stepPct = jobStatus.totalSteps
    ? Math.round(((jobStatus.currentStepIndex ?? 0) + 1) / jobStatus.totalSteps * 100)
    : 0

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-32">

      {/* 연결 상태 — 슬림 배너 */}
      <div className="flex items-center justify-between rounded-xl px-4 py-2.5"
        style={{
          background: isConnected ? "rgba(34,211,238,0.05)" : "rgba(239,68,68,0.05)",
          border: isConnected ? "1px solid rgba(34,211,238,0.15)" : "1px solid rgba(239,68,68,0.2)",
        }}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: isConnected ? "#22d3ee" : mqttStatus === "connecting" ? "#fbbf24" : "#ef4444",
              boxShadow: isConnected ? "0 0 8px #22d3ee" : "none",
              animation: isConnected ? "pulse-glow 2s ease-in-out infinite" : "none",
            }} />
          <span className="font-mono text-xs uppercase tracking-widest"
            style={{ color: isConnected ? "#22d3ee" : "#ef4444" }}>
            {isConnected ? "SERVER CONNECTED" : mqttStatus === "connecting" ? "CONNECTING..." : "DISCONNECTED"}
          </span>
        </div>
        <span className="font-mono text-[10px] text-slate-600">SSE</span>
      </div>

      {/* 공정 상태 카드 */}
      <div className="rounded-2xl p-5"
        style={{
          background: isRunning
            ? "rgba(52,211,153,0.05)"
            : isPaused
            ? "rgba(251,191,36,0.05)"
            : "rgba(15,23,42,0.6)",
          border: isRunning
            ? "1.5px solid rgba(52,211,153,0.25)"
            : isPaused
            ? "1.5px solid rgba(251,191,36,0.25)"
            : "1px solid rgba(148,163,184,0.08)",
          boxShadow: isRunning
            ? "0 0 30px rgba(52,211,153,0.06)"
            : isPaused
            ? "0 0 30px rgba(251,191,36,0.06)"
            : "none",
        }}>

        {/* 상태 헤더 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(isRunning || isPaused) && (
              <div className="h-3 w-3 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: statusColor,
                  boxShadow: `0 0 12px ${statusColor}`,
                  animation: isRunning ? "pulse-glow 1.2s ease-in-out infinite" : "none",
                }} />
            )}
            <span className="font-mono text-xs uppercase tracking-widest text-slate-500">공정 상태</span>
          </div>
          <span className="font-mono text-base font-black tracking-wide"
            style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>

        {/* 시퀀스 이름 */}
        {jobStatus.sequenceName ? (
          <div className="mb-4">
            <p className="text-base font-bold text-slate-100">{jobStatus.sequenceName}</p>
            <div className="mt-1.5 flex items-center gap-4 font-mono text-[11px] text-slate-500">
              {jobStatus.totalSteps != null && (
                <span>STEP {(jobStatus.currentStepIndex ?? 0) + 1} / {jobStatus.totalSteps}</span>
              )}
              {jobStatus.remainingSec != null && (
                <span>잔여 {fmtSec(jobStatus.remainingSec)}</span>
              )}
            </div>
          </div>
        ) : (
          <p className="mb-4 text-sm text-slate-600">
            {isRunning || isPaused ? "공정 실행 중..." : "대기 중 — 아래에서 공정을 선택하세요"}
          </p>
        )}

        {/* 진행 바 */}
        {(isRunning || isPaused) && (
          <div>
            <div className="h-2.5 w-full overflow-hidden rounded-full"
              style={{ background: "rgba(15,23,42,0.8)" }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${stepPct}%`,
                  background: isRunning
                    ? "linear-gradient(90deg, #34d399, #22d3ee)"
                    : "linear-gradient(90deg, #f59e0b, #fbbf24)",
                  boxShadow: isRunning ? "0 0 10px rgba(34,211,238,0.4)" : "none",
                }} />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-slate-600">
              <span>0%</span>
              <span className="font-bold" style={{ color: statusColor }}>{stepPct}%</span>
              <span>100%</span>
            </div>
          </div>
        )}
      </div>

      {/* 공정 제어 버튼 */}
      {(isRunning || isPaused) && (
        <div className="grid grid-cols-2 gap-3">
          {isRunning && (
            <button onClick={() => callAction("pause")} disabled={loading}
              className="rounded-2xl py-5 transition-all active:scale-[0.97]"
              style={{
                background: "rgba(251,191,36,0.08)",
                border: "1.5px solid rgba(251,191,36,0.3)",
                cursor: "pointer",
              }}>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl">⏸</span>
                <span className="font-mono text-xs font-bold text-yellow-400">일시정지</span>
              </div>
            </button>
          )}
          {isPaused && (
            <button onClick={() => callAction("resume")} disabled={loading}
              className="rounded-2xl py-5 transition-all active:scale-[0.97]"
              style={{
                background: "rgba(52,211,153,0.08)",
                border: "1.5px solid rgba(52,211,153,0.3)",
                cursor: "pointer",
              }}>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xl">▶</span>
                <span className="font-mono text-xs font-bold text-emerald-400">재개</span>
              </div>
            </button>
          )}
          <button onClick={() => callAction("stop")} disabled={loading}
            className="rounded-2xl py-5 transition-all active:scale-[0.97]"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1.5px solid rgba(239,68,68,0.25)",
              cursor: "pointer",
            }}>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">⏹</span>
              <span className="font-mono text-xs font-bold text-red-400">정지</span>
            </div>
          </button>
        </div>
      )}

      {/* 시퀀스 선택 + 시작 */}
      {!isRunning && !isPaused && (
        <div className="rounded-2xl p-4"
          style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.08)" }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-widest text-slate-500">공정 선택</p>
            <span className="font-mono text-[10px] text-slate-700">{sequences.length}개</span>
          </div>

          {/* 시퀀스 목록 */}
          <div className="mb-4 max-h-56 overflow-y-auto space-y-2"
            style={{ scrollbarWidth: "none" }}>
            {sequences.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-700">시퀀스 로딩 중...</p>
            ) : sequences.map((seq, idx) => (
              <button key={seq.id} onClick={() => setSelectedId(seq.id)}
                className="w-full rounded-xl px-4 py-3 text-left transition-all active:scale-[0.98]"
                style={{
                  background: selectedId === seq.id
                    ? "rgba(34,211,238,0.1)"
                    : "rgba(15,23,42,0.45)",
                  border: selectedId === seq.id
                    ? "1.5px solid rgba(34,211,238,0.4)"
                    : "1px solid rgba(148,163,184,0.07)",
                  cursor: "pointer",
                  boxShadow: selectedId === seq.id ? "0 0 16px rgba(34,211,238,0.08)" : "none",
                }}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex-shrink-0 rounded-lg px-2 py-0.5 font-mono text-[9px] font-bold"
                    style={{
                      background: selectedId === seq.id ? "rgba(34,211,238,0.2)" : "rgba(148,163,184,0.08)",
                      color: selectedId === seq.id ? "#22d3ee" : "#475569",
                    }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold"
                      style={{ color: selectedId === seq.id ? "#e2e8f0" : "#94a3b8" }}>
                      {seq.name}
                    </span>
                    {seq.description && (
                      <span className="mt-0.5 block text-[11px] text-slate-600"
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {seq.description}
                      </span>
                    )}
                  </div>
                  {selectedId === seq.id && (
                    <span className="mt-0.5 flex-shrink-0 text-[10px]" style={{ color: "#22d3ee" }}>✓</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* 시작 버튼 */}
          <button
            onClick={() => selectedId && callAction("start", { sequenceId: selectedId })}
            disabled={!selectedId || loading}
            className="w-full rounded-2xl py-5 transition-all active:scale-[0.97]"
            style={{
              background: selectedId
                ? "linear-gradient(135deg, rgba(34,211,238,0.15), rgba(34,211,238,0.08))"
                : "rgba(15,23,42,0.3)",
              border: selectedId
                ? "1.5px solid rgba(34,211,238,0.4)"
                : "1px solid rgba(148,163,184,0.05)",
              cursor: selectedId ? "pointer" : "not-allowed",
              opacity: selectedId ? 1 : 0.45,
              boxShadow: selectedId ? "0 0 20px rgba(34,211,238,0.1)" : "none",
            }}>
            <div className="flex items-center justify-center gap-2">
              <span className="text-base">{loading ? "⏳" : "▶"}</span>
              <span className="font-mono text-base font-black tracking-wide"
                style={{ color: selectedId ? "#22d3ee" : "#475569" }}>
                {loading ? "처리 중..." : "공정 시작"}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* 액션 결과 메시지 */}
      {actionMsg && (
        <div className="rounded-xl px-4 py-3 text-center"
          style={{
            background: "rgba(34,211,238,0.06)",
            border: "1px solid rgba(34,211,238,0.2)",
          }}>
          <span className="font-mono text-sm font-medium text-cyan-400">{actionMsg}</span>
        </div>
      )}

      {/* 긴급정지 */}
      <div className="mt-1">
        {emergencyDone ? (
          <div className="flex w-full items-center justify-center gap-3 rounded-2xl py-5"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.3)",
            }}>
            <span className="text-base">✓</span>
            <span className="font-mono text-sm font-bold tracking-widest text-red-400">긴급정지 전송됨</span>
          </div>
        ) : (
          <button onClick={handleEmPress}
            className="w-full rounded-2xl py-6 transition-all duration-200 active:scale-[0.97]"
            style={{
              background: confirm
                ? "rgba(239,68,68,0.2)"
                : "rgba(239,68,68,0.07)",
              border: confirm
                ? "2px solid rgba(239,68,68,0.8)"
                : "1.5px solid rgba(239,68,68,0.2)",
              boxShadow: confirm
                ? "0 0 40px rgba(239,68,68,0.25), inset 0 0 20px rgba(239,68,68,0.05)"
                : "0 0 20px rgba(239,68,68,0.05)",
              cursor: "pointer",
            }}>
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-mono text-xl font-black tracking-widest" style={{ color: "#ef4444" }}>
                EMERGENCY STOP
              </span>
              {confirm
                ? <span className="font-mono text-xs font-semibold text-red-400"
                    style={{ animation: "pulse-glow 0.8s ease-in-out infinite" }}>
                    한 번 더 탭 → 전송
                  </span>
                : <span className="text-[11px] text-slate-700">탭하여 긴급정지</span>
              }
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 메인 페이지
// ============================================================
export default function MobilePage() {
  const [state,        setState]        = useState<AppState>(makeInitialState)
  const [currentTime,  setTime]         = useState("")
  const [emergencyDone, setEmergencyDone] = useState(false)
  const [toasts,       setToasts]       = useState<ToastItem[]>([])
  const [activeTab,    setActiveTab]    = useState<TabId>("process")
  const [extractionPct, setExtractionPct] = useState(0)
  const [housingPct,   setHousingPct]   = useState(0)

  const sseRef = useRef<EventSource | null>(null)

  // ── 시각 업데이트
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── extraction/job-engine 폴링 (3s)
  useEffect(() => {
    const poll = async () => {
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
    poll()
    const tid = setInterval(poll, 3000)
    return () => clearInterval(tid)
  }, [])

  // ── MQTT 핸들러들
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

  const handleSensor = useCallback((id: number, raw: string) => {
    try {
      const d = JSON.parse(raw)
      const level = d.level != null ? parseFloat(String(d.level)) : NaN
      if (!isNaN(level)) {
        setState((prev) => ({
          ...prev,
          inverters: prev.inverters.map((inv) =>
            inv.id === id ? { ...inv, tankLevel: Math.min(100, Math.max(0, level)) } : inv
          ),
        }))
      }
    } catch { /* 무시 */ }
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
      if (topic === TOPICS.VALVE_STATE) { handleValveState(message); return }

      if (topic === TOPICS.INVERTER_STATE_GLOBAL) {
        try {
          const d = JSON.parse(message)
          if (d.msg !== undefined && d.active === undefined) return
          const isRunning = d.active === true || d.active === 1
          const rawMode   = d.mode
          const mode: ProcessMode | undefined =
            rawMode === "S" || rawMode === "O" || rawMode === "C" || rawMode === "U"
              ? rawMode as ProcessMode : undefined
          setState((prev) => {
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
        } catch { /* 무시 */ }
        return
      }

      const stateMatch = topic.match(/pump\/inverter(\d+)\/state$/)
      if (stateMatch) { handleInverterState(parseInt(stateMatch[1], 10), message); return }

      const sensorMatch = topic.match(/pump\/inverter(\d+)\/sensor$/)
      if (sensorMatch) { handleSensor(parseInt(sensorMatch[1], 10), message); return }

      const healthMatch = topic.match(/pump\/inverter(\d+)\/health$/)
      if (healthMatch) {
        const n = parseInt(healthMatch[1], 10)
        try {
          const d = JSON.parse(message)
          const healthMode: "wifi" | "ble_only" | "offline" =
            d.mode === "wifi" || d.mode === "ble_only" || d.mode === "offline"
              ? d.mode : "offline"
          setState((prev) => ({
            ...prev,
            inverters: prev.inverters.map((inv) =>
              inv.id === n ? { ...inv, health: { mode: healthMode } } : inv
            ),
          }))
        } catch { /* 무시 */ }
        return
      }

      const boosterMatch = topic.match(/pump\/booster(\d+)\/state$/)
      if (boosterMatch) {
        handleBoosterState(parseInt(boosterMatch[1], 10) as 1 | 2, message)
        return
      }

      if (topic === TOPICS.INVERTER_ERROR) {
        const item = makeToastItem(message)
        setToasts((prev) => [item, ...prev].slice(0, 3))
        return
      }

      if (topic === TOPICS.PROCESS_PROGRESS) {
        const p = parseProgress(message)
        if (p) setState((prev) => ({ ...prev, progress: p }))
      }
    },
    [handleValveState, handleInverterState, handleSensor, handleBoosterState]
  )

  // ── SSE 연결
  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let mounted = true

    const connect = () => {
      if (!mounted) return
      setState((prev) => ({ ...prev, mqttStatus: "connecting" }))
      es = new EventSource(`${API_BASE}/api/v1/events`)
      sseRef.current = es

      es.onopen = () => {
        if (!mounted) return
        setState((prev) => ({ ...prev, mqttStatus: "connected" }))
      }

      es.onmessage = (event) => {
        if (!mounted) return
        try {
          const d = JSON.parse(event.data) as { topic?: string; payload?: string; type?: string }
          if (d.type === "connected") return
          if (!d.topic || d.payload === undefined) return
          handleMessage(d.topic, d.payload)
        } catch { /* 무시 */ }
      }

      es.onerror = () => {
        if (!mounted) return
        setState((prev) => ({ ...prev, mqttStatus: "disconnected" }))
        es?.close()
        es = null
        sseRef.current = null
        reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      mounted = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
      sseRef.current = null
    }
  }, [handleMessage])

  // ── 긴급정지
  const handleEmergencyConfirm = useCallback(() => {
    fetch(`${API_BASE}/api/v1/commands/emergency-stop`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ command: "sr" }),
    }).catch(() => { /* 무시 */ })
    setEmergencyDone(true)
    setTimeout(() => setEmergencyDone(false), 4000)
  }, [])

  // ── 파이프 흐름
  const pipeFlows = useMemo(
    () => calcPipeFlows(state.valveRelayState, state.boosters.some((b) => b.isOn)),
    [state.valveRelayState, state.boosters]
  )

  const hasError = state.inverters.some((inv) => inv.pumpStatus === "ERROR")

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#06080F" }}>
      {/* 글로벌 애니메이션 */}
      <style jsx global>{`
        .glass-card {
          background: rgba(15, 23, 42, 0.55);
          border: 1px solid rgba(148, 163, 184, 0.07);
          border-radius: 20px;
          backdrop-filter: blur(12px);
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tab-enter {
          animation: slide-up 0.22s ease-out;
        }
      `}</style>

      {/* 에러 토스트 */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* 헤더 */}
      <Header
        mqttStatus={state.mqttStatus}
        currentTime={currentTime}
        activeTab={activeTab}
        currentValveMode={state.currentValveMode}
        isManualMode={state.isManualMode}
      />

      {/* 탭 콘텐츠 */}
      <main className="flex-1 overflow-auto pb-20">
        {activeTab === "process" && (
          <div key="process" className="tab-enter px-3 pt-3">
            <ProcessStatus
              progress={state.progress}
              inverters={state.inverters}
              boosters={state.boosters}
              extractionPct={extractionPct}
              housingPct={housingPct}
            />
          </div>
        )}
        {activeTab === "valve" && (
          <div key="valve" className="tab-enter">
            <HousingValveMap
              relayState={state.valveRelayState}
              pipeFlows={pipeFlows}
            />
          </div>
        )}
        {activeTab === "pump" && (
          <div key="pump" className="tab-enter px-3 pt-3">
            <PumpCards
              inverters={state.inverters}
              boosters={state.boosters}
            />
          </div>
        )}
        {activeTab === "control" && (
          <div key="control" className="tab-enter">
            <ControlTab
              mqttStatus={state.mqttStatus}
              progress={state.progress}
              onEmergencyStop={handleEmergencyConfirm}
              emergencyDone={emergencyDone}
            />
          </div>
        )}
      </main>

      {/* 하단 탭바 */}
      <BottomNav
        activeTab={activeTab}
        onChange={setActiveTab}
        hasAlert={hasError}
      />
    </div>
  )
}
