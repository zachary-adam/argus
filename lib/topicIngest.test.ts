import { describe, it, expect } from 'vitest'
import { topicSourceBucket, countByBucket, webResultToEvent, eventPublisherLabel, eventProvenanceLine } from './topicIngest'
import type { IntelEvent } from '@/types'

const geo = { lat: 1, lon: 2, country: 'Kenya', countryCode: 'KE' }

describe('topicIngest', () => {
  it('classifies aimed-pull events', () => {
    const e = { tags: ['targeted', 'aimed-pull', 'google-news'], source: 'analyst' } as IntelEvent
    expect(topicSourceBucket(e)).toBe('aimed')
  })

  it('classifies user-pasted events', () => {
    expect(topicSourceBucket({ tags: ['added'], source: 'analyst' } as IntelEvent)).toBe('yours')
  })

  it('classifies firehose by default', () => {
    expect(topicSourceBucket({ source: 'gdelt', tags: [] } as unknown as IntelEvent)).toBe('firehose')
  })

  it('counts buckets', () => {
    const events = [
      { tags: ['aimed-pull'], source: 'analyst' },
      { source: 'gdelt' },
      { tags: ['added'], source: 'analyst' },
    ] as IntelEvent[]
    expect(countByBucket(events)).toEqual({ aimed: 1, firehose: 1, yours: 1 })
  })

  it('web results become aimed events', () => {
    const e = webResultToEvent({ title: 'Niche report', url: 'https://example.com/a', snippet: 'detail', domain: 'example.com' }, geo)
    expect(e.tags).toContain('web-search')
    expect(topicSourceBucket(e)).toBe('aimed')
  })

  it('never labels publisher as Aimed', () => {
    const pasted = {
      source: 'analyst',
      source_detail: 'Aimed',
      tags: ['added'],
      url: 'https://indianarrative.com/story',
    } as IntelEvent
    expect(eventPublisherLabel(pasted)).toBe('indianarrative.com')
    expect(eventProvenanceLine(pasted)).toContain('indianarrative.com')
    expect(eventProvenanceLine(pasted)).not.toMatch(/\bAimed\b/)
  })
})
