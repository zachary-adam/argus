'use client'
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { X, RefreshCw, Check, AlertCircle, ToggleLeft, ToggleRight, Globe, Radio, Rss, Link, Trash2, ExternalLink } from 'lucide-react'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import type { CustomSource } from '@/types/project'
import { FEATURES } from '@/lib/features'
import { filterRelevantForProject } from '@/lib/relevance'
import { tagEphemeralRss, DEFAULT_RSS_MAP_RETENTION, stampIngested } from '@/lib/eventRetention'
import type { LiveFeedRetention } from '@/types/project'
import { SegControl } from '@/components/ui/SegControl'

const HAZARD_CONNECTOR_IDS = new Set(['gdacs', 'usgs', 'who', 'firms'])

const RSS_MAP_RETENTION_OPTIONS: { value: LiveFeedRetention; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '48h', label: '48h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

const CONNECTOR_META: Record<string, {
  label: string
  description: string
  url: string
  category: string
}> = {
  gdelt:     { label: 'GDELT', description: 'Global conflict, political, and social events from 100+ languages. Updated every 15 min.', url: 'https://gdeltproject.org', category: 'Global Events' },
  reliefweb: { label: 'ReliefWeb', description: 'UN OCHA humanitarian situation reports, maps, and country updates.', url: 'https://reliefweb.int', category: 'Humanitarian' },
  gdacs:     { label: 'GDACS', description: 'Global disaster alerts — earthquakes, cyclones, floods, volcanoes (EU JRC).', url: 'https://gdacs.org', category: 'Disaster' },
  usgs:      { label: 'USGS Earthquakes', description: 'Real-time seismic data, M2.5+ globally, updated every 5 min.', url: 'https://earthquake.usgs.gov', category: 'Geophysical' },
  who:       { label: 'WHO Disease Alerts', description: 'World Health Organization outbreak and disease event notifications.', url: 'https://who.int', category: 'Health' },
  firms:     { label: 'NASA FIRMS', description: 'Fire Information for Resource Management System — active wildfire satellite detection.', url: 'https://firms.modaps.eosdis.nasa.gov', category: 'Geophysical' },
  rss:       { label: 'RSS / News', description: 'BBC, Reuters, Al Jazeera, AP — curated headline feeds filtered by region keywords.', url: '#', category: 'News Media' },
  wikidata:  { label: 'Wikidata SPARQL', description: 'Structured political, election, and entity data via Wikidata query service.', url: 'https://wikidata.org', category: 'Structured Data' },
  acled:     { label: 'ACLED', description: 'Gold-standard armed conflict & protest data — georeferenced to your project region. Requires free myACLED email + password.', url: 'https://acleddata.com', category: 'Conflict Data' },
}

const CATEGORY_ORDER = ['Global Events', 'Conflict Data', 'Humanitarian', 'Disaster', 'Geophysical', 'Health', 'News Media', 'Structured Data']

function groupByCategory<T extends { id: string }>(items: T[]) {
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const cat = CONNECTOR_META[item.id]?.category ?? 'Other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  }
  return groups
}

function fmtTime(secs: number) {
  if (secs <= 0) return ''
  return secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`
}

export default function ConnectorsPanel() {
  const togglePanel  = useMapStore(s => s.togglePanel)
  const { handleClose, closing } = useClosePanel('connectors')
  const setAddSourceOpen = useMapStore(s => s.setAddSourceOpen)
  const setEvents    = useMapStore(s => s.setEvents)
  const setAlerts    = useMapStore(s => s.setAlerts)
  const setSituations = useMapStore(s => s.setSituations)
  const mapEvents    = useMapStore(s => s.events)

  const { getActiveProject, updateConnector, updateCustomSource, removeCustomSource } = useProjectStore()
  const project       = getActiveProject()
  const connectors    = useMemo(() => project?.connectors ?? [], [project?.connectors])
  const visibleConnectors = useMemo(
    () => connectors.filter(c => FEATURES.hazardFeeds || !HAZARD_CONNECTOR_IDS.has(c.id)),
    [connectors],
  )
  const customSources = project?.customSources ?? []

  const liveCountsBySource = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of mapEvents) counts[e.source] = (counts[e.source] ?? 0) + 1
    return counts
  }, [mapEvents])

  const [fetching,     setFetching]     = useState<Record<string, boolean>>({})
  const [errors,       setErrors]       = useState<Record<string, string>>({})
  const [success,      setSuccess]      = useState<Record<string, boolean>>({})
  const [fetchingAll,  setFetchingAll]  = useState(false)
  const [autoInterval, setAutoInterval] = useState(0)   // minutes; 0 = off
  const [countdown,    setCountdown]    = useState(0)   // seconds until next auto-refresh
  const [customFetching, setCustomFetching] = useState<Record<string, boolean>>({})
  const [customErrors,   setCustomErrors]   = useState<Record<string, string>>({})
  const [customSuccess,  setCustomSuccess]  = useState<Record<string, boolean>>({})

  const autoRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextAtRef  = useRef(0)
  const fetchAllRef = useRef<() => Promise<void>>(async () => {})

  const fetchConnector = useCallback(async (connectorId: string) => {
    if (!project) return
    setFetching(p => ({ ...p, [connectorId]: true }))
    setErrors(p => { const n = { ...p }; delete n[connectorId]; return n })
    setSuccess(p => { const n = { ...p }; delete n[connectorId]; return n })
    try {
      const params = new URLSearchParams({ source: connectorId })
      if (project.regionCenter) {
        params.set('lat', String(project.regionCenter[1]))
        params.set('lon', String(project.regionCenter[0]))
      }
      const res = await fetch(`/api/events?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const raw: any[] = Array.isArray(data) ? data : data.events ?? []

      // Filter to project region — drop events with a known foreign country code
      const scopeCodes = project.countryCodes ?? []
      const inScope = scopeCodes.length > 0
        ? raw.filter(e => {
            const code = (e.countryCode ?? '').toUpperCase()
            // Keep if countryCode is unknown/global, or is within the project scope
            return !code || code === 'XX' || scopeCodes.includes(code)
          })
        : raw

      // Situation relevance: same gate the live stream applies, so a loose connector
      // search ("Sudan" → UK politics / climate features) is scoped to the actual
      // situation before it lands in the feed. No-ops when the project has no targeting.
      const incoming = filterRelevantForProject(inScope, project)

      const currentEvents = useMapStore.getState().events
      const existingIds = new Set(currentEvents.map((e: { id: string }) => e.id))
      const merged = [...incoming.filter((e: { id: string }) => !existingIds.has(e.id)), ...currentEvents]
      setEvents(merged)
      updateConnector(project.id, connectorId, {
        lastFetched: new Date().toISOString(),
        eventCount: incoming.length,
        error: undefined,
      })
      // Strip body field — correlations/situations only need metadata, not article text
      const metaEvents = merged.map(({ body: _b, ...e }: any) => e)
      fetch('/api/correlations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: metaEvents, settings: project.correlationSettings }) })
        .then(r => r.json()).then(setAlerts).catch(() => {})
      fetch('/api/situations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: metaEvents }) })
        .then(r => r.json()).then(setSituations).catch(() => {})
      setSuccess(p => ({ ...p, [connectorId]: true }))
      setTimeout(() => setSuccess(p => { const n = { ...p }; delete n[connectorId]; return n }), 3000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fetch failed'
      setErrors(p => ({ ...p, [connectorId]: msg }))
      updateConnector(project.id, connectorId, { error: msg })
    } finally {
      setFetching(p => { const n = { ...p }; delete n[connectorId]; return n })
    }
  }, [project, setEvents, setAlerts, setSituations, updateConnector])

  const fetchAll = useCallback(async () => {
    if (!project) return
    setFetchingAll(true)
    await Promise.allSettled(visibleConnectors.filter(c => c.enabled).map(c => fetchConnector(c.id)))
    setFetchingAll(false)
  }, [visibleConnectors, fetchConnector, project])

  // Keep ref current so the interval callback always calls latest version
  useEffect(() => { fetchAllRef.current = fetchAll }, [fetchAll])

  // Auto-fetch stale connectors on panel open
  useEffect(() => {
    if (!project) return
    const staleIds = visibleConnectors
      .filter(c => c.enabled && (!c.lastFetched || Date.now() - new Date(c.lastFetched).getTime() > 10 * 60 * 1000))
      .map(c => c.id)
    if (staleIds.length > 0) {
      Promise.allSettled(staleIds.map(id => fetchConnector(id)))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh interval
  useEffect(() => {
    if (autoRef.current)  { clearInterval(autoRef.current);  autoRef.current  = null }
    if (tickRef.current)  { clearInterval(tickRef.current);  tickRef.current  = null }
    setCountdown(0)
    if (!autoInterval || !project) return

    const ms = autoInterval * 60 * 1000
    nextAtRef.current = Date.now() + ms
    setCountdown(autoInterval * 60)

    autoRef.current = setInterval(() => {
      fetchAllRef.current()
      nextAtRef.current = Date.now() + ms
    }, ms)

    tickRef.current = setInterval(() => {
      setCountdown(Math.max(0, Math.ceil((nextAtRef.current - Date.now()) / 1000)))
    }, 5000)

    return () => {
      if (autoRef.current)  clearInterval(autoRef.current)
      if (tickRef.current)  clearInterval(tickRef.current)
    }
  }, [autoInterval, project]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCustomSource = useCallback(async (src: CustomSource) => {
    if (!project) return
    setCustomFetching(p => ({ ...p, [src.id]: true }))
    setCustomErrors(p => { const n = { ...p }; delete n[src.id]; return n })
    setCustomSuccess(p => { const n = { ...p }; delete n[src.id]; return n })
    try {
      let rawEvents: any[] = []
      if (src.type === 'rss') {
        const res = await fetch('/api/connectors/rss', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedUrl: src.url }),
        })
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
        rawEvents = data.events ?? []
      } else {
        const res = await fetch('/api/connectors/scrape', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: src.url }),
        })
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)
        if (data.event) rawEvents = [data.event]
      }

      const { toIntelEvent, deduplicateEvents } = await import('@/lib/normalize')
      const current = useMapStore.getState().events
      const deduped = deduplicateEvents(rawEvents as any, current as any)
      const intel = deduped.map((e: any) => toIntelEvent(e, src.name))
      const mapEvents = src.type === 'rss'
        ? intel.map(e => tagEphemeralRss(e, src.mapRetention ?? DEFAULT_RSS_MAP_RETENTION))
        : intel.map(stampIngested)
      const added = mapEvents.length
      if (added > 0) setEvents([...current, ...mapEvents])

      updateCustomSource(project.id, src.id, {
        lastFetched: new Date().toISOString(),
        eventCount: src.eventCount + added,
        error: undefined,
      })
      setCustomSuccess(p => ({ ...p, [src.id]: true }))
      setTimeout(() => setCustomSuccess(p => { const n = { ...p }; delete n[src.id]; return n }), 3000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fetch failed'
      setCustomErrors(p => ({ ...p, [src.id]: msg }))
      updateCustomSource(project.id, src.id, { error: msg })
    } finally {
      setCustomFetching(p => { const n = { ...p }; delete n[src.id]; return n })
    }
  }, [project, setEvents, updateCustomSource])

  const toggle = (connectorId: string, enabled: boolean) => {
    if (!project) return
    updateConnector(project.id, connectorId, { enabled })
  }

  const enabledCount = visibleConnectors.filter(c => c.enabled).length
  const groups = groupByCategory(visibleConnectors)

  return (
    <div className="ui-modal-overlay" onClick={handleClose}>
      <div
        className={`ui-modal--md ui-command-palette panel-slide-in${closing ? ' panel-closing' : ''}`}
        style={{ maxHeight: 'min(86vh, 700px)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="ui-panel-header" style={{ paddingBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div className="ui-kicker" style={{ marginBottom: 4 }}>Data</div>
              <div className="ui-title ui-title--panel">Live Feeds</div>
              <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>
                {enabledCount} active · {mapEvents.length.toLocaleString()} events
                {project && <> · <span style={{ color: 'var(--accent)' }}>{project.regionName}</span></>}
              </p>
            </div>
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="ui-filter-row" style={{ marginBottom: 0, flex: 1 }}>
              <Radio size={10} style={{ color: autoInterval > 0 ? 'var(--low)' : 'var(--text-muted)' }} />
              <span className="ui-section-label" style={{ marginBottom: 0 }}>Auto</span>
              {[{ label: 'Off', val: 0 }, { label: '5m', val: 5 }, { label: '15m', val: 15 }, { label: '30m', val: 30 }].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  className={`ui-filter-pill ui-filter-pill--accent${autoInterval === opt.val ? ' ui-filter-pill--active' : ''}`}
                  onClick={() => setAutoInterval(opt.val)}
                >
                  {opt.label}
                </button>
              ))}
              {autoInterval > 0 && countdown > 0 && (
                <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)' }}>
                  next {fmtTime(countdown)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={fetchAll}
              disabled={fetchingAll || enabledCount === 0}
              className="ui-btn ui-btn--primary"
              style={{ fontSize: 11, padding: '6px 12px', flexShrink: 0 }}
            >
              <RefreshCw size={10} style={{ animation: fetchingAll ? 'spin 1s linear infinite' : 'none' }} />
              {fetchingAll ? 'Fetching…' : 'Fetch all'}
            </button>
          </div>
        </header>

        <div className="ui-panel-body" style={{ paddingTop: 12 }}>
          {project && (
            <div className="ui-callout" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>
                Paste an article, scrape a URL, or pull RSS — use <strong>Add Source</strong> for one-off imports.
              </span>
              <button
                type="button"
                onClick={() => { togglePanel('connectors'); setAddSourceOpen(true) }}
                className="ui-btn ui-btn--primary"
                style={{ fontSize: 10, padding: '5px 10px', flexShrink: 0 }}
              >
                Add Source
              </button>
            </div>
          )}
          {!project && (
            <div className="ui-panel-empty">
              <div className="ui-panel-empty__title">No project open</div>
              <p className="ui-feed-hint">Open a project to manage its data sources.</p>
            </div>
          )}

          {/* ── Custom sources (user-added RSS / scraped URLs) ── */}
          {project && customSources.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div className="ui-section-label">Your sources</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {customSources.map(src => {
                  const isFetching = customFetching[src.id]
                  const hasError   = customErrors[src.id] ?? src.error
                  const didSucceed = customSuccess[src.id]
                  const ageMs      = src.lastFetched ? Date.now() - new Date(src.lastFetched).getTime() : null
                  const ageStr     = ageMs == null ? null
                    : ageMs < 60_000 ? 'just now'
                    : ageMs < 3_600_000 ? `${Math.floor(ageMs / 60_000)}m ago`
                    : ageMs < 86_400_000 ? `${Math.floor(ageMs / 3_600_000)}h ago`
                    : `${Math.floor(ageMs / 86_400_000)}d ago`
                  const stale = ageMs != null && ageMs > 60 * 60_000

                  const cardClass = [
                    'ui-connector-card',
                    hasError ? 'ui-connector-card--error' : stale ? 'ui-connector-card--stale' : '',
                  ].filter(Boolean).join(' ')

                  return (
                    <div key={src.id} className={cardClass}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flexShrink: 0, color: src.type === 'rss' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {src.type === 'rss' ? <Rss size={14} /> : <Link size={14} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{src.name}</span>
                            <span className="ui-chip ui-chip--xs">{src.type}</span>
                            {isFetching && (
                              <span className="ui-chip ui-chip--xs ui-chip--accent">
                                <RefreshCw size={8} style={{ animation: 'spin 1s linear infinite', display: 'inline', verticalAlign: -1 }} /> fetching
                              </span>
                            )}
                            {!isFetching && src.eventCount > 0 && (
                              <span className="ui-chip ui-chip--xs ui-chip--accent font-mono">{src.eventCount} events</span>
                            )}
                            {didSucceed && (
                              <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)' }}>
                                <Check size={9} style={{ display: 'inline', verticalAlign: -1 }} /> updated
                              </span>
                            )}
                            {stale && !isFetching && !hasError && (
                              <span className="ui-chip ui-chip--xs ui-chip--disinfo">stale</span>
                            )}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {src.url}
                          </div>
                          {hasError && (
                            <div style={{ fontSize: 9, color: 'var(--critical)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                              <AlertCircle size={9} /> {hasError}
                            </div>
                          )}
                          {ageStr && !hasError && !isFetching && (
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Updated {ageStr}</div>
                          )}
                          {src.type === 'rss' && (
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span className="ui-section-label" style={{ marginBottom: 0, fontSize: 9 }}>Map retention</span>
                              <SegControl
                                size="sm"
                                value={src.mapRetention ?? DEFAULT_RSS_MAP_RETENTION}
                                onChange={v => project && updateCustomSource(project.id, src.id, { mapRetention: v })}
                                options={RSS_MAP_RETENTION_OPTIONS}
                              />
                            </div>
                          )}
                        </div>
                        <button type="button" onClick={() => fetchCustomSource(src)} disabled={isFetching} title="Re-fetch now" className="ui-btn ui-btn--ghost" style={{ padding: 4, minWidth: 0, color: 'var(--accent)' }}>
                          <RefreshCw size={12} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
                        </button>
                        <button type="button" onClick={() => { if (project) removeCustomSource(project.id, src.id) }} title="Remove source" className="ui-btn ui-btn--ghost" style={{ padding: 4, minWidth: 0 }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {project && CATEGORY_ORDER.map(cat => {
            const items = groups[cat]
            if (!items?.length) return null
            return (
              <div key={cat} style={{ marginBottom: 18 }}>
                <div className="ui-section-label">{cat}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {items.map(connector => {
                    const meta      = CONNECTOR_META[connector.id]
                    const isFetching = fetching[connector.id]
                    const hasError  = errors[connector.id]
                    const didSucceed = success[connector.id]
                    const live      = liveCountsBySource[connector.id] ?? 0

                    const cardClass = [
                      'ui-connector-card',
                      !connector.enabled ? 'ui-connector-card--off' : '',
                      hasError ? 'ui-connector-card--error' : '',
                    ].filter(Boolean).join(' ')

                    return (
                      <div key={connector.id} className={cardClass}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button type="button" onClick={() => toggle(connector.id, !connector.enabled)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                            {connector.enabled
                              ? <ToggleRight size={18} style={{ color: 'var(--accent)' }} />
                              : <ToggleLeft size={18} style={{ color: 'var(--text-muted)' }} />
                            }
                          </button>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{meta?.label ?? connector.name}</span>
                              {meta?.url && meta.url !== '#' && (
                                <a href={meta.url} target="_blank" rel="noopener noreferrer" className="ui-link" style={{ display: 'inline-flex', padding: 2 }} title="Open source website">
                                  <ExternalLink size={9} />
                                </a>
                              )}

                              {isFetching && (
                                <span className="ui-chip ui-chip--xs ui-chip--accent">
                                  <RefreshCw size={8} style={{ animation: 'spin 1s linear infinite', display: 'inline', verticalAlign: -1 }} /> fetching
                                </span>
                              )}
                              {!isFetching && live > 0 && (
                                <span className="ui-chip ui-chip--xs ui-chip--accent font-mono">{live.toLocaleString()} events</span>
                              )}
                              {!isFetching && live === 0 && connector.lastFetched && !hasError && (
                                <span className="ui-chip ui-chip--xs">0 in region</span>
                              )}
                              {didSucceed && (
                                <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)' }}>
                                  <Check size={9} style={{ display: 'inline', verticalAlign: -1 }} /> updated
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                              {meta?.description}
                            </div>
                            {hasError && (
                              <div style={{ fontSize: 9, color: 'var(--critical)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                                <AlertCircle size={9} /> {hasError}
                              </div>
                            )}
                            {connector.lastFetched && !hasError && !isFetching && (
                              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                                Updated {new Date(connector.lastFetched).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {project && (
          <div className="ui-feed-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <Globe size={10} style={{ color: project.countryCodes?.length ? 'var(--accent)' : 'var(--medium)', flexShrink: 0 }} />
              {project.countryCodes?.length > 0 ? (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Scoped to <strong style={{ color: 'var(--accent)' }}>{project.regionName}</strong>
                  <span className="font-mono" style={{ marginLeft: 4 }}>({project.countryCodes.length} countries)</span>
                </span>
              ) : (
                <span className="ui-chip ui-chip--xs ui-chip--disinfo">
                  No region scope — global data. Set region in Settings.
                </span>
              )}
            </div>
            {autoInterval > 0 && (
              <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)' }}>
                LIVE · {autoInterval}m
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
