import { describe, it, expect } from 'vitest'
import {
  CHOKEPOINT_BOXES,
  CHOKEPOINT_DEFINITIONS,
  CHOKEPOINTS,
  chokepointCentroid,
  chokepointBoxPolygon,
  chokepointsFeatureCollection,
  FOCUSED_VESSEL_BOXES,
} from './chokepointBoxes'

describe('chokepointBoxes', () => {
  it('exports one map marker per definition', () => {
    expect(CHOKEPOINTS).toHaveLength(CHOKEPOINT_DEFINITIONS.length)
    expect(CHOKEPOINT_BOXES).toHaveLength(CHOKEPOINT_DEFINITIONS.length)
  })

  it('keeps Hormuz first for maritime alert tests', () => {
    expect(CHOKEPOINTS[0]?.name).toBe('Strait of Hormuz')
  })

  it('computes centroids inside each box', () => {
    for (const { box } of CHOKEPOINT_DEFINITIONS) {
      const { lat, lon } = chokepointCentroid(box)
      const [[latMin, lonMin], [latMax, lonMax]] = box
      expect(lat).toBeGreaterThanOrEqual(Math.min(latMin, latMax))
      expect(lat).toBeLessThanOrEqual(Math.max(latMin, latMax))
      expect(lon).toBeGreaterThanOrEqual(Math.min(lonMin, lonMax))
      expect(lon).toBeLessThanOrEqual(Math.max(lonMin, lonMax))
    }
  })

  it('includes corridor boxes in focused vessel coverage', () => {
    expect(FOCUSED_VESSEL_BOXES.length).toBeGreaterThan(CHOKEPOINT_BOXES.length)
  })

  it('builds geojson for map hover layers', () => {
    const fc = chokepointsFeatureCollection()
    expect(fc.features).toHaveLength(CHOKEPOINT_DEFINITIONS.length)
    const ring = chokepointBoxPolygon(CHOKEPOINT_DEFINITIONS[0].box)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })
})
