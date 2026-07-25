const CACHE_TTL = 8 * 60 * 1000

export interface NlqCacheResult {
  matchingIds: string[]
  summary: string
  appliedFilters: string
  flyTo: { lat: number; lon: number; zoom: number } | null
  offline?: boolean
}

interface CacheEntry {
  result: NlqCacheResult
  eventCount: number
  ts: number
}

const queryCache = new Map<string, CacheEntry>()

export function getNlqQueryCache(key: string, eventCount: number): NlqCacheResult | null {
  const cached = queryCache.get(key)
  if (!cached) return null
  if (cached.eventCount !== eventCount) return null
  if (Date.now() - cached.ts >= CACHE_TTL) {
    queryCache.delete(key)
    return null
  }
  return cached.result
}

export function setNlqQueryCache(key: string, eventCount: number, result: NlqCacheResult): void {
  queryCache.set(key, { result, eventCount, ts: Date.now() })
}

export function clearNlqQueryCache(): void {
  queryCache.clear()
}
