import { describe, expect, it } from 'vitest'
import type { Project } from '@/types/project'
import {
  capJournalEntry,
  capResearchText,
  mergeResearchIntoProject,
  projectNeedsResearchMigration,
  researchTableCounts,
  stripResearchFromProjectData,
} from '@/lib/supabase/researchJournal'

describe('researchJournal helpers', () => {
  it('caps long journal text fields', () => {
    const long = 'x'.repeat(5000)
    const entry = capJournalEntry({
      id: 'j1',
      kind: 'note',
      title: 'T',
      savedAt: '2026-01-01',
      updatedAt: '2026-01-01',
      body: long,
      note: long,
    })
    expect(entry.body).toHaveLength(4000)
    expect(entry.note).toHaveLength(4000)
    expect(capResearchText('short')).toBe('short')
  })

  it('strips research arrays from project JSON payload', () => {
    const stripped = stripResearchFromProjectData({
      id: 'p1',
      name: 'N',
      journal: [{ id: 'j1', kind: 'note', title: 'T', savedAt: '2026-01-01', updatedAt: '2026-01-01' }],
      hypothesisLog: [{ id: 'h1', recordedAt: '2026-01-01', statement: 'S' }],
      eventPaperLinks: [{ id: 'l1', eventId: 'e1', paperEntryId: 'p1', analysisMark: 'm', attachedAt: '2026-01-01' }],
    } as Omit<Project, 'byokApiKey'>)
    expect(stripped.journal).toEqual([])
    expect(stripped.hypothesisLog).toEqual([])
    expect(stripped.eventPaperLinks).toEqual([])
  })

  it('uses table data when tables are available (including empty)', () => {
    const project = {
      id: 'p1',
      journal: [{ id: 'old', kind: 'note', title: 'Legacy', savedAt: '2026-01-01', updatedAt: '2026-01-01' }],
    } as Project
    const merged = mergeResearchIntoProject(project, {
      journal: [{ id: 'new', kind: 'paper', title: 'Table', savedAt: '2026-01-02', updatedAt: '2026-01-02' }],
      hypothesisLog: [],
      eventPaperLinks: [],
    }, true)
    expect(merged.journal?.[0].id).toBe('new')
  })

  it('keeps legacy JSON when research tables are not deployed', () => {
    const project = {
      id: 'p1',
      journal: [{ id: 'legacy', kind: 'note', title: 'Legacy', savedAt: '2026-01-01', updatedAt: '2026-01-01' }],
    } as Project
    const merged = mergeResearchIntoProject(project, undefined, false)
    expect(merged.journal?.[0].id).toBe('legacy')
  })

  it('clears journal when tables available but project has no rows', () => {
    const project = {
      id: 'p1',
      journal: [{ id: 'stale', kind: 'note', title: 'Stale JSON', savedAt: '2026-01-01', updatedAt: '2026-01-01' }],
    } as Project
    const merged = mergeResearchIntoProject(project, undefined, true)
    expect(merged.journal).toEqual([])
  })

  it('detects projects needing JSON→table migration', () => {
    const project = {
      id: 'p1',
      journal: [{ id: 'j1', kind: 'note', title: 'T', savedAt: '2026-01-01', updatedAt: '2026-01-01' }],
    } as Project
    expect(projectNeedsResearchMigration(project, { journal: 0, hypotheses: 0, links: 0 })).toBe(true)
    expect(projectNeedsResearchMigration(project, { journal: 1, hypotheses: 0, links: 0 })).toBe(false)
    expect(researchTableCounts({ journal: [], hypothesisLog: [], eventPaperLinks: [] }).journal).toBe(0)
  })
})
