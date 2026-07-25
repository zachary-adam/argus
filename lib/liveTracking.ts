import type { Project } from '@/types/project'
import { useMapStore } from '@/stores/mapStore'
import { haversineDistance } from '@/lib/haversine'
import { liveTrackingForGoal } from '@/lib/goalTemplates'

export type LiveLayersState = {
  vessels: boolean
  aviation: boolean
  coverage: 'focused' | 'global'
}

export type TrackingRegion = { lat: number; lon: number; radiusKm: number }

export function defaultLiveLayersForGoal(goalId?: string | null): LiveLayersState {
  const caps = liveTrackingForGoal(goalId)
  return { vessels: caps.vessels, aviation: caps.aviation, coverage: 'focused' }
}

/** Project live-layer prefs — goal defaults, overridden by saved liveLayers. */
export function resolveLiveLayers(
  project: Pick<Project, 'liveLayers' | 'goalTemplateId'> | null | undefined,
): LiveLayersState {
  const base = defaultLiveLayersForGoal(project?.goalTemplateId)
  if (!project?.liveLayers) return base
  return { ...base, ...project.liveLayers }
}

/** Push project live-tracking prefs into the map store (settings are authoritative). */
export function syncProjectLiveTracking(project: Project | null | undefined): void {
  if (!project) return
  const live = resolveLiveLayers(project)
  const st = useMapStore.getState()
  st.setLiveCoverage(live.coverage)
  st.setLiveTrackingCaps({ vessels: live.vessels, aviation: live.aviation })
  useMapStore.setState(s => ({
    layers: {
      ...s.layers,
      vessels: live.vessels,
      aviation: live.aviation,
      // Chokepoint pressure is vessel-driven — only auto-on for maritime goals.
      chokepoints: live.vessels,
    },
  }))
}

/** Focused mode: show tracks near the project AOI, not the whole hotspot sweep. */
export function focusedTrackingRadiusKm(regionZoom = 5): number {
  if (regionZoom >= 8) return 400
  if (regionZoom >= 6) return 700
  if (regionZoom >= 5) return 1200
  if (regionZoom >= 4) return 2000
  return 3500
}

/** Coastal / maritime approaches when project countries have sea lanes (focused vessels). */
const COASTAL_MARITIME_REGIONS: Record<string, TrackingRegion[]> = {
  IN: [
    { lat: 15.0, lon: 74.0, radiusKm: 950 },
    { lat: 16.0, lon: 88.0, radiusKm: 950 },
    { lat: 8.0, lon: 77.0, radiusKm: 650 },
  ],
  CN: [
    { lat: 24.0, lon: 118.0, radiusKm: 850 },
    { lat: 18.0, lon: 110.0, radiusKm: 750 },
    { lat: 38.0, lon: 121.0, radiusKm: 700 },
  ],
  PK: [{ lat: 24.0, lon: 66.0, radiusKm: 800 }],
  IR: [{ lat: 26.5, lon: 56.5, radiusKm: 700 }, { lat: 27.0, lon: 51.0, radiusKm: 600 }],
  UA: [{ lat: 46.0, lon: 32.0, radiusKm: 700 }, { lat: 44.5, lon: 33.5, radiusKm: 500 }],
  RU: [{ lat: 69.0, lon: 33.0, radiusKm: 900 }, { lat: 42.0, lon: 132.0, radiusKm: 800 }],
  US: [{ lat: 38.0, lon: -75.0, radiusKm: 1200 }, { lat: 33.0, lon: -118.0, radiusKm: 900 }],
  GB: [{ lat: 51.0, lon: 1.5, radiusKm: 600 }],
  IL: [{ lat: 32.5, lon: 34.0, radiusKm: 450 }],
  YE: [{ lat: 12.5, lon: 43.5, radiusKm: 500 }],
  TW: [{ lat: 24.0, lon: 121.0, radiusKm: 500 }],
  JP: [{ lat: 34.0, lon: 138.0, radiusKm: 800 }],
  KR: [{ lat: 35.0, lon: 129.0, radiusKm: 600 }],
  AU: [{ lat: -33.0, lon: 151.0, radiusKm: 900 }, { lat: -12.0, lon: 130.0, radiusKm: 800 }],
}

