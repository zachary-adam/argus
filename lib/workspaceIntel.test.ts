import { describe, it, expect } from 'vitest'
import { buildWorkspaceContextBlock, countryEvents } from '@/lib/workspaceIntel'
import { severityToNumber } from '@/lib/severityNum'
import type { IntelEvent } from '@/types'

describe('workspaceIntel', () => {
  it('maps string severity to numeric scale', () => {
    expect(severityToNumber('critical')).toBe(9)
    expect(severityToNumber('low')).toBe(2)
  })

  it('filters country events by code and name', () => {
    const events = [
      { id: '1', country: 'Iran', countryCode: 'IR', severity: 'high' },
      { id: '2', country: 'Iraq', countryCode: 'IQ', severity: 'low' },
    ] as IntelEvent[]
    const ir = countryEvents(events, 'Iran', 'IR')
    expect(ir).toHaveLength(1)
    expect(ir[0].id).toBe('1')
  })

  it('builds workspace block with research question and cases', () => {
    const block = buildWorkspaceContextBlock(
      {
        id: 'p1', name: 'Test', regionName: 'MENA',
        researchQuestion: 'Will Hormuz close?',
        cases: [{ id: 'c1', name: 'Strait watch', status: 'open', eventIds: ['e1'], notes: 'Watching tankers' }],
      } as unknown as import('@/types/project').Project,
      { events: [], alerts: [], situations: [], flaggedAlerts: {} },
    )
    expect(block).toContain('Research question: Will Hormuz close?')
    expect(block).toContain('Strait watch')
  })
})
