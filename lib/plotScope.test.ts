import { describe, it, expect } from 'vitest'
import { isDemoEvent, tagDemoEvents } from './demoEvents'
import { plotsForProject } from './plotScope'
import { formatForecastsHtml } from './reportSections'
import type { Plot } from '@/types'

describe('isDemoEvent', () => {
  it('detects demo tag', () => {
    expect(isDemoEvent({ tags: ['demo'] })).toBe(true)
    expect(isDemoEvent({ tags: ['saved'] })).toBe(false)
  })
})

describe('tagDemoEvents', () => {
  it('tags and stamps demo metadata', () => {
    const tagged = tagDemoEvents([{ id: 's1', source: 'gdelt', category: 'political', title: 'T', summary: '', lat: 0, lon: 0, country: '', countryCode: '', severity: 'low', timestamp: '' }])
    expect(tagged[0].tags).toContain('demo')
    expect(tagged[0].source_detail).toContain('DEMO')
  })
})

describe('plotsForProject', () => {
  const plot = (id: string, projectId?: string): Plot => ({
    id,
    workspace_id: 'w1',
    type: 'point',
    coordinates: [0, 0],
    label: id,
    properties: projectId ? { projectId } : {},
    created_at: '',
  })

  it('includes workspace-wide and matching project plots', () => {
    const plots = [plot('a'), plot('b', 'p1'), plot('c', 'p2')]
    expect(plotsForProject(plots, 'p1').map(p => p.id).sort()).toEqual(['a', 'b'])
  })
})

describe('formatForecastsHtml', () => {
  it('returns empty for no forecasts', () => {
    expect(formatForecastsHtml([], s => s)).toBe('')
  })

  it('escapes statement text', () => {
    const html = formatForecastsHtml([{
      id: 'f1', statement: 'A & B', probability: 0.5, createdAt: '', dueDate: '2026-08-01',
    }], s => s.replace(/&/g, '&amp;'))
    expect(html).toContain('A &amp; B')
  })
})
