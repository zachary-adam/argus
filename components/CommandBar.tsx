'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useScopedPlots } from '@/lib/hooks/useScopedPlots'
import { useProjectStore } from '@/stores/projectStore'
import { IntelEvent } from '@/types'
import { Search, Globe, AlertCircle, MapPin, Zap, Settings, Radio, Crosshair, FileText } from 'lucide-react'
import { SEVERITY_COLORS } from '@/lib/constants'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { getFeatureProvider, loadEffortLevel } from '@/lib/aiConfig'
import { buildAnalysisHeaders, loadAnalysisEngine } from '@/lib/aiMode'

const QUICK_COUNTRIES = [
  { name: 'Ukraine', code: 'UA', lat: 48.5, lon: 31.0 },
  { name: 'Israel', code: 'IL', lat: 31.5, lon: 34.9 },
  { name: 'Iran', code: 'IR', lat: 32.4, lon: 53.7 },
  { name: 'China', code: 'CN', lat: 35.0, lon: 105.0 },
  { name: 'Russia', code: 'RU', lat: 60.0, lon: 90.0 },
  { name: 'North Korea', code: 'KP', lat: 40.3, lon: 127.5 },
  { name: 'Taiwan', code: 'TW', lat: 23.7, lon: 121.0 },
  { name: 'Sudan', code: 'SD', lat: 15.5, lon: 32.5 },
  { name: 'Myanmar', code: 'MM', lat: 19.0, lon: 96.0 },
  { name: 'Pakistan', code: 'PK', lat: 30.0, lon: 69.0 },
  { name: 'Ethiopia', code: 'ET', lat: 9.0, lon: 39.0 },
  { name: 'Haiti', code: 'HT', lat: 19.0, lon: -72.3 },
]

interface SearchResult {
  type: 'country' | 'event' | 'location' | 'action' | 'alert' | 'incident' | 'plot'
  label: string
  sublabel?: string
  lat?: number
  lon?: number
  code?: string
  event?: IntelEvent
  severity?: string
  action?: () => void
}

interface NLFilters {
  category?: string
  severity?: string
  date?: string
  term?: string
}

function parseNLFilters(q: string): NLFilters | null {
  if (q.length < 4) return null
  const text = q.toLowerCase()

  const CATEGORIES: Record<string, string> = {
    conflict: 'conflict', conflicts: 'conflict', war: 'conflict', battle: 'conflict', fighting: 'conflict',
    political: 'political', politics: 'political', election: 'political',
    economic: 'economic', economy: 'economic', financial: 'economic', finance: 'economic',
    humanitarian: 'humanitarian', aid: 'humanitarian', refugee: 'humanitarian',
    health: 'health', disease: 'health', pandemic: 'health', outbreak: 'health',
    earthquake: 'earthquake', quake: 'earthquake', seismic: 'earthquake',
    wildfire: 'wildfire',
    disaster: 'disaster', flood: 'disaster', hurricane: 'disaster', cyclone: 'disaster', typhoon: 'disaster',
    environmental: 'environmental', climate: 'environmental',
    cyber: 'cyber', hack: 'cyber', cyberattack: 'cyber',
    social: 'social', protest: 'social', protests: 'social', unrest: 'social',
  }

  const SEVERITIES: Record<string, string> = {
    critical: 'critical', severe: 'critical',
    high: 'high', major: 'high', serious: 'high',
    medium: 'medium', moderate: 'medium',
    low: 'low', minor: 'low',
  }

  const DATE_TOKENS: Array<[string, string]> = [
    ['last 6', '6h'], ['6 hours', '6h'], ['6h', '6h'],
    ['last 24', '24h'], ['24 hours', '24h'], ['24h', '24h'], ['today', '24h'],
    ['last week', '7d'], ['7 days', '7d'], ['7d', '7d'],
    ['last month', '30d'], ['30 days', '30d'], ['30d', '30d'],
  ]

  let category: string | undefined
  let severity: string | undefined
  let date: string | undefined

  for (const [token, val] of DATE_TOKENS) {
    if (text.includes(token)) { date = val; break }
  }

  const words = text.split(/\W+/)
  for (const [token, val] of Object.entries(SEVERITIES)) {
    if (words.includes(token)) { severity = val; break }
  }
  for (const [token, val] of Object.entries(CATEGORIES)) {
    if (words.includes(token)) { category = val; break }
  }

  if (!category && !severity && !date) return null

  // Strip recognised tokens to surface any remaining search term
  const NOISE = ['show', 'find', 'filter', 'get', 'list', 'search', 'display', 'events', 'event', 'last', 'past', 'in', 'the', 'from', 'me']
  let remaining = text
  const strip = [
    ...NOISE,
    ...(date ? DATE_TOKENS.filter(([t]) => text.includes(t)).map(([t]) => t) : []),
    ...(severity ? Object.keys(SEVERITIES).filter(k => words.includes(k)) : []),
    ...(category ? Object.keys(CATEGORIES).filter(k => words.includes(k)) : []),
  ]
  for (const s of strip) remaining = remaining.replace(new RegExp(`\\b${s}\\b`, 'gi'), '')
  const term = remaining.replace(/\s+/g, ' ').trim()

  return { category, severity, date, term: term.length > 1 ? term : undefined }
}

