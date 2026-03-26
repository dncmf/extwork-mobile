// mobile-final/types.ts
// 공통 타입 정의

export type MqttStatus = "connected" | "connecting" | "disconnected"

// v2 health JSON
export interface PumpHealth {
  wifi:     boolean
  mqtt:     boolean
  ble:      boolean
  rssi:     number
  mode:     "normal" | "ble_only" | string
  fw:       string
  uptime_s: number
}

// v2 sensor JSON
export interface PumpSensor {
  full:     boolean
  empty:    boolean
  level:    "full" | "low" | "normal" | string
  filling:  boolean
  fill_sec: number
}

export interface InverterState {
  id: number
  pumpStatus: "ON" | "OFF" | "ERROR" | string
  tankLevel: number   // 0~100
  health?: PumpHealth  // v2 L2 연결 상태
  sensor?: PumpSensor  // v2 L2 수위 센서
}

export interface BoosterState {
  id: 1 | 2
  isOn: boolean
}

export interface ProcessProgress {
  pct: number          // 0~100 계산된 진행률
  processInfo: string  // 공정명/설명
  elapsedTime?: number  // 초
  remainingTime?: number // 초
  isRunning: boolean
  rawMessage: string
  // v2 inverter/state 필드
  pump?: number
  mode?: string
  repeatCur?: number
  repeatMax?: number
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
