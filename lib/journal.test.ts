import { describe, it, expect } from 'vitest'
import {
  journalEntryFromEvent,
  journalEntryFromPaper,
  isEventInJournal,
  formatJournalBlock,
  formatTaggedJournalCorpus,
  formatHypothesisBriefBlock,
  buildPaperSearchQuery,
  groupJournalByWeek,
  journalEntryToAchEvidence,
  journalMemoMarkdown,
  hypothesisRevisionFromInput,
  toggleJournalLink,
  linkedJournalEntries,
} from './journal'
import type { IntelEvent } from '@/types'
import type { Project } from '@/types/project'

const mkEvent = (): IntelEvent => ({
  id: 'ev1',
  title: 'Border clash reported',
  summary: 'Patrol incident',
  category: 'conflict',
  country: 'India',
  countryCode: 'IN',
  severity: 'high',
  timestamp: '2026-06-01T12:00:00Z',
  lat: 34,
  lon: 78,
  source: 'rss',
  url: 'https://example.com',
})

describe('journal', () => {
  it('creates event entry with snapshot fields', () => {
    const e = journalEntryFromEvent(mkEvent(), { note: 'Key signal' })
    expect(e.kind).toBe('event')
    expect(e.eventId).toBe('ev1')
    expect(e.lat).toBe(34)
    expect(e.lon).toBe(78)
    expect(e.note).toBe('Key signal')
  })

  it('detects saved events', () => {
    const project = {
      journal: [journalEntryFromEvent(mkEvent())],
    } as Project
    expect(isEventInJournal(project, 'ev1')).toBe(true)
    expect(isEventInJournal(project, 'other')).toBe(false)
  })

  it('formats journal block for AI context', () => {
    const block = formatJournalBlock([
      journalEntryFromPaper({ title: 'Escalation dynamics', authors: ['Smith'], year: 2024, abstract: 'Theory of crisis bargaining.' }),
    ])
    expect(block).toMatch(/RESEARCH JOURNAL/)
    expect(block).toMatch(/Escalation dynamics/)
  })

  it('formats tagged journal corpus with J# tags and key-first order', () => {
    const supporting = journalEntryFromEvent(mkEvent(), { significance: 'supporting' })
    const key = journalEntryFromPaper({ title: 'Key paper' })
    key.significance = 'key'
    const { text, sourceMap } = formatTaggedJournalCorpus([supporting, key])
    expect(text).toMatch(/\[J1\]/)
    expect(text).toMatch(/Key paper/)
    expect(sourceMap.J1?.title).toBe('Key paper')
  })

  it('formats hypothesis trail for briefs', () => {
    const block = formatHypothesisBriefBlock({
      hypothesisLog: [hypothesisRevisionFromInput('First view'), hypothesisRevisionFromInput('Updated view')],
    } as Project)
    expect(block).toMatch(/CURRENT HYPOTHESIS/)
    expect(block).toMatch(/Updated view/)
  })

  it('builds paper search query from mission', () => {
    const q = buildPaperSearchQuery({
      researchQuestion: 'Will border tensions escalate?',
      regionName: 'Ladakh',
      targeting: { scope: 'regional', keywords: ['border', 'military'], watchEntities: [] },
    } as unknown as Project)
    expect(q).toContain('escalate')
    expect(q).toContain('Ladakh')
    expect(q).toContain('border')
  })

  it('groups entries by ISO week', () => {
    const a = journalEntryFromEvent(mkEvent())
    a.savedAt = '2026-06-03T12:00:00Z'
    a.eventTimestamp = '2026-06-03T12:00:00Z'
    const b = journalEntryFromPaper({ title: 'Paper B' })
    b.savedAt = '2026-06-10T12:00:00Z'
    const groups = groupJournalByWeek([a, b])
    expect(groups.length).toBe(2)
    expect(groups[0].entries.length).toBeGreaterThan(0)
  })

  it('maps journal entry to ACH evidence', () => {
    const ev = journalEntryToAchEvidence(journalEntryFromEvent(mkEvent(), { note: 'Critical' }))
    expect(ev.nodeId).toMatch(/^journal:/)
    expect(ev.analystComments).toEqual(['Critical'])
  })

  it('builds analyst memo from key evidence', () => {
    const project = {
      name: 'Test',
      researchQuestion: 'Will tensions escalate?',
      journal: [
        journalEntryFromEvent(mkEvent(), { significance: 'key', note: 'Primary signal' }),
      ],
      hypothesisLog: [
        hypothesisRevisionFromInput('Stalemate likely', { rationale: 'No new kinetic contact' }),
      ],
    } as import('@/types/project').Project
    const memo = journalMemoMarkdown(project)
    expect(memo).toMatch(/no AI synthesis/)
    expect(memo).toMatch(/Stalemate likely/)
    expect(memo).toMatch(/Primary signal/)
  })

  it('toggles journal entry links', () => {
    const a = journalEntryFromEvent(mkEvent(), { significance: 'key' })
    const b = journalEntryFromPaper({ title: 'Related theory' })
    const linked = toggleJournalLink(a, b.id)
    expect(linked).toContain(b.id)
    expect(toggleJournalLink({ ...a, linkedEntryIds: linked }, b.id)).not.toContain(b.id)
    const project = { journal: [a, { ...b, id: b.id }] } as Project
    expect(linkedJournalEntries(project, { ...a, linkedEntryIds: [b.id] })).toHaveLength(1)
  })
})