export default function CommandBar() {
  const { handleClose, closing } = useClosePanel('commandBar')
  const togglePanel       = useMapStore(s => s.togglePanel)
  const events             = useMapStore(s => s.events)
  const alerts             = useMapStore(s => s.alerts)
  const flyTo              = useMapStore(s => s.flyTo)
  const setSelectedCountry = useMapStore(s => s.setSelectedCountry)
  const selectedCountry    = useMapStore(s => s.selectedCountry)
  const clearSelection     = useMapStore(s => s.clearSelection)
  const setEventFilter     = useMapStore(s => s.setEventFilter)
  const setSeverityFilter  = useMapStore(s => s.setSeverityFilter)
  const pushToast            = useMapStore(s => s.pushToast)
  const project              = useProjectStore(s => s.getActiveProject())
  const setDateFilter      = useMapStore(s => s.setDateFilter)
  const setSearchQuery     = useMapStore(s => s.setSearchQuery)

  const plots              = useScopedPlots()
  const incidents          = useMemo(() => project?.incidents ?? [], [project])

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [geoResults, setGeoResults] = useState<SearchResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // NLP filter detection
  const nlFilters = useMemo(() => parseNLFilters(query), [query])

  const applyNLFilters = useCallback(() => {
    if (!nlFilters) return
    if (nlFilters.category) setEventFilter(nlFilters.category)
    if (nlFilters.severity) setSeverityFilter(nlFilters.severity)
    if (nlFilters.date)     setDateFilter(nlFilters.date)
    if (nlFilters.term)     setSearchQuery(nlFilters.term)
    togglePanel('commandBar')
    if (!useMapStore.getState().panels.eventFeed) togglePanel('eventFeed')
  }, [nlFilters, setEventFilter, setSeverityFilter, setDateFilter, setSearchQuery, togglePanel])

  useEffect(() => { inputRef.current?.focus() }, [])

  // Actions that can be triggered from the palette
  const runSitrep = useCallback(async () => {
    togglePanel('commandBar')
    pushToast({ title: 'Generating SITREP…', body: 'Streaming global briefing', severity: 'info', type: 'system' })
    try {
      const res = await fetch('/api/sitrep?focus=global', {
        headers: {
          'x-ai-provider': getFeatureProvider('sitrep'),
          'x-effort': loadEffortLevel(),
          ...buildAnalysisHeaders(loadAnalysisEngine(project?.aiMode), project),
        },
      })
      if (!res.ok) throw new Error('Request failed')
      const text = await res.text()
      await navigator.clipboard.writeText(text)
      pushToast({ title: 'SITREP copied', body: `${Math.round(text.length / 1000)}k chars copied to clipboard`, severity: 'info', type: 'system' })
    } catch {
      pushToast({ title: 'SITREP failed', body: 'Check API keys or switch to Rules mode', severity: 'medium', type: 'system' })
    }
  }, [togglePanel, pushToast, project])

  const actionResults: SearchResult[] = ([
    { type: 'action' as const, label: 'Open Alerts', sublabel: 'Panel', action: () => { togglePanel('alerts'); togglePanel('commandBar') } },
    { type: 'action' as const, label: 'Generate Global SITREP', sublabel: 'Copy to clipboard', action: runSitrep },
    ...(selectedCountry ? [
      { type: 'action' as const, label: `Clear Country Selection`, sublabel: selectedCountry, action: () => { clearSelection(); togglePanel('commandBar') } },
    ] : []),
    {
      type: 'action' as const, label: 'Export Events (CSV)', sublabel: `${events.length} events`,
      action: () => {
        const rows = [
          ['ID', 'Title', 'Country', 'Category', 'Severity', 'Source', 'Timestamp', 'Fatalities'],
          ...events.map(e => [e.id, `"${e.title.replace(/"/g, '""')}"`, e.country, e.category, e.severity, e.source, e.timestamp, e.fatalities ?? '']),
        ]
        const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `ARGUS-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
        togglePanel('commandBar')
      },
    },
    { type: 'action' as const, label: 'Close All Panels', sublabel: 'Layout', action: () => { useMapStore.getState().closeAllPanels() } },
  ] as SearchResult[]).filter(a => !query || a.label.toLowerCase().includes(query.toLowerCase()))

  // Critical events always surfaced first
  const criticalEvents = events.filter(e => e.severity === 'critical')

  const eventResults: SearchResult[] = query.length > 1
    ? events
        .filter(e => e.title.toLowerCase().includes(query.toLowerCase()) || e.country.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5)
        .map(e => ({ type: 'event' as const, label: e.title, sublabel: `${e.country} · ${e.source}`, lat: e.lat, lon: e.lon, event: e, severity: e.severity }))
    : criticalEvents.slice(0, 4).map(e => ({ type: 'event' as const, label: e.title, sublabel: `${e.country} · ${e.source}`, lat: e.lat, lon: e.lon, event: e, severity: e.severity }))

  const countryResults: SearchResult[] = query.length > 1
    ? QUICK_COUNTRIES.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
        .map(c => ({ type: 'country' as const, label: c.name, sublabel: c.code, lat: c.lat, lon: c.lon, code: c.code }))
    : QUICK_COUNTRIES.slice(0, 6).map(c => ({ type: 'country' as const, label: c.name, sublabel: c.code, lat: c.lat, lon: c.lon, code: c.code }))

  const alertResults: SearchResult[] = query.length > 1
    ? alerts
        .filter(a => a.title.toLowerCase().includes(query.toLowerCase()) || a.countries.some(c => c.toLowerCase().includes(query.toLowerCase())))
        .slice(0, 4)
        .map(a => ({ type: 'alert' as const, label: a.title, sublabel: `${a.countries.slice(0, 3).join(', ')} · ${a.signalCount} events`, lat: a.lat, lon: a.lon, severity: a.severity }))
    : alerts.filter(a => a.severity === 'critical').slice(0, 2)
        .map(a => ({ type: 'alert' as const, label: a.title, sublabel: `${a.countries.slice(0, 3).join(', ')} · ${a.signalCount} events`, lat: a.lat, lon: a.lon, severity: a.severity }))

  const incidentResults: SearchResult[] = query.length > 1
    ? incidents
        .filter(inc => inc.title.toLowerCase().includes(query.toLowerCase()) || inc.country.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 4)
        .map(inc => ({
          type: 'incident' as const,
          label: inc.title,
          sublabel: `${inc.country} · ${inc.stage} · ${inc.severity}`,
          severity: inc.severity,
          action: () => { togglePanel('incidents'); togglePanel('commandBar') },
        }))
    : incidents.filter(inc => inc.stage === 'active' || inc.stage === 'escalated').slice(0, 2)
        .map(inc => ({
          type: 'incident' as const,
          label: inc.title,
          sublabel: `${inc.country} · ${inc.stage}`,
          severity: inc.severity,
          action: () => { togglePanel('incidents'); togglePanel('commandBar') },
        }))

  const plotResults: SearchResult[] = query.length > 1
    ? plots
        .filter(p => (p.label ?? '').toLowerCase().includes(query.toLowerCase()) || (p.properties.notes ?? '').toLowerCase().includes(query.toLowerCase()))
        .slice(0, 4)
        .map(p => {
          const coords = p.type === 'point' ? (p.coordinates as number[]) : (p.coordinates as number[][])[0] ?? [0, 0]
          return {
            type: 'plot' as const,
            label: p.label ?? 'Unnamed Plot',
            sublabel: `${p.type} · ${p.properties.category ?? 'custom'} · ${p.properties.threat_level ?? 'medium'}`,
            lat: coords[1],
            lon: coords[0],
            severity: p.properties.threat_level,
          }
        })
    : []

  const allResults: SearchResult[] = query.length > 1
    ? [...alertResults, ...incidentResults, ...eventResults, ...plotResults, ...countryResults, ...geoResults, ...actionResults].slice(0, 18)
    : [...actionResults.slice(0, 2), ...alertResults, ...incidentResults, ...eventResults, ...countryResults].slice(0, 16)

  useEffect(() => {
    if (query.length < 2) { setGeoResults([]); return }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        const results: SearchResult[] = (data.features || []).slice(0, 3).map((f: Record<string, unknown>) => ({
          type: 'location' as const,
          label: f.text as string,
          sublabel: f.place_name as string,
          lat: (f.center as number[])?.[1],
          lon: (f.center as number[])?.[0],
        }))
        setGeoResults(results)
      } catch { /* geo optional */ }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = useCallback((result: SearchResult) => {
    if (result.action) { result.action(); return }
    if (result.lat && result.lon) flyTo(result.lat, result.lon, result.type === 'country' ? 5 : 7)
    if (result.type === 'country' && result.label && result.code) setSelectedCountry(result.label, result.code)
    if (result.type === 'event' && result.event) useMapStore.getState().setSelectedEvent(result.event)
    togglePanel('commandBar')
  }, [flyTo, setSelectedCountry, togglePanel])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allResults.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && allResults[selected]) handleSelect(allResults[selected])
    if (e.key === 'Escape') handleClose()
  }

  // Sections for empty state
  const hasActions   = allResults.some(r => r.type === 'action')
  const hasAlerts    = allResults.some(r => r.type === 'alert')
  const hasIncidents = allResults.some(r => r.type === 'incident')
  const hasCritical  = allResults.some(r => r.type === 'event')
  const hasCountries = allResults.some(r => r.type === 'country')

  return (
    <div className="ui-command-overlay" onClick={handleClose}>
      <div className={`ui-command-palette ui-command-palette--bar panel-slide-in${closing ? ' panel-closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="ui-command-input">
          <Search size={15} color="var(--text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search · or try 'show conflict events last 24h'"
          />
          <kbd className="ui-kbd">ESC</kbd>
        </div>

        {nlFilters && (
          <div className="ui-command-filters">
            <span className="ui-section-label" style={{ marginBottom: 0, flexShrink: 0 }}>Filters</span>
            {nlFilters.category && <span className="ui-chip ui-chip--xs ui-chip--accent">{nlFilters.category}</span>}
            {nlFilters.severity && (
              <span className={`ui-chip ui-chip--xs ui-chip--sev-${nlFilters.severity}`}>{nlFilters.severity}</span>
            )}
            {nlFilters.date && <span className="ui-chip ui-chip--xs">{nlFilters.date}</span>}
            {nlFilters.term && <span className="ui-chip ui-chip--xs">&ldquo;{nlFilters.term}&rdquo;</span>}
            <button type="button" onClick={applyNLFilters} className="ui-btn ui-btn--primary" style={{ marginLeft: 'auto', fontSize: 10, padding: '3px 10px' }}>
              Apply →
            </button>
          </div>
        )}

        <div className={`ui-command-results${nlFilters ? ' ui-command-results--short' : ''}`}>
          {allResults.length === 0 && (
            <p className="ui-command-empty">No results for &ldquo;{query}&rdquo;</p>
          )}

          {query.length === 0 && (
            <>
              {hasActions && <SectionLabel label="Quick Actions" icon={<Zap size={9} />} />}
              {allResults.filter(r => r.type === 'action').map((r, i) => (
                <ResultItem key={`a${i}`} result={r} selected={selected === allResults.indexOf(r)} onClick={() => handleSelect(r)}
                  icon={<Settings size={12} />} />
              ))}

              {hasAlerts && <SectionLabel label={`Correlation Alerts · ${alerts.length}`} icon={<Radio size={9} />} accent />}
              {allResults.filter(r => r.type === 'alert').map((r, i) => (
                <ResultItem key={`al${i}`} result={r} selected={selected === allResults.indexOf(r)} onClick={() => handleSelect(r)}
                  icon={<Radio size={12} />} severity={r.severity} />
              ))}

              {hasIncidents && <SectionLabel label={`Active Incidents · ${incidents.filter(i => i.stage === 'active' || i.stage === 'escalated').length}`} icon={<FileText size={9} />} />}
              {allResults.filter(r => r.type === 'incident').map((r, i) => (
                <ResultItem key={`inc${i}`} result={r} selected={selected === allResults.indexOf(r)} onClick={() => handleSelect(r)}
                  icon={<FileText size={12} />} severity={r.severity} />
              ))}

              {hasCritical && <SectionLabel label={`Critical · ${criticalEvents.length} active`} icon={<AlertCircle size={9} />} danger />}
              {allResults.filter(r => r.type === 'event').map((r, i) => (
                <ResultItem key={`e${i}`} result={r} selected={selected === allResults.indexOf(r)} onClick={() => handleSelect(r)}
                  icon={<AlertCircle size={12} />} severity={r.severity} />
              ))}

              {hasCountries && <SectionLabel label="Watch List" icon={<Globe size={9} />} />}
              {allResults.filter(r => r.type === 'country').map((r, i) => (
                <ResultItem key={`c${i}`} result={r} selected={selected === allResults.indexOf(r)} onClick={() => handleSelect(r)}
                  icon={<Globe size={12} />} />
              ))}
            </>
          )}

          {query.length > 0 && allResults.map((r, i) => (
            <ResultItem key={i} result={r} selected={selected === i} onClick={() => handleSelect(r)}
              icon={
                r.type === 'country'  ? <Globe size={12} /> :
                r.type === 'event'    ? <AlertCircle size={12} /> :
                r.type === 'alert'    ? <Radio size={12} /> :
                r.type === 'incident' ? <FileText size={12} /> :
                r.type === 'plot'     ? <Crosshair size={12} /> :
                r.type === 'action'   ? <Zap size={12} /> :
                                        <MapPin size={12} />
              }
              severity={r.severity} />
          ))}
        </div>

        <div className="ui-command-footer">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
          <span className="ui-command-footer__stats">{events.length} events · {alerts.length} alerts · {incidents.length} incidents · {plots.length} plots</span>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ label, icon, accent, danger }: { label: string; icon: React.ReactNode; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`ui-command-section${accent ? ' ui-command-section--accent' : ''}${danger ? ' ui-command-section--danger' : ''}`}>
      {icon} {label}
    </div>
  )
}

function ResultItem({ result, selected, onClick, icon, severity }: {
  result: SearchResult; selected: boolean; onClick: () => void; icon: React.ReactNode; severity?: string
}) {
  const severityColor = severity ? SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS] : undefined

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className={`ui-command-row${selected ? ' ui-command-row--selected' : ''}`}
    >
      <span style={{ color: severityColor ?? (selected ? 'var(--accent)' : 'var(--text-muted)'), flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ui-command-row__label">{result.label}</div>
        {result.sublabel && <div className="ui-command-row__sub">{result.sublabel}</div>}
      </div>
      {severityColor && (
        <span className={`ui-chip ui-chip--xs ui-chip--sev-${severity}`}>{severity}</span>
      )}
    </div>
  )
}
