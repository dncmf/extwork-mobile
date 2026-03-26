"use client"

// mobile-final/PumpCards.tsx
// 인버터 펌프 1~6 + 부스터 1~2 — 미니멀 카드 그리드

import { useState, useEffect, useRef } from "react"
import { InverterState, BoosterState } from "./types"

// ── BLE 전용 배지 ─────────────────────────────────────────────
// health.mode === "ble_only" 일 때 카드 우상단에 표시
function BleBadge() {
  return (
    <span
      className="absolute right-2 top-2 rounded-md px-1 py-0.5 font-mono text-[8px] font-bold leading-none tracking-wide"
      style={{
        background: "rgba(168, 85, 247, 0.15)",
        border: "1px solid rgba(168, 85, 247, 0.35)",
        color: "#c084fc",
        boxShadow: "0 0 6px rgba(168, 85, 247, 0.2)",
      }}
      title="Wi-Fi 끊김 — BLE 전용 동작 중"
    >
      BLE
    </span>
  )
}

// ── 수위 바 색상 ──────────────────────────────────────────────
function levelColor(level: number): string {
  if (level < 30) return "#ef4444"
  if (level < 70) return "#fbbf24"
  return "#34d399"
}

// ── 인버터 카드 ───────────────────────────────────────────────
function InverterCard({ inv }: { inv: InverterState }) {
  const isOn    = inv.pumpStatus === "ON"
  const isError = inv.pumpStatus === "ERROR"
  const isBleOnly = inv.health?.mode === "ble_only"
  const barColor = isError ? "#ef4444" : levelColor(inv.tankLevel)

  return (
    <div
      className="glass-card relative overflow-hidden p-2.5"
      style={isOn ? { borderColor: "rgba(34,211,238,0.15)" } : undefined}
    >
      {/* BLE 전용 배지 */}
      {isBleOnly && <BleBadge />}
      {/* 활성 인디케이터 — 좌측 스트라이프 */}
      {isOn && (
        <div
          className="absolute left-0 top-0 h-full w-[2px]"
          style={{ backgroundColor: "#22d3ee", boxShadow: "0 0 8px #22d3ee40" }}
        />
      )}
      {isError && (
        <div className="absolute left-0 top-0 h-full w-[2px] bg-red-500" />
      )}

      {/* 헤더 */}
      {/* BLE 배지가 우상단을 차지할 때 상태 레이블을 오른쪽에서 제거해 겹침 방지 */}
      <div className={`mb-2 flex items-center ${isBleOnly ? "justify-start" : "justify-between"}`}>
        <span className="font-mono text-[11px] font-semibold text-slate-300">
          INP {inv.id}
        </span>
        {!isBleOnly && (
          <span
            className="font-mono text-[9px] font-bold"
            style={{
              color: isError ? "#ef4444" : isOn ? "#22d3ee" : "#475569",
            }}
          >
            {isError ? "ERR" : isOn ? "ON" : "OFF"}
          </span>
        )}
      </div>

      {/* 수위 바 — 슬림 */}
      <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${inv.tankLevel}%`, backgroundColor: barColor }}
        />
      </div>

      {/* 수치 */}
      <div className="flex items-baseline justify-end gap-0.5">
        <span className="font-mono text-[12px] font-bold text-slate-300">
          {inv.tankLevel.toFixed(0)}
        </span>
        <span className="text-[8px] text-slate-600">%</span>
      </div>
    </div>
  )
}

// ── 부스터 카드 (15분 사이클 트래커 포함) ──────────────────
const BOOSTER_CYCLE_SEC = 15 * 60 // 15분

function BoosterCard({ booster }: { booster: BoosterState }) {
  const [tick, setTick] = useState(0)
  const startRef  = useRef<number | null>(null)
  const lastOnRef = useRef<number | null>(null)

  // 가동 시작/종료 추적
  useEffect(() => {
    if (booster.isOn) {
      if (!startRef.current) startRef.current = Date.now()
    } else {
      if (startRef.current) lastOnRef.current = Date.now()
      startRef.current = null
    }
  }, [booster.isOn])

  // 매초 tick
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  void tick

  // 15분 사이클 계산
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
  const ringSize = 36, ringR = 14, ringC = 2 * Math.PI * ringR
  const ringOff = ringC * (1 - cycleProgress / 100)

  return (
    <div
      className="glass-card relative flex items-center gap-3 px-3 py-2.5"
      style={booster.isOn ? { borderColor: "rgba(96,165,250,0.15)" } : undefined}
    >
      {/* 15분 링 미니 SVG */}
      <div className="relative flex-shrink-0">
        <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}
          style={{ transform: "rotate(-90deg)" }}>
          <circle cx={ringSize/2} cy={ringSize/2} r={ringR}
            fill="none" stroke="rgba(71,85,105,0.3)" strokeWidth={3}/>
          {cycleProgress > 0 && (
            <circle cx={ringSize/2} cy={ringSize/2} r={ringR}
              fill="none" stroke={cycleColor} strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={`${ringC} ${ringC}`}
              strokeDashoffset={ringOff}
              style={{
                transition: "stroke-dashoffset 0.8s ease",
                filter: `drop-shadow(0 0 3px ${cycleColor}88)`,
                ...(cycleProgress >= 100 && !booster.isOn
                  ? { animation: "pulse-glow 1s ease-in-out infinite" } : {}),
              }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: booster.isOn ? "#60a5fa" : "#334155",
              boxShadow: booster.isOn ? "0 0 6px #60a5fa" : "none",
            }}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-semibold text-slate-400">
            BST {booster.id}
          </span>
          <span className="font-mono text-[10px] font-bold"
            style={{ color: booster.isOn ? "#60a5fa" : "#475569" }}>
            {booster.isOn ? "ON" : "OFF"}
          </span>
        </div>
        {cycleLabel ? (
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[8px] font-mono" style={{ color: cycleColor }}>
              15m: {cycleLabel}
            </span>
            <span className="text-[8px] font-mono text-slate-600">
              {Math.round(cycleProgress)}%
            </span>
          </div>
        ) : (
          <span className="mt-0.5 text-[8px] font-mono text-slate-700">15m: —</span>
        )}
      </div>
    </div>
  )
}

// ── 메인 ──────────────────────────────────────────────────────
interface PumpCardsProps {
  inverters: InverterState[]
  boosters: BoosterState[]
}

export default function PumpCards({ inverters, boosters }: PumpCardsProps) {
  return (
    <div className="space-y-2">
      {/* 섹션 레이블 */}
      <div className="flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-slate-600">
          Pumps
        </span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      {/* 인버터 3열 그리드 */}
      <div className="grid grid-cols-3 gap-2">
        {inverters.map((inv) => (
          <InverterCard key={inv.id} inv={inv} />
        ))}
      </div>

      {/* 부스터 2열 */}
      <div className="grid grid-cols-2 gap-2">
        {boosters.map((b) => (
          <BoosterCard key={b.id} booster={b} />
        ))}
      </div>
    </div>
  )
}