/** Air hubs / corridors for focused aviation (decoupled from map zoom). */
const AIR_APPROACH_REGIONS: Record<string, TrackingRegion[]> = {
  IN: [
    { lat: 28.6, lon: 77.2, radiusKm: 400 },  // Delhi NCR / northern air corridor
    { lat: 22.5, lon: 88.3, radiusKm: 450 },  // Kolkata / eastern command
    { lat: 11.7, lon: 92.7, radiusKm: 500 },  // Andaman / Bay approach
    { lat: 19.0, lon: 72.8, radiusKm: 400 },  // Mumbai / western command
  ],
  CN: [
    { lat: 30.7, lon: 104.0, radiusKm: 500 }, // Chengdu / western theater
    { lat: 25.0, lon: 102.7, radiusKm: 450 }, // Kunming / Tibet approaches
    { lat: 24.0, lon: 118.0, radiusKm: 400 }, // Taiwan Strait airspace
    { lat: 39.9, lon: 116.4, radiusKm: 350 }, // Beijing capital region
  ],
  PK: [{ lat: 33.7, lon: 73.0, radiusKm: 400 }],
  IR: [{ lat: 35.7, lon: 51.4, radiusKm: 450 }],
  UA: [{ lat: 50.4, lon: 30.5, radiusKm: 500 }],
  RU: [{ lat: 55.7, lon: 37.6, radiusKm: 500 }],
  IL: [{ lat: 32.0, lon: 34.8, radiusKm: 350 }],
  TW: [{ lat: 25.0, lon: 121.5, radiusKm: 400 }],
  JP: [{ lat: 35.7, lon: 139.7, radiusKm: 500 }],
  KR: [{ lat: 37.5, lon: 127.0, radiusKm: 400 }],
  US: [{ lat: 38.9, lon: -77.0, radiusKm: 600 }],
  GB: [{ lat: 51.5, lon: -0.1, radiusKm: 400 }],
}

/** Theater air radius — don't shrink below useful ADS-B range when map is zoomed in. */
export function aviationTheaterRadiusKm(regionZoom = 5): number {
  return Math.max(focusedTrackingRadiusKm(regionZoom), 1200)
}

export function aviationTrackingRegions(
  project: Pick<Project, 'regionCenter' | 'regionZoom' | 'countryCodes'> | null | undefined,
): TrackingRegion[] {
  const regions: TrackingRegion[] = []
  if (project?.regionCenter) {
    const [lon, lat] = project.regionCenter
    regions.push({ lat, lon, radiusKm: aviationTheaterRadiusKm(project.regionZoom) })
  }
  const codes = new Set(project?.countryCodes ?? [])
  for (const code of codes) {
    const air = AIR_APPROACH_REGIONS[code]
    if (air) regions.push(...air)
  }
  return regions
}

/** Vessels: project center plus maritime approaches for selected coastal countries. */
export function vesselTrackingRegions(
  project: Pick<Project, 'regionCenter' | 'regionZoom' | 'countryCodes' | 'goalTemplateId'> | null | undefined,
): TrackingRegion[] {
  const regions: TrackingRegion[] = []
  if (project?.regionCenter) {
    const [lon, lat] = project.regionCenter
    regions.push({ lat, lon, radiusKm: focusedTrackingRadiusKm(project.regionZoom) })
  }
  const codes = new Set(project?.countryCodes ?? [])
  for (const code of codes) {
    const coastal = COASTAL_MARITIME_REGIONS[code]
    if (coastal) regions.push(...coastal)
  }
  if (project?.goalTemplateId === 'maritime-security' && regions.length === 0) {
    regions.push({ lat: 20, lon: 60, radiusKm: 3500 })
  }
  return regions
}

