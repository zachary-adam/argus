import { describe, it, expect } from 'vitest'
import { nlqToMarkdown } from './nlqHistory'

describe('nlqToMarkdown', () => {
  it('formats query summary as markdown', () => {
    const md = nlqToMarkdown({
      id: '1',
      user_id: 'u1',
      project_id: 'p1',
      query: 'Critical events in Iran',
      summary: 'Three high-severity incidents near the border.',
      applied_filters: 'severity:high',
      match_count: 3,
      created_at: '2026-06-22T12:00:00.000Z',
    })
    expect(md).toContain('Critical events in Iran')
    expect(md).toContain('Three high-severity incidents')
    expect(md).toContain('severity:high')
    expect(md).toContain('**Matches:** 3')
  })
})
