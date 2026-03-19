"use client"

// ExtractionFlowMap.tsx
// CMXF 순환추출 흐름 P&ID 미니맵 (모바일 전용 SVG)
//
// 흐름 구조:
//   [본탱크(MainTank)]
//       ↓ V9 (부스터 ON 시 흐름 생성)
//   [invP-1][invP-2][invP-3][invP-4][invP-5][invP-6]
//   [탱크1 ][탱크2 ][탱크3 ][탱크4 ][탱크5 ][탱크6 ]
//              ↓ V1~V8 밸브 경로 결정
//         [수지탱크 / 레진컬럼]  ← 로딩 상태 색상 표시 (흰→검)
//              ↓
//         [집수탱크(Collect)]
//
// 수지탱크 로딩 색상 기준 (총 10시간 = 36000초):
//   0h(흰색) → 2.5h(연회색) → 5h(중간회색) → 7.5h(진회색) → 10h(검정)
//   progress = elapsedSeconds / 36000  (0.0 ~ 1.0)
//   gray = Math.round(255 * (1 - progress))
//   color = rgb(gray, gray, gray)
//
// 데이터 소스:
//   MQTT dnature/factory/zone1/inverter/output 또는 progress 토픽
//   ProcessProgress.elapsedTime (초 단위)
//   없으면 remainingTime으로 역산 (elapsedTime + remainingTime = 36000 기준)

import { useMemo } from "react"
import { InverterState, BoosterState, ProcessProgress } from "./types"

// ============================================================
// 색상 팔레트
// ============================================================
const C = {
  FLOW:        "#34d399",  // emerald-400
  IDLE:        "#475569",  // slate-600
  ERR:         "#ef4444",  // red-500
  WARN:        "#f59e0b",  // amber-400
  TANK_BG:     "#0f172a",  // slate-950
  TANK_BDR:    "#334155",  // slate-700
  BOX_BG:      "#1e293b",  // slate-800
  LABEL:       "#94a3b8",  // slate-400
  LABEL_DIM:   "#475569",  // slate-600
  RESIN_BDR:   "#3b82f6",  // blue-500
  COLLECT_BG:  "#0c4a6e",  // cyan-950
  COLLECT_BDR: "#06b6d4",  // cyan-500
  MAIN_BG:     "#1c1917",  // stone-900
  MAIN_BDR:    "#78716c",  // stone-500
}

// ============================================================
// 수지탱크 로딩 색상 계산
// ============================================================
const TOTAL_LOADING_SEC = 36000  // 10시간

function calcResinLoadColor(elapsedSeconds: number): {
  fillColor: string
  textColor: string
  progress: number
} {
  const clamped = Math.min(Math.max(elapsedSeconds, 0), TOTAL_LOADING_SEC)
  const progress = clamped / TOTAL_LOADING_SEC
  const gray = Math.round(255 * (1 - progress))
  const fillColor = `rgb(${gray}, ${gray}, ${gray})`
  // 중간 이상 어두우면 흰 텍스트, 밝으면 검정 텍스트
  const textColor = gray < 128 ? "#f1f5f9" : "#0f172a"
  return { fillColor, textColor, progress }
}

// ============================================================
// 흐름 계산
// ============================================================
interface ExtractionFlows {
  mainToV9:       boolean
  v9ToInv:        boolean[]
  invToTank:      boolean[]
  tankToResin:    boolean
  resinToCollect: boolean
  boosterActive:  boolean
}

function calcExtractionFlows(
  relayState: number[],
  inverters:  InverterState[],
  boosterOn:  boolean
): ExtractionFlows {
  const anyValveOpen = relayState.slice(0, 8).some((r) => r === 1)
  const v9Active     = boosterOn
  const invFlows     = inverters.map((inv) => v9Active && inv.pumpStatus === "ON")
  return {
    mainToV9:       v9Active,
    v9ToInv:        invFlows,
    invToTank:      invFlows,
    tankToResin:    anyValveOpen,
    resinToCollect: anyValveOpen,
    boosterActive:  boosterOn,
  }
}

