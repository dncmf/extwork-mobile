"use client"

// mobile-final/ControlBar.tsx
// 긴급정지 버튼 — 길게 누르기(3초 홀드) 방식
//
// 동작:
//   1. onPointerDown  → 타이머 시작, progress 0→1 (3초)
//   2. 3초 완료       → onEmergencyStop 호출, "정지됨" 상태 0.5초 표시
//   3. onPointerUp / onPointerLeave → 타이머 취소, progress 리셋
//
// UI:
//   - 버튼 배경: 빨강 (비활성 시 불투명도 낮춤)
//   - 홀드 중: SVG circle strokeDashoffset 으로 흰색 원형 테두리 시계방향 채움
//   - 완료 직후: "\uC815\uC9C0\uB428" 텍스트 0.5초 표시 → 원래 상태로

import { useState, useEffect, useRef, useCallback } from "react"

// ── 상수 ──────────────────────────────────────────────────────
const HOLD_MS      = 3000  // 홀드 완료 기준 (ms)
const TICK_MS      = 16    // ~60fps 간격
const DONE_SHOW_MS = 500   // 완료 텍스트 표시 시간 (ms)

const RADIUS       = 28
const STROKE_W     = 4
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const SVG_SIZE     = (RADIUS + STROKE_W + 2) * 2

// ── Props ─────────────────────────────────────────────────────
interface ControlBarProps {
  mqttConnected: boolean
  onEmergencyStop: () => void
}

// ── 컴포넌트 ──────────────────────────────────────────────────
export default function ControlBar({ mqttConnected, onEmergencyStop }: ControlBarProps) {
  const [progress, setProgress] = useState(0)    // 0.0 ~ 1.0
  const [fired, setFired]       = useState(false) // 완료 직후 상태

  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef  = useRef(0)   // interval 콜백 내 최신값 동기 참조

  const updateProgress = useCallback((val: number) => {
    progressRef.current = val
    setProgress(val)
  }, [])

  // 홀드 시작
  const startHold = useCallback(() => {
    if (!mqttConnected || fired) return
    if (intervalRef.current) return  // 이미 진행 중이면 중복 방지

    updateProgress(0)

    intervalRef.current = setInterval(() => {
      const next = progressRef.current + TICK_MS / HOLD_MS
      if (next >= 1) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        updateProgress(0)
        setFired(true)
        onEmergencyStop()
        setTimeout(() => setFired(false), DONE_SHOW_MS)
      } else {
        updateProgress(next)
      }
    }, TICK_MS)
  }, [mqttConnected, fired, onEmergencyStop, updateProgress])

  // 홀드 취소 (손 떼거나 영역 벗어남)
  const cancelHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    updateProgress(0)
  }, [updateProgress])

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // SVG 원형 프로그레스 — strokeDashoffset 계산
  // CIRCUMFERENCE = 비어있음(0%), 0 = 완전히 채워짐(100%)
  const dashOffset = CIRCUMFERENCE * (1 - progress)

  // 버튼 텍스트 결정
  let buttonLabel: string
  if (fired) {
    buttonLabel = "\uC815\uC9C0\uB428"  // 정지됨
  } else if (progress > 0) {
    buttonLabel = `\uD640\uB4DC ${Math.round(progress * 100)}%`
  } else {
    buttonLabel = "EMERGENCY STOP"
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-700/60 bg-slate-950/98 px-4 py-3 backdrop-blur-sm">

      {/* 홀드 버튼 */}
      <button
        disabled={!mqttConnected}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
        className="relative w-full select-none rounded-2xl bg-red-600 py-4 text-base font-black tracking-widest text-white shadow-lg shadow-red-950/60 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        style={
          mqttConnected
            ? { boxShadow: "0 0 16px rgba(220,38,38,0.4)", userSelect: "none" }
            : { userSelect: "none" }
        }
      >
        {/* SVG 원형 프로그레스 오버레이 */}
        {mqttConnected && !fired && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2"
          >
            <svg
              width={SVG_SIZE}
              height={SVG_SIZE}
              style={{ transform: "rotate(-90deg)" }}
            >
              {/* 배경 원 (희미한 흰색) */}
              <circle
                cx={SVG_SIZE / 2}
                cy={SVG_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={STROKE_W}
              />
              {/* 진행 원 (흰색, 시계방향 채워짐) */}
              <circle
                cx={SVG_SIZE / 2}
                cy={SVG_SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="white"
                strokeWidth={STROKE_W}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
            </svg>
          </span>
        )}

        {/* 버튼 텍스트 */}
        <span className="relative z-10">{buttonLabel}</span>
      </button>

      {/* 상태별 하단 안내 텍스트 */}
      {mqttConnected && !fired && progress === 0 && (
        <p className="mt-1.5 text-center text-[10px] text-slate-500">
          {"3\uCD08 \uB204\uB974\uACE0 \uC788\uC73C\uBA74 \uAE34\uAE09\uC815\uC9C0 \uBC1C\uB3D9"}
        </p>
      )}
      {mqttConnected && progress > 0 && (
        <p className="mt-1.5 text-center text-[10px] text-red-400">
          {"\uC190\uC744 \uB54C\uBA74 \uCDE8\uC18C\uB429\uB2C8\uB2E4"}
        </p>
      )}
      {!mqttConnected && (
        <p className="mt-1.5 text-center text-[10px] text-slate-600">
          {"MQTT \uC5F0\uACB0 \uB300\uAE30 \uC911 \u2014 \uBC84\uD2BC \uBE44\uD65C\uC131"}
        </p>
      )}
    </div>
  )
}

// EmergencyModal 은 홀드 방식 도입으로 제거됨
// page.tsx 수정 사항:
//   - import 에서 EmergencyModal 제거
//   - showEmergency state 제거
//   - <EmergencyModal> JSX 블록 제거
//   - onEmergencyStop={() => setEmergency(true)} → onEmergencyStop={handleEmergencyConfirm} 로 변경
