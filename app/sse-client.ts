// sse-client.ts
// SSE(Server-Sent Events) 기반 실시간 데이터 수신 클라이언트
// MQTT WebSocket 직접 연결 대신 서버 /api/v1/events 를 구독
// → 외부(devtunnel :3000) 에서도 MQTT 데이터 수신 가능

type MessageHandler = (topic: string, payload: string) => void
type StatusHandler  = (status: 'connected' | 'connecting' | 'disconnected') => void

interface SseClient {
  connect:      () => void
  disconnect:   () => void
  onMessage:    (h: MessageHandler) => void
  offMessage:   (h: MessageHandler) => void
  onStatus:     (h: StatusHandler)  => void
  offStatus:    (h: StatusHandler)  => void
  getStatus:    () => 'connected' | 'connecting' | 'disconnected'
  // 하위호환: subscribe/publish 시그니처 유지 (SSE라 subscribe 는 no-op, publish 는 경고)
  subscribe:    (topic: string) => void
  publish:      (topic: string, payload: string) => void
}

const SSE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://10.0.1.2:3000') + '/api/v1/events'

let _instance: ReturnType<typeof createSseClient> | null = null
export function getMqttClient(): SseClient {
  if (!_instance) _instance = createSseClient()
  return _instance
}

function createSseClient(): SseClient {
  let es: EventSource | null = null
  let status: 'connected' | 'connecting' | 'disconnected' = 'disconnected'
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const messageHandlers = new Set<MessageHandler>()
  const statusHandlers  = new Set<StatusHandler>()

  function emitStatus(s: typeof status) {
    status = s
    statusHandlers.forEach(h => h(s))
  }

  function connect() {
    if (typeof window === 'undefined') return
    if (es && es.readyState !== EventSource.CLOSED) return

    emitStatus('connecting')

    es = new EventSource(SSE_URL)

    es.onopen = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      emitStatus('connected')
    }

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        // 서버 연결 확인 ping
        if (data.type === 'connected') return
        const { topic, payload } = data as { topic: string; payload: string }
        if (topic && payload !== undefined) {
          messageHandlers.forEach(h => h(topic, payload))
        }
      } catch { /* JSON 파싱 실패 무시 */ }
    }

    es.onerror = () => {
      emitStatus('disconnected')
      es?.close()
      es = null
      // 5초 후 재연결
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, 5000)
      }
    }
  }

  function disconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    es?.close()
    es = null
    emitStatus('disconnected')
  }

  return {
    connect,
    disconnect,
    subscribe: (_topic: string) => { /* SSE는 전체 구독 — no-op */ },
    publish:   (topic: string, _payload: string) => {
      console.warn('[SSE] publish 불가 — REST API 사용:', topic)
    },
    onMessage:  h => messageHandlers.add(h),
    offMessage: h => messageHandlers.delete(h),
    onStatus:   h => statusHandlers.add(h),
    offStatus:  h => statusHandlers.delete(h),
    getStatus:  () => status,
  }
}
