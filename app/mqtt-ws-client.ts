// mobile-final/mqtt-ws-client.ts
// 브라?��? WebSocket 기반 MQTT 3.1.1 ?��????�라?�언??// ?�버 PC extwork-mobile ?�는 mqtt npm ?�키지가 ?�으므�?// 브라?��? WebSocket (ws:// 8083) ?�로 직접 MQTT ?�로?�콜 구현
//
// 참고: 브라?��? ?�경?��?�?mqtt.js CDN???�용?�는 ?�??//        Next.js dynamic import + window.mqtt 방식?�로 처리
//
// ?�용�? page.tsx ?�서 import { getMqttClient } from "./mqtt-ws-client"

type MessageHandler = (topic: string, message: string) => void
type StatusHandler = (status: "connected" | "connecting" | "disconnected") => void

interface MqttWsClient {
  subscribe: (topic: string) => void
  publish: (topic: string, payload: string) => void
  onMessage: (handler: MessageHandler) => void
  offMessage: (handler: MessageHandler) => void
  onStatus: (handler: StatusHandler) => void
  offStatus: (handler: StatusHandler) => void
  getStatus: () => "connected" | "connecting" | "disconnected"
  connect: () => void
  disconnect: () => void
}

// MQTT over WebSocket 브로�??�정 (?�경변???�선)
const MQTT_WS_HOST =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_MQTT_WS_URL ?? "ws://10.0.1.2:8083")
    : "ws://10.0.1.2:8083"
const MQTT_USERNAME = "dnature"
const MQTT_PASSWORD = "8210"
const MQTT_CLIENT_ID = `mobile-final-${Math.random().toString(16).slice(2, 8)}`

// ?�?� ?��????�스?�스 ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
let _instance: ReturnType<typeof createMqttWsClient> | null = null

export function getMqttClient() {
  if (!_instance) _instance = createMqttWsClient()
  return _instance
}

// ?�?� MQTT ?�로?�콜 빌더 ?�퍼 (MQTT 3.1.1) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

function encodeString(str: string): Uint8Array {
  const encoded = new TextEncoder().encode(str)
  const buf = new Uint8Array(2 + encoded.length)
  buf[0] = (encoded.length >> 8) & 0xff
  buf[1] = encoded.length & 0xff
  buf.set(encoded, 2)
  return buf
}

function buildConnectPacket(): Uint8Array {
  const protocol  = encodeString("MQTT")
  const clientId  = encodeString(MQTT_CLIENT_ID)
  const username  = encodeString(MQTT_USERNAME)
  const password  = encodeString(MQTT_PASSWORD)

  // Variable header: protocol name(6) + level(1) + flags(1) + keepalive(2)
  const varHeader = new Uint8Array([
    ...protocol,
    4,      // protocol level MQTT 3.1.1
    0xC2,   // connect flags: username+password+cleanSession
    0x00, 0x3C, // keepalive 60s
  ])

  const payload = new Uint8Array([
    ...clientId,
    ...username,
    ...password,
  ])

  const remainLen = varHeader.length + payload.length
  return new Uint8Array([
    0x10,       // CONNECT
    remainLen,  // remaining length (assumes < 128)
    ...varHeader,
    ...payload,
  ])
}

function buildSubscribePacket(topic: string, packetId: number): Uint8Array {
  const topicBytes = encodeString(topic)
  const remainLen = 2 + topicBytes.length + 1 // packetId(2) + topic + QoS(1)
  return new Uint8Array([
    0x82,       // SUBSCRIBE
    remainLen,
    (packetId >> 8) & 0xff,
    packetId & 0xff,
    ...topicBytes,
    0x00,       // QoS 0
  ])
}

function buildPublishPacket(topic: string, payload: string): Uint8Array {
  const topicBytes = encodeString(topic)
  const payloadBytes = new TextEncoder().encode(payload)
  const remainLen = topicBytes.length + payloadBytes.length
  return new Uint8Array([
    0x30,       // PUBLISH QoS 0
    remainLen,
    ...topicBytes,
    ...payloadBytes,
  ])
}

function buildPingreqPacket(): Uint8Array {
  return new Uint8Array([0xC0, 0x00])
}

// ?�?� ?�서: ?�신 바이????topic + message ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

function parsePublishPacket(data: Uint8Array): { topic: string; message: string } | null {
  if ((data[0] & 0xF0) !== 0x30) return null
  // remaining length (simple 1-byte decode)
  const topicLen = (data[2] << 8) | data[3]
  const topic = new TextDecoder().decode(data.slice(4, 4 + topicLen))
  const payload = new TextDecoder().decode(data.slice(4 + topicLen))
  return { topic, message: payload }
}

// ?�?� ?�라?�언???�토�??�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�

function createMqttWsClient(): MqttWsClient {
  let ws: WebSocket | null = null
  let status: "connected" | "connecting" | "disconnected" = "disconnected"
  let packetId = 1
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSubscriptions: Set<string> = new Set()

  const messageHandlers = new Set<MessageHandler>()
  const statusHandlers  = new Set<StatusHandler>()

  function emitStatus(s: typeof status) {
    status = s
    statusHandlers.forEach((h) => h(s))
  }

  function sendRaw(buf: Uint8Array) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(buf.buffer)
    }
  }

  function subscribeNow(topic: string) {
    const pkt = buildSubscribePacket(topic, packetId++)
    if (packetId > 65535) packetId = 1
    sendRaw(pkt)
  }

  function connect() {
    if (typeof window === "undefined") return
    if (ws && ws.readyState === WebSocket.OPEN) return

    emitStatus("connecting")

    ws = new WebSocket(MQTT_WS_HOST, ["mqtt"])
    ws.binaryType = "arraybuffer"

    ws.onopen = () => {
      sendRaw(buildConnectPacket())
    }

    ws.onmessage = (evt) => {
      const data = new Uint8Array(evt.data as ArrayBuffer)
      const type = data[0] & 0xF0

      if (type === 0x20) {
        // CONNACK
        const rc = data[3]
        if (rc === 0) {
          emitStatus("connected")
          // ?�구??          pendingSubscriptions.forEach((t) => subscribeNow(t))
          // ??          if (pingTimer) clearInterval(pingTimer)
          pingTimer = setInterval(() => sendRaw(buildPingreqPacket()), 30000)
        } else {
          emitStatus("disconnected")
        }
        return
      }

      if (type === 0x30) {
        const parsed = parsePublishPacket(data)
        if (parsed) {
          messageHandlers.forEach((h) => h(parsed.topic, parsed.message))
        }
        return
      }

      if (type === 0xD0) {
        // PINGRESP ??무시
        return
      }
    }

    ws.onclose = () => {
      emitStatus("disconnected")
      if (pingTimer) clearInterval(pingTimer)
      // 5�????�연�?      reconnectTimer = setTimeout(() => connect(), 5000)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (pingTimer) clearInterval(pingTimer)
    ws?.close()
    ws = null
    emitStatus("disconnected")
  }

  return {
    connect,
    disconnect,
    subscribe(topic) {
      pendingSubscriptions.add(topic)
      if (status === "connected") subscribeNow(topic)
      else if (status === "disconnected") connect()
    },
    publish(topic, payload) {
      sendRaw(buildPublishPacket(topic, payload))
    },
    onMessage(h)  { messageHandlers.add(h) },
    offMessage(h) { messageHandlers.delete(h) },
    onStatus(h)   { statusHandlers.add(h) },
    offStatus(h)  { statusHandlers.delete(h) },
    getStatus()   { return status },
  }
}
