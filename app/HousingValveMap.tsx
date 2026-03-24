"use client"

// HousingValveMap.tsx -- 하우징 밸브 P&ID
// 2026-03-19: 수지탱크 1, 2 상자 추가
// 2026-03-25: INP 1~6 본탱크 수위 표시 추가

import { useMemo } from "react"
import { PipeFlows } from "./valve-flows"
import { InverterState } from "./types"

interface HousingValveMapProps {
  relayState: number[]
  pipeFlows: PipeFlows
  resinElapsedSeconds?: number
  inverters?: InverterState[]
}

const C = {
  PIPE_FLOW:  "#34d399",
  PIPE_IDLE:  "#475569",
  VALVE_ON:   "#818cf8",
  VALVE_OFF:  "#64748b",
  VALVE_BODY: "#1e293b",
  LABEL:      "#94a3b8",
  DOT_ON:     "#34d399",
  DOT_OFF:    "#ef4444",
  RESIN_BDR:  "#3b82f6",
}

const TOTAL_LOADING_SEC = 36000

function calcResinLoadColor(elapsedSeconds: number) {
  const clamped  = Math.min(Math.max(elapsedSeconds, 0), TOTAL_LOADING_SEC)
  const progress = clamped / TOTAL_LOADING_SEC
  const gray     = Math.round(255 * (1 - progress))
  return {
    fillColor: `rgb(${gray}, ${gray}, ${gray})`,
    textColor: gray < 128 ? "#f1f5f9" : "#0f172a",
    progress,
  }
}

function Pipe({ d, flowing, dashed = false }: { d: string; flowing: boolean; dashed?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={flowing ? C.PIPE_FLOW : C.PIPE_IDLE}
      strokeWidth={flowing ? 2.5 : 1.5}
      strokeDasharray={dashed ? "4 3" : flowing ? "8 4" : "none"}
      strokeLinecap="round"
      style={flowing ? { animation: "mf-dash 1.1s linear infinite" } : undefined}
    />
  )
}

function Valve({ cx, cy, label, isOn }: { cx: number; cy: number; label: string; isOn: boolean }) {
  const fill = isOn ? C.VALVE_ON : C.VALVE_OFF
  return (
    <g>
      <polygon points={`${cx-8},${cy-6} ${cx+8},${cy-6} ${cx},${cy}`} fill={fill} opacity={0.9} />
      <polygon points={`${cx-8},${cy+6} ${cx+8},${cy+6} ${cx},${cy}`} fill={fill} opacity={0.9} />
      <circle cx={cx} cy={cy} r={2.5} fill={isOn ? "#a5f3fc" : C.VALVE_OFF} />
      <circle cx={cx + 9} cy={cy - 8} r={3.5} fill={isOn ? C.DOT_ON : C.DOT_OFF} />
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize={8} fill={C.LABEL} fontFamily="monospace">{label}</text>
    </g>
  )
}

function SmallValve({ cx, cy, label, isOn }: { cx: number; cy: number; label: string; isOn: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={C.VALVE_BODY} stroke={isOn ? C.VALVE_ON : C.VALVE_OFF} strokeWidth={1.5} />
      <text x={cx} y={cy + 3} textAnchor="middle" fontSize={6} fill={C.LABEL} fontFamily="monospace">{label}</text>
      <circle cx={cx + 9} cy={cy - 8} r={3} fill={isOn ? C.DOT_ON : C.DOT_OFF} />
    </g>
  )
}

function Tank({ x, y, w, h, label, active }: {
  x: number; y: number; w: number; h: number; label: string; active: boolean
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3}
        fill={C.VALVE_BODY} stroke={active ? C.PIPE_FLOW : C.PIPE_IDLE}
        strokeWidth={active ? 2 : 1}
      />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle"
        fontSize={7.5} fill={C.LABEL} fontFamily="monospace">{label}</text>
    </g>
  )
}

