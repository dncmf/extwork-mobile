"use client"

// PumpCards.tsx
// 인버터 펌프 1~6 소형 카드 (2열 그리드) + 부스터 펌프 1~2
// INP 표기 + ON/OFF 버튼 추가

import { InverterState, BoosterState, PumpHealth } from "./types"

// ── 수위 바 색상 ────────────────────────────────────────────────
function levelColor(level: number): string {
  if (level < 30) return "#ef4444"   // red-500
  if (level < 70) return "#f59e0b"   // amber-400
  return "#34d399"                   // emerald-400
}

// ── 인버터 카드 (ON/OFF 버튼 포함) ──────────────────────────────
interface InverterCardProps {
  inv: InverterState
  onToggle: (id: number, nextOn: boolean) => void
}

function InverterCard({ inv, onToggle }: InverterCardProps) {
  const isOn    = inv.pumpStatus === "ON"
  const isError = inv.pumpStatus === "ERROR"
  const barColor = isError ? "#ef4444" : levelColor(inv.tankLevel)

  const borderCls = isError
    ? "border-red-500/60"
    : isOn
    ? "border-emerald-500/40"
    : "border-slate-700/50"

  return (
    <div
      className={`rounded-xl border bg-slate-800/70 p-2.5 ${borderCls}`}
      style={isOn ? { boxShadow: "0 0 8px rgba(52,211,153,0.12)" } : undefined}
    >
      {/* 헤더 */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-200">INP {inv.id}</span>
        <div className="flex items-center gap-1">
          {/* v2 health 연결 아이콘 */}
          {inv.health && (
            <>
              <span
                title={`WiFi ${inv.health.rssi ?? "?"}dBm`}
                className={`h-1.5 w-1.5 rounded-full ${inv.health.wifi ? "bg-emerald-400" : "bg-slate-600"}`}
              />
              <span
                title="MQTT"
                className={`h-1.5 w-1.5 rounded-full ${inv.health.mqtt ? "bg-blue-400" : "bg-slate-600"}`}
              />
            </>
          )}
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
              isError
                ? "bg-red-900/60 text-red-400"
                : isOn
                ? "bg-emerald-900/50 text-emerald-400"
                : "bg-slate-700 text-slate-500"
            }`}
          >
            {isError ? "ERR" : isOn ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      {/* 수위 바 */}
      <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${inv.tankLevel}%`, backgroundColor: barColor }}
        />
      </div>

      {/* 수위 수치 + sensor 상태 */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] text-slate-500">
          {inv.sensor?.level === "full" ? "FULL" : inv.sensor?.level === "low" ? "LOW" : "수위"}
        </span>
        <span className={`font-mono text-[10px] font-semibold ${
          inv.sensor?.full ? "text-blue-400" : inv.sensor?.empty ? "text-red-400" : "text-slate-300"
        }`}>
          {inv.sensor != null
            ? inv.sensor.full ? "100%" : inv.sensor.empty ? "0%"
              : inv.sensor.filling ? `채움중 ${inv.sensor.fill_sec ?? 0}s` : "정상"
            : `${inv.tankLevel.toFixed(0)}%`}
        </span>
      </div>

      {/* ON/OFF 버튼 */}
      <button
        onClick={() => onToggle(inv.id, !isOn)}
        className={`w-full rounded-lg py-1 text-[10px] font-bold transition-colors active:scale-95 ${
          isOn
            ? "bg-emerald-600/80 text-white hover:bg-emerald-700"
            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
        }`}
      >
        {isOn ? "ON" : "OFF"}
      </button>
    </div>
  )
}

// ── 부스터 카드 (ON/OFF 토글 버튼 포함) ────────────────────────
interface BoosterCardProps {
  booster: BoosterState
  onToggle: (id: number, nextOn: boolean) => void
}

function BoosterCard({ booster, onToggle }: BoosterCardProps) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
        booster.isOn
          ? "border-blue-500/40 bg-slate-800/80"
          : "border-slate-700/50 bg-slate-800/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            booster.isOn ? "animate-pulse bg-blue-400" : "bg-slate-600"
          }`}
        />
        <span className="text-[11px] font-semibold text-slate-300">BST {booster.id}</span>
      </div>
      {/* ON/OFF 토글 버튼 */}
      <button
        onClick={() => onToggle(booster.id, !booster.isOn)}
        className={`rounded-lg px-3 py-1 text-[10px] font-bold transition-colors active:scale-95 ${
          booster.isOn
            ? "bg-blue-600/80 text-white hover:bg-blue-700"
            : "bg-slate-700 text-slate-400 hover:bg-slate-600"
        }`}
      >
        {booster.isOn ? "ON" : "OFF"}
      </button>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────
interface PumpCardsProps {
  inverters: InverterState[]
  boosters: BoosterState[]
  onInverterToggle: (id: number, nextOn: boolean) => void
  onBoosterToggle: (id: number, nextOn: boolean) => void
}

export default function PumpCards({ inverters, boosters, onInverterToggle, onBoosterToggle }: PumpCardsProps) {
  return (
    <div className="space-y-2.5">
      {/* 섹션 헤더 */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Inverter Pump
      </p>

      {/* 인버터 2열 그리드 */}
      <div className="grid grid-cols-2 gap-2">
        {inverters.map((inv) => (
          <InverterCard key={inv.id} inv={inv} onToggle={onInverterToggle} />
        ))}
      </div>

      {/* 부스터 2열 */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Booster Pump
        </p>
        <div className="grid grid-cols-2 gap-2">
          {boosters.map((b) => (
            <BoosterCard key={b.id} booster={b} onToggle={onBoosterToggle} />
          ))}
        </div>
      </div>
    </div>
  )
}