// ============================================================
// SVG 단위 컴포넌트
// ============================================================
function FlowPipe({
  d, flowing, dashed = false, strokeWidth,
}: {
  d: string
  flowing: boolean
  dashed?: boolean
  strokeWidth?: number
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={flowing ? C.FLOW : C.IDLE}
      strokeWidth={strokeWidth ?? (flowing ? 2 : 1.5)}
      strokeDasharray={
        dashed ? "4 3" : flowing ? "8 4" : undefined
      }
      strokeLinecap="round"
      style={flowing ? { animation: "ef-dash 1.2s linear infinite" } : undefined}
    />
  )
}

function PumpNode({
  cx, cy, r, label, status,
}: {
  cx: number
  cy: number
  r:  number
  label: string
  status: "ON" | "OFF" | string
}) {
  const isOn  = status === "ON"
  const isErr = status === "ERROR" || status === "ERR"
  const color = isErr ? C.ERR : isOn ? C.FLOW : C.IDLE
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={C.BOX_BG} stroke={color} strokeWidth={isOn ? 2 : 1} />
      <line x1={cx - r * 0.5} y1={cy}   x2={cx + r * 0.5} y2={cy}   stroke={color} strokeWidth={1} />
      <line x1={cx}            y1={cy - r * 0.5} x2={cx} y2={cy + r * 0.5} stroke={color} strokeWidth={1} />
      <text
        x={cx} y={cy + r + 9}
        textAnchor="middle" fontSize={7}
        fill={isOn ? C.FLOW : C.LABEL_DIM}
        fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  )
}

function TankNode({
  x, y, w, h, label, level, flowing,
}: {
  x: number; y: number; w: number; h: number
  label: string; level: number; flowing: boolean
}) {
  const fillH  = Math.min(h - 2, Math.max(0, ((h - 2) * level) / 100))
  const fillY  = y + h - 1 - fillH
  const lvlColor =
    level < 20 ? C.ERR : level < 50 ? C.WARN : C.FLOW

  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={2}
        fill={C.TANK_BG}
        stroke={flowing ? C.FLOW : C.TANK_BDR}
        strokeWidth={flowing ? 1.5 : 1}
      />
      {level > 0 && (
        <rect
          x={x + 1} y={fillY} width={w - 2} height={fillH} rx={1}
          fill={lvlColor} opacity={0.4}
        />
      )}
      <text
        x={x + w / 2} y={y + h / 2 + 3}
        textAnchor="middle" fontSize={7}
        fill={C.LABEL} fontFamily="monospace"
      >
        {label}
      </text>
    </g>
  )
}

function BoxNode({
  x, y, w, h, label, sublabel, bdrColor, bgColor,
}: {
  x: number; y: number; w: number; h: number
  label: string; sublabel?: string
  bdrColor: string; bgColor: string
}) {
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={3}
        fill={bgColor} stroke={bdrColor} strokeWidth={1.5}
      />
      <text
        x={x + w / 2} y={y + h / 2 + (sublabel ? -2 : 3)}
        textAnchor="middle" fontSize={8} fontWeight="bold"
        fill={bdrColor} fontFamily="monospace"
      >
        {label}
      </text>
      {sublabel && (
        <text
          x={x + w / 2} y={y + h / 2 + 9}
          textAnchor="middle" fontSize={6.5}
          fill={C.LABEL_DIM} fontFamily="monospace"
        >
          {sublabel}
        </text>
      )}
    </g>
  )
}

