import { describe, it, expect } from 'vitest'
import { keyDateDistance, sortKeyDates, keyDatesBlock } from './keyDates'
import type { KeyDate } from '@/types/project'

const NOW = new Date('2026-07-06T12:00:00Z').getTime()
const kd = (id: string, date: string, label: string, note?: string): KeyDate => ({ id, date, label, note })

describe('keyDateDistance', () => {
  it('renders relative distance around now', () => {
    expect(keyDateDistance('2026-07-06', NOW)).toBe('today')
    expect(keyDateDistance('2026-07-18', NOW)).toBe('in 12 days')
    expect(keyDateDistance('2026-07-07', NOW)).toBe('in 1 day')
    expect(keyDateDistance('2026-06-28', NOW)).toBe('8 days ago')
  })
})

describe('sortKeyDates', () => {
  it('orders upcoming soonest-first, then most-recent past', () => {
    const dates = [
      kd('a', '2026-08-01', 'Phase 2 poll'),
      kd('b', '2026-06-20', 'Nomination deadline'),
      kd('c', '2026-07-15', 'Phase 1 poll'),
    ]
    expect(sortKeyDates(dates, NOW).map(d => d.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('keyDatesBlock', () => {
  it('builds a deterministic calendar block, upcoming first', () => {
    const block = keyDatesBlock([
      kd('a', '2026-07-15', 'Phase 1 poll', 'North districts'),
      kd('b', '2026-06-20', 'Nomination deadline'),
    ], NOW)
    expect(block).toContain('SITUATION CALENDAR')
    expect(block.indexOf('Phase 1 poll')).toBeLessThan(block.indexOf('Nomination deadline'))
    expect(block).toContain('2026-07-15 (in 9 days): Phase 1 poll — North districts')
  })

  it('returns empty string when there are no valid dates', () => {
    expect(keyDatesBlock([], NOW)).toBe('')
    expect(keyDatesBlock(undefined, NOW)).toBe('')
    expect(keyDatesBlock([kd('x', 'not-a-date', 'Bad')], NOW)).toBe('')
  })
})
