// mobile-final/types.ts
// 공통 타입 정의

export type MqttStatus = "connected" | "connecting" | "disconnected"

// 탭 ID
export type TabId = "process" | "valve" | "pump" | "control"

// health.mode: "wifi" | "ble_only" | "offline"
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
export type ProcessMode = "S" | "O" | "C"

export const PROCESS_MODE_LABEL: Record<ProcessMode, string> = {
  S: "동시",
  O: "오버랩",
  C: "순차",
}

export interface ProcessProgress {
  pct: number
  processInfo: string
  elapsedTime?: number
  remainingTime?: number
  isRunning: boolean
  mode?: ProcessMode
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