// 인버터 펌프 본탱크 — 실린더형 (SVG 내부)
function InvTankCylinder({ x, y, inv }: { x: number; y: number; inv: InverterState }) {
  const W = 42, bodyH = 36, ry = 5
  const isOn    = inv.pumpStatus === "ON"
  const isError = inv.pumpStatus === "ERROR"
  const lvl     = Math.min(100, Math.max(0, inv.tankLevel))
  const fillH   = Math.round(bodyH * lvl / 100)
  const waterColor = isError ? "#ef4444" : lvl < 30 ? "#7f1d1d" : lvl < 70 ? "#78350f" : "#1e40af"
  const strokeColor = isError ? "#ef4444" : isOn ? "#60a5fa" : "#334155"
  const bodyY = y + ry * 2   // 상단 타원 공간 확보

  const clipId = `clip-tank-${inv.id}`

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x} y={bodyY} width={W} height={bodyH} />
        </clipPath>
      </defs>

      {/* 탱크 몸통 배경 */}
      <rect x={x} y={bodyY} width={W} height={bodyH}
        fill="#0c1829" stroke={strokeColor} strokeWidth={1.2} />

      {/* 수위 채움 (클립) */}
      {fillH > 0 && (
        <rect x={x} y={bodyY + bodyH - fillH} width={W} height={fillH}
          fill={waterColor} opacity={0.85} clipPath={`url(#${clipId})`} />
      )}

      {/* 상단 타원 (뚜껑) */}
      <ellipse cx={x + W / 2} cy={bodyY} rx={W / 2} ry={ry}
        fill="#0c1829" stroke={strokeColor} strokeWidth={1.2} />

      {/* 하단 타원 (바닥) */}
      <ellipse cx={x + W / 2} cy={bodyY + bodyH} rx={W / 2} ry={ry}
        fill={fillH > 0 ? waterColor : "#0c1829"}
        stroke={strokeColor} strokeWidth={1.2} opacity={0.9} />

      {/* 수위 텍스트 */}
      <text x={x + W / 2} y={bodyY + bodyH / 2 + 3} textAnchor="middle"
        fontSize={8} fill="#cbd5e1" fontFamily="monospace" fontWeight="bold">
        {lvl.toFixed(0)}%
      </text>

      {/* 하단 라벨 */}
      <text x={x + W / 2} y={bodyY + bodyH + ry * 2 + 7} textAnchor="middle"
        fontSize={7.5} fill="#94a3b8" fontFamily="monospace">
        {inv.id}번 탱크
      </text>

      {/* 펌프 상태 점 */}
      <circle cx={x + W - 4} cy={y + 4} r={3}
        fill={isError ? "#ef4444" : isOn ? "#34d399" : "#475569"} />
    </g>
  )
}

// 수지탱크 상자 — 40x40, 흰색(0h)→검정(10h)
function ResinTankBox({ x, y, label, elapsedSeconds }: {
  x: number; y: number; label: string; elapsedSeconds: number
}) {
  const size = 40
  const { fillColor, textColor } = calcResinLoadColor(elapsedSeconds)
  return (
    <g>
      {/* 상단 라벨 */}
      <text x={x + size / 2} y={y - 3} textAnchor="middle" fontSize={7} fill={C.LABEL} fontFamily="monospace">
        {"\uC218\uC9C0\uD0F1\uD06C"}
      </text>
      {/* 상자 */}
      <rect x={x} y={y} width={size} height={size} rx={4}
        fill={fillColor} stroke={C.RESIN_BDR} strokeWidth={1.5}
      />
      {/* 중앙 숫자 */}
      <text x={x + size / 2} y={y + size / 2 + 5}
        textAnchor="middle" fontSize={16} fontWeight="bold"
        fill={textColor} fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  )
}

