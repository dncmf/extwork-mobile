"use client"

// mobile-final/ProcessStatus.tsx
// 공정 진행 상태 섹션
// 구조:
//   [전체 공정 진행률 바] — 상단 가로 바 (0~100%)
//   [순환추출 원형 게이지]  [펌프 상태 바]
//   [하우징 원형 게이지]   [하우징 상태 바]

import { useMemo } from "react"
import { ProcessProgress, InverterState, BoosterState } from "./types"

// ============================================================
// 원형 게이지
// ============================================================
function CircularGauge({
  pct,
  label,
  color,
  statusText,
}: {
  pct: number
  label: string
  color: string
  statusText?: string
}) {
  const size = 92
  const radius = 36
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius
  const clamp = Math.min(100, Math.max(0, pct))
  const dashOffset = circumference * (1 - clamp / 100)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1e293b" strokeWidth={7} />
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-black leading-none text-[17px]" style={{ color }}>
            {clamp.toFixed(0)}%
          </span>
          <span className="mt-0.5 text-[9px] font-semibold text-slate-400 leading-none">
            {label}
          </span>
        </div>
      </div>
      {statusText && (
        <span className="text-[10px] text-slate-500 text-center leading-tight">
          {statusText}
        </span>
      )}
    </div>
  )
}

// ============================================================
// 가로 상태 바
// ============================================================
function StatusBar({
  label,
  pct,
  statusText,
  color,
  highlight = false,
}: {
  label: string
  pct: number
  statusText: string
  color: string
  highlight?: boolean
}) {
  const clamp = Math.min(100, Math.max(0, pct))
  return (
    <div
      className={`flex-1 rounded-xl border p-3 ${
        highlight
          ? "border-emerald-500/30 bg-slate-800/80"
          : "border-slate-700/40 bg-slate-800/50"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-300">{label}</span>
        <span className="font-mono text-[11px] font-bold" style={{ color }}>
          {clamp.toFixed(0)}%
        </span>
      </div>
      <div className="mb-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-700/80">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clamp}%`, backgroundColor: color }}
        />
      </div>
      <p className="truncate text-[10px] text-slate-500">{statusText}</p>
    </div>
  )
}

// ============================================================
// 전체 공정 진행률 바 (최상단)
// ============================================================
function OverallProgressBar({
  pct,
  label,
  isRunning,
  elapsedSec,
  remainSec,
}: {
  pct: number
  label: string
  isRunning: boolean
  elapsedSec?: number
  remainSec?: number
}) {
  const clamp = Math.min(100, Math.max(0, pct))
  const barColor = isRunning ? "#34d399" : clamp >= 100 ? "#34d399" : "#f59e0b"

  const fmtTime = (sec?: number) => {
    if (sec == null || sec < 0) return "--:--"
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              isRunning ? "animate-pulse bg-emerald-400" : "bg-amber-400"
            }`}
          />
          <span className="text-[12px] font-bold text-slate-200">진행 상태</span>
        </div>
        <span className="font-mono text-[14px] font-black" style={{ color: barColor }}>
          {clamp.toFixed(0)}%
        </span>
      </div>

      <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-slate-700/80">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${clamp}%`, backgroundColor: barColor }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="max-w-[55%] truncate text-[10px] text-slate-400">{label}</span>
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
          {elapsedSec != null && <span>경과 {fmtTime(elapsedSec)}</span>}
          {remainSec != null && (
            <span className="text-slate-400">잔여 {fmtTime(remainSec)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Props
// ============================================================
interface ProcessStatusProps {
  progress: ProcessProgress | null
  inverters: InverterState[]
  boosters: BoosterState[]
}

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function ProcessStatus({ progress, inverters, boosters }: ProcessStatusProps) {
  // 전체 공정 진행률
  const overallPct     = progress?.pct ?? 0
  const overallRunning = progress?.isRunning ?? false
  const overallLabel   = progress?.processInfo ?? "공정 대기 중"

  // 순환추출 진행률 (인버터 ON 비율)
  const circulationPct = useMemo(() => {
    if (inverters.length === 0) return 0
    const onCount = inverters.filter((inv) => inv.pumpStatus === "ON").length
    return (onCount / inverters.length) * 100
  }, [inverters])

  const circulationRunning = inverters.some((inv) => inv.pumpStatus === "ON")
  const circulationColor   = circulationRunning ? "#34d399" : "#f59e0b"

  // 펌프 상태 집계
  const pumpPct = useMemo(() => {
    const total = inverters.length + boosters.length
    if (total === 0) return 0
    const onCount =
      inverters.filter((i) => i.pumpStatus === "ON").length +
      boosters.filter((b) => b.isOn).length
    return (onCount / total) * 100
  }, [inverters, boosters])

  const pumpStatusText = useMemo(() => {
    const invOn  = inverters.filter((i) => i.pumpStatus === "ON").length
    const bstOn  = boosters.filter((b) => b.isOn).length
    if (invOn === 0 && bstOn === 0) return "대기 중 — 모든 펌프 정지"
    const parts: string[] = []
    if (invOn > 0) parts.push(`INV ${invOn}/${inverters.length} ON`)
    if (bstOn > 0) parts.push(`BST ${bstOn}/2 ON`)
    return parts.join("  |  ")
  }, [inverters, boosters])

  const pumpColor = pumpPct > 0 ? "#f59e0b" : "#475569"

  // 하우징 상태 (MQTT에서 별도 수신하지 않으므로 progress 기반 추정)
  // 하우징은 부스터 ON 여부로 추정
  const housingRunning = boosters.some((b) => b.isOn)
  const housingPct     = housingRunning ? overallPct : 0
  const housingColor   = housingRunning ? "#34d399" : "#f59e0b"

  return (
    <div className="space-y-3">
      {/* 1. 전체 공정 진행률 바 */}
      <OverallProgressBar
        pct={overallPct}
        label={overallLabel}
        isRunning={overallRunning}
        elapsedSec={progress?.elapsedTime}
        remainSec={progress?.remainingTime}
      />

      {/* 2. 순환추출 + 펌프 상태 */}
      <div className="flex items-stretch gap-3">
        <CircularGauge
          pct={circulationPct}
          label="순환추출"
          color={circulationColor}
          statusText={circulationRunning ? "실행 중" : "대기 중"}
        />
        <StatusBar
          label="펌프 상태"
          pct={pumpPct}
          statusText={pumpStatusText}
          color={pumpColor}
          highlight={pumpPct > 0}
        />
      </div>

      {/* 3. 하우징 원형 + 하우징 상태 바 */}
      <div className="flex items-stretch gap-3">
        <CircularGauge
          pct={housingPct}
          label="하우징"
          color={housingColor}
          statusText={housingRunning ? "실행 중" : "대기 중"}
        />
        <StatusBar
          label="하우징"
          pct={housingPct}
          statusText={housingRunning ? "하우징 실행 중" : "하우징 대기"}
          color={housingColor}
          highlight={housingRunning}
        />
      </div>
    </div>
  )
}
