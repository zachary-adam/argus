import { NextRequest } from 'next/server'

interface Window {
  count: number
  resetAt: number
}

const store = new Map<string, Window>()

// Cleanup stale entries periodically so the Map doesn't grow unbounded
let lastCleanup = Date.now()
function maybeCleanup() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, w] of store) {
    if (now > w.resetAt) store.delete(key)
  }
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  maybeCleanup()
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= maxRequests) return false
  entry.count++
  return true
}

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}
