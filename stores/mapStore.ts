import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { startTransition } from 'react'
import { IntelEvent, CorrelationAlert, Situation, VesselPosition, AircraftPosition } from '@/types'
import type { EvidenceView } from '@/lib/journalView'

export interface AppToast {
  id: string
  title: string
  body: string
  severity: 'critical' | 'high' | 'medium' | 'info'
  type: 'watch-rule' | 'critical-event' | 'correlation' | 'system' | 'vessel-anomaly' | 'aircraft-anomaly'
  timestamp: string
  eventId?: string
  ruleId?: string
}

interface Viewport {
  latitude: number
  longitude: number
  zoom: number
  pitch: number
  bearing: number
}

interface Layers {
  events: boolean
  disasters: boolean
  chokepoints: boolean
  alerts: boolean
  aviation: boolean
  vessels: boolean
  cables: boolean
  landingPoints: boolean
  pipelines: boolean
  plots: boolean
  riskHeatmap: boolean
  threatDensity: boolean
  terrain: boolean
}

export interface Panels {
  eventFeed: boolean
  country: boolean
  alerts: boolean
  commandBar: boolean
  authModal: boolean
  anomaly: boolean
  timeline: boolean
  connectors: boolean
  export: boolean
  briefHistory: boolean
  overview: boolean
  settings: boolean
  incidents: boolean
  watchRules: boolean
  topic: boolean
  scrubber: boolean
  plotsPanel: boolean
  velocity: boolean
  forecasts: boolean
  canvas: boolean
  ledger: boolean
  cases: boolean
  actors: boolean
  threads: boolean
  monitor: boolean
  journal: boolean
  menu: boolean
}

