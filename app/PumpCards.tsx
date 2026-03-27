"use client"

// PumpCards.tsx — 펌프 탭 2열 확대 리디자인

import { useState, useEffect, useRef } from "react"
import { InverterState, BoosterState } from "./types"

// ── BLE 배지
function BleBadge() {
  return (
    <span
      className="absolute right-2.5 top-2.5 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold leading-none"
      style={{
        background: "rgba(168,85,247,0.15)",
        border: "1px solid rgba(168,85,247,0.35)",
        color: "#c084fc",
        boxShadow: "0 0 8px rgba(168,85,247,0.25)",
      }}
    >
      BLE
    </span>
  )
}

// ── 수위 색상
function levelColor(level: number): string {
  if (level < 30) return "#ef4444"
  if (level < 70) return "#fbbf24"
  return "#34d399"
}

// ── 인버터 카드 (2열 확대)
function InverterCard({ inv }: { inv: InverterState }) {
  const isOn     = inv.pumpStatus === "ON"
  const isError  = inv.pumpStatus === "ERROR"
  const isBle    = inv.health?.mode === "ble_only"
  const barColor = isError ? "#ef4444" : levelColor(inv.tankLevel)
  const statusColor = isError ? "#ef4444" : isOn ? "#22d3ee" : "#475569"

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4"
      style={{
        background: isOn
          ? "rgba(34,211,238,0.05)"
          : isError
          ? "rgba(239,68,68,0.05)"
          : "rgba(15,23,42,0.55)",
        border: isOn
          ? "1.5px solid rgba(34,211,238,0.2)"
          : isError
          ? "1.5px solid rgba(239,68,68,0.25)"
          : "1px solid rgba(148,163,184,0.07)",
        boxShadow: isOn ? "0 0 20px rgba(34,211,238,0.06)" : "none",
      }}
    >
      {/* 좌측 활성 스트라이프 */}
      {(isOn || isError) && (
        <div
          className="absolute left-0 top-0 h-full w-[3px] rounded-l-2xl"
          style={{
            backgroundColor: isError ? "#ef4444" : "#22d3ee",
            boxShadow: isError ? "0 0 10px #ef444460" : "0 0 10px #22d3ee60",
          }}
        />
      )}

      {isBle && <BleBadge />}

      {/* 펌프 번호 */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-base font-black text-slate-200">
          INP {inv.id}
        </span>
        <span
          className="font-mono text-sm font-bold"
          style={{
            color: statusColor,
            textShadow: isOn ? "0 0 12px #22d3ee80" : "none",
          }}
        >
          {isError ? "ERROR" : isOn ? "ON" : "OFF"}
        </span>
      </div>

      {/* 수위 바 — 굵게 */}
      <div
        className="mb-2 h-2.5 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(148,163,184,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${inv.tankLevel}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 8px ${barColor}60`,
          }}
        />
      </div>

      {/* 수위 수치 */}
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-600">수위</span>
        <div className="flex items-baseline gap-0.5">
          <span
            className="font-mono text-lg font-bold"
            style={{ color: barColor }}
          >
            {inv.tankLevel.toFixed(0)}
          </span>
          <span className="text-xs text-slate-600">%</span>
        </div>
      </div>
    </div>
  )
}

// ── 부스터 카드 (확대)
const BOOSTER_CYCLE_SEC = 15 * 60

