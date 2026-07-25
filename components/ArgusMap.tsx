'use client'
import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { Map, Marker, Popup, NavigationControl, Source, Layer, type MapRef, type MapMouseEvent } from '@/components/map/MapGL'
import { USE_MAPBOX, MAPBOX_TOKEN, resolveMapStyle, FREE_MAP_STYLE_FALLBACK, getMapboxToken } from '@/lib/mapProvider'
import { useMapStore } from '@/stores/mapStore'
import { usePlotsStore } from '@/stores/plotsStore'
import { IntelEvent, AircraftPosition, VesselPosition, Plot } from '@/types'
import { SEVERITY_COLORS, CHOKEPOINTS } from '@/lib/constants'
import { chokepointsFeatureCollection } from '@/lib/chokepointBoxes'
import { haversineDistance } from '@/lib/haversine'
import { formatDistanceToNow } from 'date-fns'
import { useLiveAviation } from '@/lib/hooks/useLiveAviation'
import { filterLiveTracksForProject } from '@/lib/liveTracking'
import PlotsLayer from './PlotsLayer'
import LayerControls from './LayerControls'
import MapQueryBar from './MapQueryBar'
import MapLocationSearch, { type GeoResult } from './MapLocationSearch'
import { OnboardingBanner } from './OnboardingBanner'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { usePlots } from '@/lib/hooks/usePlots'
import { withPlotProjectId } from '@/lib/plotScope'
import { useProjectStore } from '@/stores/projectStore'
import { extractAndSimplify } from '@/lib/simplifyPolygon'
import { displayCountry } from '@/lib/countryNames'
import { addIntelEventToCanvas } from '@/lib/canvasEvents'
import { useDisplayEvents } from '@/lib/hooks/useDisplayEvents'
import { circleGeoJson } from '@/lib/mapCircle'

const TOKEN = MAPBOX_TOKEN
const CABLE_THREAT_KM = 40
// GL `paint` properties require literal strings (CSS vars don't evaluate
// inside the style), so we mirror --brand-nuit / --accent here. Keep these
// in sync with app/globals.css.
const MAP_ACCENT = '#1E488F'
// Dash sequences that simulate a flowing/marching line (standard Mapbox technique)
const DASH_SEQUENCE = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
  [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2],
  [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5], [0, 4, 3, 0],
]

type CableInfo = {
  id: string; name: string; length?: string; rfs?: string; is_planned?: boolean
  owners?: string[] | string; landing_points?: { name: string; country: string }[]; url?: string; notes?: string
}

type MapPopup =
  | { kind: 'cable'; id: string; name: string; lng: number; lat: number }
  | { kind: 'landing'; cables: string[]; cable_count: number; lng: number; lat: number }
  | { kind: 'chokepoint'; name: string; description: string; lng: number; lat: number }
  | { kind: 'alert'; id: string; title: string; summary: string; severity: string; pattern: string; signals: string[]; signalCount: number; countries: string[]; lng: number; lat: number }

