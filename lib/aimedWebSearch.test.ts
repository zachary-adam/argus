import { describe, expect, it } from 'vitest'
import { queriesFromResearchQuestion } from './aimedWebSearch'

describe('queriesFromResearchQuestion', () => {
  it('builds place + topic tokens from a prediction-style question', () => {
    const q = queriesFromResearchQuestion(
      'Who will win the Jamia student union election prediction check?',
      'Jamia Nagar, Delhi',
    )
    expect(q).toHaveLength(1)
    expect(q[0]).toContain('"Jamia Nagar"')
    expect(q[0]).toMatch(/Jamia|student|union|election/i)
    expect(q[0].toLowerCase()).not.toContain('prediction')
    expect(q[0].toLowerCase()).not.toContain(' will ')
  })

  it('returns empty when question is only stopwords', () => {
    expect(queriesFromResearchQuestion('what will win?', undefined)).toEqual([])
  })
})
