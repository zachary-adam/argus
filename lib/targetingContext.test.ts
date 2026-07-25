import { describe, it, expect } from 'vitest'
import { targetingToPrompt } from './targetingContext'

describe('targetingToPrompt — AI framing', () => {
  it('is empty for global scope (no extra framing)', () => {
    expect(targetingToPrompt({ scope: 'global', keywords: [], watchEntities: [] })).toBe('')
    expect(targetingToPrompt(undefined)).toBe('')
  })

  it('renders place, entities, topics and date for a local scope', () => {
    const out = targetingToPrompt({
      scope: 'local', placeName: 'Kibera, Nairobi',
      keywords: ['election', 'violence'], watchEntities: ['ODM', 'Ruto'], keyDate: '2026-08-12',
    })
    expect(out).toContain('scope: LOCAL')
    expect(out).toContain('Kibera, Nairobi')
    expect(out).toContain('ODM, Ruto')
    expect(out).toContain('election, violence')
    expect(out).toContain('2026-08-12')
  })

  it('omits fields that are not set', () => {
    const out = targetingToPrompt({ scope: 'country', placeName: 'Sudan', keywords: [], watchEntities: [] })
    expect(out).toContain('Sudan')
    expect(out).not.toContain('Watch entities')
    expect(out).not.toContain('Priority topics')
  })
})
