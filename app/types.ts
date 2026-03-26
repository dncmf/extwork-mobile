// mobile-final/types.ts
// 공통 타입 정의

export type MqttStatus = "connected" | "connecting" | "disconnected"

// health.mode: "wifi" | "ble_only" | "offline"
//   - "wifi"     : Wi-Fi + MQTT 정상
//   - "ble_only" : Wi-Fi 끊김, BLE 폴백 동작 중
//   - "offline"  : 연결 없음
export interface InverterHealth {
  mode: "wifi" | "ble_only" | "offline"
}

export interface InverterState {
  id: number
  pumpStatus: "ON" | "OFF" | "ERROR" | string
  tankLevel: number   // 0~100
  health?: InverterHealth
}

export interface BoosterState {
  id: 1 | 2
  isOn: boolean
}

// inverter/state 의 mode 필드
//   "S" — Simultaneous (동시)
//   "O" — Overlap     (오버랩)
//   "C" — Sequential  (순차)
export type ProcessMode = "S" | "O" | "C"

export const PROCESS_MODE_LABEL: Record<ProcessMode, string> = {
  S: "동시",
  O: "오버랩",
  C: "순차",
}

export interface ProcessProgress {
  pct: number          // 0~100 계산된 진행률
  processInfo: string  // 공정명/설명
  elapsedTime?: number  // 초
  remainingTime?: number // 초
  isRunning: boolean
  mode?: ProcessMode   // "S" | "O" | "C" — inverter/state 의 mode 필드
  rawMessage: string
}

export interface ValvePayload {
  current_valve_mode: number
  relay_mode?: "auto" | "manual"
  relay_state: number[]
  device_id?: string
  command?: string
}

export interface AppState {
  mqttStatus: MqttStatus
  valveRelayState: number[]
  currentValveMode: number
  isManualMode: boolean
  inverters: InverterState[]
  boosters: BoosterState[]
  progress: ProcessProgress | null
}
