import { describe, it, expect } from 'vitest'
import { isRateElevated } from './correlationStats'

const RECENT_H = 72
const BASE_H = 336 // 14 days

describe('base-rate-relative correlation thresholds', () => {
  it('quiet country: meeting the floor with no baseline IS elevated (new activity)', () => {
    expect(isRateElevated(4, 0, RECENT_H, BASE_H, 3)).toBe(true)
  })

  it('below the absolute floor is never elevated, even with zero baseline', () => {
    expect(isRateElevated(2, 0, RECENT_H, BASE_H, 3)).toBe(false)
  })

  it('busy country at its NORMAL rate is NOT elevated (the alert-fatigue fix)', () => {
    // 28 events over 14 days ⇒ expected ≈ 6 in a 72h window. Observing 6 is normal.
    expect(isRateElevated(6, 28, RECENT_H, BASE_H, 3)).toBe(false)
  })

  it('busy country with a real spike above its own baseline IS elevated', () => {
    // Same baseline (expected ≈6), but 15 observed in 72h is a clear deviation.
    expect(isRateElevated(15, 28, RECENT_H, BASE_H, 3)).toBe(true)
  })

  it('a quiet country gets flagged at a LOWER count than a busy one needs', () => {
    const quiet = isRateElevated(4, 1, RECENT_H, BASE_H, 3)   // baseline ~0.2 expected
    const busy  = isRateElevated(4, 40, RECENT_H, BASE_H, 3)  // baseline ~8.6 expected
    expect(quiet).toBe(true)
    expect(busy).toBe(false)
  })
})