export default function ArgusMap() {
  const mapRef = useRef<MapRef>(null)
  const initialViewport = useRef(useMapStore.getState().viewport)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [patrolActive, setPatrolActive] = useState(false)
  const patrolRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const patrolIndexRef = useRef(0)
  const patrolCardRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const patrolActiveRef = useRef(false)

  // Drone camera fly mode (inactive but kept for state compatibility)
  const [droneActive] = useState(false)

  // Map → Canvas context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; event: IntelEvent } | null>(null)

  // Split selectors so vessel/aircraft updates don't re-render the whole component
  const setViewport = useMapStore(s => s.setViewport)
  const displayEvents = useDisplayEvents()
  const events = displayEvents
  const alerts = useMapStore(s => s.alerts)
  const layers = useMapStore(s => s.layers)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const selectedEvent = useMapStore(s => s.selectedEvent)
  const setFlyToCallback = useMapStore(s => s.setFlyToCallback)
  const setThreatenedCableData = useMapStore(s => s.setThreatenedCableData)
  const highlightedCableId = useMapStore(s => s.highlightedCableId)
  const eventFeedOpen = useMapStore(s => s.panels.eventFeed)
  const mapQueryPanelOpen = useMapStore(s => s.mapQueryPanelOpen)
  const plottingMode = useMapStore(s => s.plottingMode)
  const setPlottingMode = useMapStore(s => s.setPlottingMode)
  const togglePanel = useMapStore(s => s.togglePanel)
  const highlightedAlertId  = useMapStore(s => s.highlightedAlertId)
  const nlqHighlightIds     = useMapStore(s => s.nlqHighlightIds)
  const mapFocusHighlightIds = useMapStore(s => s.mapFocusHighlightIds)
  const mapFocusLabel = useMapStore(s => s.mapFocusLabel)
  const mapFocusCircle = useMapStore(s => s.mapFocusCircle)
  const clearMapFocusHighlights = useMapStore(s => s.clearMapFocusHighlights)
  const eventHighlightIds = useMemo(
    () => [...new Set([...nlqHighlightIds, ...mapFocusHighlightIds])],
    [nlqHighlightIds, mapFocusHighlightIds],
  )
  const focusCircleGeo = useMemo(
    () => (mapFocusCircle ? circleGeoJson(mapFocusCircle.lon, mapFocusCircle.lat, mapFocusCircle.radiusKm) : null),
    [mapFocusCircle],
  )
  const eventFilter = useMapStore(s => s.eventFilter)
  const severityFilter = useMapStore(s => s.severityFilter)
  const dateFilter = useMapStore(s => s.dateFilter)
  const searchQuery = useMapStore(s => s.searchQuery)
  const clearEventFilters = useMapStore(s => s.clearEventFilters)
  // Isolated selectors — vessel/aircraft changes only re-render what uses them
  const liveVesselPositions   = useMapStore(s => s.vesselPositions)
  const historicalVessels     = useMapStore(s => s.historicalVessels)
  const historicalAircraft    = useMapStore(s => s.historicalAircraft)

  // Playback time filter
  const playback = useMapStore(s => s.playback)
  const scrubbing = playback.active && !!playback.time

  // Use historical positions when scrubbing; hide live tracks until snapshots exist
  // Aviation — shared poll; frozen to nearest snapshot while scrubbing
  const liveCoverage = useMapStore(s => s.liveCoverage)
  const liveEnabled = useMapStore(s => s.liveTrackingCaps)
  const project = useProjectStore(s => s.projects.find(p => p.id === s.activeProjectId))
  const { data: liveAircraftRaw = [] } = useLiveAviation(liveEnabled.aviation && !droneActive && !scrubbing)
  const liveAircraftScoped = useMemo(
    () => filterLiveTracksForProject(
      liveAircraftRaw,
      project,
      'aviation',
      liveCoverage,
    ),
    [liveAircraftRaw, project, liveCoverage],
  )
  const liveVesselScoped = useMemo(
    () => filterLiveTracksForProject(
      liveVesselPositions,
      project,
      'vessels',
      liveCoverage,
    ),
    [liveVesselPositions, project, liveCoverage],
  )
  const aircraft = scrubbing ? historicalAircraft : liveAircraftScoped
  const vesselPositions = scrubbing
    ? historicalVessels
    : liveVesselScoped

  const [selectedVessel, setSelectedVessel] = useState<VesselPosition | null>(null)
  const [selectedAircraft, setSelectedAircraft] = useState<AircraftPosition | null>(null)

  const { workspace } = useWorkspace()
  const { createPlot } = usePlots(workspace?.id)
  const { addPlot: addPlotToStore } = usePlotsStore()
  const { getActiveProject, addPlot: addLocalPlot, addCanvasNode, addEvents } = useProjectStore()
  const pushToast = useMapStore(s => s.pushToast)

  // Popup tokens — use design variables (readable in Mapbox popup DOM)
  const p = {
    bg: 'var(--surface)',
    border: 'var(--border)',
    text: 'var(--text-primary)',
    muted: 'var(--text-muted)',
    sub: 'var(--text-secondary)',
    track: 'var(--surface-elevated)',
    row: 'var(--surface-elevated)',
    accent: 'var(--accent)',
    high: 'var(--high)',
    critical: 'var(--critical)',
  }

  const [plotDrop, setPlotDrop] = useState<{ lng: number; lat: number } | null>(null)
  const [plotLabel, setPlotLabel] = useState('')
  const [plotCategory, setPlotCategory] = useState<'military' | 'economic' | 'political' | 'infrastructure' | 'humanitarian' | 'intelligence' | 'custom'>('custom')
  const [plotThreat, setPlotThreat] = useState<'critical' | 'high' | 'medium' | 'low' | 'info'>('medium')
  const [plotConfidence, setPlotConfidence] = useState<'confirmed' | 'probable' | 'possible' | 'unconfirmed'>('probable')
  const [plotAiInclude, setPlotAiInclude] = useState(true)
  const [plotNotes, setPlotNotes] = useState('')
  const [plotSaving, setPlotSaving] = useState(false)

  // Geocoder highlight state
  const [geoSaving, setGeoSaving] = useState(false)
  const [geoHighlight, setGeoHighlight] = useState<{
    center: [number, number]
    bbox?: [number, number, number, number]
    geometry?: GeoJSON.Geometry
    place_name: string
    note?: string
  } | null>(null)

  // Inject geo-highlight keyframes once
  useEffect(() => {
    const s = document.createElement('style')
    s.id = 'argus-geo-keyframes'
    s.textContent = `
      @keyframes argus-ripple {
        0%   { transform: scale(1);   opacity: 0.8; }
        100% { transform: scale(4.5); opacity: 0; }
      }
      @keyframes argus-ripple2 {
        0%   { transform: scale(1);   opacity: 0.5; }
        100% { transform: scale(3);   opacity: 0; }
      }
      @keyframes argus-pin-in {
        0%   { transform: scale(0.4) translateY(8px); opacity: 0; }
        60%  { transform: scale(1.1) translateY(-2px); opacity: 1; }
        100% { transform: scale(1)   translateY(0);   opacity: 1; }
      }
    `
    if (!document.getElementById('argus-geo-keyframes')) document.head.appendChild(s)
    return () => document.getElementById('argus-geo-keyframes')?.remove()
  }, [])

  const flyToGeoResult = useCallback((result: GeoResult) => {
    const map = mapRef.current
    if (!map) return
    if (result.bbox) {
      const [minLng, minLat, maxLng, maxLat] = result.bbox
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 1200, maxZoom: 16 })
    } else {
      const parts = result.place_name.split(',').length
      const zoom = parts >= 4 ? 14 : parts === 3 ? 12 : parts === 2 ? 8 : 5
      map.flyTo({ center: result.center, zoom, duration: 1200 })
    }
    setGeoHighlight({
      center: result.center,
      bbox: result.bbox,
      geometry: result.geometry,
      place_name: result.place_name,
      note: result.note,
    })
  }, [])

  const hoveredEventRef = useRef<IntelEvent | null>(null)
  const [hoveredEvent, setHoveredEvent] = useState<IntelEvent | null>(null)
  const [chokepointCursorTip, setChokepointCursorTip] = useState<{
    name: string; description: string; x: number; y: number
  } | null>(null)
  const [chokepointMarkerHover, setChokepointMarkerHover] = useState<string | null>(null)
  const chokepointMarkerHoverRef = useRef<string | null>(null)
  const mouseMoveThrottleRef = useRef<number>(0)
  const [cablesGeoJSON, setCablesGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null)
  const [landingPointsGeoJSON, setLandingPointsGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null)
  const [mapPopup, setMapPopup] = useState<MapPopup | null>(null)
  const [cableInfo, setCableInfo] = useState<CableInfo | null>(null)
  const [cableInfoLoading, setCableInfoLoading] = useState(false)
  const [threatenedCableIds, setThreatenedCableIds] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const animStepRef = useRef(0)

  // Drawing state — shared for zone/draw/area modes
  const [drawVerts, setDrawVerts] = useState<[number, number][]>([])
  const [drawCursor, setDrawCursor] = useState<[number, number] | null>(null)
  const drawCursorRef = useRef<[number, number] | null>(null)
  const drawCursorRafRef = useRef<number | null>(null)
  const [drawForm, setDrawForm] = useState<{ type: 'zone' | 'polygon'; coords: number[][] } | null>(null)
  const [zoneRadius, setZoneRadius] = useState(50) // km, for zone mode

  // Load cables only when the layer is on (large MultiLineString — don't pay on every project).
  useEffect(() => {
    if (!layers.cables || cablesGeoJSON) return
    fetch('/api/cables')
      .then(r => r.json())
      .then(setCablesGeoJSON)
      .catch(() => fetch('/data/cables.json').then(r => r.json()).then(setCablesGeoJSON).catch(() => {}))
  }, [layers.cables, cablesGeoJSON])

  // Load landing points only when toggled on
  useEffect(() => {
    if (!layers.landingPoints || landingPointsGeoJSON) return
    fetch('/data/landing-points.json').then(r => r.json()).then(setLandingPointsGeoJSON).catch(() => {})
  }, [layers.landingPoints, landingPointsGeoJSON])

  // Signature of critical events only — recomputes only when critical events actually change.
  // Prevents non-critical event arrivals from resetting the cable-threat debounce.
  const criticalEvents = useMemo(() => events.filter(e => e.severity === 'critical'), [events])
  // Patrol stops — critical/high events grouped by ~10 km cell. The camera flies
  // once per SITE, then cycles through the cards of every event at that site, so
  // ten stories pinned on one place are all briefed without orbiting one point.
  const patrolStops = useMemo(() => {
    const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    const sorted = events
      .filter(e => (e.severity === 'critical' || e.severity === 'high') && (e.lat !== 0 || e.lon !== 0))
      .sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))
    // NB: `Map` here is the react-map-gl component — use the global Map explicitly.
    const byCell = new globalThis.Map<string, IntelEvent[]>()
    // Same story often exists as several event entries (multiple sources, or the
    // same headline pinned at slightly different coordinates). Brief it ONCE per
    // circuit — dedupe by normalized title across all sites.
    const seenStories = new Set<string>()
    for (const e of sorted) {
      const story = e.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
      if (seenStories.has(story)) continue
      seenStories.add(story)
      const cell = `${Math.round(e.lat * 10)}:${Math.round(e.lon * 10)}`
      const bucket = byCell.get(cell)
      if (bucket) bucket.push(e)
      else byCell.set(cell, [e])
    }
    // Cap per-site briefings so one mega-cluster doesn't stall the whole patrol.
    return [...byCell.values()].map(evts => evts.slice(0, 8))
  }, [events])
  const patrolEventCount = useMemo(() => patrolStops.reduce((n, s) => n + s.length, 0), [patrolStops])
  // True when the displayed vessel/aircraft tracks are procedural placeholders
  // (real AIS/ADS-B feed unavailable) — surfaced so they're never mistaken for live data.
  const tracksSimulated = useMemo(
    () => (layers.vessels && vesselPositions.some(v => v.simulated)) || (layers.aviation && aircraft.some(a => a.simulated)),
    [layers.vessels, layers.aviation, vesselPositions, aircraft],
  )
  const criticalEventSig = useMemo(() => {
    const top = criticalEvents.slice(0, 20)
    return top.length + ':' + top.map(e => e.id).join(',')
  }, [criticalEvents])

  // Compute which cables are near active events
  const cableThreatDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!cablesGeoJSON || !layers.cables) {
      setThreatenedCableIds(new Set())
      return
    }
    // Debounce: run at most once per 4s — cable threat doesn't need real-time updates
    if (cableThreatDebounceRef.current) clearTimeout(cableThreatDebounceRef.current)
    cableThreatDebounceRef.current = setTimeout(() => {
      const activeEvents = criticalEvents.slice(0, 20)
      if (activeEvents.length === 0) { setThreatenedCableIds(new Set()); return }

      const threatened = new Set<string>()
      for (const feature of cablesGeoJSON.features) {
        const cableId = String((feature.properties as Record<string, unknown>)?.id ?? '')
        const lines = (feature.geometry as GeoJSON.MultiLineString).coordinates
        outer: for (const line of lines) {
          // Sample every 8th waypoint — halves the work vs every 4th
          for (let i = 0; i < line.length; i += 8) {
            const [lon, lat] = line[i]
            for (const ev of activeEvents) {
              if (haversineDistance(ev.lat, ev.lon, lat, lon) < CABLE_THREAT_KM) {
                threatened.add(cableId)
                break outer
              }
            }
          }
        }
      }
      setThreatenedCableIds(threatened)

      const cableData = cablesGeoJSON.features
        .filter(f => threatened.has(String((f.properties as Record<string, unknown>)?.id ?? '')))
        .map(f => {
          const p = f.properties as Record<string, unknown>
          const lines = (f.geometry as GeoJSON.MultiLineString).coordinates
          const mid = lines[0]?.[Math.floor((lines[0]?.length ?? 0) / 2)] ?? [0, 0]
          return { id: String(p.id ?? ''), name: String(p.name ?? 'Unknown Cable'), lat: mid[1], lon: mid[0] }
        })
      setThreatenedCableData(cableData)
    }, 4000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cablesGeoJSON, criticalEventSig, layers.cables])

  useEffect(() => {
    setFlyToCallback((lat, lon, zoom) => {
      mapRef.current?.flyTo({
        center: [lon, lat],
        zoom: zoom || 5,
        duration: 2200,
        pitch: 50,
        bearing: -12,
        essential: true,
      })
    })
  }, [setFlyToCallback])

  // Toggle 3D terrain — fully imperative so React never touches the DEM source.
  // Cleanup order matters: setTerrain(null) MUST come before removeSource,
  // otherwise Mapbox throws "Source cannot be removed while terrain is using it"
  // which cascades into the terrain.ts crash.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !mapLoaded || !USE_MAPBOX) return

    if (!layers.terrain) {
      // Disable path: terrain → null first, then clean up source & sky
      try { map.setTerrain(null) } catch {}
      try { if (map.getLayer('sky')) map.removeLayer('sky') } catch {}
      try { if (map.getSource('mapbox-dem')) map.removeSource('mapbox-dem') } catch {}
      return
    }

    // Enable path
    try {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512, maxzoom: 14,
        } as Parameters<typeof map.addSource>[1])
      }
      map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 })
      if (!map.getLayer('sky')) {
        map.addLayer({
          id: 'sky', type: 'sky',
          paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0.0, 90.0], 'sky-atmosphere-sun-intensity': 15 },
        } as Parameters<typeof map.addLayer>[0])
      }
    } catch {}

    // Cleanup: disable terrain BEFORE removing source (strict ordering required)
    return () => {
      try { map.setTerrain(null) } catch {}
      try { if (map.getLayer('sky')) map.removeLayer('sky') } catch {}
      try { if (map.getSource('mapbox-dem')) map.removeSource('mapbox-dem') } catch {}
    }
  }, [layers.terrain, mapLoaded])

  // Patrol mode — drone-sweep between critical events
  useEffect(() => {
    patrolActiveRef.current = patrolActive
    if (!patrolActive) {
      if (patrolRef.current) clearTimeout(patrolRef.current)
      if (patrolCardRef.current) clearTimeout(patrolCardRef.current)
      // Drop the auto-opened card when patrol stops
      hoveredEventRef.current = null
      setHoveredEvent(null)
      return
    }
    const stops = patrolStops
    if (stops.length === 0) { setPatrolActive(false); return }

    const FLY_MS = 3000
    const CARD_MS = 4500 // reading time per event card

    const showCard = (e: IntelEvent) => {
      hoveredEventRef.current = e
      setHoveredEvent(e)
    }

    const flyNext = () => {
      if (patrolIndexRef.current >= stops.length) {
        setPatrolActive(false)
        hoveredEventRef.current = null
        setHoveredEvent(null)
        return
      }
      const stop = stops[patrolIndexRef.current]
      patrolIndexRef.current++
      // Card from the previous stop closes while the camera is in transit
      hoveredEventRef.current = null
      setHoveredEvent(null)
      const lead = stop[0]
      mapRef.current?.flyTo({
        center: [lead.lon, lead.lat],
        // Close in on precise pins; stay wider for country-centroid placements
        // so the camera doesn't pretend to know a street address it doesn't have.
        zoom: lead.geoPrecision === 'country' ? 5.5 : 8.5,
        pitch: 55,
        bearing: ((patrolIndexRef.current * 47) % 60) - 30, // vary angle each stop
        duration: FLY_MS,
        essential: true,
      })
      // Once the camera lands, brief every event at this site card-by-card,
      // then move on to the next site.
      let cardIdx = 0
      const nextCard = () => {
        if (cardIdx < stop.length) {
          showCard(stop[cardIdx])
          cardIdx++
          patrolCardRef.current = setTimeout(nextCard, CARD_MS)
        } else {
          flyNext()
        }
      }
      patrolRef.current = setTimeout(nextCard, FLY_MS + 100)
    }
    flyNext()
    return () => {
      if (patrolRef.current) clearTimeout(patrolRef.current)
      if (patrolCardRef.current) clearTimeout(patrolCardRef.current)
    }
  }, [patrolActive, patrolStops])

  // Resize Mapbox canvas when the container changes width (e.g. feed panel collapse)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = mapContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      mapRef.current?.getMap()?.resize()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Called once the Mapbox GL context + style are fully ready.
  // Gates all Source/Layer children to prevent terrain.get() crash on early mount.
  const applyBaseTheme = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trySet = (layer: string, prop: string, value: unknown) => {
      try { if (map.getLayer(layer)) map.setPaintProperty(layer, prop as any, value) } catch {}
    }

    trySet('land', 'background-color', '#E4E6E8')
    trySet('water', 'fill-color', '#CDD5DC')
    trySet('landcover', 'fill-color', '#D8DBD8')
    trySet('landcover', 'fill-opacity', 1)
    trySet('national-park', 'fill-color', '#D8DBD8')
    trySet('national-park', 'fill-opacity', 1)
    trySet('admin-0-boundary', 'line-color', '#B0B8BE')
    trySet('admin-0-boundary', 'line-opacity', 0.7)
    trySet('admin-1-boundary', 'line-color', '#C4CBD0')
    trySet('admin-1-boundary', 'line-opacity', 0.5)

    const textColor  = '#1a2030'
    const haloColor  = 'rgba(255,255,255,0.96)'
    const haloWidth  = 2.0
    try {
      const style = map.getStyle()
      style?.layers?.forEach((layer: { type?: string; id: string }) => {
        if (layer.type !== 'symbol') return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layout = (layer as any).layout ?? {}
        if (!layout['text-field']) return
        try { map.setPaintProperty(layer.id, 'text-color',      textColor) } catch {}
        try { map.setPaintProperty(layer.id, 'text-halo-color', haloColor) } catch {}
        try { map.setPaintProperty(layer.id, 'text-halo-width', haloWidth) } catch {}
      })
    } catch {}
  }, [])

  // Re-apply base theme + terrain whenever the style reloads (dark/light toggle swaps the style URL)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const handler = () => {
      applyBaseTheme()
      // Re-add aircraft arrow icon — style reload clears all custom images, causing
      // "Image 'aircraft-arrow' not found" errors for every aircraft rendered.
      addAircraftArrow()
      // Re-apply terrain after style reload — Mapbox DEM only.
      if (USE_MAPBOX && useMapStore.getState().layers.terrain) {
        try {
          if (!map.getSource('mapbox-dem')) {
            map.addSource('mapbox-dem', {
              type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14,
            } as Parameters<typeof map.addSource>[1])
          }
          map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.8 })
        } catch {}
      }
    }
    map.on('style.load', handler)
    return () => { map.off('style.load', handler) }
  }, [applyBaseTheme]) // eslint-disable-line react-hooks/exhaustive-deps

  const addAircraftArrow = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map || map.hasImage('aircraft-arrow')) return

    // Patch mapbox-gl 3.x bug: _updateTerrain calls terrain.update() without null-checking
    // the tile cache, crashing whenever any source is added/removed while terrain is active.
    // This is a library bug; wrapping the method swallows the crash safely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = map as any
    if (m._updateTerrain && !m.__terrainPatched) {
      const orig = m._updateTerrain.bind(m)
      m._updateTerrain = function () { try { orig() } catch { /* mapbox-gl terrain race */ } }
      m.__terrainPatched = true
    }

    // Aircraft arrow (chevron pointing north)
    const size = 20
    const canvas = document.createElement('canvas')
    canvas.width = size; canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.moveTo(size / 2, 0)
    ctx.lineTo(size * 0.8, size)
    ctx.lineTo(size / 2, size * 0.65)
    ctx.lineTo(size * 0.2, size)
    ctx.closePath()
    ctx.fill()
    const imgData = ctx.getImageData(0, 0, size, size)
    map.addImage('aircraft-arrow', { width: size, height: size, data: imgData.data as unknown as Uint8Array }, { sdf: true })

    // Drone icon — quad-rotor X frame viewed from above
    if (!map.hasImage('drone-icon')) {
      const ds = 24
      const dc = document.createElement('canvas')
      dc.width = ds; dc.height = ds
      const dctx = dc.getContext('2d')!
      const cx = ds / 2, cy = ds / 2
      const armLen = ds * 0.38
      const rotorR = ds * 0.19
      dctx.fillStyle = 'white'
      dctx.strokeStyle = 'white'
      dctx.lineWidth = 2
      // Four diagonal arms
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) {
        dctx.beginPath()
        dctx.moveTo(cx, cy)
        dctx.lineTo(cx + dx * armLen, cy + dy * armLen)
        dctx.stroke()
        // Rotor disc at tip
        dctx.beginPath()
        dctx.arc(cx + dx * armLen, cy + dy * armLen, rotorR, 0, Math.PI * 2)
        dctx.fill()
      }
      // Center body (small square, rotated 45°)
      dctx.save()
      dctx.translate(cx, cy)
      dctx.rotate(Math.PI / 4)
      dctx.fillRect(-2.5, -2.5, 5, 5)
      dctx.restore()
      const dImgData = dctx.getImageData(0, 0, ds, ds)
      map.addImage('drone-icon', { width: ds, height: ds, data: dImgData.data as unknown as Uint8Array }, { sdf: true })
    }

    applyBaseTheme()
    setMapLoaded(true)
  }, [applyBaseTheme])

  // Chokepoint pressure — cheap bbox reject before haversine; skip when layer off
  const chokepointPressure = useMemo(() => {
    if (!layers.chokepoints) {
      return CHOKEPOINTS.map(cp => ({ ...cp, vesselCount: 0, aircraftCount: 0, pressure: 0 }))
    }
    const vessels = layers.vessels ? vesselPositions : []
    const milAir = layers.aviation ? aircraft.filter(a => a.type === 'military') : []
    return CHOKEPOINTS.map(cp => {
      let vesselCount = 0
      for (const v of vessels) {
        if (Math.abs(v.lat - cp.lat) > 2 || Math.abs(v.lon - cp.lon) > 2.5) continue
        if (haversineDistance(v.lat, v.lon, cp.lat, cp.lon) < 200) vesselCount++
      }
      let aircraftCount = 0
      for (const a of milAir) {
        if (Math.abs(a.latitude - cp.lat) > 2.5 || Math.abs(a.longitude - cp.lon) > 3) continue
        if (haversineDistance(a.latitude, a.longitude, cp.lat, cp.lon) < 250) aircraftCount++
      }
      return { ...cp, vesselCount, aircraftCount, pressure: vesselCount + aircraftCount * 2 }
    })
  }, [vesselPositions, aircraft, layers.vessels, layers.aviation, layers.chokepoints])

  const chokepointBoxesGeoJSON = useMemo(() => chokepointsFeatureCollection(), [])

  // GeoJSON for alerts — GPU circle layers, replaces DOM <Marker> pulse rings
  const alertsGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: alerts.filter(a => a.lat && a.lon).map(a => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
      properties: {
        id: a.id, title: a.title, summary: a.summary, severity: a.severity,
        pattern: a.pattern, signalCount: a.signalCount,
        signals: JSON.stringify(a.signals),
        countries: JSON.stringify(a.countries),
      },
    })),
  }), [alerts])

  // GeoJSON for vessels — WebGL circle layer, zero DOM overhead
  const vesselGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: vesselPositions.map(v => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] },
      properties: {
        mmsi: v.mmsi, name: v.name, flag: v.flag,
        ship_type: v.ship_type, speed: v.speed, heading: v.heading,
        destination: v.destination, sanctioned: v.sanctioned,
        colorKey: v.sanctioned ? 'sanctioned' : v.ship_type === 'Military' ? 'military' : v.ship_type === 'Tanker' ? 'tanker' : 'other',
      },
    })),
  }), [vesselPositions])

  // GeoJSON for aircraft — WebGL symbol layer with rotation
  const aircraftGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: aircraft.map(a => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [a.longitude, a.latitude] },
      properties: {
        icao24: a.icao24, callsign: a.callsign, origin_country: a.origin_country,
        baro_altitude: a.baro_altitude, velocity: a.velocity,
        track: a.track, on_ground: a.on_ground, type: a.type,
      },
    })),
  }), [aircraft])

  // Altitude sticks — vertical lines from ground to baro altitude (meters).
  // Visible as 3D pillars when map is pitched; requires terrain or Mapbox v3 z-elevation.
  const altitudeSticksGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: aircraft
      .filter(a => !a.on_ground && a.baro_altitude > 300 && (a.type === 'military' || a.type === 'drone'))
      .map(a => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [a.longitude, a.latitude, 0],
            [a.longitude, a.latitude, a.baro_altitude],
          ],
        },
        properties: { type: a.type, altitude: a.baro_altitude },
      })),
  }), [aircraft])

  // Flowing dash animation on threatened cables only — pause when tab hidden
  useEffect(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (threatenedCableIds.size === 0) return

    let lastTs = 0
    // 100ms ≈ 10fps — setPaintProperty triggers a full Mapbox repaint each call,
    // so keeping this low reduces forced repaints without losing visual quality.
    const FRAME_INTERVAL = 100
    let running = true

    function animate(ts: number) {
      if (!running) return
      if (document.visibilityState === 'hidden') {
        animFrameRef.current = requestAnimationFrame(animate)
        return
      }
      if (ts - lastTs >= FRAME_INTERVAL) {
        lastTs = ts
        const map = mapRef.current?.getMap()
        if (map && map.getLayer('submarine-cables-threatened')) {
          animStepRef.current = (animStepRef.current + 1) % DASH_SEQUENCE.length
          map.setPaintProperty('submarine-cables-threatened', 'line-dasharray', DASH_SEQUENCE[animStepRef.current])
        }
      }
      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)
    return () => {
      running = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [threatenedCableIds])

  // Critical event pulse — animates halo radius/opacity at 10fps; idle when tab hidden
  const pulseFrameRef   = useRef<number | null>(null)
  const pulseTRef       = useRef(0)
  const pulseLastTsRef  = useRef(0)
  useEffect(() => {
    // Only animate when critical events actually exist. Otherwise setPaintProperty
    // would force a full GPU repaint 10x/sec forever, keeping the map from ever
    // going idle — the main cause of constant lag with nothing on screen.
    if (!mapLoaded || criticalEvents.length === 0 || !layers.events) return
    const PULSE_MS = 100 // 10fps — setPaintProperty triggers a full GPU repaint; halving rate saves ~50% GPU
    let running = true

    function tick(ts: number) {
      if (!running) return
      if (document.visibilityState === 'hidden') {
        pulseFrameRef.current = requestAnimationFrame(tick)
        return
      }
      if (ts - pulseLastTsRef.current >= PULSE_MS) {
        pulseLastTsRef.current = ts
        const map = mapRef.current?.getMap()
        if (map && map.getLayer('events-critical-halo')) {
          pulseTRef.current += 0.08
          const t = pulseTRef.current
          // Gentle sine wave: radius 11→19, opacity 0.06→0.22
          map.setPaintProperty('events-critical-halo', 'circle-radius', 15 + Math.sin(t) * 4)
          map.setPaintProperty('events-critical-halo', 'circle-opacity', 0.14 + Math.abs(Math.sin(t)) * 0.08)
        }
      }
      pulseFrameRef.current = requestAnimationFrame(tick)
    }

    pulseFrameRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      if (pulseFrameRef.current) cancelAnimationFrame(pulseFrameRef.current)
    }
  }, [mapLoaded, criticalEvents.length, layers.events])

  // Fetch real TeleGeography metadata when a cable popup opens
  useEffect(() => {
    if (!mapPopup || mapPopup.kind !== 'cable') { setCableInfo(null); return }
    setCableInfo(null)
    setCableInfoLoading(true)
    fetch(`/api/cable-info?id=${encodeURIComponent(mapPopup.id)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setCableInfo(data); setCableInfoLoading(false) })
      .catch(() => setCableInfoLoading(false))
  }, [mapPopup])

  const propsToEvent = (props: Record<string, unknown>): IntelEvent => ({
    id: String(props.id), title: String(props.title), summary: String(props.summary),
    country: String(props.country), countryCode: String(props.countryCode),
    severity: props.severity as IntelEvent['severity'],
    source: props.source as IntelEvent['source'],
    category: props.category as IntelEvent['category'],
    timestamp: String(props.timestamp),
    lat: Number(props.lat), lon: Number(props.lon), url: '',
    fatalities: props.fatalities ? Number(props.fatalities) : undefined,
  })

  // ── Map → Canvas bridge ─────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: MapMouseEvent) => {
    e.originalEvent.preventDefault()
    const feature = e.features?.[0]
    if (!feature || feature.layer?.id !== 'events-point') { setContextMenu(null); return }
    const props = (feature.properties ?? {}) as Record<string, unknown>
    // Prefer the full event from store (has all fields); fall back to reconstructed object
    const eventId = String(props.id ?? '')
    const fullEvent = useMapStore.getState().events.find(ev => ev.id === eventId) ?? propsToEvent(props)
    setContextMenu({ x: e.originalEvent.clientX, y: e.originalEvent.clientY, event: fullEvent })
  }, [])

  const sendToCanvas = useCallback((ev: IntelEvent) => {
    const project = getActiveProject()
    addIntelEventToCanvas(project, ev, addCanvasNode, {
      onAlready: () => pushToast({ title: 'Already on canvas', body: ev.title, severity: 'info', type: 'system' }),
      onAdded: () => pushToast({ title: 'Added to Canvas', body: ev.title, severity: 'info', type: 'system' }),
      addEvents,
    })
    setContextMenu(null)
  }, [getActiveProject, addCanvasNode, addEvents, pushToast])

  const handleMapClick = useCallback((e: MapMouseEvent) => {
    if (!TOKEN) return
    // Clear geo highlight only when clicking outside the highlighted bbox
    if (geoHighlight) {
      const { lng, lat } = e.lngLat
      const inside = geoHighlight.bbox
        ? lng >= geoHighlight.bbox[0] && lng <= geoHighlight.bbox[2] && lat >= geoHighlight.bbox[1] && lat <= geoHighlight.bbox[3]
        : Math.abs(lng - geoHighlight.center[0]) < 0.01 && Math.abs(lat - geoHighlight.center[1]) < 0.01
      if (!inside) setGeoHighlight(null)
    }
    // Plotting mode intercept
    if (plottingMode === 'point') {
      const { lng, lat } = e.lngLat
      setPlotDrop({ lng, lat })
      setPlotLabel('')
      setPlotNotes('')
      return
    }
    if (plottingMode === 'zone') {
      const { lng, lat } = e.lngLat
      // First click: set center and open form with radius slider
      setDrawVerts([[lng, lat]])
      setDrawForm({ type: 'zone', coords: makeCircle(lng, lat, zoneRadius) })
      setPlotLabel('')
      setPlotNotes('')
      return
    }
    if (plottingMode === 'draw') {
      const { lng, lat } = e.lngLat
      setDrawVerts(prev => [...prev, [lng, lat]])
      return
    }
    if (plottingMode === 'zone-builder') {
      // Rectangle: first click = corner A, second click = corner B → close form
      const { lng, lat } = e.lngLat
      setDrawVerts(prev => {
        const next = [...prev, [lng, lat] as [number, number]]
        if (next.length === 2) {
          const [[x1, y1], [x2, y2]] = next
          const rect: number[][] = [[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]
          setDrawForm({ type: 'polygon', coords: rect })
          setPlotLabel('')
          setPlotNotes('')
        }
        return next
      })
      return
    }
    const features = e.features
    if (features && features.length > 0) {
      const feature = features[0]
      const { lng, lat } = e.lngLat
      const layerId = feature.layer?.id
      const props = (feature.properties ?? {}) as Record<string, unknown>

      if (layerId === 'events-cluster') {
        const clusterId = props.cluster_id as number
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const source = mapRef.current?.getMap().getSource('events') as any
        source?.getClusterExpansionZoom(clusterId, (err: unknown, zoom: number) => {
          if (!err) mapRef.current?.flyTo({ center: [lng, lat], zoom: zoom + 0.5, duration: 600 })
        })
        return
      }
      if (layerId === 'events-point') {
        const ev = propsToEvent(props)
        setSelectedEvent(ev)
        mapRef.current?.flyTo({ center: [lng, lat], zoom: Math.max(mapRef.current?.getMap().getZoom() ?? 5, 5), duration: 800 })
        return
      }
      if (layerId === 'alerts-core') {
        const a = props as Record<string, unknown>
        setMapPopup({
          kind: 'alert',
          id: String(a.id), title: String(a.title), summary: String(a.summary),
          severity: String(a.severity), pattern: String(a.pattern),
          signals: JSON.parse(String(a.signals || '[]')),
          signalCount: Number(a.signalCount),
          countries: JSON.parse(String(a.countries || '[]')),
          lng, lat,
        })
        return
      }
      if (layerId === 'vessels-layer') {
        const v = props as Record<string, unknown>
        setSelectedVessel({
          mmsi: String(v.mmsi), name: String(v.name), flag: String(v.flag),
          ship_type: String(v.ship_type), speed: Number(v.speed), heading: Number(v.heading),
          destination: String(v.destination), sanctioned: Boolean(v.sanctioned),
          lat, lon: lng,
        })
        return
      }
      if (layerId === 'aircraft-layer') {
        const a = props as Record<string, unknown>
        setSelectedAircraft({
          icao24: String(a.icao24), callsign: String(a.callsign),
          origin_country: String(a.origin_country),
          baro_altitude: Number(a.baro_altitude), velocity: Number(a.velocity),
          track: Number(a.track), on_ground: Boolean(a.on_ground),
          type: a.type as AircraftPosition['type'],
          latitude: lat, longitude: lng,
        })
        return
      }
      if (layerId === 'landing-points-layer' || layerId === 'landing-points-hit') {
        const cables = JSON.parse(String(props.cables || '[]')) as string[]
        setMapPopup({ kind: 'landing', cables, cable_count: Number(props.cable_count || 0), lng, lat })
        return
      }
      if (layerId === 'submarine-cables-layer' || layerId === 'submarine-cables-hit' ||
          layerId === 'submarine-cables-threatened' || layerId === 'submarine-cables-threatened-hit') {
        setMapPopup({ kind: 'cable', id: String(props.id ?? ''), name: String(props.name ?? 'Submarine Cable'), lng, lat })
        return
      }
    }
    setMapPopup(null)
    setSelectedEvent(null)
    const { lng, lat } = e.lngLat
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        if (USE_MAPBOX && TOKEN) {
          const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=country&access_token=${TOKEN}`)
          const data = await res.json()
          const feat = data.features?.[0]
          if (feat) {
            useMapStore.getState().setSelectedCountry(feat.text || feat.place_name, (feat.properties?.short_code || '').toUpperCase())
          }
          return
        }
        // Keyless reverse geocode (Nominatim)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=3&addressdetails=1`,
          { headers: { Accept: 'application/json' } },
        )
        if (!res.ok) return
        const data = await res.json() as { address?: { country?: string; country_code?: string } }
        const name = data.address?.country
        const code = (data.address?.country_code || '').toUpperCase()
        if (name) useMapStore.getState().setSelectedCountry(name, code)
      } catch {}
    }, 280)
  }, [plottingMode, zoneRadius, setSelectedEvent, setMapPopup, setPlotDrop, setDrawVerts, setDrawForm, setPlotLabel, setPlotNotes, geoHighlight])

  // Generate circle polygon from center + radius (km)
  // Recompute zone circle when radius changes
  useEffect(() => {
    if (drawForm?.type === 'zone' && drawVerts.length > 0) {
      const [lon, lat] = drawVerts[0]
      setDrawForm({ type: 'zone', coords: makeCircle(lon, lat, zoneRadius) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneRadius])

  const makeCircle = (lon: number, lat: number, radiusKm: number, steps = 64): number[][] => {
    const R = 6371
    const coords: number[][] = []
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI
      const dLat = (radiusKm / R) * (180 / Math.PI)
      const dLon = (radiusKm / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180)
      coords.push([lon + dLon * Math.sin(angle), lat + dLat * Math.cos(angle)])
    }
    return coords
  }

  const cancelDraw = useCallback(() => {
    setDrawVerts([])
    setDrawCursor(null)
    setDrawForm(null)
    setPlotDrop(null)
    setPlottingMode('none')
  }, [setPlottingMode])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape: cancel active plot
      if (e.key === 'Escape' && (plotDrop || drawForm || plottingMode !== 'none')) {
        cancelDraw(); return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [plotDrop, drawForm, plottingMode, cancelDraw, togglePanel])

  const savePlot = useCallback(async () => {
    setPlotSaving(true)
    const project = getActiveProject()

    const saveOrLocalise = async (
      type: 'point' | 'zone' | 'polygon',
      coordinates: number[] | number[][],
      label: string,
      properties: Plot['properties']
    ) => {
      const scoped = project ? withPlotProjectId(properties, project.id) : properties
      const result = await createPlot(type, coordinates, label, scoped)
      if (!result) {
        // API unavailable — keep in memory and persist to project store for this session
        const localPlot: Plot = {
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          workspace_id: '',
          type, coordinates, label, properties: scoped,
          created_at: new Date().toISOString(),
        }
        addPlotToStore(localPlot)
        if (project) addLocalPlot(project.id, localPlot)
      }
    }

    if (plotDrop) {
      await saveOrLocalise('point', [plotDrop.lng, plotDrop.lat], plotLabel || 'Plot', {
        category: plotCategory, threat_level: plotThreat,
        confidence: plotConfidence, ai_include: plotAiInclude,
        notes: plotNotes || undefined,
      })
      setPlotDrop(null)
    } else if (drawForm) {
      const type = drawForm.type === 'zone' ? 'zone' : 'polygon'
      await saveOrLocalise(type, drawForm.coords, plotLabel || (type === 'zone' ? 'Zone' : 'Area'), {
        category: plotCategory, threat_level: plotThreat,
        confidence: plotConfidence, ai_include: plotAiInclude,
        notes: plotNotes || undefined,
        radius: drawForm.type === 'zone' ? zoneRadius : undefined,
      })
      setDrawForm(null)
      setDrawVerts([])
    }
    setPlotSaving(false)
    setPlotLabel('')
    setPlotNotes('')
    setPlotAiInclude(true)
    setPlottingMode('none')
  }, [plotDrop, drawForm, plotLabel, plotCategory, plotThreat, plotConfidence, plotAiInclude, plotNotes, zoneRadius, createPlot, setPlottingMode, getActiveProject, addLocalPlot, addPlotToStore])

  const handleDblClick = useCallback((e: { lngLat: { lng: number; lat: number }; preventDefault: () => void }) => {
    if (plottingMode === 'draw' && drawVerts.length >= 3) {
      e.preventDefault()
      const closed = [...drawVerts, drawVerts[0]]
      setDrawForm({ type: 'polygon', coords: closed })
      setPlotLabel('')
      setPlotNotes('')
    }
  }, [plottingMode, drawVerts])

  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const canvas = mapRef.current?.getCanvas()

    if (plottingMode === 'draw' || plottingMode === 'zone-builder') {
      const { lng, lat } = e.lngLat
      if (canvas) canvas.style.cursor = 'crosshair'
      // Throttle drawCursor state to rAF — avoids re-render on every mouse event
      drawCursorRef.current = [lng, lat]
      if (!drawCursorRafRef.current) {
        drawCursorRafRef.current = requestAnimationFrame(() => {
          setDrawCursor(drawCursorRef.current)
          drawCursorRafRef.current = null
        })
      }
      return
    }
    if (plottingMode === 'point' || plottingMode === 'zone') {
      if (canvas) canvas.style.cursor = 'crosshair'
      return
    }

    const hasFeatures = e.features && e.features.length > 0

    // Throttle hover state updates — mouse fires 60+ times/sec otherwise
    const now = performance.now()
    const throttled = now - mouseMoveThrottleRef.current < 60
    if (!throttled) mouseMoveThrottleRef.current = now

    if (layers.chokepoints) {
      const cpFeature = e.features?.find((f: { layer?: { id?: string } }) =>
        f.layer?.id === 'chokepoints-fill' || f.layer?.id === 'chokepoints-line',
      )
      if (cpFeature?.properties?.name) {
        if (canvas) canvas.style.cursor = 'pointer'
        if (!throttled) {
          setChokepointCursorTip({
            name: String(cpFeature.properties.name),
            description: String(cpFeature.properties.description ?? ''),
            x: e.point.x,
            y: e.point.y,
          })
        }
        return
      }
      if (!throttled) setChokepointCursorTip(null)
    }

    if (canvas) canvas.style.cursor = hasFeatures ? 'pointer' : ''

    if (throttled) return

    if (hasFeatures) {
      const f = e.features![0]
      if (f.layer?.id === 'events-point') {
        const ev = propsToEvent((f.properties ?? {}) as Record<string, unknown>)
        if (ev.id !== hoveredEventRef.current?.id) {
          hoveredEventRef.current = ev
          setHoveredEvent(ev)
        }
        return
      }
    }
    // During patrol the card is opened programmatically at each stop — don't let
    // incidental mouse movement over empty map wipe it mid-dwell.
    if (hoveredEventRef.current !== null && !patrolActiveRef.current) {
      hoveredEventRef.current = null
      setHoveredEvent(null)
    }
  }, [plottingMode, layers.chokepoints])

  const filteredEvents = useMemo(() => {
    const now = Date.now()
    const dateMs = dateFilter === '6h' ? 6 * 3600000
      : dateFilter === '24h' ? 24 * 3600000
      : dateFilter === '7d' ? 168 * 3600000
      : dateFilter === '30d' ? 720 * 3600000
      : null
    const q = searchQuery.trim().toLowerCase()
    return events.filter(e => {
      if (!layers.events) return false
      if (!layers.disasters && (e.category === 'disaster' || e.category === 'earthquake')) return false
      if (e.lat == null || e.lon == null || isNaN(e.lat) || isNaN(e.lon)) return false
      if (e.lat === 0 && e.lon === 0) return false
      if (eventFilter !== 'all' && e.category !== eventFilter) return false
      if (severityFilter !== 'all' && e.severity !== severityFilter) return false
      if (dateMs !== null && now - new Date(e.timestamp).getTime() > dateMs) return false
      if (q && !e.title.toLowerCase().includes(q) && !e.country.toLowerCase().includes(q) && !e.summary.toLowerCase().includes(q)) return false
      // Timeline playback — only show events that occurred before the cursor
      if (playback.active && playback.time && new Date(e.timestamp).getTime() > new Date(playback.time).getTime()) return false
      return true
    })
  }, [events, layers.events, layers.disasters, eventFilter, severityFilter, dateFilter, searchQuery, playback.active, playback.time])

  // Country risk scores — severity-weighted event density per country
  const riskByCountry = useMemo(() => {
    const SEV_W: Record<string, number> = { critical: 10, high: 5, medium: 2, low: 1 }
    const pool = scrubbing && playback.time
      ? events.filter(e => new Date(e.timestamp).getTime() <= new Date(playback.time!).getTime())
      : events
    const scores: Record<string, number> = {}
    for (const e of pool) {
      const cc = (e.countryCode || '').toUpperCase()
      if (!cc) continue
      scores[cc] = (scores[cc] ?? 0) + (SEV_W[e.severity] ?? 1)
    }
    const max = Object.values(scores).reduce((m, v) => v > m ? v : m, 1)
    const norm: Record<string, number> = {}
    for (const [cc, v] of Object.entries(scores)) norm[cc] = Math.round((v / max) * 100)
    return norm
  }, [events, scrubbing, playback.time])

  const eventsGeoJSON = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: filteredEvents.map(e => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
      properties: {
        id: e.id, title: e.title, summary: e.summary,
        country: e.country, countryCode: e.countryCode,
        severity: e.severity, source: e.source, category: e.category,
        timestamp: e.timestamp, lat: e.lat, lon: e.lon,
        fatalities: e.fatalities ?? null,
        severityWeight: e.severity === 'critical' ? 4 : e.severity === 'high' ? 3 : e.severity === 'medium' ? 2 : 1,
      },
    })),
  }), [filteredEvents])

  // Build threatened/safe GeoJSON splits — memoised to avoid rebuilding on every render
  const safeCables = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!cablesGeoJSON) return null
    return {
      type: 'FeatureCollection',
      features: cablesGeoJSON.features.filter(f => !threatenedCableIds.has(String((f.properties as Record<string,unknown>)?.id ?? ''))),
    }
  }, [cablesGeoJSON, threatenedCableIds])

  const threatenedCables = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!cablesGeoJSON || threatenedCableIds.size === 0) return null
    return {
      type: 'FeatureCollection',
      features: cablesGeoJSON.features.filter(f => threatenedCableIds.has(String((f.properties as Record<string,unknown>)?.id ?? ''))),
    }
  }, [cablesGeoJSON, threatenedCableIds])

  // Single highlighted cable feature (shown regardless of layer toggle)
  const highlightedCable = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!cablesGeoJSON || !highlightedCableId) return null
    return {
      type: 'FeatureCollection',
      features: cablesGeoJSON.features.filter(f =>
        String((f.properties as Record<string, unknown>)?.id ?? '') === highlightedCableId
      ),
    }
  }, [cablesGeoJSON, highlightedCableId])

  // Live drawing GeoJSON — polygon outline + vertices during draw mode
  const drawPreviewGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: (() => {
      const features: GeoJSON.Feature[] = []
      // Completed shape (zone circle or polygon from drawForm)
      if (drawForm) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [drawForm.coords] },
          properties: {},
        })
      } else if (drawVerts.length > 0) {
        // Live in-progress polygon line
        const preview = [...drawVerts, ...(drawCursor ? [drawCursor] : [])]
        if (preview.length >= 2) {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: preview },
            properties: {},
          })
        }
        // Vertex dots
        for (const v of drawVerts) {
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: v }, properties: {} })
        }
      }
      return features
    })(),
  }

  const interactiveLayerIds = useMemo(() => {
    const ids = ['events-cluster', 'events-point', 'alerts-core']
    if (layers.cables && cablesGeoJSON) {
      ids.push('submarine-cables-hit', 'submarine-cables-layer')
      if (threatenedCables) ids.push('submarine-cables-threatened-hit', 'submarine-cables-threatened')
    }
    if (layers.landingPoints && landingPointsGeoJSON) ids.push('landing-points-hit', 'landing-points-layer')
    if (layers.chokepoints) ids.push('chokepoints-fill', 'chokepoints-line')
    if (layers.vessels) ids.push('vessels-layer')
    if (layers.aviation) ids.push('aircraft-layer')
    return ids
  }, [layers.cables, layers.landingPoints, layers.chokepoints, layers.vessels, layers.aviation, cablesGeoJSON, threatenedCables, landingPointsGeoJSON])

  const [mapStyleUrl, setMapStyleUrl] = useState(() => resolveMapStyle())
  const mapUsesMapbox = USE_MAPBOX || (typeof window !== 'undefined' && !!getMapboxToken())

  useEffect(() => {
    const sync = () => setMapStyleUrl(resolveMapStyle())
    sync()
    window.addEventListener('argus-mapbox-changed', sync)
    return () => window.removeEventListener('argus-mapbox-changed', sync)
  }, [])

  const mapStyle = mapStyleUrl

  return (
    <>
    <div ref={mapContainerRef} style={{ width: '100%', height: '100%', position: 'relative', background: 'var(--surface)', overflow: 'hidden' }}>
      {!mapUsesMapbox && (
        <div
          style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 8,
            maxWidth: 420, padding: '6px 12px', borderRadius: 'var(--radius-md)',
            background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
            border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)',
            textAlign: 'center', lineHeight: 1.4, pointerEvents: 'none',
          }}
        >
          Free map (OpenStreetMap) — no Mapbox key needed. Add Mapbox in Settings → Integrations for 3D terrain.
        </div>
      )}

      {/* Geocoder search box */}
      {plottingMode === 'none' && !plotDrop && !drawForm && !eventFeedOpen && !mapQueryPanelOpen && (
        <MapLocationSearch onSelect={flyToGeoResult} />
      )}

      {/* Plotting mode hint bar */}
      {plottingMode !== 'none' && !plotDrop && !drawForm && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 'var(--z-map-overlay)' as unknown as number, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent)', color: 'white', fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 'var(--radius-md)', pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          {plottingMode === 'point' && 'POINT — click to drop a pin'}
          {plottingMode === 'zone' && 'ZONE — click map to place circle'}
          {plottingMode === 'draw' && (drawVerts.length === 0 ? 'POLYGON — click to start drawing' : `POLYGON — ${drawVerts.length} pts · double-click to finish`)}
          {plottingMode === 'zone-builder' && (drawVerts.length === 0 ? 'AREA — click first corner' : 'AREA — click opposite corner')}
        </div>
      )}

      {/* Plot save form — shown for point drop OR after shape is completed */}
      {(plotDrop || drawForm) && (
        <div style={{ position: 'absolute', bottom: 60, right: 56, zIndex: 'var(--z-map-popup)' as unknown as number, background: p.bg, border: `1px solid ${p.border}`, borderRadius: 'var(--radius-xl)', width: 300, boxShadow: '0 16px 48px rgba(0,0,0,0.35)', padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: p.text, marginBottom: 14 }}>
            {plotDrop ? 'Drop Point' : drawForm?.type === 'zone' ? 'Zone' : 'Area / Polygon'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              autoFocus
              value={plotLabel}
              onChange={e => setPlotLabel(e.target.value)}
              placeholder={plotDrop ? 'Label (e.g. SAM Site, FOB Alpha)' : drawForm?.type === 'zone' ? 'Zone label' : 'Area label'}
              style={{ padding: '8px 10px', border: `1px solid ${p.border}`, borderRadius: 'var(--radius-sm)', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box', background: p.row, color: p.text }}
            />
            {/* Radius slider — only for zone mode */}
            {drawForm?.type === 'zone' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: p.muted, marginBottom: 4 }}>
                  <span>Radius</span><span style={{ fontWeight: 700, color: 'var(--accent)' }}>{zoneRadius} km</span>
                </div>
                <input type="range" min={5} max={500} step={5} value={zoneRadius}
                  onChange={e => setZoneRadius(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={plotCategory} onChange={e => setPlotCategory(e.target.value as typeof plotCategory)}
                style={{ flex: 1, padding: '7px 8px', border: `1px solid ${p.border}`, borderRadius: 'var(--radius-sm)', fontSize: 11, outline: 'none', background: p.row, color: p.text }}>
                <option value="military">Military</option>
                <option value="political">Political</option>
                <option value="economic">Economic</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="humanitarian">Humanitarian</option>
                <option value="intelligence">Intelligence</option>
                <option value="custom">Custom</option>
              </select>
              <select value={plotThreat} onChange={e => setPlotThreat(e.target.value as typeof plotThreat)}
                style={{ flex: 1, padding: '7px 8px', border: `1px solid ${p.border}`, borderRadius: 'var(--radius-sm)', fontSize: 11, outline: 'none', background: p.row, color: p.text }}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
            </div>
            <select value={plotConfidence} onChange={e => setPlotConfidence(e.target.value as typeof plotConfidence)}
              style={{ padding: '7px 8px', border: `1px solid ${p.border}`, borderRadius: 'var(--radius-sm)', fontSize: 11, outline: 'none', background: p.row, color: p.text, width: '100%' }}>
              <option value="confirmed">Confirmed (3+ sources / imagery)</option>
              <option value="probable">Probable (~70% confidence)</option>
              <option value="possible">Possible (~40% confidence)</option>
              <option value="unconfirmed">Unconfirmed / single source</option>
            </select>
            <textarea
              value={plotNotes}
              onChange={e => setPlotNotes(e.target.value)}
              placeholder={`AI analyst notes — structured format:\nAsset: what is here\nActivity: observed behavior\nSignificance: why it matters`}
              rows={3}
              style={{ padding: '7px 10px', border: `1px solid ${p.border}`, borderRadius: 'var(--radius-sm)', fontSize: 11, outline: 'none', resize: 'vertical', fontFamily: 'monospace', width: '100%', boxSizing: 'border-box', background: p.row, color: p.text, lineHeight: 1.5 }}
            />
            {/* AI include toggle */}
            <button
              type="button"
              onClick={() => setPlotAiInclude(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                background: plotAiInclude ? 'var(--accent-tint)' : p.row,
                border: `1px solid ${plotAiInclude ? 'var(--accent)' : p.border}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', width: '100%',
              }}
            >
              <div style={{
                width: 28, height: 16, borderRadius: 'var(--radius-md)',
                background: plotAiInclude ? 'var(--accent)' : 'var(--text-muted)',
                position: 'relative', transition: 'background 150ms', flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: plotAiInclude ? 14 : 2,
                  width: 12, height: 12, borderRadius: '50%', background: 'white',
                  transition: 'left 150ms',
                }} />
              </div>
              <span style={{ fontSize: 11, color: plotAiInclude ? 'var(--accent)' : p.muted, fontWeight: 600 }}>
                {plotAiInclude ? 'Include in AI analysis' : 'Excluded from AI analysis'}
              </span>
            </button>
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button onClick={cancelDraw} style={{ flex: 1, padding: '8px', background: p.row, border: `1px solid ${p.border}`, borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, color: p.sub, fontWeight: 600 }}>Cancel</button>
              <button onClick={savePlot} disabled={plotSaving} style={{ flex: 2, padding: '8px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, color: 'white', fontWeight: 700 }}>
                {plotSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}



      {chokepointCursorTip && layers.chokepoints && (
        <div
          className="ui-chokepoint-cursor-tip"
          style={{ left: chokepointCursorTip.x + 14, top: chokepointCursorTip.y + 14 }}
        >
          <div className="ui-chokepoint-cursor-tip__name">{chokepointCursorTip.name}</div>
          {chokepointCursorTip.description && (
            <div className="ui-chokepoint-cursor-tip__desc">{chokepointCursorTip.description}</div>
          )}
        </div>
      )}

      <Map
          ref={mapRef}
          {...(mapUsesMapbox ? { mapboxAccessToken: getMapboxToken() || TOKEN } : {})}
          mapStyle={mapStyle}
          {...(mapUsesMapbox ? { projection: 'globe' as const } : {})}
          initialViewState={initialViewport.current}
          onLoad={addAircraftArrow}
          onError={(e: { error?: { message?: string } }) => {
            const msg = e?.error?.message ?? ''
            if (!mapUsesMapbox && mapStyle !== FREE_MAP_STYLE_FALLBACK && /style|fetch|network|failed/i.test(msg)) {
              setMapStyleUrl(FREE_MAP_STYLE_FALLBACK)
            }
          }}
          onMoveEnd={(evt: { viewState: { latitude: number; longitude: number; zoom: number; pitch: number; bearing: number } }) => setViewport(evt.viewState)}
          onClick={handleMapClick}
          onContextMenu={handleContextMenu}
          onMouseMove={handleMouseMove}
          onDblClick={handleDblClick}
          interactiveLayerIds={interactiveLayerIds}
          style={{ width: '100%', height: '100%' }}
          fadeDuration={0}
          renderWorldCopies={false}
          maxTileCacheSize={150}
          collectResourceTiming={false}
          trackResize={false}
          {...(mapUsesMapbox ? {
            fog: {
              color: 'rgba(220,225,228,0.6)',
              'high-color': '#C8D2D8',
              'horizon-blend': 0.04,
              'space-color': '#FFFFFF',
              'star-intensity': 0,
            },
          } : {})}
        >
          <NavigationControl position="bottom-right" style={{ marginBottom: 196 }} />

          {/* Patrol + Terrain controls — bottom-right above nav */}
          <div style={{
            position: 'absolute', bottom: 320, right: 10,
            display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10,
          }}>
            <button
              onClick={() => { patrolIndexRef.current = 0; setPatrolActive(v => !v) }}
              title={patrolActive ? 'Stop patrol' : 'Patrol high-priority events (one pass)'}
              style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
                background: patrolActive
                  ? 'rgba(220,38,38,0.9)'
                  : 'rgba(255,255,255,0.92)',
                color: patrolActive ? '#fff' : '#374151',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                transition: 'all 150ms',
              }}
            >
              {patrolActive ? '■' : '◈'}
            </button>

          </div>

          {/* Drone recon overlay — rendered as a portal over everything */}

          {/* Patrol mode active banner — sits above the LiveTicker pill (bottom: 14, h: 30) */}
          {patrolActive && (
            <div style={{
              position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(220,38,38,0.9)', color: '#fff',
              padding: '5px 14px', borderRadius: 'var(--radius-md)',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', zIndex: 'var(--z-map-popup)' as unknown as number,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 2px 12px rgba(220,38,38,0.4)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#fff',
                animation: 'argus-pulse 1.2s ease-in-out infinite',
                display: 'inline-block', flexShrink: 0,
              }} />
              PATROL ACTIVE — {patrolEventCount} event{patrolEventCount !== 1 ? 's' : ''} · {patrolStops.length} site{patrolStops.length !== 1 ? 's' : ''}
              <button
                onClick={() => setPatrolActive(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 13, padding: 0, marginLeft: 4 }}
              >
                ×
              </button>
            </div>
          )}

          {/* Honest disclosure: vessel/aircraft tracks are procedural placeholders */}
          {tracksSimulated && (
            <div style={{
              position: 'absolute', bottom: 30, left: 10, zIndex: 'var(--z-map-popup)' as unknown as number,
              background: 'rgba(120,75,10,0.92)', color: '#FFE8B0',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,200,90,0.4)',
              fontFamily: 'var(--font-mono), monospace',
            }} title="Real AIS/ADS-B feed unavailable — vessel/aircraft tracks shown are procedural placeholders, not live data.">
              ⚠ Simulated tracks — no live AIS/ADS-B feed
            </div>
          )}

          {mapLoaded && <>
          {/* Drawing preview layers */}
          {(drawVerts.length > 0 || drawForm) && (
            <Source id="draw-preview" type="geojson" data={drawPreviewGeoJSON}>
              <Layer id="draw-fill" type="fill" filter={['==', '$type', 'Polygon']}
                paint={{ 'fill-color': MAP_ACCENT, 'fill-opacity': 0.15 }} />
              <Layer id="draw-outline" type="line"
                filter={['any', ['==', '$type', 'Polygon'], ['==', '$type', 'LineString']]}
                paint={{ 'line-color': MAP_ACCENT, 'line-width': 2, 'line-dasharray': [4, 2] }} />
              <Layer id="draw-verts" type="circle" filter={['==', '$type', 'Point']}
                paint={{ 'circle-radius': 5, 'circle-color': MAP_ACCENT, 'circle-stroke-color': 'white', 'circle-stroke-width': 2 }} />
            </Source>
          )}

          {/* Country Risk Heatmap — Mapbox admin-0 boundaries (Mapbox token only) */}
          {USE_MAPBOX && layers.riskHeatmap && Object.keys(riskByCountry).length > 0 && (
            <Source
              id="country-risk"
              type="vector"
              url="mapbox://mapbox.country-boundaries-v1"
            >
              <Layer
                id="country-risk-fill"
                type="fill"
                source-layer="country_boundaries"
                beforeId="waterway-label"
                filter={['in', ['get', 'iso_3166_1'], ['literal', Object.keys(riskByCountry)]]}
                paint={{
                  'fill-color': [
                    'interpolate', ['linear'],
                    ['coalesce',
                      ['match', ['get', 'iso_3166_1'],
                        ...Object.entries(riskByCountry).flatMap(([cc, v]) => [cc, v]),
                        0
                      ],
                      0
                    ],
                    0,   'rgba(61,124,102,0)',
                    10,  'rgba(101,163,13,0.25)',
                    30,  'rgba(154,117,23,0.35)',
                    60,  'rgba(190,30,58,0.45)',
                    100, 'rgba(127,29,29,0.6)',
                  ],
                  'fill-opacity': 0.85,
                }}
              />
              <Layer
                id="country-risk-border"
                type="line"
                source-layer="country_boundaries"
                beforeId="waterway-label"
                filter={['in', ['get', 'iso_3166_1'], ['literal', Object.keys(riskByCountry).filter(cc => riskByCountry[cc] > 20)]]}
                paint={{
                  'line-color': [
                    'match', ['get', 'iso_3166_1'],
                    ...Object.entries(riskByCountry).filter(([,v]) => v > 60).flatMap(([cc]) => [cc, '#BE1E3A']),
                    '#9A7517'
                  ],
                  'line-width': 1,
                  'line-opacity': 0.6,
                }}
              />
            </Source>
          )}

          {/* Chokepoint boxes — hover for name; click marker or box opens detail */}
          {layers.chokepoints && (
            <Source id="chokepoints" type="geojson" data={chokepointBoxesGeoJSON}>
              <Layer
                id="chokepoints-fill"
                type="fill"
                paint={{
                  'fill-color': MAP_ACCENT,
                  'fill-opacity': 0.06,
                }}
              />
              <Layer
                id="chokepoints-line"
                type="line"
                paint={{
                  'line-color': MAP_ACCENT,
                  'line-width': 1.25,
                  'line-opacity': 0.45,
                  'line-dasharray': [2, 2],
                }}
              />
            </Source>
          )}

          {/* Chokepoints — DOM markers; pressure from memoised compute */}
          {layers.chokepoints && chokepointPressure.map(cp => {
            const pressureColor = cp.pressure > 20 ? '#BE1E3A' : cp.pressure > 8 ? '#9A7517' : MAP_ACCENT
            const markerHovered = chokepointMarkerHover === cp.name
            return (
              <Marker key={cp.name} latitude={cp.lat} longitude={cp.lon}
                onClick={(e: { originalEvent: { stopPropagation: () => void } }) => { e.originalEvent.stopPropagation(); setMapPopup({ kind: 'chokepoint', name: cp.name, description: cp.description, lng: cp.lon, lat: cp.lat }) }}>
                <div
                  className="ui-chokepoint-marker"
                  onMouseEnter={() => setChokepointMarkerHover(cp.name)}
                  onMouseLeave={() => setChokepointMarkerHover(null)}
                >
                  {markerHovered && (
                    <div className="ui-chokepoint-marker__label">{cp.name}</div>
                  )}
                  <div className="ui-chokepoint-marker__dot" style={{ background: pressureColor, boxShadow: `0 0 0 3px ${pressureColor}40` }} />
                  {(cp.vesselCount > 0 || cp.aircraftCount > 0) && (
                    <div className="ui-chokepoint-marker__counts" style={{ background: pressureColor }}>
                      {cp.vesselCount > 0 && `${cp.vesselCount}V`}{cp.vesselCount > 0 && cp.aircraftCount > 0 && ' '}{cp.aircraftCount > 0 && `${cp.aircraftCount}A`}
                    </div>
                  )}
                </div>
              </Marker>
            )
          })}

          {/* Correlation alerts — GPU circle layers, no DOM per alert */}
          {layers.alerts && (
            <Source id="alerts-source" type="geojson" data={alertsGeoJSON}>
              {/* Outer glow — skip blur, use opacity fade instead (blur is expensive) */}
              <Layer id="alerts-glow" type="circle" paint={{
                'circle-radius': 20,
                'circle-color': ['match', ['get', 'severity'], 'critical', '#BE1E3A', 'high', '#C2691C', '#9A7517'],
                'circle-opacity': 0.15,
                'circle-blur': 0,
              }} />
              {/* Ring */}
              <Layer id="alerts-ring" type="circle" paint={{
                'circle-radius': 13,
                'circle-color': 'rgba(0,0,0,0)',
                'circle-stroke-width': 1.5,
                'circle-stroke-color': ['match', ['get', 'severity'], 'critical', '#BE1E3A', 'high', '#C2691C', '#9A7517'],
                'circle-stroke-opacity': 0.8,
              }} />
              {/* Core — clickable */}
              <Layer id="alerts-core" type="circle" paint={{
                'circle-radius': ['match', ['get', 'severity'], 'critical', 7, 6],
                'circle-color': ['match', ['get', 'severity'], 'critical', '#BE1E3A', 'high', '#C2691C', '#9A7517'],
                'circle-stroke-width': 2,
                'circle-stroke-color': 'white',
              }} />
            </Source>
          )}

          {/* Vessels — WebGL circle layer (handles thousands with zero lag) */}
          {liveEnabled.vessels && layers.vessels && (
            <Source id="vessels" type="geojson" data={vesselGeoJSON}>
              <Layer
                id="vessels-sanctioned-glow"
                type="circle"
                filter={['==', ['get', 'sanctioned'], true]}
                minzoom={3}
                paint={{
                  'circle-radius': 12,
                  'circle-color': '#BE1E3A',
                  'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 4, 0.18],
                  'circle-blur': 0.8,
                }}
              />
              <Layer
                id="vessels-layer"
                type="circle"
                paint={{
                  'circle-radius': ['match', ['get', 'colorKey'], 'sanctioned', 7, 5],
                  'circle-color': ['match', ['get', 'colorKey'],
                    'sanctioned', '#BE1E3A',
                    'military',   '#8B5CF6',
                    'tanker',     '#9A7517',
                    '#06B6D4',
                  ],
                  'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 0, 4.5, 1.5],
                  'circle-stroke-color': 'rgba(255,255,255,0.9)',
                  'circle-opacity': ['interpolate', ['linear'], ['zoom'], 2.5, 0, 3.5, 1],
                }}
              />
            </Source>
          )}

          {/* Vessel popup */}
          {selectedVessel && (
            <Popup
              latitude={selectedVessel.lat}
              longitude={selectedVessel.lon}
              closeButton
              closeOnClick={false}
              onClose={() => setSelectedVessel(null)}
              anchor="bottom"
              offset={[0, -8] as [number, number]}
            >
              <div style={{ padding: '10px 12px', minWidth: 210, maxWidth: 270, background: p.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: selectedVessel.sanctioned ? '#BE1E3A' : '#0891B2', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {selectedVessel.sanctioned ? 'SANCTIONED' : selectedVessel.ship_type}
                  </span>
                  <span style={{ fontSize: 9, color: p.muted, marginLeft: 'auto' }}>Flag: {selectedVessel.flag}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: p.text, marginBottom: 8 }}>{selectedVessel.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Row label="MMSI" value={selectedVessel.mmsi} p={p} mono />
                  <Row label="Speed" value={`${selectedVessel.speed.toFixed(1)} kn`} p={p} mono />
                  <Row label="Heading" value={`${Math.round(selectedVessel.heading)}°`} p={p} mono />
                  <Row label="Destination" value={selectedVessel.destination || '—'} p={p} />
                </div>
                {selectedVessel.sanctioned && (
                  <div style={{ marginTop: 8, padding: '5px 8px', background: '#F7E2E6', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', fontSize: 10, color: '#BE1E3A', fontWeight: 600 }}>
                    OFAC/SDN — Verify before engagement
                  </div>
                )}
              </div>
            </Popup>
          )}

          {/* Altitude sticks — vertical pillars showing baro altitude (3D when map is pitched) */}
          {liveEnabled.aviation && layers.aviation && (
            <Source id="altitude-sticks" type="geojson" data={altitudeSticksGeoJSON}>
              <Layer
                id="altitude-sticks-layer"
                type="line"
                minzoom={3}
                paint={{
                  'line-color': ['match', ['get', 'type'],
                    'drone',    'rgba(239,68,68,0.55)',
                    'military', 'rgba(139,92,246,0.35)',
                    'rgba(100,116,139,0.25)',
                  ],
                  'line-width': ['match', ['get', 'type'], 'drone', 1.5, 1],
                  'line-opacity': 0.9,
                }}
              />
            </Source>
          )}

          {/* Aviation — WebGL symbol layer with per-aircraft rotation (zero lag) */}
          {liveEnabled.aviation && layers.aviation && (
            <Source id="aircraft" type="geojson" data={aircraftGeoJSON}>
              <Layer
                id="aircraft-layer"
                type="symbol"
                minzoom={2.5}
                layout={{
                  'icon-image': ['match', ['get', 'type'],
                    'drone', 'drone-icon',
                    'aircraft-arrow',
                  ],
                  'icon-size': ['interpolate', ['linear'], ['zoom'],
                    2.5, ['match', ['get', 'type'], 'military', 0.5, 'drone', 0.55, 0.4],
                    5,   ['match', ['get', 'type'], 'military', 1.0, 'drone', 1.1,  0.78],
                  ],
                  'icon-rotate': ['get', 'track'],
                  'icon-rotation-alignment': 'map',
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                  'icon-pitch-alignment': 'map',
                }}
                paint={{
                  'icon-color': ['match', ['get', 'type'],
                    'drone',    '#EF4444',
                    'military', '#8B5CF6',
                    'cargo',    '#9A7517',
                    MAP_ACCENT,
                  ],
                  'icon-opacity': ['interpolate', ['linear'], ['zoom'],
                    2.5, 0,
                    3.5, ['case', ['get', 'on_ground'], 0.2, 0.9],
                  ],
                  'icon-halo-color': ['match', ['get', 'type'],
                    'drone',    '#EF4444',
                    'military', '#8B5CF6',
                    'cargo',    '#9A7517',
                    MAP_ACCENT,
                  ],
                  'icon-halo-width': ['match', ['get', 'type'], 'drone', 2, 1],
                  'icon-halo-blur': 0,
                }}
              />
            </Source>
          )}

          {/* Aircraft popup */}
          {selectedAircraft && (
            <Popup
              latitude={selectedAircraft.latitude}
              longitude={selectedAircraft.longitude}
              closeButton
              closeOnClick={false}
              onClose={() => setSelectedAircraft(null)}
              anchor="bottom"
              offset={[0, -8] as [number, number]}
            >
              <div style={{ padding: '10px 12px', minWidth: 210, maxWidth: 270, background: p.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 800,
                    color: selectedAircraft.type === 'drone' ? '#EF4444' : selectedAircraft.type === 'military' ? '#7C3AED' : selectedAircraft.type === 'cargo' ? '#9A7517' : '#64748B',
                    textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {selectedAircraft.type === 'drone' ? 'UAV / DRONE' : selectedAircraft.type}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: p.text, marginBottom: 8 }}>
                  {selectedAircraft.callsign || selectedAircraft.icao24}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Row label="ICAO24" value={selectedAircraft.icao24} p={p} mono />
                  <Row label="Country" value={selectedAircraft.origin_country} p={p} />
                  <Row label="Altitude" value={`${Math.round(selectedAircraft.baro_altitude).toLocaleString()} m`} p={p} mono />
                  <Row label="Speed" value={`${Math.round(selectedAircraft.velocity)} km/h`} p={p} mono />
                </div>
              </div>
            </Popup>
          )}

          {/* Safe cables */}
          {layers.cables && safeCables && (
            <Source id="submarine-cables" type="geojson" data={safeCables}>
              <Layer id="submarine-cables-layer" type="line" paint={{
                'line-color': ['coalesce', ['get', 'color'], '#6366f1'],
                'line-width': 1, 'line-opacity': 0.5,
              }} />
              <Layer id="submarine-cables-hit" type="line" paint={{ 'line-width': 12, 'line-opacity': 0 }} />
            </Source>
          )}

          {/* Threatened cables — red highlight */}
          {layers.cables && threatenedCables && (
            <Source id="submarine-cables-threatened" type="geojson" data={threatenedCables}>
              <Layer id="submarine-cables-threatened" type="line" paint={{
                'line-color': '#BE1E3A',
                'line-width': 2,
                'line-opacity': 0.85,
              }} />
              <Layer id="submarine-cables-threatened-hit" type="line" paint={{ 'line-width': 12, 'line-opacity': 0 }} />
            </Source>
          )}

          {/* Landing points */}
          {layers.landingPoints && landingPointsGeoJSON && (
            <Source id="landing-points" type="geojson" data={landingPointsGeoJSON}>
              <Layer id="landing-points-hit" type="circle" paint={{ 'circle-radius': 14, 'circle-opacity': 0, 'circle-stroke-width': 0 }} />
              <Layer id="landing-points-layer" type="circle" paint={{
                'circle-radius': ['interpolate', ['linear'], ['get', 'cable_count'], 1, 3, 3, 4.5, 6, 6, 10, 8],
                'circle-color': '#1e293b',
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#ffffff',
                'circle-opacity': 0.9,
              }} />
            </Source>
          )}

          {/* Highlighted cable — glowing outline on top of all other layers */}
          {highlightedCable && highlightedCable.features.length > 0 && (
            <Source id="cable-highlight" type="geojson" data={highlightedCable}>
              {/* Outer glow */}
              <Layer id="cable-highlight-glow" type="line" paint={{
                'line-color': '#facc15',
                'line-width': 10,
                'line-opacity': 0.25,
                'line-blur': 4,
              }} />
              {/* Bright core */}
              <Layer id="cable-highlight-core" type="line" paint={{
                'line-color': '#facc15',
                'line-width': 3,
                'line-opacity': 1,
              }} />
            </Source>
          )}

          {/* Popups for cables / landing points / chokepoints */}
          {mapPopup && (
            <Popup
              latitude={mapPopup.lat}
              longitude={mapPopup.lng}
              closeButton
              closeOnClick={false}
              onClose={() => setMapPopup(null)}
              anchor="bottom"
              offset={[0, -8] as [number, number]}
            >
              {mapPopup.kind === 'chokepoint' && (() => {
                const cpVessels = vesselPositions.filter(v => haversineDistance(v.lat, v.lon, mapPopup.lat, mapPopup.lng) < 200)
                const cpAircraft = aircraft.filter(a => a.type === 'military' && haversineDistance(a.latitude, a.longitude, mapPopup.lat, mapPopup.lng) < 250)
                const cpSanctioned = cpVessels.filter(v => v.sanctioned)
                return (
                  <div style={{ padding: '10px 12px', minWidth: 220, maxWidth: 280, background: p.bg }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: MAP_ACCENT, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>Strategic Chokepoint</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: p.text, marginBottom: 5 }}>{mapPopup.name}</div>
                    <div style={{ fontSize: 11, color: p.sub, lineHeight: 1.5, marginBottom: 8 }}>{mapPopup.description}</div>
                    {(cpVessels.length > 0 || cpAircraft.length > 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 8, borderTop: `1px solid ${p.border}` }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: p.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live Activity</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {cpVessels.length > 0 && (
                            <div style={{ flex: 1, background: p.track, borderRadius: 'var(--radius-sm)', padding: '5px 7px' }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#0891B2', fontFamily: 'monospace' }}>{cpVessels.length}</div>
                              <div style={{ fontSize: 9, color: p.muted }}>Vessels</div>
                            </div>
                          )}
                          {cpAircraft.length > 0 && (
                            <div style={{ flex: 1, background: p.track, borderRadius: 'var(--radius-sm)', padding: '5px 7px' }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#8B5CF6', fontFamily: 'monospace' }}>{cpAircraft.length}</div>
                              <div style={{ fontSize: 9, color: p.muted }}>Mil. Aircraft</div>
                            </div>
                          )}
                          {cpSanctioned.length > 0 && (
                            <div style={{ flex: 1, background: '#F7E2E6', borderRadius: 'var(--radius-sm)', padding: '5px 7px' }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#BE1E3A', fontFamily: 'monospace' }}>{cpSanctioned.length}</div>
                              <div style={{ fontSize: 9, color: '#BE1E3A' }}>Sanctioned</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {mapPopup.kind === 'cable' && (
                <div style={{ padding: '10px 12px', minWidth: 220, maxWidth: 280, background: p.bg }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: threatenedCableIds.has(mapPopup.id) ? '#BE1E3A' : '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {threatenedCableIds.has(mapPopup.id) ? 'At-Risk Cable' : 'Submarine Cable'}
                    </div>
                    {threatenedCableIds.has(mapPopup.id) && (
                      <div style={{ fontSize: 9, background: '#F7E2E6', color: '#BE1E3A', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', padding: '1px 5px', fontWeight: 700 }}>THREAT ZONE</div>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: p.text, marginBottom: 8 }}>{mapPopup.name}</div>
                  {cableInfoLoading && <div style={{ fontSize: 11, color: p.muted }}>Loading details…</div>}
                  {cableInfo && !cableInfoLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {cableInfo.length && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 10, color: p.muted }}>Length</span><span style={{ fontSize: 10, fontWeight: 600, color: p.sub }}>{cableInfo.length}</span></div>}
                      {cableInfo.rfs && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 10, color: p.muted }}>Ready for Service</span><span style={{ fontSize: 10, fontWeight: 600, color: p.sub }}>{cableInfo.rfs}</span></div>}
                      {cableInfo.is_planned && <div style={{ fontSize: 10, color: '#9A7517', fontWeight: 600 }}>Planned / Under Construction</div>}
                      {cableInfo.landing_points && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 10, color: p.muted }}>Landing Points</span><span style={{ fontSize: 10, fontWeight: 600, color: p.sub }}>{cableInfo.landing_points.length}</span></div>}
                      {cableInfo.owners && (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 9, color: p.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Owners</div>
                          <div style={{ fontSize: 10, color: p.sub, lineHeight: 1.5 }}>
                            {Array.isArray(cableInfo.owners)
                              ? cableInfo.owners.slice(0, 4).join(', ') + (cableInfo.owners.length > 4 ? ` +${cableInfo.owners.length - 4} more` : '')
                              : String(cableInfo.owners)}
                          </div>
                        </div>
                      )}
                      {cableInfo.url && (
                        <a href={cableInfo.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: MAP_ACCENT, marginTop: 4, textDecoration: 'none' }}>View details →</a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {mapPopup.kind === 'landing' && (
                <div style={{ padding: '10px 12px', minWidth: 200, maxWidth: 260, background: p.bg }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#0891B2', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                    Landing Station · {mapPopup.cable_count} cable{mapPopup.cable_count !== 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {mapPopup.cables.map((c, i) => (
                      <div key={i} style={{ fontSize: 11, color: p.sub, lineHeight: 1.4 }}>{c}</div>
                    ))}
                    {mapPopup.cable_count > mapPopup.cables.length && (
                      <div style={{ fontSize: 10, color: p.muted, marginTop: 2 }}>+{mapPopup.cable_count - mapPopup.cables.length} more</div>
                    )}
                  </div>
                </div>
              )}

              {mapPopup.kind === 'alert' && (() => {
                const sevColor = mapPopup.severity === 'critical' ? '#BE1E3A' : mapPopup.severity === 'high' ? '#C2691C' : '#9A7517'
                return (
                  <div style={{ padding: '10px 12px', minWidth: 230, maxWidth: 290, background: p.bg }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: sevColor, boxShadow: `0 0 6px ${sevColor}` }} />
                      <span style={{ fontSize: 9, fontWeight: 800, color: sevColor, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{mapPopup.severity}</span>
                      <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#CBD5E1', display: 'inline-block' }} />
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{mapPopup.pattern}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: p.text, lineHeight: 1.4, marginBottom: 6 }}>{mapPopup.title}</div>
                    <div style={{ fontSize: 11, color: p.sub, lineHeight: 1.5, marginBottom: 8 }}>{mapPopup.summary}</div>
                    {/* Signals */}
                    {mapPopup.signals.length > 0 && (
                      <div style={{ marginBottom: 8, padding: '6px 8px', background: p.row, borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ fontSize: 9, color: p.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Correlated Signals</div>
                        {mapPopup.signals.slice(0, 3).map((s, i) => (
                          <div key={i} style={{ fontSize: 10, color: p.sub, lineHeight: 1.4, display: 'flex', gap: 5 }}>
                            <span style={{ color: sevColor, flexShrink: 0 }}>›</span>{s}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: `1px solid ${p.border}` }}>
                      <span style={{ fontSize: 10, color: p.muted }}>{mapPopup.countries.slice(0, 3).join(', ')}</span>
                      <span style={{ fontSize: 9, color: p.muted, fontFamily: 'monospace' }}>
                        {mapPopup.signalCount} signal{mapPopup.signalCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </Popup>
          )}

          {/* Nearby-event focus ring (200 km) */}
          {focusCircleGeo && (
            <Source id="map-focus-circle" type="geojson" data={focusCircleGeo}>
              <Layer
                id="map-focus-circle-fill"
                type="fill"
                paint={{ 'fill-color': MAP_ACCENT, 'fill-opacity': 0.07 }}
              />
              <Layer
                id="map-focus-circle-line"
                type="line"
                paint={{
                  'line-color': MAP_ACCENT,
                  'line-width': 2,
                  'line-opacity': 0.5,
                  'line-dasharray': [3, 2],
                }}
              />
            </Source>
          )}

          {/* Event clusters + individual points */}
          <Source
            id="events"
            type="geojson"
            data={eventsGeoJSON}
            cluster
            clusterMaxZoom={7}
            clusterRadius={48}
          >
            {/* Threat density heatmap — shows when layer enabled, fades above zoom 7 */}
            {layers.threatDensity ? [
              <Layer
                key="events-heatmap"
                id="events-heatmap"
                type="heatmap"
                filter={['!', ['has', 'point_count']]}
                paint={{
                  'heatmap-weight': ['interpolate', ['linear'], ['get', 'severityWeight'], 1, 0.3, 4, 1],
                  'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 8, 3],
                  'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 20, 5, 40, 8, 60],
                  'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0,   'rgba(61,124,102,0)',
                    0.2, 'rgba(61,124,102,0.5)',
                    0.4, 'rgba(154,117,23,0.7)',
                    0.6, 'rgba(194,105,28,0.85)',
                    0.8, 'rgba(190,30,58,0.9)',
                    1.0, 'rgba(127,29,29,1)',
                  ],
                  'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 8, 0.4, 10, 0],
                }}
              />,
              <Layer
                key="events-heatmap-point"
                id="events-heatmap-point"
                type="circle"
                filter={['!', ['has', 'point_count']]}
                minzoom={6}
                paint={{
                  'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2, 9, 5],
                  'circle-color': ['match', ['get', 'severity'],
                    'critical', '#BE1E3A', 'high', '#C2691C', 'medium', '#9A7517', '#3D7C66'],
                  'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 8, 0.8],
                  'circle-stroke-width': 1,
                  'circle-stroke-color': 'rgba(255,255,255,0.7)',
                }}
              />,
            ] : null}

            {/* Cluster outer glow */}
            <Layer
              id="events-cluster-glow"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-radius': ['step', ['get', 'point_count'], 26, 10, 34, 40, 44],
                'circle-color': ['step', ['get', 'point_count'], MAP_ACCENT, 10, '#9A7517', 40, '#BE1E3A'],
                'circle-opacity': 0.15,
              }}
            />
            {/* Cluster main circle */}
            <Layer
              id="events-cluster"
              type="circle"
              filter={['has', 'point_count']}
              paint={{
                'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 40, 32],
                'circle-color': ['step', ['get', 'point_count'], MAP_ACCENT, 10, '#9A7517', 40, '#BE1E3A'],
                'circle-opacity': 0.9,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': 'rgba(255,255,255,0.6)',
              }}
            />
            {/* Cluster count label */}
            <Layer
              id="events-cluster-count"
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'text-field': '{point_count_abbreviated}',
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 12,
              }}
              paint={{ 'text-color': '#ffffff' }}
            />
            {/* Critical event outer halo */}
            <Layer
              id="events-critical-halo"
              type="circle"
              filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'severity'], 'critical']]}
              paint={{
                'circle-radius': 15,
                'circle-color': '#BE1E3A',
                'circle-opacity': 0.18,
                'circle-stroke-width': 0,
              }}
            />
            {/* High event soft halo */}
            <Layer
              id="events-high-halo"
              type="circle"
              filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'severity'], 'high']]}
              paint={{
                'circle-radius': 11,
                'circle-color': '#C2691C',
                'circle-opacity': 0.12,
                'circle-stroke-width': 0,
              }}
            />
            {/* Individual event dot — size encodes severity for at-a-glance triage */}
            <Layer
              id="events-point"
              type="circle"
              filter={['!', ['has', 'point_count']]}
              paint={{
                'circle-radius': ['match', ['get', 'severity'], 'critical', 10, 'high', 7, 'medium', 5, 3.5],
                'circle-color': ['match', ['get', 'severity'],
                  'critical', '#BE1E3A', 'high', '#C2691C', 'medium', '#9A7517', '#3D7C66'],
                'circle-opacity': highlightedAlertId
                  ? 0.15
                  : ['match', ['get', 'severity'], 'critical', 1.0, 'high', 0.90, 'medium', 0.80, 0.65],
                'circle-stroke-width': ['match', ['get', 'severity'], 'critical', 2.5, 'high', 1.5, 'medium', 1, 0.5],
                'circle-stroke-color': 'rgba(255,255,255,0.9)',
              }}
            />
            {/* NLQ results — dim all non-matched, bright ring on matched */}
            {eventHighlightIds.length > 0 ? [
              <Layer
                key="events-nlq-dim"
                id="events-nlq-dim"
                type="circle"
                filter={['all', ['!', ['has', 'point_count']], ['!', ['in', ['get', 'id'], ['literal', eventHighlightIds]]]]}
                paint={{ 'circle-radius': ['match', ['get', 'severity'], 'critical', 10, 'high', 7, 'medium', 5, 3.5], 'circle-color': ['match', ['get', 'severity'], 'critical', '#BE1E3A', 'high', '#C2691C', 'medium', '#9A7517', '#3D7C66'], 'circle-opacity': 0.12, 'circle-stroke-width': 0 }}
              />,
              <Layer
                key="events-nlq-ring"
                id="events-nlq-ring"
                type="circle"
                filter={['all', ['!', ['has', 'point_count']], ['in', ['get', 'id'], ['literal', eventHighlightIds]]]}
                paint={{ 'circle-radius': 18, 'circle-color': MAP_ACCENT, 'circle-opacity': 0.18, 'circle-stroke-width': 2, 'circle-stroke-color': MAP_ACCENT }}
              />,
              <Layer
                key="events-nlq-dot"
                id="events-nlq-dot"
                type="circle"
                filter={['all', ['!', ['has', 'point_count']], ['in', ['get', 'id'], ['literal', eventHighlightIds]]]}
                paint={{ 'circle-radius': ['match', ['get', 'severity'], 'critical', 11, 'high', 8, 'medium', 6, 4.5], 'circle-color': ['match', ['get', 'severity'], 'critical', '#BE1E3A', 'high', '#C2691C', 'medium', '#9A7517', '#3D7C66'], 'circle-opacity': 1, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#FFFFFF' }}
              />,
            ] : null}

            {/* Alert drill-down: brighten events in alerted countries */}
            {highlightedAlertId && (() => {
              const alert = alerts.find(a => a.id === highlightedAlertId)
              if (!alert) return null
              return (
                <Layer
                  id="events-drill-highlight"
                  type="circle"
                  filter={['all',
                    ['!', ['has', 'point_count']],
                    ['in', ['get', 'country'], ['literal', alert.countries]],
                  ]}
                  paint={{
                    'circle-radius': ['match', ['get', 'severity'], 'critical', 10, 'high', 8, 6],
                    'circle-color': ['match', ['get', 'severity'],
                      'critical', '#BE1E3A', 'high', '#C2691C', 'medium', '#9A7517', '#3D7C66'],
                    'circle-opacity': 1,
                    'circle-stroke-width': 2.5,
                    'circle-stroke-color': '#FFFFFF',
                  }}
                />
              )
            })()}
          </Source>

          {/* Event popup — hover preview only; click opens EventDetailPanel */}
          {hoveredEvent && !selectedEvent && (() => {
            const ev = hoveredEvent
            return (
              <Popup
                latitude={ev.lat}
                longitude={ev.lon}
                closeButton={false}
                closeOnClick={false}
                onClose={() => setSelectedEvent(null)}
                anchor="bottom"
                offset={[0, -10] as [number, number]}
              >
                <div style={{ minWidth: 220, maxWidth: 280, padding: '10px 12px', background: p.bg }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: SEVERITY_COLORS[ev.severity], textTransform: 'uppercase', letterSpacing: '0.1em' }}>{ev.severity}</span>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: p.border, display: 'inline-block' }} />
                    <span style={{ fontSize: 9, color: p.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{ev.source}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: p.text, lineHeight: 1.4, marginBottom: 5 }}>{ev.title}</div>
                  <div style={{ fontSize: 11, color: p.sub, lineHeight: 1.5, marginBottom: 9 }}>{ev.summary?.replace(/<[^>]*>/g,' ').replace(/&\w+;/g,' ').replace(/\s{2,}/g,' ').trim()}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: `1px solid ${p.border}` }}>
                    <span style={{ fontSize: 10, color: p.muted }}>{displayCountry(ev.country)} · {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}</span>
                    {ev.fatalities && <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: '#BE1E3A' }}>{ev.fatalities} KIA</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
                    {ev.url ? (
                      <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: MAP_ACCENT, textDecoration: 'none' }}>
                        Source →
                      </a>
                    ) : <span />}
                    <button
                      onClick={() => setSelectedEvent(ev)}
                      style={{ fontSize: 10, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                    >
                      Open Details →
                    </button>
                  </div>
                </div>
              </Popup>
            )
          })()}

          {/* Geocoder highlight — bbox outline + pulsing center marker + action card */}
          {geoHighlight && (() => {
            const hl = geoHighlight
            const hlColor = MAP_ACCENT
            const hlFill  = 'rgba(37,99,235,0.07)'
            const hlLine  = 'rgba(37,99,235,0.65)'
            const cardBg  = 'rgba(255,255,255,0.97)'
            const cardBorder = '#E2E8F0'

            // Prefer actual polygon shape (Nominatim), fall back to bbox rectangle, then nothing
            const shapeGeometry: GeoJSON.Geometry | null =
              (hl.geometry?.type === 'Polygon' || hl.geometry?.type === 'MultiPolygon')
                ? hl.geometry
                : hl.bbox ? {
                    type: 'Polygon',
                    coordinates: [[
                      [hl.bbox[0], hl.bbox[1]], [hl.bbox[2], hl.bbox[1]],
                      [hl.bbox[2], hl.bbox[3]], [hl.bbox[0], hl.bbox[3]],
                      [hl.bbox[0], hl.bbox[1]],
                    ]],
                  }
                : null

            const bboxPoly: GeoJSON.FeatureCollection | null = shapeGeometry ? {
              type: 'FeatureCollection',
              features: [{ type: 'Feature', geometry: shapeGeometry, properties: {} }],
            } : null

            const isRealShape = hl.geometry?.type === 'Polygon' || hl.geometry?.type === 'MultiPolygon'

            const shortName = hl.place_name.split(',')[0].trim()

            return (
              <>
                {bboxPoly && (
                  <Source id="geo-highlight" type="geojson" data={bboxPoly}>
                    <Layer id="geo-highlight-fill" type="fill"
                      paint={{
                        'fill-color': hlFill,
                        'fill-opacity': isRealShape ? 1 : 1,
                        // Real shapes get a slightly stronger fill; bbox rectangle stays very subtle
                      }} />
                    <Layer id="geo-highlight-line" type="line"
                      paint={{
                        'line-color': hlLine,
                        'line-width': isRealShape ? 2.5 : 1.5,
                        'line-dasharray': isRealShape ? [1, 0] : [6, 3], // solid border for real shapes, dashed for bbox
                      }} />
                  </Source>
                )}

                <Marker latitude={hl.center[1]} longitude={hl.center[0]}>
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Ripple rings */}
                    <div style={{
                      position: 'absolute', width: 20, height: 20, borderRadius: '50%',
                      background: hlColor, opacity: 0.35,
                      animation: 'argus-ripple 2s ease-out infinite', pointerEvents: 'none',
                    }} />
                    <div style={{
                      position: 'absolute', width: 20, height: 20, borderRadius: '50%',
                      background: hlColor, opacity: 0.25,
                      animation: 'argus-ripple2 2s ease-out 0.5s infinite', pointerEvents: 'none',
                    }} />
                    {/* Center dot */}
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: hlColor, border: '2.5px solid white',
                      boxShadow: `0 0 0 3px ${hlColor}55, 0 2px 8px rgba(0,0,0,0.35)`,
                      animation: 'argus-pin-in 0.35s ease-out both',
                      position: 'relative', zIndex: 2, flexShrink: 0,
                    }} />

                    {/* Action card */}
                    <div style={{
                      marginTop: 10,
                      background: cardBg,
                      border: `1px solid ${cardBorder}`,
                      borderTop: `2px solid ${hlColor}`,
                      borderRadius: 'var(--radius-lg)',
                      boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
                      backdropFilter: 'blur(10px)',
                      animation: 'argus-pin-in 0.4s ease-out 0.05s both',
                      minWidth: 180, maxWidth: 240,
                      overflow: 'hidden',
                    }}>
                      {/* Place name */}
                      <div style={{ padding: '8px 12px 6px', borderBottom: `1px solid ${cardBorder}` }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: hlColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {shortName}
                        </div>
                        {hl.place_name.includes(',') && (
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {hl.place_name.split(',').slice(1).join(',').trim()}
                          </div>
                        )}
                        {hl.note && (
                          <div style={{ marginTop: 5 }}>
                            <div style={{ fontSize: 11, color: MAP_ACCENT, fontStyle: 'italic', lineHeight: 1.3 }}>
                              {hl.note}
                            </div>
                            <div style={{
                              marginTop: 4, fontSize: 11, color: '#B45309',
                              background: 'rgba(180,83,9,0.07)',
                              border: `1px solid ${'rgba(180,83,9,0.2)'}`,
                              borderRadius: 'var(--radius-sm)', padding: '3px 5px', lineHeight: 1.4,
                            }}>
                              ⚠ If this boundary looks wrong per Government of India, report it to your admin.
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Plot tools */}
                      <div style={{ borderTop: `1px solid ${cardBorder}` }}>
                        <div style={{ padding: '5px 8px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
                          Plot as
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 3, padding: '0 7px 7px' }}>
                          {/* Point — drops pin at center */}
                          {([
                            { mode: 'point',        label: 'Pin',  icon: <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> },
                            { mode: 'zone',         label: 'Zone', icon: <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/></svg> },
                            { mode: 'draw',         label: 'Draw', icon: <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg> },
                            { mode: 'zone-builder', label: 'Area', icon: <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><rect x="3" y="3" width="18" height="18" rx="2"/></svg> },
                          ] as { mode: string; label: string; icon: React.ReactNode }[]).map(({ mode, label, icon }) => (
                            <button
                              key={mode}
                              onClick={() => {
                                if (mode === 'point') {
                                  setPlotDrop({ lng: hl.center[0], lat: hl.center[1] })
                                  setPlotLabel(shortName)
                                  setPlottingMode('none')
                                } else {
                                  setPlotLabel(shortName)
                                  setPlottingMode(mode as typeof plottingMode)
                                }
                                setGeoHighlight(null)
                              }}
                              style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                padding: '5px 2px', border: `1px solid ${cardBorder}`, borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer', background: 'none', color: hlColor,
                                transition: 'background 100ms',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.07)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              {icon}
                              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
                            </button>
                          ))}
                        </div>
                        {/* Save boundary polygon directly as a plot */}
                        {hl.geometry && (hl.geometry.type === 'Polygon' || hl.geometry.type === 'MultiPolygon') && (
                          <button
                            disabled={geoSaving}
                            onClick={async () => {
                              const pts = extractAndSimplify(hl.geometry!, hl.bbox)
                              if (!pts) return
                              setGeoSaving(true)
                              try {
                                const coords = pts as number[][]
                                const result = await createPlot('polygon', coords, shortName, {
                                  category: 'political',
                                  threat_level: 'info',
                                  confidence: 'confirmed',
                                  ai_include: true,
                                  notes: `Boundary: ${hl.place_name}${hl.note ? `\nSource: ${hl.note}` : ''}`,
                                })
                                if (result) addPlotToStore(result)
                                setGeoHighlight(null)
                              } finally {
                                setGeoSaving(false)
                              }
                            }}
                            style={{
                              width: '100%', padding: '6px 8px', background: 'none',
                              borderTop: `1px solid ${cardBorder}`, border: 'none',
                              cursor: geoSaving ? 'wait' : 'pointer', fontSize: 10, fontWeight: 600,
                              color: hlColor,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                              opacity: geoSaving ? 0.6 : 1,
                            }}
                            onMouseEnter={e => { if (!geoSaving) e.currentTarget.style.background = 'rgba(37,99,235,0.07)' }}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                            {geoSaving ? 'Saving…' : 'Save boundary as plot'}
                          </button>
                        )}
                        <button
                          onClick={() => setGeoHighlight(null)}
                          style={{
                            width: '100%', padding: '6px 8px', background: 'none',
                            borderTop: `1px solid ${cardBorder}`, border: 'none',
                            cursor: 'pointer', fontSize: 10, fontWeight: 600,
                            color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          Clear highlight
                        </button>
                      </div>
                    </div>
                  </div>
                </Marker>
              </>
            )
          })()}

          <PlotsLayer />
          </>}
        </Map>
      <OnboardingBanner />
      <MapQueryBar />
      <LayerControls />
      {mapFocusLabel && (
        <div className="ui-map-focus-banner">
          <span>{mapFocusLabel}</span>
          <button type="button" className="ui-map-focus-banner__dismiss" onClick={() => clearMapFocusHighlights()} aria-label="Clear map highlight">
            ×
          </button>
        </div>
      )}
      {/* Filter status chip — only shown when at least one filter is active */}
      {(eventFilter !== 'all' || severityFilter !== 'all' || dateFilter !== 'all' || searchQuery) && (
        <div style={{
          position: 'absolute', bottom: 196, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '5px 14px',
          fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.14)',
          pointerEvents: 'auto',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ color: MAP_ACCENT, fontWeight: 800 }}>{filteredEvents.length}</span>
          <span style={{ color: 'var(--text-muted)' }}>of {events.length} events</span>
          {eventFilter !== 'all' && <span style={{ fontSize: 9, background: 'var(--accent-tint)', color: MAP_ACCENT, border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)', padding: '1px 6px' }}>{eventFilter}</span>}
          {severityFilter !== 'all' && <span style={{ fontSize: 9, background: '#F7E2E6', color: '#BE1E3A', border: '1px solid #FECACA', borderRadius: 'var(--radius-lg)', padding: '1px 6px' }}>{severityFilter}</span>}
          {dateFilter !== 'all' && <span style={{ fontSize: 9, background: '#E0EDE8', color: '#3D7C66', border: '1px solid #BBF7D0', borderRadius: 'var(--radius-lg)', padding: '1px 6px' }}>{dateFilter}</span>}
          {searchQuery && <span style={{ fontSize: 9, background: '#FEFCE8', color: '#CA8A04', border: '1px solid #FDE68A', borderRadius: 'var(--radius-lg)', padding: '1px 6px' }}>"{searchQuery}"</span>}
          <button
            onClick={clearEventFilters}
            style={{ marginLeft: 2, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1px 8px', cursor: 'pointer', fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}
          >
            Clear
          </button>
        </div>
      )}
    </div>

    {/* ── Map → Canvas context menu ────────────────────────────────────────── */}
    {contextMenu && (
      <div
        style={{
          position: 'fixed',
          left: contextMenu.x,
          top: contextMenu.y,
          zIndex: 9000,
          background: '#ffffff',
          border: `1px solid ${'rgba(0,0,0,0.1)'}`,
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
          minWidth: 210,
          overflow: 'hidden',
          userSelect: 'none',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Event label */}
        <div style={{
          padding: '9px 12px 7px',
          borderBottom: `1px solid ${'rgba(0,0,0,0.07)'}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3b82f6', marginBottom: 3 }}>
            {contextMenu.event.category}
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: '#0f172a',
            lineHeight: 1.35,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {contextMenu.event.title}
          </div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>
            {displayCountry(contextMenu.event.country)}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: 4 }}>
          <button
            onClick={() => sendToCanvas(contextMenu.event)}
            style={{
              width: '100%', textAlign: 'left', padding: '7px 10px',
              borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: '#0f172a',
              fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>⬡</span>
            Send to Canvas
          </button>
          <button
            onClick={() => { setSelectedEvent(contextMenu.event); setContextMenu(null) }}
            style={{
              width: '100%', textAlign: 'left', padding: '7px 10px',
              borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              background: 'transparent',
              color: '#64748b',
              fontSize: 11, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>◎</span>
            View Details
          </button>
        </div>
      </div>
    )}

    {/* Click-outside overlay to close context menu */}
    {contextMenu && (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 8999 }}
        onClick={() => setContextMenu(null)}
        onContextMenu={e => { e.preventDefault(); setContextMenu(null) }}
      />
    )}
    </>
  )
}

function Row({ label, value, p, mono }: { label: string; value: string; p: Record<string, string>; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 9, color: p.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span className={mono ? 'font-mono' : ''} style={{ fontSize: 10, fontWeight: 600, color: p.sub }}>{value}</span>
    </div>
  )
}
