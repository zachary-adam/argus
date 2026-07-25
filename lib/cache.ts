const cache = new Map<string, { data: unknown; expiry: number }>()

export function getCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCache(key: string, data: unknown, ttlSeconds: number): void {
  cache.set(key, { data, expiry: Date.now() + ttlSeconds * 1000 })
}

export function clearCache(key: string): void {
  cache.delete(key)
}

export function clearAllCache(): number {
  const n = cache.size
  cache.clear()
  return n
}