export default function HousingValveMap({
  relayState,
  pipeFlows: pf,
  resinElapsedSeconds = 0,
  inverters = [],
}: HousingValveMapProps) {
  const v = useMemo(
    () => Array.from({ length: 8 }, (_, i) => (relayState[i] ?? 0) === 1),
    [relayState]
  )

  return (
    <div className="relative w-full rounded-xl border border-slate-700/60 bg-slate-900/80 p-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Housing Valve P&amp;ID
      </p>

      <svg viewBox="0 0 320 340" className="w-full" style={{ maxHeight: 340 }}>
        <defs>
          <style>{`@keyframes mf-dash { to { stroke-dashoffset: -20; } }`}</style>
        </defs>

        {/* 상단 라인 A: SUIDO → V1 → 레진 → V2 → 분기 */}
        <text x={4} y={60} fontSize={8} fill={C.LABEL} fontFamily="monospace">SUIDO</text>
        <Pipe d="M 42 56 H 76" flowing={pf.suidoToV1} />
        <Valve cx={84} cy={56} label="V1" isOn={v[0]} />
        <Pipe d="M 98 56 H 136" flowing={pf.v1ToResin} />
        <Tank x={136} y={40} w={28} h={32} label="RES" active={pf.v1ToResin || pf.v4ToResin} />
        <Pipe d="M 164 56 H 198" flowing={pf.resinToV2} />
        <Valve cx={206} cy={56} label="V2" isOn={v[1]} />
        <Pipe d="M 220 56 H 262" flowing={pf.v2ToDrain} />
        <text x={264} y={60} fontSize={8} fill={C.LABEL} fontFamily="monospace">DRN</text>

        {/* V2 → V3 하단 분기 */}
        <Pipe d="M 206 68 V 100" flowing={pf.v2ToV3} />
        <Valve cx={206} cy={108} label="V3" isOn={v[2]} />
        <Pipe d="M 220 108 H 258" flowing={pf.v3ToCollect} />
        <Tank x={258} y={94} w={38} h={28} label="COLL" active={pf.v3ToCollect || pf.v7ToCollect} />
        <Pipe d="M 192 108 H 158" flowing={pf.v3ToReturn} dashed />
        <text x={128} y={112} fontSize={8} fill={C.LABEL} fontFamily="monospace">RET</text>

        {/* V1 하단 분기: V1 → 탱크 → V4 */}
        <Pipe d="M 84 68 V 143" flowing={pf.v1ToTank} />
        <Tank x={64} y={143} w={40} h={32} label="TANK" active={pf.tankToV4} />
        <Pipe d="M 104 159 H 132" flowing={pf.tankToV4} />
        <Valve cx={140} cy={159} label="V4" isOn={v[3]} />
        <Pipe d="M 148 159 H 170 V 72 H 150" flowing={pf.v4ToResin} />
        <Pipe d="M 140 171 V 213 H 262" flowing={pf.v4ToDrain} />

        {/* 하단 라인 B: SUIDO2 → V5 → V6 → V7 */}
        <text x={4} y={210} fontSize={8} fill={C.LABEL} fontFamily="monospace">SUIDO2</text>
        <Pipe d="M 46 206 H 68" flowing={pf.suidoToV5} />
        <Valve cx={76} cy={206} label="V5" isOn={v[4]} />
        <Pipe d="M 90 206 H 116" flowing={pf.v5ToV6} />
        <Pipe d="M 76 218 V 233 H 262" flowing={pf.v5ToDrain} dashed />
        <Valve cx={124} cy={206} label="V6" isOn={v[5]} />
        <Pipe d="M 138 206 H 172" flowing={pf.v6ToDrain} />
        <text x={174} y={210} fontSize={8} fill={C.LABEL} fontFamily="monospace">DRN</text>
        <Pipe d="M 124 218 V 238" flowing={pf.v6ToV7} />
        <SmallValve cx={124} cy={240} label="V7" isOn={v[6]} />
        <Pipe d="M 132 240 H 268 V 122" flowing={pf.v7ToCollect} />
        <Pipe d="M 116 240 H 88" flowing={pf.v7ToReturn} dashed />
        <text x={58} y={244} fontSize={8} fill={C.LABEL} fontFamily="monospace">RET</text>

        {/* V8 독립 */}
        <SmallValve cx={283} cy={165} label="V8" isOn={v[7]} />

        {/* 공통 드레인 세로 라인 */}
        <Pipe d="M 262 56 V 233" flowing={pf.v2ToDrain || pf.v4ToDrain || pf.v5ToDrain} />
        <text x={268} y={242} fontSize={8} fill={C.LABEL} fontFamily="monospace">DRN</text>

        {/* 수지탱크 1, 2 — Standby 영역 (좌측 하단 빈 공간) */}
        <text x={4} y={192} fontSize={7} fill="#475569" fontFamily="monospace">Standby</text>
        <ResinTankBox x={4}  y={197} label="1" elapsedSeconds={resinElapsedSeconds} />
        <ResinTankBox x={50} y={197} label="2" elapsedSeconds={resinElapsedSeconds} />

        {/* INP 1~6 본탱크 (실린더형) */}
        {inverters.length > 0 && (
          <g>
            <text x={4} y={276} fontSize={7} fill="#475569" fontFamily="monospace">본탱크</text>
            {inverters.map((inv, i) => (
              <InvTankCylinder
                key={inv.id}
                x={4 + i * 52}
                y={278}
                inv={inv}
              />
            ))}
          </g>
        )}
      </svg>

      {/* 범례 */}
      <div className="mt-1 flex flex-wrap items-center gap-3 px-1">
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-5 rounded-full bg-emerald-400" />
          <span className="text-[9px] text-slate-500">{"\uD750\uB984"}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-5 rounded-full bg-slate-600" />
          <span className="text-[9px] text-slate-500">{"\uC815\uC9C0"}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[9px] text-slate-500">ON</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-[9px] text-slate-500">OFF</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex h-3 w-8 overflow-hidden rounded border border-blue-500">
            <div className="h-full w-1/4 bg-white" />
            <div className="h-full w-1/4 bg-gray-400" />
            <div className="h-full w-1/4 bg-gray-700" />
            <div className="h-full w-1/4 bg-black" />
          </div>
          <span className="text-[9px] text-slate-500">{"\uC218\uC9C0\uB85C\uB529"}</span>
        </div>
      </div>
    </div>
  )
}
