// mobile-final/valve-flows.ts
// 하우징 밸브 파이프 흐름 계산 + n8n 이중 래핑 해제

export interface PipeFlows {
  suidoToV1:   boolean
  v1ToResin:   boolean
  v1ToTank:    boolean
  resinToV2:   boolean
  v2ToDrain:   boolean
  v2ToV3:      boolean
  v3ToCollect: boolean
  v3ToReturn:  boolean
  tankToV4:    boolean
  v4ToResin:   boolean
  v4ToDrain:   boolean
  suidoToV5:   boolean
  v5ToV6:      boolean
  v5ToDrain:   boolean
  v6ToDrain:   boolean
  v6ToV7:      boolean
  v7ToCollect: boolean
  v7ToReturn:  boolean
  boosterActive: boolean
}

export function calcPipeFlows(relayState: number[], boosterOn: boolean): PipeFlows {
  const v = (i: number) => (relayState[i] ?? 0) === 1

  const suidoToV1 = boosterOn || v(0) || v(1) || v(2) || v(3)
  const suidoToV5 = boosterOn || v(4) || v(5) || v(6) || v(7)

  const v1ToResin = suidoToV1 && v(0)
  const v1ToTank  = suidoToV1 && !v(0)
  const resinToV2 = v1ToResin
  const v2ToDrain = resinToV2 && v(1)
  const v2ToV3    = resinToV2 && !v(1)
  const v3ToCollect = v2ToV3 && v(2)
  const v3ToReturn  = v2ToV3 && !v(2)
  const tankToV4  = v1ToTank
  const v4ToResin = tankToV4 && v(3)
  const v4ToDrain = tankToV4 && !v(3)
  const v5ToV6    = suidoToV5 && v(4)
  const v5ToDrain = suidoToV5 && !v(4)
  const v6ToDrain = v5ToV6 && v(5)
  const v6ToV7    = v5ToV6 && !v(5)
  const v7ToCollect = v6ToV7 && v(6)
  const v7ToReturn  = v6ToV7 && !v(6)

  return {
    suidoToV1, v1ToResin, v1ToTank, resinToV2,
    v2ToDrain, v2ToV3, v3ToCollect, v3ToReturn,
    tankToV4, v4ToResin, v4ToDrain,
    suidoToV5, v5ToV6, v5ToDrain,
    v6ToDrain, v6ToV7, v7ToCollect, v7ToReturn,
    boosterActive: boosterOn,
  }
}

/**
 * n8n 이중 래핑 해제
 * { topic, message: "{...}" } 또는 { topic, payload: "{...}" } 형태 처리
 */
export function unwrapN8n(raw: string): unknown {
  try {
    let parsed = JSON.parse(raw)
    if (typeof parsed?.message === "string" && parsed.message.startsWith("{")) {
      parsed = JSON.parse(parsed.message)
    } else if (typeof parsed?.payload === "string" && parsed.payload.startsWith("{")) {
      parsed = JSON.parse(parsed.payload)
    }
    return parsed
  } catch {
    return raw
  }
}
