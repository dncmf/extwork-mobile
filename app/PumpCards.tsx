"use client"

// mobile-final/PumpCards.tsx
// 인버터 펌프 1~6 + 부스터 1~2 — 미니멀 카드 그리드

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

// ── 부스터 카드 ───────────────────────────────────────────────
function BoosterCard({ booster }: { booster: BoosterState }) {
  return (
    <div
      className="glass-card flex items-center justify-between px-3 py-2.5"
      style={booster.isOn ? { borderColor: "rgba(96,165,250,0.15)" } : undefined}
    >
      <div className="flex items-center gap-2">
        {booster.isOn && (
          <div
            className="h-1.5 w-1.5 rounded-full bg-blue-400"
            style={{ boxShadow: "0 0 6px #60a5fa" }}
          />
        )}
        <span className="font-mono text-[11px] font-semibold text-slate-400">
          BST {booster.id}
        </span>
      </div>
      <span
        className="font-mono text-[10px] font-bold"
        style={{ color: booster.isOn ? "#60a5fa" : "#475569" }}
      >
        {booster.isOn ? "ON" : "OFF"}
      </span>
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
