import { describe, it, expect } from 'vitest'
import {
  createEventPaperLink,
  formatEventPaperBriefBlock,
  resolveEventTitle,
  resolvedEventPapers,
} from './eventPapers'
import { journalEntryFromEvent, journalEntryFromPaper } from './journal'
import type { Project } from '@/types/project'
import type { IntelEvent } from '@/types'

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

describe('eventPapers', () => {
  it('formats analyst marks for brief context', () => {
    const paper = journalEntryFromPaper({
      title: 'Escalation dynamics',
      authors: ['Smith'],
      year: 2024,
      abstract: 'Theory of crisis bargaining under audience costs.',
    })
    const project = {
      journal: [journalEntryFromEvent(mkEvent()), paper],
      eventPaperLinks: [
        createEventPaperLink('ev1', paper.id, 'Audience-cost mechanism explains follow-on mobilization', 'explains'),
      ],
    } as Project

    const block = formatEventPaperBriefBlock(project)
    expect(block).toMatch(/EVENT–PAPER ANALYSIS MARKS/)
    expect(block).toMatch(/Border clash/)
    expect(block).toMatch(/Audience-cost mechanism/)
    expect(block).toMatch(/Escalation dynamics/)
  })

  it('resolves event title from live feed when journal entry is absent', () => {
    const live: IntelEvent = { ...mkEvent(), title: 'Live feed headline' }
    const project = {
      journal: [],
      eventPaperLinks: [createEventPaperLink('ev1', 'p1', 'Mark', 'explains')],
    } as unknown as Project
    expect(resolveEventTitle('ev1', project, [live])).toBe('Live feed headline')
  })

  it('resolves paper entries for an event', () => {
    const paper = journalEntryFromPaper({ title: 'Paper A' })
    const project = {
      journal: [paper],
      eventPaperLinks: [createEventPaperLink('ev1', paper.id, 'Use for hypothesis H2', 'method')],
    } as Project
    expect(resolvedEventPapers(project, 'ev1')).toHaveLength(1)
    expect(resolvedEventPapers(project, 'ev1')[0].link.analysisMark).toContain('H2')
  })
})
