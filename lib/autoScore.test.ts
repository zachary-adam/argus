import { describe, it, expect } from 'vitest'
import { autoScoreFromEvents } from './autoScore'

describe('autoScoreFromEvents', () => {
  it('returns empty object for empty event list', () => {
    expect(autoScoreFromEvents('conflict-intensity-score', [])).toEqual({})
  })

  it('returns empty object for unknown formula id', () => {
    expect(autoScoreFromEvents('unknown-formula', [{ category: 'conflict', severity: 5 }])).toEqual({})
  })

  describe('conflict-intensity-score', () => {
    it('returns all four keys', () => {
      const result = autoScoreFromEvents('conflict-intensity-score', [{ category: 'conflict', severity: 8 }])
      expect(result).toHaveProperty('event_freq')
      expect(result).toHaveProperty('fatality_rate')
      expect(result).toHaveProperty('actor_count')
      expect(result).toHaveProperty('displacement')
    })

    it('event_freq caps at 1.0 for 20+ events', () => {
      const events = Array.from({ length: 20 }, () => ({ category: 'conflict', severity: 5 }))
      expect(autoScoreFromEvents('conflict-intensity-score', events).event_freq).toBe(1)
    })

    it('computes correct values for 5 conflict events at severity 8', () => {
      const events = Array.from({ length: 5 }, () => ({ category: 'conflict', severity: 8 }))
      const result = autoScoreFromEvents('conflict-intensity-score', events)
      expect(result.event_freq).toBeCloseTo(0.25)
      expect(result.fatality_rate).toBeCloseTo(0.8)
      expect(result.actor_count).toBe(0)
      expect(result.displacement).toBe(0)
    })

    it('picks up displacement from humanitarian events', () => {
      const events = [
        { category: 'conflict', severity: 7 },
        { category: 'humanitarian', severity: 6 },
        { category: 'disaster', severity: 5 },
      ]
      const result = autoScoreFromEvents('conflict-intensity-score', events)
      expect(result.displacement).toBeCloseTo(2 / 3)
    })

    it('counts unique actors across events', () => {
      const events = [
        { category: 'conflict', severity: 5, actors: [{ name: 'Group A' }, { name: 'Group B' }] },
        { category: 'conflict', severity: 5, actors: [{ name: 'Group B' }, { name: 'Group C' }] },
      ]
      const result = autoScoreFromEvents('conflict-intensity-score', events)
      expect(result.actor_count).toBeCloseTo(3 / 10) // 3 unique actors / 10 saturation
    })
  })

  describe('electoral-violence-risk', () => {
    it('returns all four keys', () => {
      const result = autoScoreFromEvents('electoral-violence-risk', [{ category: 'political', severity: 6 }])
      expect(result).toHaveProperty('hist_violence')
      expect(result).toHaveProperty('political_exclusion')
      expect(result).toHaveProperty('incumbent_risk')
      expect(result).toHaveProperty('security_posture')
    })

    it('computes correct values for 4 political events at severity 7', () => {
      const events = Array.from({ length: 4 }, () => ({ category: 'political', severity: 7 }))
      const result = autoScoreFromEvents('electoral-violence-risk', events)
      expect(result.hist_violence).toBeCloseTo(0.4)  // cap(0 + 1.0 * 0.4)
      expect(result.political_exclusion).toBe(1)
      expect(result.incumbent_risk).toBe(1)          // all highSev (0.7 >= 0.65)
      expect(result.security_posture).toBe(0)        // no conflict events
    })
  })

  describe('fragility-index', () => {
    it('returns all four keys', () => {
      const result = autoScoreFromEvents('fragility-index', [{ category: 'conflict', severity: 5 }])
      expect(result).toHaveProperty('security_apparatus')
      expect(result).toHaveProperty('political_legitimacy')
      expect(result).toHaveProperty('economic_decline')
      expect(result).toHaveProperty('group_grievance')
    })

    it('maps conflict to security_apparatus and social to group_grievance', () => {
      const events = [
        { category: 'conflict', severity: 5 },
        { category: 'social', severity: 4 },
      ]
      const result = autoScoreFromEvents('fragility-index', events)
      expect(result.security_apparatus).toBeCloseTo(0.5)
      expect(result.group_grievance).toBeCloseTo(0.5)  // cap(0.5 + 0 * 0.5)
      expect(result.economic_decline).toBe(0)
    })
  })

  describe('gdelt-unrest-index', () => {
    it('returns all four keys', () => {
      const result = autoScoreFromEvents('gdelt-unrest-index', [{ category: 'social', severity: 5 }])
      expect(result).toHaveProperty('protest_freq')
      expect(result).toHaveProperty('security_response')
      expect(result).toHaveProperty('grievance_signal')
      expect(result).toHaveProperty('media_attention')
    })

    it('media_attention scales with sourceCount', () => {
      const events = [{ category: 'social', severity: 5, sourceCount: 5 }]
      const result = autoScoreFromEvents('gdelt-unrest-index', events)
      expect(result.media_attention).toBe(1)  // cap(5/5)
    })
  })

  describe('debt-distress-index', () => {
    it('returns all four keys', () => {
      const result = autoScoreFromEvents('debt-distress-index', [{ category: 'economic', severity: 5 }])
      expect(result).toHaveProperty('debt_to_gdp')
      expect(result).toHaveProperty('reserve_coverage')
      expect(result).toHaveProperty('current_account')
      expect(result).toHaveProperty('creditor_concentration')
    })

    it('creditor_concentration is always 0.5 (not derivable from events)', () => {
      const result = autoScoreFromEvents('debt-distress-index', [{ category: 'economic', severity: 8 }])
      expect(result.creditor_concentration).toBe(0.5)
    })

    it('computes correct values for pure economic events', () => {
      const events = [{ category: 'economic', severity: 5 }, { category: 'economic', severity: 5 }]
      const result = autoScoreFromEvents('debt-distress-index', events)
      expect(result.debt_to_gdp).toBeCloseTo(0.9)       // cap(1.0 * 0.7 + 0.2)
      expect(result.reserve_coverage).toBeCloseTo(0.1)  // cap(0.5 - 1.0 * 0.4)
      expect(result.current_account).toBe(1)
    })
  })

  describe('ipc-crisis-model', () => {
    it('returns all four keys', () => {
      const result = autoScoreFromEvents('ipc-crisis-model', [{ category: 'humanitarian', severity: 7 }])
      expect(result).toHaveProperty('food_insecurity')
      expect(result).toHaveProperty('displacement')
      expect(result).toHaveProperty('aid_access')
      expect(result).toHaveProperty('health_stress')
    })

    it('health_stress is non-zero only for health category', () => {
      const mixed = [
        { category: 'humanitarian', severity: 8 },
        { category: 'health', severity: 6 },
      ]
      const result = autoScoreFromEvents('ipc-crisis-model', mixed)
      expect(result.health_stress).toBeCloseTo(0.5)
    })

    it('all values are capped at 1.0', () => {
      const events = Array.from({ length: 3 }, () => ({ category: 'humanitarian', severity: 9 }))
      const result = autoScoreFromEvents('ipc-crisis-model', events)
      Object.values(result).forEach(v => expect(v).toBeLessThanOrEqual(1))
    })
  })

  it('all values are between 0 and 1 across all formulas', () => {
    const formulaIds = [
      'conflict-intensity-score', 'electoral-violence-risk', 'fragility-index',
      'gdelt-unrest-index', 'debt-distress-index', 'ipc-crisis-model',
    ]
    const events = [
      { category: 'conflict', severity: 8 },
      { category: 'political', severity: 6 },
      { category: 'economic', severity: 5 },
      { category: 'humanitarian', severity: 9 },
    ]
    for (const id of formulaIds) {
      const result = autoScoreFromEvents(id, events)
      for (const [key, val] of Object.entries(result)) {
        expect(val, `${id}.${key} out of range`).toBeGreaterThanOrEqual(0)
        expect(val, `${id}.${key} out of range`).toBeLessThanOrEqual(1)
      }
    }
  })
})