// V9 밸브 심볼 (다이아몬드형)
function ValveV9({
  cx, cy, active,
}: {
  cx: number; cy: number; active: boolean
}) {
  const color = active ? C.FLOW : C.IDLE
  return (
    <g>
      <polygon
        points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`}
        fill={C.BOX_BG} stroke={color} strokeWidth={active ? 2 : 1}
      />
      <text
        x={cx} y={cy + 3}
        textAnchor="middle" fontSize={6}
        fill={color} fontFamily="monospace" fontWeight="bold"
      >
        V9
      </text>
    </g>
  )
}

// ============================================================
// 수지탱크 로딩 노드 (핵심 신규 컴포넌트)
// ============================================================
// 원형 심볼 + 아래 텍스트: 경과 시간 / 진행률
// 외곽선: blue-500 (flowing 시 pulse 효과)
// fill: 흰색(0h) → 검정(10h) 선형 보간
// ============================================================
function ResinLoadingNode({
  x, y, w, h,
  elapsedSeconds,
  flowing,
}: {
  x: number; y: number
  w: number; h: number
  elapsedSeconds: number
  flowing: boolean
}) {
  const { fillColor, textColor, progress } = calcResinLoadColor(elapsedSeconds)

  // 원 심볼 파라미터
  const cx = x + w / 2
  const cy = y + h / 2
  const r  = Math.min(w, h) / 2 - 1

  // 경과 시간 표시 텍스트
  const elapsedHours = elapsedSeconds / 3600
  const pctInt       = Math.round(progress * 100)
  const timeLabel    = elapsedSeconds > 0
    ? `경과 ${elapsedHours.toFixed(1)}h`
    : "대기중"

  // 진행률 표시 (0% 일 때는 숨김)
  const pctLabel = elapsedSeconds > 0 ? `${pctInt}%` : ""

  return (
    <g>
      {/* 외곽 컨테이너 (보조 테두리) */}
      <rect
        x={x} y={y} width={w} height={h} rx={4}
        fill="none"
        stroke={flowing ? C.RESIN_BDR : C.TANK_BDR}
        strokeWidth={flowing ? 1.5 : 1}
        strokeDasharray={flowing ? "4 2" : undefined}
      />

      {/* 수지탱크 원형 심볼 */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fillColor}
        stroke={C.RESIN_BDR}
        strokeWidth={flowing ? 2 : 1.5}
        style={flowing ? { animation: "ef-pulse 2s ease-in-out infinite" } : undefined}
      />

      {/* 레진컬럼 라벨 (원 안 — 색상 대비에 따라 조정) */}
      <text
        x={cx} y={cy - 2}
        textAnchor="middle" fontSize={7} fontWeight="bold"
        fill={textColor} fontFamily="monospace"
      >
        수지탱크
      </text>
      <text
        x={cx} y={cy + 7}
        textAnchor="middle" fontSize={5.5}
        fill={textColor} fontFamily="monospace"
      >
        Resin Col.
      </text>

      {/* 경과 시간 텍스트 (원 아래) */}
      <text
        x={cx} y={y + h + 9}
        textAnchor="middle" fontSize={7}
        fill={elapsedSeconds > 0 ? C.RESIN_BDR : C.LABEL_DIM}
        fontFamily="monospace"
      >
        {timeLabel}
      </text>

      {/* 진행률 % (경과 시간 텍스트 오른쪽) */}
      {pctLabel && (
        <text
          x={cx + 28} y={y + h + 9}
          textAnchor="middle" fontSize={7}
          fill={C.LABEL_DIM} fontFamily="monospace"
        >
          {pctLabel}
        </text>
      )}
    </g>
  )
}

// ============================================================
// 메인 컴포넌트
// ============================================================
interface ExtractionFlowMapProps {
  relayState:  number[]
  inverters:   InverterState[]
  boosters:    BoosterState[]
  progress?:   ProcessProgress | null
}

export default function ExtractionFlowMap({
  relayState,
  inverters,
  boosters,
  progress,
}: ExtractionFlowMapProps) {
  const boosterOn = boosters.some((b) => b.isOn)

  // elapsedSeconds 결정:
  //   1순위: progress.elapsedTime (초)
  //   2순위: remainingTime 역산 (36000 - remainingTime)
  //   없으면 0
  const elapsedSeconds = useMemo<number>(() => {
    if (!progress) return 0
    if (progress.elapsedTime != null && progress.elapsedTime > 0) {
      return progress.elapsedTime
    }
    if (progress.remainingTime != null && progress.remainingTime > 0) {
      return Math.max(0, TOTAL_LOADING_SEC - progress.remainingTime)
    }
    return 0
  }, [progress])

  const flows = useMemo(
    () => calcExtractionFlows(relayState, inverters, boosterOn),
    [relayState, inverters, boosterOn]
  )

  // SVG 좌표 설계 (viewBox 360 x 290)
  // 수지탱크 높이 증가: 기존 28 → 36 (원형 심볼 수용)
  // 아래 텍스트 공간을 위해 RESIN 아래 여백 +12
  const VB_W = 360
  const VB_H = 290

  // 본탱크
  const MT_W = 50; const MT_H = 24
  const MT_X = VB_W / 2 - MT_W / 2; const MT_Y = 6

  // V9 위치
  const V9_CX = VB_W / 2; const V9_CY = MT_Y + MT_H + 14

  // 인버터 펌프 6개 (r=11)
  const INV_R        = 11
  const INV_COUNT    = 6
  const INV_SPACING  = 52
  const INV_START_X  = VB_W / 2 - ((INV_COUNT - 1) * INV_SPACING) / 2
  const INV_Y        = V9_CY + 30

  // 탱크 6개
  const TANK_W = 34; const TANK_H = 26
  const TANK_Y = INV_Y + INV_R + 18

  // 수지탱크 (원형 심볼 수용을 위해 높이 36)
  const RESIN_W = 100; const RESIN_H = 36
  const RESIN_X = VB_W / 2 - RESIN_W / 2; const RESIN_Y = TANK_Y + TANK_H + 28

  // 집수탱크 (아래 경과시간 텍스트 공간 확보 +14)
  const COLL_W = 80; const COLL_H = 24
  const COLL_X = VB_W / 2 - COLL_W / 2; const COLL_Y = RESIN_Y + RESIN_H + 28

  // 집수 수평 라인 Y
  const COLLECT_LINE_Y = RESIN_Y - 10

  return (
    <div className="relative w-full rounded-xl border border-slate-700/60 bg-slate-900/80 p-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Extraction Flow — 순환추출 P&amp;ID
      </p>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full"
        style={{ maxHeight: 280 }}
      >
        <defs>
          <style>{`
            @keyframes ef-dash  { to { stroke-dashoffset: -20; } }
            @keyframes ef-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
          `}</style>
        </defs>

        {/* 레이어 1. 본탱크 */}
        <BoxNode
          x={MT_X} y={MT_Y} w={MT_W} h={MT_H}
          label="본탱크"
          sublabel="MainTank"
          bdrColor={C.MAIN_BDR}
          bgColor={C.MAIN_BG}
        />

        {/* 본탱크 → V9 수직 파이프 */}
        <FlowPipe
          d={`M ${V9_CX} ${MT_Y + MT_H} V ${V9_CY - 8}`}
          flowing={flows.mainToV9}
        />

        {/* 레이어 2. V9 밸브 */}
        <ValveV9 cx={V9_CX} cy={V9_CY} active={flows.mainToV9} />

        {/* V9 → 수평 분배 라인 */}
        <FlowPipe
          d={`M ${INV_START_X} ${INV_Y - INV_R - 6} H ${INV_START_X + (INV_COUNT - 1) * INV_SPACING}`}
          flowing={flows.mainToV9}
        />
        <FlowPipe
          d={`M ${V9_CX} ${V9_CY + 8} V ${INV_Y - INV_R - 6}`}
          flowing={flows.mainToV9}
        />

        {/* 레이어 3. 인버터 펌프 6개 + 탱크 6개 */}
        {Array.from({ length: INV_COUNT }, (_, i) => {
          const inv         = inverters[i] ?? { id: i + 1, pumpStatus: "OFF", tankLevel: 0 }
          const invCX       = INV_START_X + i * INV_SPACING
          const tankX       = invCX - TANK_W / 2
          const downFlowing = flows.v9ToInv[i]
          const tankFlowing = flows.invToTank[i]

          return (
            <g key={i}>
              {/* 수평라인 → 인버터 수직 드롭 */}
              <FlowPipe
                d={`M ${invCX} ${INV_Y - INV_R - 6} V ${INV_Y - INV_R}`}
                flowing={downFlowing}
              />

              <PumpNode
                cx={invCX} cy={INV_Y} r={INV_R}
                label={`P${i + 1}`}
                status={inv.pumpStatus}
              />

              {/* 인버터 → 탱크 수직 파이프 */}
              <FlowPipe
                d={`M ${invCX} ${INV_Y + INV_R} V ${TANK_Y}`}
                flowing={tankFlowing}
              />

              <TankNode
                x={tankX} y={TANK_Y} w={TANK_W} h={TANK_H}
                label={`T${i + 1}`}
                level={inv.tankLevel}
                flowing={tankFlowing}
              />
            </g>
          )
        })}

        {/* 레이어 4. 탱크 → 집수 수평 라인 */}
        <FlowPipe
          d={`M ${INV_START_X} ${COLLECT_LINE_Y} H ${INV_START_X + (INV_COUNT - 1) * INV_SPACING}`}
          flowing={flows.tankToResin}
        />

        {/* 각 탱크 하단 → 집수 라인 수직 연결 */}
        {Array.from({ length: INV_COUNT }, (_, i) => {
          const invCX = INV_START_X + i * INV_SPACING
          return (
            <FlowPipe
              key={i}
              d={`M ${invCX} ${TANK_Y + TANK_H} V ${COLLECT_LINE_Y}`}
              flowing={flows.tankToResin}
            />
          )
        })}

        {/* 집수 라인 중앙 → 수지탱크 */}
        <FlowPipe
          d={`M ${VB_W / 2} ${COLLECT_LINE_Y} V ${RESIN_Y}`}
          flowing={flows.tankToResin}
        />

        {/* 레이어 5. 수지탱크 (로딩 상태 원형 심볼) */}
        <ResinLoadingNode
          x={RESIN_X}
          y={RESIN_Y}
          w={RESIN_W}
          h={RESIN_H}
          elapsedSeconds={elapsedSeconds}
          flowing={flows.tankToResin}
        />

        {/* 수지탱크 → 집수탱크 수직 파이프 */}
        <FlowPipe
          d={`M ${VB_W / 2} ${RESIN_Y + RESIN_H} V ${COLL_Y}`}
          flowing={flows.resinToCollect}
        />

        {/* 레이어 6. 집수탱크 */}
        <BoxNode
          x={COLL_X} y={COLL_Y} w={COLL_W} h={COLL_H}
          label="집수탱크"
          sublabel="Collect"
          bdrColor={C.COLLECT_BDR}
          bgColor={C.COLLECT_BG}
        />

        {/* 밸브 개수 표시 (V1~V8 열린 수) */}
        {(() => {
          const openCount = relayState.slice(0, 8).filter((r) => r === 1).length
          return (
            <g>
              <rect
                x={RESIN_X + RESIN_W + 4}
                y={RESIN_Y + 4}
                width={40}
                height={20}
                rx={3}
                fill={openCount > 0 ? "#1e3a5f" : C.BOX_BG}
                stroke={openCount > 0 ? C.RESIN_BDR : C.TANK_BDR}
                strokeWidth={1}
              />
              <text
                x={RESIN_X + RESIN_W + 24} y={RESIN_Y + 12}
                textAnchor="middle" fontSize={7}
                fill={C.LABEL_DIM} fontFamily="monospace"
              >
                V1~V8
              </text>
              <text
                x={RESIN_X + RESIN_W + 24} y={RESIN_Y + 21}
                textAnchor="middle" fontSize={8} fontWeight="bold"
                fill={openCount > 0 ? C.RESIN_BDR : C.LABEL_DIM}
                fontFamily="monospace"
              >
                {openCount}/8
              </text>
            </g>
          )
        })()}
      </svg>

      {/* 범례 */}
      <div className="mt-1 flex flex-wrap items-center gap-3 px-1">
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-5 rounded-full bg-emerald-400" />
          <span className="text-[9px] text-slate-500">흐름 활성</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-5 rounded-full bg-slate-600" />
          <span className="text-[9px] text-slate-500">대기</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[9px] text-slate-500">펌프 ON</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-[9px] text-slate-500">ERR</span>
        </div>
        {/* 수지탱크 로딩 범례 */}
        <div className="flex items-center gap-1">
          <div className="flex h-3 w-10 overflow-hidden rounded border border-blue-500">
            <div className="h-full w-1/5 bg-white" />
            <div className="h-full w-1/5 bg-gray-300" />
            <div className="h-full w-1/5 bg-gray-500" />
            <div className="h-full w-1/5 bg-gray-700" />
            <div className="h-full w-1/5 bg-black" />
          </div>
          <span className="text-[9px] text-slate-500">수지 로딩(0→10h)</span>
        </div>
      </div>
    </div>
  )
}
