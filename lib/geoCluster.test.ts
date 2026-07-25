import { describe, it, expect } from 'vitest'
import { dbscanGeo } from './geoCluster'

// Two tight geographic groups + one far-away loner.
const KYIV = { lat: 50.45, lon: 30.52, tag: 'kyiv' }
const KYIV2 = { lat: 50.50, lon: 30.60, tag: 'kyiv' }
const KYIV3 = { lat: 50.40, lon: 30.45, tag: 'kyiv' }
const GAZA = { lat: 31.50, lon: 34.47, tag: 'gaza' }
const GAZA2 = { lat: 31.52, lon: 34.45, tag: 'gaza' }
const GAZA3 = { lat: 31.48, lon: 34.50, tag: 'gaza' }
const LONER = { lat: -33.86, lon: 151.20, tag: 'sydney' }

describe('dbscanGeo', () => {
  it('finds ALL dense clusters, not just the first (the old break-bug)', () => {
    const clusters = dbscanGeo([KYIV, GAZA, KYIV2, GAZA2, KYIV3, GAZA3, LONER], 100, 3)
    expect(clusters).toHaveLength(2)
    const tagsOf = (c: typeof clusters[number]) => new Set(c.map(p => p.tag))
    expect(clusters.some(c => tagsOf(c).has('kyiv') && c.length === 3)).toBe(true)
    expect(clusters.some(c => tagsOf(c).has('gaza') && c.length === 3)).toBe(true)
  })

  it('treats sparse points as noise (excluded from clusters)', () => {
    const clusters = dbscanGeo([KYIV, KYIV2, KYIV3, LONER], 100, 3)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].every(p => p.tag === 'kyiv')).toBe(true)
  })

  it('is order-independent (deterministic regardless of input order)', () => {
    const a = dbscanGeo([KYIV, GAZA, KYIV2, GAZA2, KYIV3, GAZA3], 100, 3).map(c => c.length).sort()
    const b = dbscanGeo([GAZA3, KYIV3, GAZA, KYIV, GAZA2, KYIV2], 100, 3).map(c => c.length).sort()
    expect(a).toEqual(b)
  })

  it('respects epsilon: a tiny radius yields no clusters', () => {
    expect(dbscanGeo([KYIV, KYIV2, KYIV3], 0.1, 3)).toHaveLength(0)
  })
})
