import { describe, expect, it } from 'vitest'
import {
  defaultLiveLayersForGoal,
  resolveLiveLayers,
  liveLayersAfterGoalChange,
  filterTracksByProjectRegion,
  filterLiveTracksForProject,
  vesselTrackingRegions,
  aviationTrackingRegions,
  focusedTrackingRadiusKm,
  liveTrackingExplainer,
} from './liveTracking'

describe('liveTracking', () => {
  it('defaultLiveLayersForGoal maps armed-conflict to aviation only', () => {
    expect(defaultLiveLayersForGoal('armed-conflict')).toEqual({
      vessels: false,
      aviation: true,
      coverage: 'focused',
    })
  })

  it('defaultLiveLayersForGoal maps maritime-security to both layers', () => {
    expect(defaultLiveLayersForGoal('maritime-security')).toEqual({
      vessels: true,
      aviation: true,
      coverage: 'focused',
    })
  })

  it('resolveLiveLayers lets project settings override goal defaults', () => {
    const live = resolveLiveLayers({
      goalTemplateId: 'armed-conflict',
      liveLayers: { vessels: true, aviation: true, coverage: 'global' },
    })
    expect(live.vessels).toBe(true)
    expect(live.coverage).toBe('global')
  })

  it('liveLayersAfterGoalChange adopts new goal defaults when unchanged', () => {
    const cur = defaultLiveLayersForGoal('armed-conflict')
    const next = liveLayersAfterGoalChange(cur, 'armed-conflict', 'maritime-security')
    expect(next.vessels).toBe(true)
    expect(next.aviation).toBe(true)
  })

  it('liveLayersAfterGoalChange keeps manual overrides', () => {
    const cur = { vessels: true, aviation: false, coverage: 'focused' as const }
    const next = liveLayersAfterGoalChange(cur, 'armed-conflict', 'maritime-security')
    expect(next).toEqual(cur)
  })

  it('filterTracksByProjectRegion keeps global rows', () => {
    const rows = [{ lat: 0, lon: 0 }, { lat: 30, lon: 78 }]
    expect(filterTracksByProjectRegion(rows, [78, 30], 'global', 5)).toHaveLength(2)
  })

  it('filterTracksByProjectRegion trims focused rows outside AOI', () => {
    const rows = [{ lat: 30, lon: 78 }, { lat: 51, lon: -0.1 }]
    const kept = filterTracksByProjectRegion(rows, [78, 30], 'focused', 6)
    expect(kept).toHaveLength(1)
    expect(kept[0].lat).toBe(30)
  })

  it('vesselTrackingRegions adds coastal approaches for India', () => {
    const regions = vesselTrackingRegions({
      regionCenter: [78, 34],
      regionZoom: 5,
      countryCodes: ['IN', 'CN'],
      goalTemplateId: 'armed-conflict',
    })
    expect(regions.length).toBeGreaterThan(2)
  })

  it('filterLiveTracksForProject keeps Bay of Bengal vessels for India project', () => {
    const project = {
      regionCenter: [78, 34] as [number, number],
      regionZoom: 5,
      countryCodes: ['IN', 'CN'],
      goalTemplateId: 'armed-conflict' as const,
    }
    const rows = [
      { lat: 34, lon: 78 },
      { lat: 16, lon: 88 },
      { lat: 51, lon: -0.1 },
    ]
    const kept = filterLiveTracksForProject(rows, project, 'vessels', 'focused')
    expect(kept).toHaveLength(2)
    expect(kept.some(r => r.lat === 16)).toBe(true)
  })

  it('aviationTrackingRegions adds air hubs for India and China', () => {
    const regions = aviationTrackingRegions({
      regionCenter: [78, 34],
      regionZoom: 8,
      countryCodes: ['IN', 'CN'],
    })
    expect(regions.length).toBeGreaterThan(3)
    expect(regions.some(r => r.radiusKm >= 1200)).toBe(true)
  })

  it('filterLiveTracksForProject uses air hubs for aviation on border projects', () => {
    const project = {
      regionCenter: [78, 34] as [number, number],
      regionZoom: 8,
      countryCodes: ['IN', 'CN'],
      goalTemplateId: 'armed-conflict' as const,
    }
    const rows = [
      { latitude: 34, longitude: 78 },
      { latitude: 28.6, longitude: 77.2 },
      { latitude: 51, longitude: -0.1 },
    ]
    const kept = filterLiveTracksForProject(rows, project, 'aviation', 'focused')
    expect(kept).toHaveLength(2)
  })

  it('filterLiveTracksForProject uses air AOI only for aviation', () => {
    const project = {
      regionCenter: [78, 34] as [number, number],
      regionZoom: 6,
      countryCodes: ['IN'],
      goalTemplateId: 'armed-conflict' as const,
    }
    const rows = [{ lat: 34, lon: 78 }, { lat: 16, lon: 88 }]
    const kept = filterLiveTracksForProject(rows, project, 'aviation', 'focused')
    expect(kept).toHaveLength(1)
    expect(kept[0].lat).toBe(34)
  })

  it('focusedTrackingRadiusKm scales with zoom', () => {
    expect(focusedTrackingRadiusKm(8)).toBeLessThan(focusedTrackingRadiusKm(4))
  })

  it('liveTrackingExplainer describes scoped counts', () => {
    const line = liveTrackingExplainer({
      goalTemplateId: 'armed-conflict',
      regionName: 'Ladakh',
      countryCodes: ['IN'],
      liveLayers: { vessels: false, aviation: true, coverage: 'focused' },
    }, { aviation: 42, vessels: 0 })
    expect(line).toContain('42 aircraft')
    expect(line).toContain('Ladakh')
  })
})
