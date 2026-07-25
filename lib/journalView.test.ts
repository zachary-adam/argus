import { describe, it, expect } from 'vitest'
import {
  journalEventIds,
  resolveEvidenceEvents,
  journalSnapshotEvents,
  intelEventFromJournalEntry,
  journalOnlyCount,
} from './journalView'
import { journalEntryFromEvent } from './journal'
import type { IntelEvent } from '@/types'
import type { Project } from '@/types/project'

const mkEvent = (id = 'ev1'): IntelEvent => ({
  id,
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

describe('journalView', () => {
  it('collects journal event ids', () => {
    const project = {
      journal: [journalEntryFromEvent(mkEvent()), journalEntryFromEvent(mkEvent('ev2'))],
    } as Project
    expect(journalOnlyCount(project)).toBe(2)
    expect(journalEventIds(project).has('ev1')).toBe(true)
  })

  it('filters live events to journal only', () => {
    const live = [mkEvent('ev1'), mkEvent('ev2'), mkEvent('ev3')]
    const project = { journal: [journalEntryFromEvent(mkEvent('ev2'))] } as Project
    const out = resolveEvidenceEvents(live, project, 'journal')
    expect(out.map(e => e.id)).toEqual(['ev2'])
  })

  it('includes snapshot when event left live feed', () => {
    const entry = journalEntryFromEvent(mkEvent('gone'))
    const project = { journal: [entry] } as Project
    const out = resolveEvidenceEvents([], project, 'journal')
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('gone')
    expect(out[0].lat).toBe(34)
  })

  it('reconstructs intel event from journal entry', () => {
    const entry = journalEntryFromEvent(mkEvent())
    const ev = intelEventFromJournalEntry(entry)
    expect(ev?.title).toBe('Border clash reported')
    expect(ev?.lon).toBe(78)
  })

  it('builds snapshot list from journal', () => {
    const project = { journal: [journalEntryFromEvent(mkEvent())] } as Project
    expect(journalSnapshotEvents(project)).toHaveLength(1)
  })
})
