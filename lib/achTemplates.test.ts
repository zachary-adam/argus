import { describe, it, expect } from 'vitest'
import {
  ACH_STARTER_HYPOTHESES,
  starterACHHypothesisTexts,
  createStarterACHNode,
} from './achTemplates'

describe('ACH_STARTER_HYPOTHESES', () => {
  it('covers every goal category with three hypotheses', () => {
    const goals = [
      'elections', 'civil-unrest', 'armed-conflict', 'economic-crisis',
      'political-stability', 'humanitarian', 'maritime-security', 'counterterrorism',
      'cyber-threat', 'border-migration', 'supply-chain', 'public-health',
      'information-ops', 'organized-crime',
    ] as const
    for (const g of goals) {
      expect(ACH_STARTER_HYPOTHESES[g]).toHaveLength(3)
      expect(ACH_STARTER_HYPOTHESES[g].every(h => h.length > 10)).toBe(true)
    }
  })
})

describe('starterACHHypothesisTexts', () => {
  it('uses goal-specific templates', () => {
    const texts = starterACHHypothesisTexts({ goalTemplateId: 'armed-conflict' })
    expect(texts[0]).toContain('Fighting intensifies')
  })

  it('falls back to default for unknown goals', () => {
    const texts = starterACHHypothesisTexts({ goalTemplateId: 'unknown-goal' })
    expect(texts[0]).toBe(ACH_STARTER_HYPOTHESES.default[0])
  })

  it('weaves research question into hypotheses', () => {
    const texts = starterACHHypothesisTexts({
      goalTemplateId: 'elections',
      researchQuestion: 'Will violence spike before polls?',
    })
    expect(texts.every(t => t.includes('Will violence spike before polls'))).toBe(true)
  })
})

describe('createStarterACHNode', () => {
  it('creates a ready-to-score ACH node', () => {
    const node = createStarterACHNode(100, 200, { goalTemplateId: 'civil-unrest' })
    expect(node.type).toBe('ach')
    expect(node.hypotheses).toHaveLength(3)
    expect(node.hypotheses.every(h => h.text.length > 0)).toBe(true)
    expect(node.scores).toEqual([])
  })
})
