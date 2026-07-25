import { describe, expect, it } from 'vitest'
import type { CorrelationAlert, IntelEvent } from '@/types'
import type { Pattern, Project } from '@/types/project'
import {
  buildPatternCorpus,
  mergePatterns,
  MIN_PATTERN_CORPUS,
  novelCorrelationPatterns,
  patternCorpusReady,
  patternDedupeKey,
  qualifiesPattern,
} from '@/lib/patterns'

function ev(id: string, cat: IntelEvent['category'] = 'political'): IntelEvent {
  return {
    id,
    source: 'gdelt',
    category: cat,
    title: id,
    summary: '',
    lat: 1,
    lon: 2,
    country: 'Test',
    countryCode: 'TT',
    severity: 'medium',
    timestamp: '2026-01-01T00:00:00Z',
    url: '',
  }
}

describe('patterns utils', () => {
  it('mergePatterns dedupes by if/then and prefers higher hits', () => {
    const a: Pattern = {
      id: '1', name: 'A', if: 'if x', then: 'then y', source: 'ai', evidence: { eventIds: [] },
      hits: 2, misses: 1, hitRate: 0.66, confidence: 'low', createdAt: '2026-01-01',
    }
    const b: Pattern = {
      id: '2', name: 'B', if: 'if x', then: 'then y', source: 'rules', evidence: { eventIds: [] },
      hits: 4, misses: 1, hitRate: 0.8, confidence: 'high', createdAt: '2026-01-01',
    }
    const merged = mergePatterns([a], [b])
    expect(merged).toHaveLength(1)
    expect(merged[0].hits).toBe(4)
    expect(merged[0].source).toBe('rules')
  })

  it('requires minimum corpus size', () => {
    expect(patternCorpusReady(MIN_PATTERN_CORPUS - 1)).toBe(false)
    expect(patternCorpusReady(MIN_PATTERN_CORPUS)).toBe(true)
  })

  it('qualifiesPattern enforces hits and hit rate', () => {
    const weak: Pattern = {
      id: 'w', name: 'w', if: 'a', then: 'b', source: 'rules', evidence: { eventIds: [] },
      hits: 2, misses: 2, hitRate: 0.5, confidence: 'low', createdAt: '2026-01-01',
    }
    const strong: Pattern = {
      id: 's', name: 's', if: 'a', then: 'b', source: 'rules', evidence: { eventIds: [] },
      hits: 3, misses: 1, hitRate: 0.75, confidence: 'moderate', createdAt: '2026-01-01',
    }
    expect(qualifiesPattern(weak, 30)).toBe(false)
    expect(qualifiesPattern(strong, 30)).toBe(true)
  })

  it('buildPatternCorpus prioritizes journal events', () => {
    const project = {
      id: 'p1',
      journal: [{
        id: 'j1',
        kind: 'event',
        eventId: 'saved',
        title: 'Saved',
        savedAt: '2026-01-01',
        updatedAt: '2026-01-01',
        lat: 3,
        lon: 4,
      }],
    } as Project
    const corpus = buildPatternCorpus(project, [ev('noise'), ev('saved')])
    expect(corpus[0].id).toBe('saved')
  })

  it('novelCorrelationPatterns skips already saved alerts', () => {
    const alert: CorrelationAlert = {
      id: 'al1',
      title: 'Escalation',
      summary: 'Multiple conflict events',
      severity: 'high',
      pattern: 'Conflict Escalation',
      signals: ['3 events in 24h'],
      signalCount: 3,
      countries: ['Test'],
      lat: 0,
      lon: 0,
      timestamp: '2026-01-01',
    }
    const saved: Pattern[] = [{
      id: 'corr_al1',
      name: 'Conflict Escalation',
      if: 'x',
      then: 'y',
      source: 'correlation',
      correlationAlertId: 'al1',
      evidence: { eventIds: [] },
      hits: 3,
      misses: 0,
      hitRate: 1,
      confidence: 'moderate',
      createdAt: '2026-01-01',
    }]
    expect(novelCorrelationPatterns(saved, [alert])).toHaveLength(0)
    expect(novelCorrelationPatterns([], [alert])).toHaveLength(1)
    expect(patternDedupeKey(saved[0])).toBeTruthy()
  })
})
