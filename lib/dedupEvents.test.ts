import { describe, it, expect } from 'vitest'
import { deduplicateEvents } from './dedupEvents'
import { IntelEvent } from '@/types'

const base = (over: Partial<IntelEvent>): IntelEvent => ({
  id: Math.random().toString(36).slice(2),
  source: 'gdelt',
  category: 'conflict',
  title: 'Russian missile strike on Dnipro energy infrastructure',
  summary: '',
  lat: 48.46, lon: 35.04, country: 'Ukraine', countryCode: 'UA',
  severity: 'high',
  timestamp: new Date('2026-06-16T08:00:00Z').toISOString(),
  url: 'https://example.org',
  ...over,
})

describe('deduplicateEvents — corroboration', () => {
  it('collapses the same event from different sources into one', () => {
    const out = deduplicateEvents([
      base({ source: 'gdelt' }),
      base({ source: 'rss', title: 'Russian missile strike hits Dnipro energy infrastructure' }),
      base({ source: 'reliefweb', title: 'Missile strike on Dnipro energy grid — Russian forces' }),
    ])
    expect(out).toHaveLength(1)
  })

  it('records corroborationCount = number of DISTINCT sources', () => {
    const [merged] = deduplicateEvents([
      base({ source: 'gdelt' }),
      base({ source: 'rss', title: 'Russian missile strike hits Dnipro energy infrastructure grid' }),
      base({ source: 'reliefweb', title: 'Missile strike Dnipro energy infrastructure Russian forces report' }),
    ])
    expect(merged.corroborationCount).toBe(3)
  })

  it('does NOT inflate corroboration when the SAME source re-emits', () => {
    const [merged] = deduplicateEvents([
      base({ source: 'gdelt' }),
      base({ source: 'gdelt' }), // identical re-emit
    ])
    expect(merged.corroborationCount).toBe(1)
  })

  it('keeps the most severe report and the highest fatality figure', () => {
    const [merged] = deduplicateEvents([
      base({ source: 'gdelt', severity: 'high', fatalities: 4 }),
      base({ source: 'rss', severity: 'critical', fatalities: 9, title: 'Russian missile strike Dnipro energy infrastructure deadly' }),
    ])
    expect(merged.severity).toBe('critical')
    expect(merged.fatalities).toBe(9)
  })

  it('leaves genuinely distinct events untouched (different place, no merge)', () => {
    const out = deduplicateEvents([
      base({ source: 'gdelt', title: 'Russian missile strike on Dnipro', lat: 48.46, lon: 35.04 }),
      base({ source: 'gdelt', title: 'Flooding displaces thousands in Jakarta', lat: -6.2, lon: 106.8, country: 'Indonesia' }),
    ])
    expect(out).toHaveLength(2)
    expect(out.every(e => e.corroborationCount == null || e.corroborationCount === 1)).toBe(true)
  })
})
