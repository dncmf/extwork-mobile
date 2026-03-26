"use client"

// mobile-final/ControlBar.tsx
// 긴급정지 — 길게 누르기(3초 홀드) 방식
// 미래지향적 미니멀 디자인

import { useState, useEffect, useRef, useCallback } from "react"

const HOLD_MS      = 3000
const TICK_MS      = 16
const DONE_SHOW_MS = 500

const RADIUS        = 22
const STROKE_W      = 3
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const SVG_SIZE      = (RADIUS + STROKE_W + 2) * 2

interface ControlBarProps {
  mqttConnected: boolean
  onEmergencyStop: () => void
}

export default function ControlBar({ mqttConnected, onEmergencyStop }: ControlBarProps) {
  const [progress, setProgress] = useState(0)
  const [fired, setFired]       = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressRef = useRef(0)

  const updateProgress = useCallback((val: number) => {
    progressRef.current = val
    setProgress(val)
  }, [])

  const startHold = useCallback(() => {
    if (!mqttConnected || fired) return
    if (intervalRef.current) return

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

  const cancelHold = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    updateProgress(0)
  }, [updateProgress])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const dashOffset = CIRCUMFERENCE * (1 - progress)

  // 버튼 텍스트
  let buttonLabel: string
  if (fired) {
    buttonLabel = "STOPPED"
  } else if (progress > 0) {
    buttonLabel = `${Math.round(progress * 100)}%`
  } else {
    buttonLabel = "EMERGENCY STOP"
  }

  // 홀드 중 빨간색 강도
  const holdIntensity = progress > 0 ? 0.3 + progress * 0.7 : 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/60 bg-[#06080F]/95 px-4 py-3 backdrop-blur-lg">
      <button
        disabled={!mqttConnected}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
        className="relative w-full select-none overflow-hidden rounded-2xl py-3.5 font-mono text-sm font-bold uppercase tracking-[0.2em] transition-all disabled:cursor-not-allowed disabled:opacity-30"
        style={{
          userSelect: "none",
          backgroundColor: progress > 0
            ? `rgba(220, 38, 38, ${holdIntensity})`
            : fired
            ? "rgba(220, 38, 38, 0.8)"
            : "rgba(220, 38, 38, 0.08)",
          color: progress > 0 || fired ? "#fecaca" : "#dc2626",
          border: `1px solid rgba(220, 38, 38, ${progress > 0 ? 0.4 : 0.12})`,
          boxShadow: progress > 0
            ? `0 0 ${20 + progress * 30}px rgba(220,38,38,${holdIntensity * 0.4})`
            : "none",
        }}
      >
        {/* SVG 원형 프로그레스 */}
        {mqttConnected && !fired && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
          >
            <svg width={SVG_SIZE} height={SVG_SIZE} style={{ transform: "rotate(-90deg)" }}>
              <circle
                cx={SVG_SIZE / 2} cy={SVG_SIZE / 2} r={RADIUS}
                fill="none" stroke="rgba(220,38,38,0.15)" strokeWidth={STROKE_W}
              />
              <circle
                cx={SVG_SIZE / 2} cy={SVG_SIZE / 2} r={RADIUS}
                fill="none" stroke="#fca5a5" strokeWidth={STROKE_W}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
            </svg>
          </span>
        )}

        <span className="relative z-10">{buttonLabel}</span>
      </button>

      {/* 하단 힌트 */}
      {mqttConnected && progress === 0 && !fired && (
        <p className="mt-1.5 text-center text-[9px] text-slate-700">
          3초 홀드
        </p>
      )}
      {mqttConnected && progress > 0 && (
        <p className="mt-1.5 text-center text-[9px] text-red-500/60">
          손을 떼면 취소
        </p>
      )}
      {!mqttConnected && (
        <p className="mt-1.5 text-center text-[9px] text-slate-700">
          연결 대기
        </p>
      )}
    </div>
  )
}
