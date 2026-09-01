import { describe, it, expect } from 'vitest'
import { matchesWatchCondition, eventsMatchingRule } from './watchCondition'
import type { IntelEvent } from '@/types'

const base = (overrides: Partial<IntelEvent> = {}): IntelEvent => ({
  id: '1', title: 'Election rally in Lagos', summary: 'Opposition party gathers supporters',
  category: 'political', severity: 'medium', country: 'Nigeria', countryCode: 'NG',
  lat: 6.5, lon: 3.4, source: 'gdelt', timestamp: new Date().toISOString(),
  url: 'https://example.com/1',
  ...overrides,
})

describe('matchesWatchCondition', () => {
  it('matches text contains for keywords', () => {
    expect(matchesWatchCondition(base(), { field: 'text', op: 'contains', value: 'election' })).toBe(true)
    expect(matchesWatchCondition(base(), { field: 'text', op: 'contains', value: 'cricket' })).toBe(false)
  })

  it('matches title contains', () => {
    expect(matchesWatchCondition(base(), { field: 'title', op: 'contains', value: 'Lagos' })).toBe(true)
  })

  it('matches actor names in text field', () => {
    const e = base({ actors: [{ name: 'APC', type: 'organization' }] })
    expect(matchesWatchCondition(e, { field: 'text', op: 'contains', value: 'APC' })).toBe(true)
  })
})

describe('eventsMatchingRule eventScope', () => {
  const aimed = base({
    title: 'Election rally in Lagos Nigeria',
    tags: ['aimed-pull', 'google-news'],
    source: 'analyst',
  })
  const firehose = base({ title: 'Election rally in Lagos', source: 'gdelt' })
  const rule = {
    conditions: [{ field: 'text' as const, op: 'contains' as const, value: 'election' }],
    windowHours: 24,
    threshold: 1,
  }

  it('topic scope ignores firehose even when text matches', () => {
    const ctx = { targeting: { scope: 'regional' as const, keywords: ['election'], watchEntities: [] }, countryCodes: ['NG'] }
    expect(eventsMatchingRule({ ...rule, eventScope: 'topic' }, [firehose], ctx)).toHaveLength(0)
    expect(eventsMatchingRule({ ...rule, eventScope: 'topic' }, [aimed], ctx)).toHaveLength(1)
  })

  it('topic scope rejects aimed hits outside your countries', () => {
    const uk = base({
      title: 'UK Cabinet Coup Against PM Starmer',
      tags: ['aimed-pull'],
      source: 'analyst',
    })
    const ctx = {
      targeting: { scope: 'regional' as const, keywords: ['cabinet', 'coup'], watchEntities: [] },
      countryCodes: ['IL', 'IR', 'LB'],
    }
    expect(eventsMatchingRule({
      ...rule,
      eventScope: 'topic',
      conditions: [{ field: 'text', op: 'contains', value: 'cabinet' }],
    }, [uk], ctx)).toHaveLength(0)
  })

  it('all scope includes firehose', () => {
    expect(eventsMatchingRule({ ...rule, eventScope: 'all' }, [firehose])).toHaveLength(1)
  })
})
