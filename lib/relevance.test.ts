import { describe, it, expect } from 'vitest'
import { situationRelevance, isSituationRelevant, filterRelevantForProject, effectiveTargeting } from './relevance'
import { Targeting } from '@/types/project'

const bengal: Targeting = {
  scope: 'regional',
  placeName: 'West Bengal, India',
  keywords: ['election', 'violence', 'polling'],
  watchEntities: ['TMC', 'BJP', 'Mamata Banerjee'],
}

const ev = (o: Partial<{ title: string; summary: string; body: string; country: string; countryCode: string; category: string }>) => ({
  title: '', summary: '', body: '', country: '', countryCode: '', ...o,
})

describe('situation relevance', () => {
  it('keeps an on-situation event (place + keyword)', () => {
    expect(isSituationRelevant(ev({ title: 'Violence erupts in West Bengal during polling', country: 'India', countryCode: 'IN' }), bengal, ['IN'])).toBe(true)
  })

  it('keeps an event that names a watched entity even if out-of-country', () => {
    expect(isSituationRelevant(ev({ title: 'Mamata Banerjee addresses diaspora rally in London', country: 'UK', countryCode: 'GB' }), bengal, ['IN'])).toBe(true)
  })

  it('DROPS generic-keyword noise in the wrong country (the Haiti problem)', () => {
    // Contains the keyword "violence" but nothing to do with the situation.
    expect(isSituationRelevant(ev({ title: 'Gang violence surges in Port-au-Prince, Haiti', country: 'Haiti', countryCode: 'HT' }), bengal, ['IN'])).toBe(false)
  })

  it('keeps an in-AOR political/security event even without an exact keyword', () => {
    expect(isSituationRelevant(ev({ title: 'Security forces deployed across Bengal districts', countryCode: 'IN', category: 'political' }), bengal, ['IN'])).toBe(true)
  })

  it('DROPS off-topic in-AOR national noise (a celebrity surgery in the right country)', () => {
    // Right country, but nothing to do with the election and not a political/security event.
    expect(isSituationRelevant(ev({ title: 'Dalai Lama undergoes left knee surgery in New Delhi', countryCode: 'IN', category: 'technology' }), bengal, ['IN'])).toBe(false)
  })

  it('keeps everything when no targeting is defined', () => {
    expect(isSituationRelevant(ev({ title: 'Anything', countryCode: 'HT' }), undefined, ['IN'])).toBe(true)
    expect(isSituationRelevant(ev({ title: 'Anything', countryCode: 'HT' }), { scope: 'global', keywords: [], watchEntities: [] }, ['IN'])).toBe(true)
  })

  it('matches significant place tokens (Jamia from Jamia Nagar)', () => {
    const jamia: Targeting = {
      scope: 'local',
      placeName: 'Jamia Nagar, Delhi',
      keywords: ['election'],
      watchEntities: [],
    }
    expect(situationRelevance(ev({ title: 'Jamia student union election update' }), jamia).placeMatch).toBe(true)
    expect(isSituationRelevant(ev({ title: 'Jamia student from Kerala goes missing', countryCode: 'IN' }), jamia, ['IN'])).toBe(true)
  })

  it('does not treat generic place suffixes alone as a place hit', () => {
    const jamia: Targeting = {
      scope: 'local',
      placeName: 'Jamia Nagar, Delhi',
      keywords: ['election'],
      watchEntities: [],
    }
    expect(situationRelevance(ev({ title: 'Floods hit a nagar ward downtown' }), jamia).placeMatch).toBe(false)
  })
})

describe('filterRelevantForProject (connector firehose gate)', () => {
  const project = { targeting: bengal, countryCodes: ['IN'] }

  it('scopes a loose connector pull down to on-situation events', () => {
    const pulled = [
      ev({ title: 'BJP and TMC clash over polling in West Bengal', countryCode: 'IN', category: 'political' }),
      ev({ title: 'Ebola outbreak whereabouts unknown', country: 'DRC', countryCode: 'CD', category: 'health' }),
      ev({ title: 'El Niño climate feature', countryCode: 'GB', category: 'environmental' }),
    ]
    const kept = filterRelevantForProject(pulled, project)
    expect(kept).toHaveLength(1)
    expect(kept[0].title).toContain('West Bengal')
  })

  it('keeps everything when the project has no meaningful targeting', () => {
    const pulled = [ev({ title: 'Anything', countryCode: 'HT' }), ev({ title: 'Else', countryCode: 'CD' })]
    expect(filterRelevantForProject(pulled, { countryCodes: ['IN'] })).toHaveLength(2)
  })

  it('effectiveTargeting falls back to goal keywords when targeting is empty', () => {
    const t = effectiveTargeting({ goalTemplateId: 'organized-crime' })
    expect((t?.keywords?.length ?? 0)).toBeGreaterThan(0)
  })
})