interface MapStore {
  viewport: Viewport
  selectedCountry: string | null
  selectedCountryCode: string | null
  selectedEvent: IntelEvent | null
  events: IntelEvent[]
  alerts: CorrelationAlert[]
  situations: Situation[]
  vesselPositions: VesselPosition[]
  selectedVessel: VesselPosition | null
  selectedAircraft: AircraftPosition | null
  flaggedAlerts: Record<string, { note: string; flaggedAt: string }>
  layers: Layers
  panels: Panels
  eventFilter: string
  severityFilter: string
  dateFilter: string
  searchQuery: string
  plottingMode: 'none' | 'point' | 'zone' | 'draw' | 'zone-builder'
  pendingPlotGeometry: unknown
  flyTo: (lat: number, lon: number, zoom?: number) => void
  setViewport: (viewport: Partial<Viewport>) => void
  setSelectedCountry: (name: string, code: string) => void
  clearSelection: () => void
  toggleLayer: (key: keyof Layers) => void
  togglePanel: (key: keyof Panels) => void
  closeAllPanels: () => void
  clearProjectData: () => void
  setEvents: (events: IntelEvent[]) => void
  addEvent: (event: IntelEvent) => void
  removeEvent: (id: string) => void
  setAlerts: (alerts: CorrelationAlert[]) => void
  dismissAlert: (id: string) => void
  setSituations: (situations: Situation[]) => void
  setEventFilter: (filter: string) => void
  setSeverityFilter: (f: string) => void
  setDateFilter: (f: string) => void
  setSearchQuery: (q: string) => void
  clearEventFilters: () => void
  setPlottingMode: (mode: MapStore['plottingMode']) => void
  setPendingPlotGeometry: (geo: unknown) => void
  setSelectedEvent: (event: IntelEvent | null) => void
  setSelectedVessel: (v: VesselPosition | null) => void
  setSelectedAircraft: (a: AircraftPosition | null) => void
  flagAlert: (id: string, note: string) => void
  unflagAlert: (id: string) => void
  escalateAlert: (id: string) => void
  threatenedCableData: { id: string; name: string; lat: number; lon: number }[]
  setThreatenedCableData: (cables: { id: string; name: string; lat: number; lon: number }[]) => void
  highlightedCableId: string | null
  setHighlightedCableId: (id: string | null) => void
  _flyToCallback: ((lat: number, lon: number, zoom?: number) => void) | null
  setFlyToCallback: (cb: (lat: number, lon: number, zoom?: number) => void) => void
  liveStatus: 'connected' | 'reconnecting' | 'disconnected'
  setLiveStatus: (status: MapStore['liveStatus']) => void
  highlightedAlertId: string | null
  setHighlightedAlertId: (id: string | null) => void
  toasts: AppToast[]
  notificationHistory: AppToast[]
  pushToast: (toast: Omit<AppToast, 'id' | 'timestamp'>) => void
  dismissToast: (id: string) => void
  clearAllToasts: () => void
  unreadToastCount: number
  clearToastBadge: () => void
  clearNotificationHistory: () => void
  // Situation monitor — derived change signals (session-level, capped)
  monitorSignals: import('@/lib/monitor').MonitorSignal[]
  /** Returns only the signals that were NEW (not already logged) — callers toast just those. */
  addMonitorSignals: (signals: import('@/lib/monitor').MonitorSignal[]) => import('@/lib/monitor').MonitorSignal[]
  markMonitorSeen: () => void
  clearMonitorSignals: () => void
  monitorUnseen: number
  eventsLoading: boolean
  setEventsLoading: (loading: boolean) => void
  liveCoverage: 'focused' | 'global'  // vessel/aircraft coverage scope (per active project)
  setLiveCoverage: (c: 'focused' | 'global') => void
  // Per-project live layer prefs (synced from project.liveLayers on open).
  liveTrackingCaps: { vessels: boolean; aviation: boolean }
  setLiveTrackingCaps: (c: { vessels: boolean; aviation: boolean }) => void
  // Timeline playback
  playback: { active: boolean; time: string | null; playing: boolean; speed: number }
  setPlaybackTime: (time: string | null) => void
  setPlaybackPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setPlaybackActive: (active: boolean) => void
  // Historical positions for playback (populated by usePlaybackTracks)
  historicalVessels: VesselPosition[]
  historicalAircraft: AircraftPosition[]
  trackTimestamps: { vessels: string[]; aircraft: string[] }
  setHistoricalVessels: (v: VesselPosition[]) => void
  setHistoricalAircraft: (a: AircraftPosition[]) => void
  setTrackTimestamps: (t: { vessels: string[]; aircraft: string[] }) => void
  nlqHighlightIds: string[]
  nlqSummary: string | null
  setNlqHighlights: (ids: string[], summary: string | null) => void
  clearNlqHighlights: () => void
  /** Event-detail "Map" action — highlights nearby events without clearing NLQ. */
  mapFocusHighlightIds: string[]
  mapFocusLabel: string | null
  mapFocusCircle: { lat: number; lon: number; radiusKm: number } | null
  setMapFocusHighlights: (
    ids: string[],
    label: string | null,
    circle?: { lat: number; lon: number; radiusKm: number } | null,
  ) => void
  clearMapFocusHighlights: () => void
  briefHistoryTab: 'briefs' | 'nlq'
  setBriefHistoryTab: (tab: 'briefs' | 'nlq') => void
  openBriefHistory: (tab?: 'briefs' | 'nlq') => void
  journalTab: 'entries' | 'hypotheses' | 'patterns'
  openJournal: (tab?: 'entries' | 'hypotheses' | 'patterns') => void
  /** Deep-link target when opening Threads from Monitor or toasts. */
  selectedThreadId: string | null
  /** Fallback when thread IDs shift — match storyline by shared events. */
  selectedThreadEventIds: string[] | null
  setSelectedThreadId: (id: string | null) => void
  openThreads: (threadId?: string, eventIds?: string[]) => void
  selectedActorId: string | null
  setSelectedActorId: (id: string | null) => void
  openActors: (actorId?: string) => void
  /** One focus at a time — map-first workbench. */
  focusWorkbench: (mode: 'map' | 'feed' | 'research' | 'canvas' | 'menu') => void
  addSourceOpen: boolean
  setAddSourceOpen: (open: boolean) => void
  topicPull: {
    lastAt: string | null
    aimedCount: number
    query: string
    querying: boolean
    error: string | null
  }
  setTopicPull: (patch: Partial<MapStore['topicPull']>) => void
  /** Live firehose vs journal-curated evidence on map + feed */
  evidenceView: EvidenceView
  setEvidenceView: (view: EvidenceView) => void
  /** Bumped to focus the map NLQ search bar (⌘K). */
  mapQueryFocusTick: number
  requestMapQueryFocus: () => void
  mapQueryPanelOpen: boolean
}

