"use client"

import { useState, useEffect, useRef, useCallback } from "react"

const HOLD_MS      = 3000
const TICK_MS      = 16
const DONE_SHOW_MS = 1500

const RADIUS      = 20
const STROKE_W    = 3
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const SVG_SIZE    = (RADIUS + STROKE_W + 2) * 2

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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const dashOffset = CIRCUMFERENCE * (1 - progress)

  return (
    <div className="fixed bottom-0 right-0 z-40 pb-4 pr-4">
      <div className="flex flex-col items-end gap-1">

        {/* 안내 텍스트 */}
        {mqttConnected && !fired && progress === 0 && (
          <p className="text-[9px] text-slate-600 pr-1">3초 홀드</p>
        )}
        {mqttConnected && progress > 0 && (
          <p className="text-[9px] text-red-400 pr-1">손 떼면 취소</p>
        )}
        {fired && (
          <p className="text-[9px] text-red-300 pr-1">정지됨</p>
        )}
        {!mqttConnected && (
          <p className="text-[9px] text-slate-700 pr-1">연결 대기</p>
        )}

        {/* 버튼 — 작고 우하단에만 */}
        <button
          disabled={!mqttConnected}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          className="relative select-none rounded-xl border-2 border-red-700/60 bg-slate-900 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-30"
          style={{ userSelect: "none" }}
        >
          <div className="flex items-center gap-2">
            {/* 원형 진행 SVG */}
            <span className="pointer-events-none relative" style={{ width: SVG_SIZE, height: SVG_SIZE }}>
              <svg width={SVG_SIZE} height={SVG_SIZE} style={{ transform: "rotate(-90deg)" }}>
                <circle
                  cx={SVG_SIZE / 2} cy={SVG_SIZE / 2} r={RADIUS}
                  fill="none" stroke="rgba(220,38,38,0.2)" strokeWidth={STROKE_W}
                />
                {mqttConnected && (
                  <circle
                    cx={SVG_SIZE / 2} cy={SVG_SIZE / 2} r={RADIUS}
                    fill="none"
                    stroke={fired ? "#f87171" : progress > 0 ? "#ef4444" : "rgba(220,38,38,0.4)"}
                    strokeWidth={STROKE_W}
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={fired ? 0 : dashOffset}
                    style={{ transition: fired ? "none" : "stroke-dashoffset 0.05s linear" }}
                  />
                )}
              </svg>
              {/* 아이콘: ⚡ */}
              <span
                className="absolute inset-0 flex items-center justify-center text-[11px]"
                style={{ color: fired ? "#f87171" : progress > 0 ? "#ef4444" : "#7f1d1d" }}
              >
                ⚡
              </span>
            </span>

            {/* 텍스트 */}
            <span
              className="text-[10px] font-bold tracking-wide"
              style={{ color: fired ? "#f87171" : progress > 0 ? "#ef4444" : "#7f1d1d" }}
            >
              {fired ? "정지됨" : progress > 0 ? `${Math.round(progress * 100)}%` : "E-STOP"}
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}
