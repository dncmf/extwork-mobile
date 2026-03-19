// mobile-final/types.ts
// 공통 타입 정의

export type MqttStatus = "connected" | "connecting" | "disconnected"

export interface InverterState {
  id: number
  pumpStatus: "ON" | "OFF" | "ERROR" | string
  tankLevel: number   // 0~100
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