function BoosterCard({ booster }: { booster: BoosterState }) {
  const [tick, setTick] = useState(0)
  const startRef  = useRef<number | null>(null)
  const lastOnRef = useRef<number | null>(null)

  useEffect(() => {
    if (booster.isOn) {
      if (!startRef.current) startRef.current = Date.now()
    } else {
      if (startRef.current) lastOnRef.current = Date.now()
      startRef.current = null
    }
  }, [booster.isOn])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  void tick

  let cycleProgress = 0, cycleLabel = "", cycleColor = "#475569"
  if (booster.isOn && startRef.current) {
    const el = Math.floor((Date.now() - startRef.current) / 1000)
    cycleProgress = Math.min(100, (el / BOOSTER_CYCLE_SEC) * 100)
    const m = Math.floor(el / 60), s = el % 60
    cycleLabel = el < 60 ? `${el}s` : `${m}m${String(s).padStart(2,"0")}s`
    cycleColor = el < 600 ? "#22c55e" : el < 780 ? "#eab308" : "#ef4444"
  } else if (lastOnRef.current) {
    const off = Math.floor((Date.now() - lastOnRef.current) / 1000)
    cycleProgress = Math.min(100, (off / BOOSTER_CYCLE_SEC) * 100)
    const m = Math.floor(off / 60), s = off % 60
    cycleLabel = off < 60 ? `${off}s 전` : `${m}m${String(s).padStart(2,"0")}s 전`
    cycleColor = cycleProgress >= 100 ? "#ef4444" : cycleProgress >= 80 ? "#eab308" : "#38bdf8"
  }

  const ringSize = 52, ringR = 20, ringC = 2 * Math.PI * ringR
  const ringOff = ringC * (1 - cycleProgress / 100)

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4"
      style={{
        background: booster.isOn ? "rgba(96,165,250,0.06)" : "rgba(15,23,42,0.55)",
        border: booster.isOn
          ? "1.5px solid rgba(96,165,250,0.2)"
          : "1px solid rgba(148,163,184,0.07)",
      }}
    >
      {booster.isOn && (
        <div
          className="absolute left-0 top-0 h-full w-[3px] rounded-l-2xl"
          style={{ backgroundColor: "#60a5fa", boxShadow: "0 0 10px #60a5fa60" }}
        />
      )}

      <div className="flex items-center gap-4">
        {/* 링 */}
        <div className="relative flex-shrink-0">
          <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}
            style={{ transform: "rotate(-90deg)" }}>
            <circle cx={ringSize/2} cy={ringSize/2} r={ringR}
              fill="none" stroke="rgba(71,85,105,0.25)" strokeWidth={4}/>
            {cycleProgress > 0 && (
              <circle cx={ringSize/2} cy={ringSize/2} r={ringR}
                fill="none" stroke={cycleColor} strokeWidth={3.5}
                strokeLinecap="round"
                strokeDasharray={`${ringC} ${ringC}`}
                strokeDashoffset={ringOff}
                style={{
                  transition: "stroke-dashoffset 0.8s ease",
                  filter: `drop-shadow(0 0 5px ${cycleColor}80)`,
                  ...(cycleProgress >= 100 && !booster.isOn
                    ? { animation: "pulse-glow 1s ease-in-out infinite" } : {}),
                }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: booster.isOn ? "#60a5fa" : "#334155",
                boxShadow: booster.isOn ? "0 0 8px #60a5fa" : "none",
              }}
            />
          </div>
        </div>

        {/* 정보 */}
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-base font-black text-slate-200">
              BST {booster.id}
            </span>
            <span
              className="font-mono text-sm font-bold"
              style={{ color: booster.isOn ? "#60a5fa" : "#475569" }}
            >
              {booster.isOn ? "ON" : "OFF"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600">15분 사이클</span>
            <span className="font-mono text-xs" style={{ color: cycleColor }}>
              {cycleLabel || "—"}
            </span>
          </div>
          {cycleProgress > 0 && (
            <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "rgba(15,23,42,0.8)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${cycleProgress}%`, backgroundColor: cycleColor }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 메인
interface PumpCardsProps {
  inverters: InverterState[]
  boosters: BoosterState[]
}

export default function PumpCards({ inverters, boosters }: PumpCardsProps) {
  return (
    <div className="space-y-4 pb-4">
      {/* 섹션: 인버터 */}
      <div>
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            인버터 펌프
          </span>
          <div className="h-px flex-1" style={{ background: "rgba(148,163,184,0.08)" }} />
          <span className="font-mono text-xs text-slate-600">
            {inverters.filter(i => i.pumpStatus === "ON").length}/{inverters.length}
          </span>
        </div>
        {/* 2열 그리드 */}
        <div className="grid grid-cols-2 gap-3">
          {inverters.map((inv) => (
            <InverterCard key={inv.id} inv={inv} />
          ))}
        </div>
      </div>

      {/* 섹션: 부스터 */}
      <div>
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            부스터 펌프
          </span>
          <div className="h-px flex-1" style={{ background: "rgba(148,163,184,0.08)" }} />
          <span className="font-mono text-xs text-slate-600">
            {boosters.filter(b => b.isOn).length}/2
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {boosters.map((b) => (
            <BoosterCard key={b.id} booster={b} />
          ))}
        </div>
      </div>
    </div>
  )
}