// Right-side map panels — collapse feed on narrow viewports when one opens
const RIGHT_SIDE_PANELS: (keyof Panels)[] = [
  'alerts', 'anomaly', 'country', 'velocity', 'forecasts', 'plotsPanel', 'journal',
]

function collapseFeedIfNarrow(panels: Panels, key: keyof Panels): Panels {
  if (typeof window !== 'undefined' && window.innerWidth <= 1100 && RIGHT_SIDE_PANELS.includes(key)) {
    return { ...panels, eventFeed: false }
  }
  return panels
}

function openExclusivePanel(panels: Panels, key: keyof Panels): Panels {
  let newPanels = { ...panels, [key]: true }
  newPanels = collapseFeedIfNarrow(newPanels, key)
  for (const group of PANEL_EXCLUSIVE_GROUPS) {
    if ((group as string[]).includes(key as string)) {
      for (const peer of group) {
        if (peer !== key) newPanels = { ...newPanels, [peer]: false }
      }
      break
    }
  }
  return newPanels
}

// Panels that are mutually exclusive — opening any one closes the others in the same group.
const PANEL_EXCLUSIVE_GROUPS: (keyof Panels)[][] = [
  // Right-side column slot (map stays visible beside these)
  ['alerts', 'anomaly', 'country', 'velocity', 'forecasts', 'plotsPanel', 'journal'],
  // Full-screen overlays — only one may be open at a time
  ['incidents', 'watchRules', 'topic', 'connectors', 'export', 'briefHistory', 'settings', 'timeline'],
  // Left float slot over the map (feed) + drawers — one at a time
  ['eventFeed', 'cases', 'actors', 'threads', 'monitor'],
]

