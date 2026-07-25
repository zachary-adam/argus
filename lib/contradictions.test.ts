import { describe, it, expect } from 'vitest'
import { extractClaims, findContradictions } from './contradictions'

const T0 = new Date('2026-07-05T08:00:00Z')
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000).toISOString()

describe('extractClaims', () => {
  it('extracts and normalizes casualty figures', () => {
    expect(extractClaims('At least 5 killed and 12 injured in clashes')).toEqual([
      { term: 'killed', value: 5 },
      { term: 'injured', value: 12 },
    ])
    expect(extractClaims('3 people dead, 40 villagers displaced')).toEqual([
      { term: 'killed', value: 3 },
      { term: 'displaced', value: 40 },
    ])
    expect(extractClaims('Death toll rises to 1,200')).toEqual([{ term: 'killed', value: 1200 }])
    expect(extractClaims('No figures in this headline')).toEqual([])
  })
})

describe('findContradictions', () => {
  it('flags different figures inside the same 24h window as conflicting', () => {
    const out = findContradictions([
      { id: 'a', title: '3 killed in Baruipur clashes', timestamp: at(0) },
      { id: 'b', title: '5 killed as Baruipur unrest continues', timestamp: at(6) },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ term: 'killed', kind: 'conflicting' })
    expect(out[0].reports.map(r => r.value)).toEqual([3, 5])
  })

  it('flags a later LOWER figure as a walkback', () => {
    const out = findContradictions([
      { id: 'a', title: '12 dead in district violence', timestamp: at(0) },
      { id: 'b', title: 'Officials revise: 7 killed in district violence', timestamp: at(48) },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('walkback')
  })

  it('does NOT flag a rising toll across days — that is normal reporting', () => {
    const out = findContradictions([
      { id: 'a', title: '3 killed in floods', timestamp: at(0) },
      { id: 'b', title: 'Flood death toll rises to 9', timestamp: at(72) },
    ])
    expect(out).toHaveLength(0)
  })

  it('compares only within the same normalized term', () => {
    const out = findContradictions([
      { id: 'a', title: '5 injured in protest', timestamp: at(0) },
      { id: 'b', title: '2 arrested at protest', timestamp: at(2) },
    ])
    expect(out).toHaveLength(0)
  })

  it('uses the highest per-event claim per term', () => {
    const out = findContradictions([
      { id: 'a', title: '2 killed', summary: 'Initial reports said 2 killed; later 4 killed confirmed', timestamp: at(0) },
      { id: 'b', title: '4 killed in same incident', timestamp: at(3) },
    ])
    expect(out).toHaveLength(0) // both events net out at 4 — no divergence
  })
})
