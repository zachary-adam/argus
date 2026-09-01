import { describe, it, expect } from 'vitest'
import { isAimedEventRelevant, collapseAimedStories, userVisibleTags } from './aimedIngest'
import type { IntelEvent } from '@/types'

const targeting = {
  scope: 'regional' as const,
  keywords: ['cabinet', 'Israel', 'Iran', 'Lebanon'],
  watchEntities: [],
}

const ev = (over: Partial<IntelEvent>): IntelEvent => ({
  id: '1', title: '', summary: '', category: 'political', severity: 'medium',
  country: 'Israel', countryCode: 'IL', lat: 31.5, lon: 34.8, source: 'analyst',
  timestamp: new Date().toISOString(), url: 'https://example.com/1', tags: ['aimed-pull'], ...over,
})

describe('isAimedEventRelevant', () => {
  it('rejects generic cabinet UK story for Middle East project', () => {
    const uk = ev({
      title: 'Government Faces No-Confidence Vote — PM Starmer',
      summary: 'Westminster crisis deepens',
      country: 'United Kingdom', countryCode: 'GB',
    })
    expect(isAimedEventRelevant(uk, targeting, ['IL', 'IR', 'LB'])).toBe(false)
  })

  it('rejects keyword-only stories outside your countries', () => {
    const uk = ev({
      title: 'UK Cabinet Coup Against PM Starmer?',
      summary: 'Westminster crisis',
      country: 'United Kingdom', countryCode: 'GB',
    })
    const coupTargeting = { ...targeting, keywords: ['coup', 'cabinet', 'crackdown'], watchEntities: [] }
    expect(isAimedEventRelevant(uk, coupTargeting, ['IL', 'IR', 'LB'])).toBe(false)
  })

  it('accepts story mentioning project country with keyword', () => {
    const hit = ev({
      title: 'Israel cabinet reshuffle amid Lebanon tensions',
      summary: 'Netanyahu moves ministers',
    })
    expect(isAimedEventRelevant(hit, targeting, ['IL', 'IR', 'LB'])).toBe(true)
  })

  it('accepts entity in watch list', () => {
    const hit = ev({
      title: 'Hezbollah leader warns Israel over border',
      summary: 'Lebanon escalation',
    })
    expect(isAimedEventRelevant(hit, { ...targeting, keywords: [], watchEntities: ['Hezbollah'] }, ['IL'])).toBe(true)
  })
})

describe('collapseAimedStories', () => {
  it('merges headline variants at same anchor', () => {
    const out = collapseAimedStories([
      ev({ id: 'a', title: 'Government Ousted by No-Confidence Vote' }),
      ev({ id: 'b', title: 'Government Faces No-Confidence Deepens' }),
      ev({ id: 'c', title: 'Prime minister loses confidence vote' }),
    ])
    expect(out.length).toBeLessThan(3)
    expect(out[0].corroborationCount).toBeGreaterThan(1)
  })
})

describe('userVisibleTags', () => {
  it('hides internal tags', () => {
    expect(userVisibleTags(['targeted', 'aimed-pull', 'my-tag'])).toEqual(['my-tag'])
  })
})
