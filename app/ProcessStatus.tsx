"use client"

// mobile-final/ProcessStatus.tsx
// 공정 진행 상태 — 미래지향적 미니멀 디자인
//
// 구조:
//   [전체 공정 진행률] — 슬림 바 + 시간 정보
//   [순환추출 링]  [하우징 링]  [펌프 요약]

import { useMemo } from "react"
import { ProcessProgress, InverterState, BoosterState, ProcessMode, PROCESS_MODE_LABEL } from "./types"

// ── 공정 모드 배너 ────────────────────────────────────────────
// inverter/state 의 mode 필드: "S" = 동시, "O" = 오버랩, "C" = 순차
// isRunning 이 true 일 때만 표시

const MODE_COLOR: Record<ProcessMode, { bg: string; border: string; text: string; glow: string }> = {
  S: {
    bg: "rgba(34, 211, 238, 0.08)",
    border: "rgba(34, 211, 238, 0.25)",
    text: "#22d3ee",
    glow: "0 0 12px rgba(34, 211, 238, 0.15)",
  },
  O: {
    bg: "rgba(251, 191, 36, 0.08)",
    border: "rgba(251, 191, 36, 0.25)",
    text: "#fbbf24",
    glow: "0 0 12px rgba(251, 191, 36, 0.15)",
  },
  C: {
    bg: "rgba(52, 211, 153, 0.08)",
    border: "rgba(52, 211, 153, 0.25)",
    text: "#34d399",
    glow: "0 0 12px rgba(52, 211, 153, 0.15)",
  },
}

function ProcessModeBanner({ mode, isRunning }: { mode: ProcessMode | undefined; isRunning: boolean }) {
  if (!isRunning || !mode) return null

  const c = MODE_COLOR[mode]

  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        boxShadow: c.glow,
      }}
    >
      {/* 점멸 도트 */}
      <div
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: c.text,
          boxShadow: `0 0 6px ${c.text}`,
          animation: "pulse-glow 2s ease-in-out infinite",
        }}
      />
      {/* 모드 코드 */}
      <span className="font-mono text-[10px] font-bold" style={{ color: c.text }}>
        {mode}
      </span>
      {/* 구분선 */}
      <span className="text-slate-700">|</span>
      {/* 모드 한글 라벨 */}
      <span className="text-[11px] font-medium text-slate-300">
        {PROCESS_MODE_LABEL[mode]} 공정
      </span>
      {/* 우측: 실행 중 표시 */}
      <span className="ml-auto font-mono text-[9px] uppercase tracking-wide text-slate-600">
        running
      </span>
    </div>
  )
}

// ── 원형 게이지 (미니멀) ──────────────────────────────────────────
function Ring({
  pct,
  label,
  color,
  isActive,
}: {
  pct: number
  label: string
  color: string
  isActive: boolean
}) {
  const size = 80
  const radius = 32
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius
  const clamp = Math.min(100, Math.max(0, pct))
  const dashOffset = circumference * (1 - clamp / 100)

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* 배경 트랙 */}
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke="rgba(148,163,184,0.06)"
            strokeWidth={5}
          />
          {/* 진행 아크 */}
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
              filter: isActive ? `drop-shadow(0 0 6px ${color}40)` : "none",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono text-[16px] font-bold leading-none"
            style={{ color }}
          >
            {clamp.toFixed(0)}
          </span>
          <span className="text-[8px] font-medium text-slate-500">%</span>
        </div>
      </div>
      <span className="mt-1 text-[10px] font-medium text-slate-500">{label}</span>
    </div>
  )
}

