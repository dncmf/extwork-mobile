"use client"

// BottomNav.tsx — 하단 탭바
// 4탭: 공정 / 밸브 / 펌프 / 제어

import { TabId } from "./types"

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

function ProcessIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={active ? "#22d3ee" : "#475569"} strokeWidth="1.5"/>
      <path d="M12 7v5l3 3" stroke={active ? "#22d3ee" : "#475569"} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function ValveIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "#475569"
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="10" width="18" height="4" rx="2" stroke={c} strokeWidth="1.5"/>
      <path d="M7 12H3M21 12h-4" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="2.5" stroke={c} strokeWidth="1.5"/>
      <path d="M12 3v3M12 18v3" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function PumpIcon({ active }: { active: boolean }) {
  const c = active ? "#22d3ee" : "#475569"
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="8" height="12" rx="2" stroke={c} strokeWidth="1.5"/>
      <rect x="13" y="9" width="8" height="9" rx="2" stroke={c} strokeWidth="1.5"/>
      <path d="M7 10v4M17 12v3" stroke={c} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function ControlIcon({ active }: { active: boolean }) {
  const c = active ? "#ef4444" : "#475569"
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke={c} strokeWidth="1.5"/>
      <rect x="9" y="9" width="6" height="6" rx="1" fill={active ? "#ef4444" : "#475569"}/>
    </svg>
  )
}

interface BottomNavProps {
  activeTab: TabId
  onChange: (tab: TabId) => void
  hasAlert?: boolean
}

const TABS: { id: TabId; label: string }[] = [
  { id: "process", label: "공정" },
  { id: "valve",   label: "밸브" },
  { id: "pump",    label: "펌프" },
  { id: "control", label: "제어" },
]

export default function BottomNav({ activeTab, onChange, hasAlert }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(6, 8, 15, 0.92)",
        borderTop: "1px solid rgba(148, 163, 184, 0.08)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex">
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          const isControl = tab.id === "control"
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 transition-all duration-200 active:scale-95"
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              {/* 아이콘 */}
              <div className="relative">
                {tab.id === "process" && <ProcessIcon active={active} />}
                {tab.id === "valve"   && <ValveIcon   active={active} />}
                {tab.id === "pump"    && <PumpIcon    active={active} />}
                {tab.id === "control" && <ControlIcon active={active} />}
                {/* 알림 뱃지 */}
                {isControl && hasAlert && (
                  <span
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
                    style={{ background: "#ef4444", boxShadow: "0 0 6px #ef4444" }}
                  />
                )}
              </div>
              {/* 라벨 */}
              <span
                className="font-medium transition-colors duration-200"
                style={{
                  fontSize: "10px",
                  color: active
                    ? (isControl ? "#ef4444" : "#22d3ee")
                    : "#475569",
                  letterSpacing: "0.05em",
                }}
              >
                {tab.label}
              </span>
              {/* 활성 인디케이터 */}
              {active && (
                <div
                  className="absolute bottom-0 h-0.5 rounded-full"
                  style={{
                    width: "28px",
                    background: isControl ? "#ef4444" : "#22d3ee",
                    boxShadow: isControl
                      ? "0 0 8px rgba(239,68,68,0.6)"
                      : "0 0 8px rgba(34,211,238,0.6)",
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
