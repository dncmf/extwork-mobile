"use client"

// mobile-final/HousingValveMap.tsx
// 하우징 밸브 P&ID 미니맵 — 미래지향적 스타일
//
// 토폴로지 (변경 없음):
//   수도(SUIDO)  -> V1 -> 레진 -> V2 -> [드레인 / V3 -> [수집/리턴]]
//   수도(SUIDO2) -> V5 -> [V6 -> [드레인/V7->[수집/리턴]] / 드레인]

import { useMemo } from "react"
import { PipeFlows } from "./valve-flows"

interface HousingValveMapProps {
  relayState: number[]
  pipeFlows: PipeFlows
}

// ── 색상 팔레트 (미래지향적) ─────────────────────────────────────
const C = {
  PIPE_FLOW:  "#22d3ee",   // cyan-400
  PIPE_IDLE:  "#1e293b",   // slate-800
  VALVE_ON:   "#818cf8",   // violet-400
  VALVE_OFF:  "#334155",   // slate-700
  VALVE_BODY: "#0f172a",   // slate-900
  LABEL:      "#64748b",   // slate-500
  DOT_ON:     "#34d399",   // emerald-400
  DOT_OFF:    "#475569",   // slate-600 (less alarming)
}

// ── 파이프 ────────────────────────────────────────────────────
function Pipe({ d, flowing, dashed = false }: { d: string; flowing: boolean; dashed?: boolean }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={flowing ? C.PIPE_FLOW : C.PIPE_IDLE}
      strokeWidth={flowing ? 2 : 1.2}
      strokeDasharray={dashed ? "4 3" : flowing ? "6 4" : "none"}
      strokeLinecap="round"
      style={flowing ? {
        animation: "mf-dash 1.2s linear infinite",
        filter: "drop-shadow(0 0 3px rgba(34,211,238,0.3))",
      } : undefined}
    />
  )
}

// ── 3-way 밸브 ────────────────────────────────────────────────
function Valve({ cx, cy, label, isOn }: {
  cx: number; cy: number; label: string; isOn: boolean
}) {
  const fill = isOn ? C.VALVE_ON : C.VALVE_OFF
  return (
    <g>
      <polygon points={`${cx-7},${cy-5} ${cx+7},${cy-5} ${cx},${cy}`} fill={fill} opacity={0.85} />
      <polygon points={`${cx-7},${cy+5} ${cx+7},${cy+5} ${cx},${cy}`} fill={fill} opacity={0.85} />
      <circle cx={cx} cy={cy} r={2} fill={isOn ? "#c4b5fd" : C.VALVE_OFF} />
      <circle cx={cx + 9} cy={cy - 7} r={3} fill={isOn ? C.DOT_ON : C.DOT_OFF} />
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">
        {label}
      </text>
    </g>
  )
}

// ── 소형 밸브 (V7, V8) ────────────────────────────────────────
function SmallValve({ cx, cy, label, isOn }: {
  cx: number; cy: number; label: string; isOn: boolean
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={C.VALVE_BODY} stroke={isOn ? C.VALVE_ON : C.VALVE_OFF} strokeWidth={1.2} />
      <text x={cx} y={cy + 2.5} textAnchor="middle" fontSize={5.5} fill={C.LABEL} fontFamily="var(--font-mono), monospace">{label}</text>
      <circle cx={cx + 8} cy={cy - 7} r={2.5} fill={isOn ? C.DOT_ON : C.DOT_OFF} />
    </g>
  )
}

// ── 탱크 ──────────────────────────────────────────────────────
function Tank({ x, y, w, h, label, active }: {
  x: number; y: number; w: number; h: number; label: string; active: boolean
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3}
        fill={C.VALVE_BODY}
        stroke={active ? C.PIPE_FLOW : C.PIPE_IDLE}
        strokeWidth={active ? 1.5 : 0.8}
        style={active ? { filter: "drop-shadow(0 0 4px rgba(34,211,238,0.2))" } : undefined}
      />
      <text x={x + w / 2} y={y + h / 2 + 3.5} textAnchor="middle"
        fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">
        {label}
      </text>
    </g>
  )
}

