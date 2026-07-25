/**
 * Situation calendar — deterministic key-date context for briefs and panels.
 * Analyst-declared anchors (polling phases, summit rounds, rulings, deadlines,
 * anniversaries); ARGUS only computes distance-to-now. Generic for any watch.
 */
import type { KeyDate } from '@/types/project'

const DAY = 86_400_000

/** Human distance for a key date: "in 12 days" / "today" / "8 days ago". */
export function keyDateDistance(date: string, now: number = Date.now()): string {
  const days = Math.round((new Date(`${date}T12:00:00Z`).getTime() - now) / DAY)
  if (days === 0) return 'today'
  if (days > 0) return `in ${days} day${days !== 1 ? 's' : ''}`
  return `${-days} day${days !== -1 ? 's' : ''} ago`
}

/** Chronological, upcoming first (soonest → furthest), then recent past. */
export function sortKeyDates(dates: KeyDate[], now: number = Date.now()): KeyDate[] {
  const ts = (d: KeyDate) => new Date(`${d.date}T12:00:00Z`).getTime()
  const future = dates.filter(d => ts(d) >= now - DAY / 2).sort((a, b) => ts(a) - ts(b))
  const past = dates.filter(d => ts(d) < now - DAY / 2).sort((a, b) => ts(b) - ts(a))
  return [...future, ...past]
}

/** SITUATION CALENDAR prompt block for briefs. Deterministic; '' when empty. */
export function keyDatesBlock(dates: KeyDate[] | undefined, now: number = Date.now()): string {
  const valid = (dates ?? []).filter(d => d.label?.trim() && !Number.isNaN(new Date(d.date).getTime()))
  if (valid.length === 0) return ''
  const lines = sortKeyDates(valid, now).slice(0, 10).map(d =>
    `- ${d.date} (${keyDateDistance(d.date, now)}): ${d.label.trim()}${d.note?.trim() ? ` — ${d.note.trim()}` : ''}`,
  )
  return [
    'SITUATION CALENDAR (analyst-declared key dates — anchor the outlook and time-sensitive findings to these):',
    ...lines,
  ].join('\n')
}
