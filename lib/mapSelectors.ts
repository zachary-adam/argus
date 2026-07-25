import type { IntelEvent } from '@/types'

/** Single-pass counts; numeric selectors skip re-render when count unchanged. */
export function selectHighEventCount(s: { events: IntelEvent[] }): number {
  let n = 0
  for (const e of s.events) if (e.severity === 'high') n++
  return n
}

export function selectCriticalEventCount(s: { events: IntelEvent[] }): number {
  let n = 0
  for (const e of s.events) if (e.severity === 'critical') n++
  return n
}
