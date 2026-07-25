import { describe, it, expect } from 'vitest'
import { briefSummary, briefToMarkdown, BRIEF_TYPE_LABEL } from './briefRender'
import type { BriefHistoryRecord } from './briefRender'

describe('briefSummary', () => {
  it('extracts country executive summary', () => {
    expect(briefSummary('country', { executiveSummary: 'Tensions rising along the border.' })).toBe('Tensions rising along the border.')
  })

  it('extracts project BLUF', () => {
    expect(briefSummary('project', { bluf: 'Election violence likely.' })).toBe('Election violence likely.')
  })

  it('extracts canvas headline', () => {
    expect(briefSummary('canvas', { headline: 'Escalation probable', situation: 'x' })).toBe('Escalation probable')
  })
})

describe('briefToMarkdown', () => {
  it('renders project brief markdown', () => {
    const record: BriefHistoryRecord = {
      id: '1',
      type: 'project',
      title: 'Bihar Watch intelligence brief',
      country: '',
      country_code: '',
      project_id: 'p1',
      data: {
        classification: 'UNCLASSIFIED',
        bluf: 'Violence may spike.',
        situation: 'Polling nears.',
        keyFindings: [],
        patterns: 'n/a',
        outlook: 'Watch rallies.',
        analystNote: 'Limited sources.',
        tags: [],
      },
      summary: 'Violence may spike.',
      created_at: '2026-06-22T12:00:00.000Z',
    }
    const md = briefToMarkdown(record)
    expect(md).toContain('Violence may spike.')
    expect(md).toContain('Bihar Watch')
  })
})

describe('BRIEF_TYPE_LABEL', () => {
  it('labels all brief types', () => {
    expect(BRIEF_TYPE_LABEL.country).toBe('Country')
    expect(BRIEF_TYPE_LABEL.canvas).toBe('Canvas')
  })
})
