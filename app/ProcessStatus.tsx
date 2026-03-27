"use client"

// ProcessStatus.tsx — 공정 탭 전면 확대 리디자인
// 크고 명확한 정보 표시

import { useMemo } from "react"
import { ProcessProgress, InverterState, BoosterState, ProcessMode, PROCESS_MODE_LABEL } from "./types"

const MODE_COLOR: Record<ProcessMode, { bg: string; border: string; text: string; glow: string }> = {
  S: { bg: "rgba(34,211,238,0.08)",  border: "rgba(34,211,238,0.3)",  text: "#22d3ee", glow: "0 0 20px rgba(34,211,238,0.15)" },
  O: { bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.3)",  text: "#fbbf24", glow: "0 0 20px rgba(251,191,36,0.15)" },
  C: { bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.3)",  text: "#34d399", glow: "0 0 20px rgba(52,211,153,0.15)" },
}

// ── 공정 모드 배너
function ProcessModeBanner({ mode, isRunning }: { mode: ProcessMode | undefined; isRunning: boolean }) {
  if (!isRunning || !mode) return null
  const c = MODE_COLOR[mode]
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-5 py-3.5"
      style={{ background: c.bg, border: `1.5px solid ${c.border}`, boxShadow: c.glow }}
    >
      <div
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: c.text, boxShadow: `0 0 10px ${c.text}`, animation: "pulse-glow 2s ease-in-out infinite" }}
      />
      <div className="flex flex-1 items-center gap-3">
        <span className="font-mono text-base font-black tracking-wide" style={{ color: c.text }}>
          {mode}
        </span>
        <span className="text-sm font-semibold text-slate-300">
          {PROCESS_MODE_LABEL[mode]} 공정
        </span>
      </div>
      <span className="font-mono text-xs uppercase tracking-widest" style={{ color: c.text, opacity: 0.7 }}>
        RUNNING
      </span>
    </div>
  )
}

// ── 원형 게이지 (대형)
function Ring({ pct, label, sublabel, color, isActive }: {
  pct: number; label: string; sublabel?: string; color: string; isActive: boolean
}) {
  const size = 120
  const radius = 48
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius
  const clamp = Math.min(100, Math.max(0, pct))
  const dashOffset = circumference * (1 - clamp / 100)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(148,163,184,0.07)" strokeWidth={7} />
          <circle
            cx={cx} cy={cy} r={radius} fill="none"
            stroke={isActive ? color : "rgba(148,163,184,0.15)"}
            strokeWidth={7} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={dashOffset}
            style={{
              transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)",
              filter: isActive ? `drop-shadow(0 0 8px ${color}60)` : "none",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-black leading-none"
            style={{ fontSize: "24px", color: isActive ? color : "#475569" }}
          >
            {clamp.toFixed(0)}
          </span>
          <span className="font-mono text-xs font-medium" style={{ color: isActive ? color : "#334155", opacity: 0.7 }}>%</span>
        </div>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-sm font-semibold text-slate-300">{label}</span>
        {sublabel && <span className="text-xs text-slate-600">{sublabel}</span>}
      </div>
    </div>
  )
}