type LatLon = { lat: number; lon: number }
type LatLng = { latitude: number; longitude: number }

function trackLatLon<T extends LatLon | LatLng>(item: T): { lat: number; lon: number } {
  return 'lat' in item
    ? { lat: item.lat, lon: item.lon }
    : { lat: item.latitude, lon: item.longitude }
}

function inAnyRegion(lat: number, lon: number, regions: TrackingRegion[]): boolean {
  return regions.some(r => haversineDistance(lat, lon, r.lat, r.lon) <= r.radiusKm)
}

/** Case-based focused filter — aviation uses air AOI; vessels use maritime AOI. */
export function filterLiveTracksForProject<T extends LatLon | LatLng>(
  items: T[],
  project: Pick<Project, 'regionCenter' | 'regionZoom' | 'countryCodes' | 'goalTemplateId'> | null | undefined,
  layer: 'vessels' | 'aviation',
  coverage: 'focused' | 'global',
): T[] {
  const RENDER_CAP = layer === 'aviation'
    ? (coverage === 'focused' ? 400 : 1000)
    : (coverage === 'focused' ? 350 : 800)

  let out = items
  if (coverage !== 'global') {
    const regions = layer === 'aviation'
      ? aviationTrackingRegions(project)
      : vesselTrackingRegions(project)
    if (regions.length > 0) {
      out = items.filter(item => {
        const { lat, lon } = trackLatLon(item)
        return inAnyRegion(lat, lon, regions)
      })
    }
  }
  return out.length > RENDER_CAP ? out.slice(0, RENDER_CAP) : out
}

/** @deprecated Use filterLiveTracksForProject with layer 'aviation'. */
export function filterTracksByProjectRegion<T extends LatLon | LatLng>(
  items: T[],
  center: [number, number] | undefined,
  coverage: 'focused' | 'global',
  regionZoom?: number,
): T[] {
  if (coverage === 'global' || !center) return items
  const [lon, lat] = center
  const r = focusedTrackingRadiusKm(regionZoom)
  return items.filter(item => {
    const { lat: la, lon: lo } = trackLatLon(item)
    return haversineDistance(la, lo, lat, lon) <= r
  })
}

/** When goal changes, adopt new defaults only if layers still match the old goal defaults. */
export function liveLayersAfterGoalChange(
  current: LiveLayersState,
  prevGoalId: string | null | undefined,
  nextGoalId: string | null | undefined,
): LiveLayersState {
  if (!nextGoalId || prevGoalId === nextGoalId) return current
  const oldDef = liveTrackingForGoal(prevGoalId)
  const newDef = liveTrackingForGoal(nextGoalId)
  const customized = current.vessels !== oldDef.vessels || current.aviation !== oldDef.aviation
  if (customized) return current
  return { ...current, vessels: newDef.vessels, aviation: newDef.aviation }
}

/** Plain-language line for why the map shows N aircraft/vessels. */
export function liveTrackingExplainer(
  project: Pick<Project, 'goalTemplateId' | 'countryCodes' | 'regionName' | 'liveLayers'> | null | undefined,
  counts: { vessels: number; aviation: number },
): string | null {
  if (!project) return null
  const live = resolveLiveLayers(project)
  if (!live.vessels && !live.aviation) return null

  const scope = live.coverage === 'global'
    ? 'worldwide'
    : project.regionName?.trim() || (project.countryCodes?.length ? project.countryCodes.join('/') : 'your area')

  const parts: string[] = []
  if (live.aviation) {
    parts.push(`${counts.aviation} aircraft near ${scope}`)
  }
  if (live.vessels) {
    const sea = project.countryCodes?.length ? `${project.countryCodes.join('/')} waters` : 'coastal zones'
    parts.push(`${counts.vessels} vessels near ${live.coverage === 'global' ? 'worldwide lanes' : sea}`)
  }
  return parts.join(' · ')
}
