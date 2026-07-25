import { IntelEvent } from '@/types'
import { WatchCondition, WatchConditionField, WatchRule, Targeting } from '@/types/project'
import { topicSourceBucket } from '@/lib/topicIngest'
import { isAimedEventRelevant } from '@/lib/aimedIngest'

const SEV_RANK: Record<string, number> = { critical: 9, high: 7, medium: 5, low: 2 }

export interface WatchEvalContext {
  targeting?: Targeting
  countryCodes?: string[]
}

/** Whether an event is eligible for a watch rule's source scope. */
export function eventEligibleForWatch(
  rule: Pick<WatchRule, 'eventScope'>,
  e: IntelEvent,
  ctx?: WatchEvalContext,
): boolean {
  if (rule.eventScope !== 'topic') return true
  const bucket = topicSourceBucket(e)
  if (bucket !== 'aimed' && bucket !== 'yours') return false
  if (ctx?.targeting) {
    return isAimedEventRelevant(e, ctx.targeting, ctx.countryCodes ?? [])
  }
  return true
}

export function eventFieldValue(e: IntelEvent, field: WatchConditionField): string | number {
  switch (field) {
    case 'severity':   return e.severity
    case 'category':   return e.category
    case 'country':    return e.country
    case 'fatalities': return e.fatalities ?? 0
    case 'source':     return e.source
    case 'title':      return e.title
    case 'summary':    return e.summary ?? ''
    case 'text': {
      const actors = (e.actors ?? []).map(a => a.name).join(' ')
      return `${e.title} ${e.summary} ${e.body ?? ''} ${actors}`
    }
    default:           return ''
  }
}

/** Single watch condition against one event. Shared by engine, hooks, and UI previews. */
export function matchesWatchCondition(e: IntelEvent, c: WatchCondition): boolean {
  const { field, op, value } = c
  if (field !== 'fatalities' && field !== 'severity' && !String(value).trim()) return false

  let fieldValue: string | number
  if (field === 'severity' && (op === 'gte' || op === 'lte')) {
    fieldValue = SEV_RANK[e.severity] ?? 0
  } else {
    fieldValue = eventFieldValue(e, field)
  }

  switch (op) {
    case 'equals':   return String(fieldValue).toLowerCase() === String(value).toLowerCase()
    case 'contains': return String(fieldValue).toLowerCase().includes(String(value).toLowerCase())
    case 'gte':      return Number(fieldValue) >= Number(value)
    case 'lte':      return Number(fieldValue) <= Number(value)
    default:         return false
  }
}

export function eventsMatchingRule(
  rule: Pick<WatchRule, 'conditions' | 'windowHours' | 'eventScope'>,
  events: IntelEvent[],
  ctx?: WatchEvalContext,
): IntelEvent[] {
  const cutoff = Date.now() - rule.windowHours * 3_600_000
  return events.filter(e => {
    if (new Date(e.timestamp).getTime() < cutoff) return false
    if (!eventEligibleForWatch(rule, e, ctx)) return false
    return rule.conditions.every(c => matchesWatchCondition(e, c))
  })
}