// ── 메인 진행률 바 (대형)
function MainProgressBar({ pct, label, isRunning, elapsedSec, remainSec }: {
  pct: number; label: string; isRunning: boolean; elapsedSec?: number; remainSec?: number
}) {
  const clamp = Math.min(100, Math.max(0, pct))
  const barColor = isRunning ? "#22d3ee" : clamp >= 100 ? "#34d399" : "#334155"

  const fmtTime = (sec?: number) => {
    if (sec == null || sec < 0) return "--:--"
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(15,23,42,0.55)",
        border: isRunning
          ? "1.5px solid rgba(34,211,238,0.2)"
          : "1px solid rgba(148,163,184,0.07)",
        boxShadow: isRunning ? "0 0 30px rgba(34,211,238,0.05)" : "none",
      }}
    >
      {/* 상단: 라벨 + 퍼센트 */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {isRunning && (
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: "#22d3ee", boxShadow: "0 0 8px #22d3ee", animation: "pulse-glow 1.5s ease-in-out infinite" }}
              />
            )}
            <span className="text-xs font-medium uppercase tracking-widest text-slate-500">
              {isRunning ? "실행 중" : "대기"}
            </span>
          </div>
          <span className="text-sm font-medium text-slate-300 leading-snug max-w-[200px]">
            {label}
          </span>
        </div>
        <span
          className="font-mono font-black leading-none"
          style={{ fontSize: "42px", color: barColor, lineHeight: 1, letterSpacing: "-0.02em" }}
        >
          {clamp.toFixed(0)}<span className="text-2xl" style={{ opacity: 0.5 }}>%</span>
        </span>
      </div>

      {/* 진행 바 — 굵게 */}
      <div
        className="h-3 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(148,163,184,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${clamp}%`,
            background: isRunning
              ? "linear-gradient(90deg, #0ea5e9, #22d3ee, #67e8f9)"
              : clamp >= 100 ? "#34d399" : "#334155",
            boxShadow: isRunning ? "0 0 16px rgba(34,211,238,0.5)" : "none",
          }}
        />
      </div>

      {/* 시간 정보 */}
      {(elapsedSec != null || remainSec != null) && (
        <div className="mt-3 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-slate-600">경과</span>
            <span className="font-mono text-base font-semibold text-slate-400">{fmtTime(elapsedSec)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-slate-600">잔여</span>
            <span className="font-mono text-base font-semibold" style={{ color: "#22d3ee" }}>-{fmtTime(remainSec)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 펌프 요약 카드
function PumpSummaryCard({ invOn, invTotal, bstOn }: { invOn: number; invTotal: number; bstOn: number }) {
  return (
    <div
      className="rounded-2xl px-5 py-4"
      style={{
        background: "rgba(15,23,42,0.55)",
        border: "1px solid rgba(148,163,184,0.07)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-600">활성 장비</span>
        <span className="font-mono text-3xl font-black" style={{ color: invOn + bstOn > 0 ? "#22d3ee" : "#334155" }}>
          {invOn + bstOn}
        </span>
      </div>
      <div className="flex gap-3">
        {/* 인버터 */}
        <div
          className="flex flex-1 flex-col items-center rounded-xl py-3"
          style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.12)" }}
        >
          <span className="font-mono text-2xl font-black" style={{ color: invOn > 0 ? "#22d3ee" : "#334155" }}>
            {invOn}<span className="text-sm text-slate-600">/{invTotal}</span>
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-600">인버터</span>
        </div>
        {/* 부스터 */}
        <div
          className="flex flex-1 flex-col items-center rounded-xl py-3"
          style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}
        >
          <span className="font-mono text-2xl font-black" style={{ color: bstOn > 0 ? "#818cf8" : "#334155" }}>
            {bstOn}<span className="text-sm text-slate-600">/2</span>
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-slate-600">부스터</span>
        </div>
      </div>
    </div>
  )
}

// ── Props
interface ProcessStatusProps {
  progress: ProcessProgress | null
  inverters: InverterState[]
  boosters: BoosterState[]
  extractionPct?: number
  housingPct?: number
}

// ── 메인 컴포넌트
export default function ProcessStatus({ progress, inverters, boosters, extractionPct: extPctProp, housingPct: housingPctProp }: ProcessStatusProps) {
  const overallPct     = progress?.pct ?? 0
  const overallRunning = progress?.isRunning ?? false
  const overallLabel   = progress?.processInfo ?? "대기 중"

  const circulationActive = inverters.some((inv) => inv.pumpStatus === "ON")
  const housingActive     = boosters.some((b) => b.isOn)

  const circulationPct = useMemo(() => {
    if (inverters.length === 0) return 0
    const onCount = inverters.filter((inv) => inv.pumpStatus === "ON").length
    return (onCount / inverters.length) * 100
  }, [inverters])

  const finalExtractionPct = extPctProp != null ? extPctProp : circulationPct
  const finalHousingPct    = housingPctProp != null ? housingPctProp : (housingActive ? overallPct : 0)

  const pumpSummary = useMemo(() => ({
    invOn: inverters.filter((i) => i.pumpStatus === "ON").length,
    bstOn: boosters.filter((b) => b.isOn).length,
  }), [inverters, boosters])

  return (
    <div className="space-y-3 pb-4">
      {/* 모드 배너 */}
      <ProcessModeBanner mode={progress?.mode} isRunning={overallRunning} />

      {/* 전체 공정 메인 바 — 크게 */}
      <MainProgressBar
        pct={overallPct}
        label={overallLabel}
        isRunning={overallRunning}
        elapsedSec={progress?.elapsedTime}
        remainSec={progress?.remainingTime}
      />

      {/* 링 게이지 2개 — 나란히 크게 */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="flex flex-col items-center rounded-2xl py-5"
          style={{
            background: "rgba(15,23,42,0.55)",
            border: circulationActive
              ? "1.5px solid rgba(34,211,238,0.18)"
              : "1px solid rgba(148,163,184,0.07)",
          }}
        >
          <Ring
            pct={finalExtractionPct}
            label="순환추출"
            color="#22d3ee"
            isActive={circulationActive}
          />
        </div>
        <div
          className="flex flex-col items-center rounded-2xl py-5"
          style={{
            background: "rgba(15,23,42,0.55)",
            border: housingActive
              ? "1.5px solid rgba(52,211,153,0.18)"
              : "1px solid rgba(148,163,184,0.07)",
          }}
        >
          <Ring
            pct={finalHousingPct}
            label="하우징"
            color="#34d399"
            isActive={housingActive}
          />
        </div>
      </div>

      {/* 펌프 요약 */}
      <PumpSummaryCard
        invOn={pumpSummary.invOn}
        invTotal={inverters.length}
        bstOn={pumpSummary.bstOn}
      />
    </div>
  )
}