export const useMapStore = create<MapStore>()(
  persist(
    (set, get) => ({
  viewport: { latitude: 20, longitude: 10, zoom: 2, pitch: 0, bearing: 0 },
  selectedCountry: null,
  selectedCountryCode: null,
  selectedEvent: null,
  events: [],
  alerts: [],
  situations: [],
  vesselPositions: [],
  selectedVessel: null,
  selectedAircraft: null,
  flaggedAlerts: {},
  layers: {
    // Live/analysis layers start off — goal sync turns vessels/aviation/chokepoints on when relevant.
    events: true, disasters: true, chokepoints: false, alerts: true,
    aviation: false, vessels: false, cables: false, landingPoints: false, pipelines: false, plots: true, riskHeatmap: false, threatDensity: false, terrain: false,
  },
  panels: {
    eventFeed: false, country: false, alerts: false,
    commandBar: false, authModal: false,
    anomaly: false, timeline: false,
    connectors: false, export: false, briefHistory: false, overview: false, settings: false, incidents: false,
    watchRules: false, topic: false, scrubber: false, plotsPanel: false, velocity: false, forecasts: false,
    canvas: false, ledger: false, cases: false, actors: false, threads: false, monitor: false, journal: false, menu: false,
  },
  eventFilter: 'all',
  severityFilter: 'all',
  dateFilter: 'all',
  searchQuery: '',
  plottingMode: 'none',
  pendingPlotGeometry: null,
  _flyToCallback: null,

  flyTo: (lat, lon, zoom) => {
    const cb = get()._flyToCallback
    if (cb) cb(lat, lon, zoom)
    set(s => ({ viewport: { ...s.viewport, latitude: lat, longitude: lon, zoom: zoom ?? s.viewport.zoom } }))
  },

  setViewport: (viewport) => set(s => ({ viewport: { ...s.viewport, ...viewport } })),

  setSelectedCountry: (name, code) => set({
    selectedCountry: name,
    selectedCountryCode: code,
    panels: { ...get().panels, country: true },
  }),

  clearSelection: () => set({ selectedCountry: null, selectedCountryCode: null, selectedEvent: null }),

  toggleLayer: (key) => set(s => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),

  togglePanel: (key) => set(s => {
    const opening = !s.panels[key]
    let newPanels = { ...s.panels, [key]: opening }
    if (opening) {
      newPanels = collapseFeedIfNarrow(newPanels, key)
      for (const group of PANEL_EXCLUSIVE_GROUPS) {
        if ((group as string[]).includes(key as string)) {
          for (const peer of group) {
            if (peer !== key) newPanels[peer] = false
          }
          break
        }
      }
    }
    return {
      panels: newPanels,
      ...(opening && key === 'threads' ? { selectedThreadId: null, selectedThreadEventIds: null } : {}),
      ...(opening && key === 'actors' ? { selectedActorId: null } : {}),
    }
  }),

  closeAllPanels: () => set(s => ({
    panels: Object.keys(s.panels).reduce((acc, k) => ({ ...acc, [k]: false }), {} as Panels),
  })),

  clearProjectData: () => { startTransition(() => { set({ events: [], alerts: [], situations: [], eventsLoading: false }) }) },

  // Wrap bulk data updates in startTransition — React 18 defers them so
  // user interactions (clicks, hover, scroll) are never blocked by data loading
  setEvents: (events) => { startTransition(() => { set({ events }) }) },
  addEvent: (event) => set(s => s.events.some(e => e.id === event.id) ? s : ({ events: [event, ...s.events] })),
  removeEvent: (id) => set(s => ({ events: s.events.filter(e => e.id !== id) })),
  setAlerts: (alerts) => { startTransition(() => { set({ alerts }) }) },
  dismissAlert: (id) => set(s => ({ alerts: s.alerts.filter(a => a.id !== id) })),
  setSituations: (situations) => set({ situations }),
  setEventFilter: (filter) => set({ eventFilter: filter }),
  setSeverityFilter: (f) => set({ severityFilter: f }),
  setDateFilter: (f) => set({ dateFilter: f }),
  clearEventFilters: () => set({ eventFilter: 'all', severityFilter: 'all', dateFilter: 'all', searchQuery: '' }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setPlottingMode: (mode) => set({ plottingMode: mode }),
  setPendingPlotGeometry: (geo) => set({ pendingPlotGeometry: geo }),
  setSelectedEvent: (event) => set({ selectedEvent: event }),
  setSelectedVessel: (v) => set({ selectedVessel: v }),
  setSelectedAircraft: (a) => set({ selectedAircraft: a }),
  flagAlert: (id, note) => set(s => ({ flaggedAlerts: { ...s.flaggedAlerts, [id]: { note, flaggedAt: new Date().toISOString() } } })),
  unflagAlert: (id) => set(s => { const f = { ...s.flaggedAlerts }; delete f[id]; return { flaggedAlerts: f } }),
  escalateAlert: (id) => {
    const s = get()
    const alert = s.alerts.find(a => a.id === id)
    if (!alert) return
    const sit: Situation = {
      id: `sit-${Date.now()}`,
      name: alert.title,
      countries: alert.countries,
      eventCount: alert.signals.length,
      criticalCount: alert.severity === 'critical' ? 1 : 0,
      highCount: alert.severity === 'high' ? 1 : 0,
      mediumCount: alert.severity === 'medium' ? 1 : 0,
      trend: 'escalating',
      trendPercent: 0,
      sources: ['Correlation Engine'],
      topEvents: [],
      lat: alert.lat,
      lon: alert.lon,
      activeSince: new Date().toISOString(),
    }
    set(s2 => ({ situations: [...s2.situations, sit] }))
  },
  threatenedCableData: [],
  setThreatenedCableData: (cables) => set({ threatenedCableData: cables }),
  highlightedCableId: null,
  setHighlightedCableId: (id) => set({ highlightedCableId: id }),
  setFlyToCallback: (cb) => set({ _flyToCallback: cb }),
  liveStatus: 'disconnected',
  setLiveStatus: (status) => set({ liveStatus: status }),
  highlightedAlertId: null,
  setHighlightedAlertId: (id) => set({ highlightedAlertId: id }),
  toasts: [],
  notificationHistory: [],
  unreadToastCount: 0,
  pushToast: (toast) => set(s => {
    const full: AppToast = { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: new Date().toISOString() }
    return {
      toasts: [...s.toasts.slice(-9), full],
      notificationHistory: [full, ...s.notificationHistory].slice(0, 50),
      unreadToastCount: s.unreadToastCount + 1,
    }
  }),
  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  clearAllToasts: () => set({ toasts: [] }),
  clearToastBadge: () => set({ unreadToastCount: 0 }),
  clearNotificationHistory: () => set({ notificationHistory: [], unreadToastCount: 0 }),
  monitorSignals: [],
  monitorUnseen: 0,
  addMonitorSignals: (signals) => {
    if (signals.length === 0) return []
    // Dedup by stable id, newest first, cap the session log.
    const existing = new Set(get().monitorSignals.map(x => x.id))
    const fresh = signals.filter(x => !existing.has(x.id))
    if (fresh.length === 0) return []
    set(s => ({
      monitorSignals: [...fresh, ...s.monitorSignals].slice(0, 60),
      monitorUnseen: s.monitorUnseen + fresh.length,
    }))
    return fresh
  },
  markMonitorSeen: () => set({ monitorUnseen: 0 }),
  clearMonitorSignals: () => set({ monitorSignals: [], monitorUnseen: 0 }),
  eventsLoading: true,
  setEventsLoading: (loading) => set({ eventsLoading: loading }),
  liveCoverage: 'focused',
  setLiveCoverage: (c) => set({ liveCoverage: c }),
  liveTrackingCaps: { vessels: false, aviation: false },
  setLiveTrackingCaps: (liveTrackingCaps) => set({ liveTrackingCaps }),
  playback: { active: false, time: null, playing: false, speed: 60 },
  setPlaybackTime: (time) => set(s => ({ playback: { ...s.playback, time } })),
  setPlaybackPlaying: (playing) => set(s => ({ playback: { ...s.playback, playing } })),
  setPlaybackSpeed: (speed) => set(s => ({ playback: { ...s.playback, speed } })),
  setPlaybackActive: (active) => set(s => ({ playback: { ...s.playback, active, time: active ? s.playback.time : null, playing: false } })),
  historicalVessels: [],
  historicalAircraft: [],
  trackTimestamps: { vessels: [], aircraft: [] },
  setHistoricalVessels: (historicalVessels) => set({ historicalVessels }),
  setHistoricalAircraft: (historicalAircraft) => set({ historicalAircraft }),
  setTrackTimestamps: (trackTimestamps) => set({ trackTimestamps }),
  // NLQ — highlighted event IDs from a map query
  nlqHighlightIds: [] as string[],
  nlqSummary: null as string | null,
  setNlqHighlights: (ids: string[], summary: string | null) => set({ nlqHighlightIds: ids, nlqSummary: summary }),
  clearNlqHighlights: () => set({ nlqHighlightIds: [], nlqSummary: null }),
  mapFocusHighlightIds: [] as string[],
  mapFocusLabel: null as string | null,
  mapFocusCircle: null as { lat: number; lon: number; radiusKm: number } | null,
  setMapFocusHighlights: (ids, label, circle = null) => set({
    mapFocusHighlightIds: ids,
    mapFocusLabel: label,
    mapFocusCircle: circle ?? null,
  }),
  clearMapFocusHighlights: () => set({ mapFocusHighlightIds: [], mapFocusLabel: null, mapFocusCircle: null }),
  briefHistoryTab: 'briefs' as 'briefs' | 'nlq',
  setBriefHistoryTab: (tab) => set({ briefHistoryTab: tab }),
  openBriefHistory: (tab = 'briefs') => set(s => {
    let newPanels = { ...s.panels, briefHistory: true }
    for (const group of PANEL_EXCLUSIVE_GROUPS) {
      if ((group as (keyof Panels)[]).includes('briefHistory')) {
        for (const peer of group) {
          if (peer !== 'briefHistory') newPanels = { ...newPanels, [peer]: false }
        }
        break
      }
    }
    return { briefHistoryTab: tab, panels: newPanels }
  }),
  journalTab: 'entries' as 'entries' | 'hypotheses' | 'patterns',
  openJournal: (tab = 'entries') => set(s => ({
    journalTab: tab,
    panels: openExclusivePanel({ ...s.panels, canvas: false, ledger: false }, 'journal'),
  })),
  selectedThreadId: null,
  selectedThreadEventIds: null,
  setSelectedThreadId: (id) => set(s => ({
    selectedThreadId: id,
    selectedThreadEventIds: id ? s.selectedThreadEventIds : null,
  })),
  openThreads: (threadId, eventIds) => set(s => ({
    selectedThreadId: threadId ?? null,
    selectedThreadEventIds: eventIds?.length ? eventIds : null,
    panels: openExclusivePanel(s.panels, 'threads'),
  })),
  selectedActorId: null,
  setSelectedActorId: (id) => set({ selectedActorId: id }),
  openActors: (actorId) => set(s => ({
    selectedActorId: actorId ?? null,
    panels: openExclusivePanel(s.panels, 'actors'),
  })),
  focusWorkbench: (mode) => set(s => {
    const off = { canvas: false, ledger: false, journal: false, eventFeed: false, menu: false }
    if (mode === 'map') {
      return { panels: { ...s.panels, ...off } }
    }
    if (mode === 'feed') {
      return { panels: { ...s.panels, ...off, eventFeed: true } }
    }
    if (mode === 'research') {
      return {
        journalTab: 'entries',
        panels: { ...s.panels, ...off, journal: true },
      }
    }
    if (mode === 'menu') {
      return {
        selectedEvent: null,
        panels: { ...s.panels, ...off, menu: true },
      }
    }
    return { panels: { ...s.panels, ...off, canvas: true } }
  }),
  addSourceOpen: false,
  setAddSourceOpen: (open) => set({ addSourceOpen: open }),
  topicPull: { lastAt: null, aimedCount: 0, query: '', querying: false, error: null },
  setTopicPull: (patch) => set(s => ({ topicPull: { ...s.topicPull, ...patch } })),
  evidenceView: 'live',
  setEvidenceView: (view) => set({ evidenceView: view }),
  mapQueryFocusTick: 0,
  requestMapQueryFocus: () => set(s => ({ mapQueryFocusTick: s.mapQueryFocusTick + 1 })),
  mapQueryPanelOpen: false,
    }),
    {
      name: 'argus-ui-prefs',
      storage: createJSONStorage(() => localStorage),
      // Defer reading localStorage until after mount. The server renders with the
      // initial defaults; if we rehydrated synchronously the first client render
      // would use the persisted values and mismatch the SSR HTML (hydration error
      // + theme/panel flash). providers.tsx calls rehydrate() in an effect.
      skipHydration: true,
      // Only persist user preferences — never persist live data (events/vessels/aircraft).
      // Modals and transient overlays are always reset to closed on page load.
      partialize: (state) => ({
        // terrain/riskHeatmap/threatDensity are excluded — they're analysis tools that should
        // start off on each session so the map doesn't open looking entirely red or broken.
        // Chokepoints also reset off — pressure math is opt-in; maritime goals re-enable via sync.
        layers:         { ...state.layers, terrain: false, riskHeatmap: false, threatDensity: false, chokepoints: false },
        eventFilter:    state.eventFilter,
        severityFilter: state.severityFilter,
        dateFilter:     state.dateFilter,
        evidenceView:   state.evidenceView,
        panels: {
          // Layout preferences that survive page reload
          eventFeed:   state.panels.eventFeed,
          overview:    state.panels.overview,
          scrubber:    state.panels.scrubber,
          velocity:    state.panels.velocity,
          alerts:      state.panels.alerts,
          anomaly:     state.panels.anomaly,
          country:     state.panels.country,
          // All other panels reset to false on reload
        },
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<typeof current>
        return {
          ...current,
          ...p,
          // Deep-merge panels so un-persisted keys keep their initial (false) value
          panels: { ...current.panels, ...(p.panels ?? {}) },
        }
      },
    }
  )
)
