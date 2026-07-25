import { describe, it, expect } from 'vitest'
import { rateChangeSignificant } from './velocityStats'

describe('velocity significance', () => {
  it('a small low-count jump is NOT significant (2→4 is noise)', () => {
    expect(rateChangeSignificant(4, 2)).toBe(false)
  })
  it('a large proportional jump on real volume IS significant (20 vs 5 expected)', () => {
    expect(rateChangeSignificant(20, 5)).toBe(true)
  })
  it('no change is not significant', () => {
    expect(rateChangeSignificant(10, 10)).toBe(false)
  })
  it('below the minimum-count floor is never significant', () => {
    expect(rateChangeSignificant(3, 0)).toBe(false) // only 3 events, even if "new"
  })
  it('a genuinely new burst with enough volume is significant', () => {
    expect(rateChangeSignificant(8, 0)).toBe(true)
  })
})