// ── 메인 ──────────────────────────────────────────────────────
export default function HousingValveMap({ relayState, pipeFlows: pf }: HousingValveMapProps) {
  const v = useMemo(
    () => Array.from({ length: 8 }, (_, i) => (relayState[i] ?? 0) === 1),
    [relayState]
  )

  // 활성 밸브 수
  const activeCount = v.filter(Boolean).length

  return (
    <div className="overflow-hidden" style={{ background: "rgba(6,8,15,0.8)", minHeight: "calc(100vh - 120px)" }}>
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between px-2 pt-4">
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-slate-800" />
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
            P&amp;ID
          </span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>
        <span className="font-mono text-xs font-medium text-slate-400">
          {activeCount}/8
        </span>
      </div>

      <svg viewBox="0 0 320 255" className="w-full" style={{ maxHeight: "calc(100vh - 200px)", minHeight: 300 }}>
        <defs>
          <style>{`
            @keyframes mf-dash { to { stroke-dashoffset: -20; } }
          `}</style>
        </defs>

        {/* ── 상단 라인 A: SUIDO -> V1 -> 레진 -> V2 -> 분기 ── */}
        <text x={4} y={60} fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">SUIDO</text>
        <Pipe d="M 42 56 H 76" flowing={pf.suidoToV1} />
        <Valve cx={84} cy={56} label="V1" isOn={v[0]} />
        <Pipe d="M 98 56 H 136" flowing={pf.v1ToResin} />
        <Tank x={136} y={40} w={28} h={32} label="RES" active={pf.v1ToResin || pf.v4ToResin} />
        <Pipe d="M 164 56 H 198" flowing={pf.resinToV2} />
        <Valve cx={206} cy={56} label="V2" isOn={v[1]} />
        <Pipe d="M 220 56 H 262" flowing={pf.v2ToDrain} />
        <text x={264} y={60} fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">DRN</text>

        {/* V2 -> V3 하단 분기 */}
        <Pipe d="M 206 68 V 100" flowing={pf.v2ToV3} />
        <Valve cx={206} cy={108} label="V3" isOn={v[2]} />
        <Pipe d="M 220 108 H 258" flowing={pf.v3ToCollect} />
        <Tank x={258} y={94} w={38} h={28} label="COLL" active={pf.v3ToCollect || pf.v7ToCollect} />
        <Pipe d="M 192 108 H 158" flowing={pf.v3ToReturn} dashed />
        <text x={128} y={112} fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">RET</text>

        {/* ── V1 하단 분기: V1 -> 탱크 -> V4 ── */}
        <Pipe d="M 84 68 V 143" flowing={pf.v1ToTank} />
        <Tank x={64} y={143} w={40} h={32} label="TANK" active={pf.tankToV4} />
        <Pipe d="M 104 159 H 132" flowing={pf.tankToV4} />
        <Valve cx={140} cy={159} label="V4" isOn={v[3]} />
        <Pipe d="M 148 159 H 170 V 72 H 150" flowing={pf.v4ToResin} />
        <Pipe d="M 140 171 V 213 H 262" flowing={pf.v4ToDrain} />

        {/* ── 하단 라인 B: SUIDO2 -> V5 -> V6 -> V7 ── */}
        <text x={4} y={210} fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">SUIDO2</text>
        <Pipe d="M 46 206 H 68" flowing={pf.suidoToV5} />
        <Valve cx={76} cy={206} label="V5" isOn={v[4]} />
        <Pipe d="M 90 206 H 116" flowing={pf.v5ToV6} />
        <Pipe d="M 76 218 V 233 H 262" flowing={pf.v5ToDrain} dashed />
        <Valve cx={124} cy={206} label="V6" isOn={v[5]} />
        <Pipe d="M 138 206 H 172" flowing={pf.v6ToDrain} />
        <text x={174} y={210} fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">DRN</text>
        <Pipe d="M 124 218 V 238" flowing={pf.v6ToV7} />
        <SmallValve cx={124} cy={240} label="V7" isOn={v[6]} />
        <Pipe d="M 132 240 H 268 V 122" flowing={pf.v7ToCollect} />
        <Pipe d="M 116 240 H 88" flowing={pf.v7ToReturn} dashed />
        <text x={58} y={244} fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">RET</text>

        {/* ── V8 독립 ── */}
        <SmallValve cx={283} cy={165} label="V8" isOn={v[7]} />

        {/* 공통 드레인 세로 라인 */}
        <Pipe d="M 262 56 V 233" flowing={pf.v2ToDrain || pf.v4ToDrain || pf.v5ToDrain} />
        <text x={268} y={242} fontSize={7} fill={C.LABEL} fontFamily="var(--font-mono), monospace">DRN</text>
      </svg>

      {/* 미니멀 범례 */}
      <div className="mt-1 flex items-center justify-center gap-4 px-1">
        <div className="flex items-center gap-1">
          <div className="h-[3px] w-4 rounded-full" style={{ backgroundColor: C.PIPE_FLOW }} />
          <span className="text-xs text-slate-500">흐름</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: C.DOT_ON }} />
          <span className="text-xs text-slate-500">ON</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: C.DOT_OFF }} />
          <span className="text-xs text-slate-500">OFF</span>
        </div>
      </div>
    </div>
  )
}
