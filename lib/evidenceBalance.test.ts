import { describe, expect, it } from 'vitest'
import { assessEvidenceBalance, evidenceBalanceToPrompt } from './evidenceBalance'

describe('assessEvidenceBalance', () => {
  it('flags missing watch entities', () => {
    const balance = assessEvidenceBalance(
      [{ title: 'Indian Army chief visits Ladakh', summary: 'readiness review', country: 'India', countryCode: 'IN', source: 'rss' }],
      { watchEntities: ['PLA', 'Indian Army'], countryCodes: ['IN', 'CN'] },
    )
    expect(balance.entityCoverage['Indian Army']).toBe(1)
    expect(balance.entityCoverage['PLA']).toBe(0)
    expect(balance.gaps.some(g => g.type === 'entity' && g.label.includes('PLA'))).toBe(true)
    expect(balance.confidenceCap).toBe('MODERATE')
  })

  it('flags missing country in bilateral project', () => {
    const balance = assessEvidenceBalance(
      Array.from({ length: 14 }, (_, i) => ({
        title: `India border event ${i}`,
        summary: 'LAC',
        country: 'India',
        countryCode: 'IN',
        source: 'gdelt',
      })),
      { countryCodes: ['IN', 'CN'], watchEntities: ['Indian Army'] },
    )
    expect(balance.gaps.some(g => g.type === 'country')).toBe(true)
    expect(balance.score).toBeLessThan(60)
  })

  it('prompt block mentions confidence cap', () => {
    const balance = assessEvidenceBalance([], { watchEntities: ['PLA'], countryCodes: ['CN'] })
    const prompt = evidenceBalanceToPrompt(balance)
    expect(prompt).toContain('confidence MUST NOT exceed')
  })
})
