import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cacheBriefsForProject, loadCachedBriefs } from './briefCache'
import type { BriefHistoryRecord } from './briefRender'

const store = new Map<string, string>()

vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
})

const record = (id: string): BriefHistoryRecord => ({
  id,
  type: 'canvas',
  title: 'Test brief',
  country: '',
  country_code: '',
  project_id: 'p1',
  data: { headline: 'H', situation: 'S', keyFindings: [], riskLevel: 'LOW', riskRationale: '', assessmentInsight: '', watchItems: [], analystJudgment: '', confidence: 'LOW', confidenceRationale: '' },
  summary: '',
  created_at: '2026-01-01T00:00:00Z',
})

describe('briefCache', () => {
  beforeEach(() => {
    store.clear()
  })

  it('round-trips briefs for a project', () => {
    cacheBriefsForProject('p1', [record('b1'), record('b2')])
    const loaded = loadCachedBriefs('p1')
    expect(loaded).toHaveLength(2)
    expect(loaded[0].id).toBe('b1')
  })

  it('returns empty for unknown project', () => {
    expect(loadCachedBriefs('missing')).toEqual([])
  })
})
