import { clearNlqQueryCache } from '@/lib/nlqQueryCache'
import { clearRelevanceCache } from '@/lib/relevanceClient'

/** Ephemeral browser keys — safe to wipe without losing projects or settings. */
const EPHEMERAL_LS_KEYS = [
  'argus_prev_event_count',
  'argus_onboarding_dismissed_v1',
  'argus_workflow_hint_v1',
  'argus-forecasts',
] as const

export interface ClearClientCacheResult {
  cleared: string[]
}

/** Clear in-memory client caches and ephemeral localStorage entries. */
export function clearClientCaches(): ClearClientCacheResult {
  const cleared: string[] = []

  clearRelevanceCache()
  cleared.push('relevance verdicts')

  clearNlqQueryCache()
  cleared.push('NLQ query cache')

  if (typeof localStorage !== 'undefined') {
    for (const key of EPHEMERAL_LS_KEYS) {
      try {
        if (localStorage.getItem(key) != null) {
          localStorage.removeItem(key)
          cleared.push(key)
        }
      } catch { /* quota / private mode */ }
    }
  }

  return { cleared }
}

/** Clear caches then hard-reload so stores rehydrate from a clean slate. */
export async function clearClientCachesAndReload(): Promise<ClearClientCacheResult> {
  const result = clearClientCaches()
  try {
    await fetch('/api/cache', { method: 'POST' })
    result.cleared.push('server API cache')
  } catch { /* offline / local */ }
  if (typeof window !== 'undefined') window.location.reload()
  return result
}
