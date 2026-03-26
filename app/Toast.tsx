"use client"

// mobile-final/Toast.tsx
// 인버터 에러 토스트 알림 컴포넌트
//
// 사용처: page.tsx 에서 inverter/error 수신 시 addToast() 호출
// 최대 3개 스택, 5초 자동 소멸

import { useEffect, useRef } from "react"

// ── 에러 코드 문구 맵 ──────────────────────────────────────────
export const ERROR_CODE_MAP: Record<string, string> = {
  E01: "인버터 과부하",
  E02: "수위 센서 오류",
  E03: "펌프 정지 실패",
  E04: "통신 타임아웃",
  E05: "밸브 응답 없음",
  E06: "탱크 넘침 경고",
  E07: "전원 전압 이상",
  E08: "모터 과열",
  E09: "비상정지 활성화됨",
  E10: "순서 실행 중단",
}

export interface ToastItem {
  id: string
  code: string
  message: string
  raw: string
  ts: number   // Date.now()
}

// ── 단일 토스트 카드 ──────────────────────────────────────────
function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: (id: string) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(item.id), 5000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [item.id, onDismiss])

  const timeStr = new Date(item.ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  return (
    <div
      className="toast-item flex items-start gap-3 rounded-2xl border border-red-800/40 bg-red-950/90 px-4 py-3 shadow-2xl backdrop-blur-lg"
      style={{
        animation: "toast-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both",
      }}
    >
      {/* 아이콘 영역 */}
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20">
        <div className="h-2 w-2 rounded-full bg-red-400" style={{ boxShadow: "0 0 6px #f87171" }} />
      </div>

      {/* 텍스트 영역 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[11px] font-bold text-red-400">
            {item.code}
          </span>
          <span className="font-mono text-[9px] text-slate-600">{timeStr}</span>
        </div>
        <p className="mt-0.5 text-[12px] leading-tight text-red-200">
          {item.message}
        </p>
        {/* raw 원문 (코드 미매칭 시에만 노출) */}
        {item.code === "ERR" && (
          <p className="mt-0.5 truncate font-mono text-[9px] text-slate-600">
            {item.raw}
          </p>
        )}
      </div>

      {/* 닫기 */}
      <button
        onClick={() => onDismiss(item.id)}
        className="ml-1 mt-0.5 shrink-0 text-slate-600 active:text-slate-400"
        aria-label="닫기"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

// ── 토스트 컨테이너 ───────────────────────────────────────────
interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <>
      <style jsx global>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
      `}</style>

      {/* 헤더 아래, 콘텐츠 위에 고정 */}
      <div
        className="fixed left-0 right-0 z-50 space-y-2 px-3"
        style={{ top: "56px" }}
        aria-live="assertive"
        aria-label="에러 알림"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  )
}

// ── 팩토리 헬퍼 ───────────────────────────────────────────────
// page.tsx 에서 아래처럼 사용:
//   const item = makeToastItem(rawPayload)
//   setToasts((prev) => [item, ...prev].slice(0, 3))

export function makeToastItem(raw: string): ToastItem {
  let code = "ERR"
  let message = raw.trim()

  // 페이로드 파싱 시도: JSON { "code": "E01", "message": "..." }
  try {
    const j = JSON.parse(raw)
    const c = j.code ?? j.error_code ?? j.errorCode ?? ""
    if (c) code = String(c).toUpperCase()
    message = j.message ?? j.msg ?? j.error ?? raw
  } catch {
    // 단순 문자열이면 코드 앞 2~3자 시도 (예: "E01: 펌프 정지 실패")
    const m = raw.trim().match(/^(E\d{2,3})[:\s]/)
    if (m) code = m[1].toUpperCase()
  }

  const mapped = ERROR_CODE_MAP[code]
  if (mapped) message = mapped

  return {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    code,
    message,
    raw,
    ts: Date.now(),
  }
}
