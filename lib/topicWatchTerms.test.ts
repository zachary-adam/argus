import { describe, it, expect } from 'vitest'
import { topicWatchTerms } from './topicWatchTerms'

describe('topicWatchTerms', () => {
  it('includes entities and country keywords only', () => {
    const terms = topicWatchTerms(
      { scope: 'regional', keywords: ['coup', 'cabinet', 'Israel', 'Hezbollah'], watchEntities: ['Netanyahu'], placeName: 'Gaza' },
      ['IL', 'IR', 'LB'],
    )
    expect(terms).toContain('Netanyahu')
    expect(terms).toContain('Israel')
    expect(terms).toContain('Gaza')
    expect(terms).not.toContain('coup')
    expect(terms).not.toContain('cabinet')
  })
})
