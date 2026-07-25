import { IntelEvent } from '@/types'
import { WatchRule } from '@/types/project'
import { eventsMatchingRule, WatchEvalContext } from '@/lib/watchCondition'

export interface RuleFired {
  rule: WatchRule
  matchingEvents: IntelEvent[]
}

/**
 * Evaluates enabled watch rules against the event set.
 * Returns rules that meet their threshold and haven't fired within their own window.
 */
export function evaluateWatchRules(
  events: IntelEvent[],
  rules: WatchRule[],
  ctx?: WatchEvalContext,
): RuleFired[] {
  const now = Date.now()
  const fired: RuleFired[] = []

  for (const rule of rules) {
    if (!rule.enabled) continue

    // Prevent re-fire until the rule's own window elapses
    if (rule.lastFiredAt) {
      const elapsed = now - new Date(rule.lastFiredAt).getTime()
      if (elapsed < rule.windowHours * 3_600_000) continue
    }

    const matches = eventsMatchingRule(rule, events, ctx)

    if (matches.length >= rule.threshold) {
      fired.push({ rule, matchingEvents: matches })
    }
  }

  return fired
}
