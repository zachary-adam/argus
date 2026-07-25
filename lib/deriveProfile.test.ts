import { describe, it, expect } from 'vitest'
import { deriveProfile } from './deriveProfile'

describe('deriveProfile — goal takes priority over keywords', () => {
  it('armed-conflict → conflict', () => expect(deriveProfile('armed-conflict', '')).toBe('conflict'))
  it('counterterrorism → conflict', () => expect(deriveProfile('counterterrorism', '')).toBe('conflict'))
  it('maritime-security → conflict', () => expect(deriveProfile('maritime-security', '')).toBe('conflict'))
  it('border-migration → conflict', () => expect(deriveProfile('border-migration', '')).toBe('conflict'))

  it('elections → political', () => expect(deriveProfile('elections', '')).toBe('political'))
  it('political-stability → political', () => expect(deriveProfile('political-stability', '')).toBe('political'))
  it('information-ops → political', () => expect(deriveProfile('information-ops', '')).toBe('political'))
  it('organized-crime → political', () => expect(deriveProfile('organized-crime', '')).toBe('political'))
  it('civil-unrest → political', () => expect(deriveProfile('civil-unrest', '')).toBe('political'))

  it('economic-crisis → economic', () => expect(deriveProfile('economic-crisis', '')).toBe('economic'))
  it('supply-chain → economic', () => expect(deriveProfile('supply-chain', '')).toBe('economic'))

  it('public-health → humanitarian', () => expect(deriveProfile('public-health', '')).toBe('humanitarian'))
  it('humanitarian → humanitarian', () => expect(deriveProfile('humanitarian', '')).toBe('humanitarian'))
})

describe('deriveProfile — keyword fallback when goal is null', () => {
  it('conflict keywords → conflict', () => {
    expect(deriveProfile(null, 'Will the armed conflict escalate?')).toBe('conflict')
    expect(deriveProfile(null, 'Assessing militant activity near the border')).toBe('conflict')
    expect(deriveProfile(null, 'Risk of a military coup')).toBe('conflict')
  })

  it('political keywords → political', () => {
    expect(deriveProfile(null, 'Can the election be held peacefully?')).toBe('political')
    expect(deriveProfile(null, 'Assessment of democratic governance and corruption')).toBe('political')
    expect(deriveProfile(null, 'Will protest movements destabilize the regime?')).toBe('political')
  })

  it('economic keywords → economic', () => {
    expect(deriveProfile(null, 'Sovereign debt crisis risk assessment')).toBe('economic')
    expect(deriveProfile(null, 'Impact of inflation on currency stability')).toBe('economic')
    expect(deriveProfile(null, 'GDP recession probability for fiscal year 2025')).toBe('economic')
  })

  it('humanitarian keywords → humanitarian', () => {
    expect(deriveProfile(null, 'Famine and displacement outlook')).toBe('humanitarian')
    expect(deriveProfile(null, 'Disease epidemic response capacity')).toBe('humanitarian')
    expect(deriveProfile(null, 'Flood disaster humanitarian needs')).toBe('humanitarian')
  })

  it('no matching keywords → general', () => {
    expect(deriveProfile(null, '')).toBe('general')
    expect(deriveProfile(null, 'Monitoring the situation')).toBe('general')
    expect(deriveProfile(null, 'Regional stability overview')).toBe('general')
  })

  it('goal takes priority over conflicting keywords', () => {
    // goal says economic-crisis, but question mentions conflict keywords
    expect(deriveProfile('economic-crisis', 'armed conflict risk')).toBe('economic')
  })

  it('keyword matching is case-insensitive', () => {
    expect(deriveProfile(null, 'ARMED CONFLICT RISK')).toBe('conflict')
    expect(deriveProfile(null, 'ELECTION MONITORING')).toBe('political')
    expect(deriveProfile(null, 'GDP OUTLOOK')).toBe('economic')
    expect(deriveProfile(null, 'FAMINE AND REFUGEE DISPLACEMENT')).toBe('humanitarian')
  })
})
