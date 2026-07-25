/**
 * Shared helper: returns the cached event list (set by /api/events)
 * without making an HTTP self-call.
 * If cache is cold, returns a sparse historical baseline for anomaly stats.
 */
import { IntelEvent } from '@/types'
import { getCache } from './cache'
import { demoEventsWithHistory } from './demoEvents'

export async function getEvents(): Promise<IntelEvent[]> {
  const cached = getCache<IntelEvent[]>('all-events')
  if (cached && cached.length > 0) return cached
  return demoEventsWithHistory()
}