// ── 전체 공정 프로그레스 바 ───────────────────────────────────────
function ProgressBar({
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
  const barColor = isRunning ? "#22d3ee" : clamp >= 100 ? "#34d399" : "#64748b"

  const fmtTime = (sec?: number) => {
    if (sec == null || sec < 0) return "--:--"
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  return (
    <div className="glass-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="h-1.5 w-1.5 rounded-full bg-cyan-400" style={{
              boxShadow: "0 0 6px #22d3ee",
              animation: "pulse-glow 2s ease-in-out infinite",
            }} />
          )}
          <span className="text-[11px] font-medium text-slate-400">
            {label}
          </span>
        </div>
        <span className="font-mono text-[18px] font-bold tracking-tight" style={{ color: barColor }}>
          {clamp.toFixed(0)}%
        </span>
      </div>

      {/* 슬림 바 */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${clamp}%`,
            backgroundColor: barColor,
            boxShadow: isRunning ? `0 0 12px ${barColor}60` : "none",
          }}
        />
      </div>

      {/* 시간 정보 */}
      {(elapsedSec != null || remainSec != null) && (
        <div className="mt-2 flex items-center justify-end gap-3 font-mono text-[10px] text-slate-600">
          {elapsedSec != null && <span>{fmtTime(elapsedSec)}</span>}
          {remainSec != null && (
            <span className="text-slate-500">-{fmtTime(remainSec)}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────
interface ProcessStatusProps {
  progress: ProcessProgress | null
  inverters: InverterState[]
  boosters: BoosterState[]
  extractionPct?: number
  housingPct?: number
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function ProcessStatus({ progress, inverters, boosters, extractionPct: extPctProp, housingPct: housingPctProp }: ProcessStatusProps) {
  const overallPct     = progress?.pct ?? 0
  const overallRunning = progress?.isRunning ?? false
  const overallLabel   = progress?.processInfo ?? "대기"

  // 순환추출 (인버터 ON 비율)
  const circulationPct = useMemo(() => {
    if (inverters.length === 0) return 0
    const onCount = inverters.filter((inv) => inv.pumpStatus === "ON").length
    return (onCount / inverters.length) * 100
  }, [inverters])
  const circulationActive = inverters.some((inv) => inv.pumpStatus === "ON")

  // 하우징 (부스터 기반)
  const housingActive = boosters.some((b) => b.isOn)
  const housingPctBase = housingActive ? overallPct : 0

  // API 폴링값 우선 적용 (서버 job-engine / extraction-engine)
  const finalExtractionPct = extPctProp != null ? extPctProp : circulationPct
  const finalHousingPct    = housingPctProp != null ? housingPctProp : housingPctBase

  // 펌프 요약
  const pumpSummary = useMemo(() => {
    const invOn = inverters.filter((i) => i.pumpStatus === "ON").length
    const bstOn = boosters.filter((b) => b.isOn).length
    return { invOn, bstOn, total: invOn + bstOn }
  }, [inverters, boosters])

  return (
    <div className="space-y-3">
      {/* 공정 모드 배너 — 실행 중일 때만 표시 */}
      <ProcessModeBanner mode={progress?.mode} isRunning={overallRunning} />

      {/* 전체 공정 바 */}
      <ProgressBar
        pct={overallPct}
        label={overallLabel}
        isRunning={overallRunning}
        elapsedSec={progress?.elapsedTime}
        remainSec={progress?.remainingTime}
      />

      {/* 링 게이지 + 펌프 요약 */}
      <div className="glass-card flex items-center justify-between px-4 py-3">
        <Ring
          pct={finalExtractionPct}
          label="순환추출"
          color={circulationActive ? "#22d3ee" : "#334155"}
          isActive={circulationActive}
        />
        <Ring
          pct={finalHousingPct}
          label="하우징"
          color={housingActive ? "#34d399" : "#334155"}
          isActive={housingActive}
        />

        {/* 펌프 요약 수치 */}
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="font-mono text-[20px] font-bold leading-none text-slate-200">
              {pumpSummary.total}
            </div>
            <div className="text-[9px] text-slate-600">ACTIVE</div>
          </div>
          <div className="flex gap-2">
            <span className="rounded-md bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-cyan-400">
              INP {pumpSummary.invOn}/{inverters.length}
            </span>
            <span className="rounded-md bg-slate-800/80 px-1.5 py-0.5 font-mono text-[9px] text-blue-400">
              BST {pumpSummary.bstOn}/2
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
