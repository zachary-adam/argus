import { describe, it, expect } from 'vitest'
import { countBriefInputs, formatBriefInputsLine } from './briefInputsSummary'
import type { Project } from '@/types/project'

const base = { id: 'p1' } as Project

describe('briefInputsSummary', () => {
  it('counts project research inputs', () => {
    const project = {
      ...base,
      eventPaperLinks: [{ id: 'l1' }],
      journal: [{ id: 'j1' }, { id: 'j2' }],
      cases: [{ id: 'c1', status: 'open' }, { id: 'c2', status: 'closed' }],
      hypothesisLog: [{ id: 'h1' }],
    } as Project
    expect(countBriefInputs(project)).toEqual({
      paperLinks: 1,
      journalEntries: 2,
      cases: 1,
      hypotheses: 1,
    })
  })

  it('formats a line when inputs exist', () => {
    const line = formatBriefInputsLine({
      ...base,
      eventPaperLinks: [{ id: 'l1' }, { id: 'l2' }],
      journal: [],
      cases: [],
    } as unknown as Project)
    expect(line).toContain('2 paper links')
  })

  it('returns null when nothing to weight', () => {
    expect(formatBriefInputsLine(base)).toBeNull()
  })
})
