import { describe, it, expect } from 'vitest'
import { indicatorTerms, evaluateIndicator, createStarterIndicatorNode } from '@/lib/indicators'

describe('indicatorTerms', () => {
  it('splits on commas/semicolons/newlines and drops short noise', () => {
    expect(indicatorTerms('troops, mobilization; armor\na')).toEqual(['troops', 'mobilization', 'armor'])
  })
  it('returns [] for empty input', () => {
    expect(indicatorTerms('   ,  ; ')).toEqual([])
  })
})

describe('evaluateIndicator', () => {
  const events = [
    { title: 'Heavy shelling along the frontline', summary: 'artillery exchange' },
    { title: 'Ceasefire talks announced', summary: 'negotiation window opens' },
    { title: 'Power plant struck in overnight raid', summary: '' },
  ]

  it('trips when a term matches title or summary', () => {
    const m = evaluateIndicator('shelling, offensive', events)
    expect(m.tripped).toBe(true)
    expect(m.matchCount).toBe(1)
    expect(m.sampleTitles[0]).toMatch(/shelling/i)
  })

  it('matches against summary text too', () => {
    expect(evaluateIndicator('negotiation', events).matchCount).toBe(1)
  })

  it('counts every matching event', () => {
    // "raid" hits event 3; "talks" hits event 2
    expect(evaluateIndicator('raid, talks', events).matchCount).toBe(2)
  })

  it('does not trip with no terms or no matches', () => {
    expect(evaluateIndicator('', events).tripped).toBe(false)
    expect(evaluateIndicator('tsunami', events).tripped).toBe(false)
  })
})

describe('createStarterIndicatorNode', () => {
  it('builds a goal-specific starter set with unique ids', () => {
    const node = createStarterIndicatorNode(10, 20, { goalTemplateId: 'armed-conflict', researchQuestion: 'Will fighting escalate?' })
    expect(node.type).toBe('indicator')
    expect(node.indicators.length).toBeGreaterThanOrEqual(3)
    expect(node.indicators.some(i => i.direction === 'refutes')).toBe(true)
    expect(new Set(node.indicators.map(i => i.id)).size).toBe(node.indicators.length)
    expect(node.title).toBe('Will fighting escalate?')
  })
  it('falls back to the default set for an unknown goal', () => {
    const node = createStarterIndicatorNode(0, 0, {})
    expect(node.indicators.length).toBe(4)
  })
})
