import { describe, it, expect } from 'vitest'
import { circlePolygon, circleGeoJson } from './mapCircle'

describe('mapCircle', () => {
  it('builds a closed ring', () => {
    const ring = circlePolygon(77.5, 34.2, 200)
    expect(ring.length).toBeGreaterThan(60)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('returns geojson feature', () => {
    const f = circleGeoJson(77.5, 34.2, 200)
    expect(f.geometry.type).toBe('Polygon')
    expect(f.properties.radiusKm).toBe(200)
  })
})
