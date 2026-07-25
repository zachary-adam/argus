'use client'
import { useState, useMemo, useEffect } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { IntelEvent } from '@/types'
import { TrustChip } from '@/components/TrustChip'
import { formatDistanceToNow, format } from 'date-fns'
import {
  ExternalLink, MapPin, Flag, MessageSquare,
  ChevronRight, Copy, Check, Globe, Clock, Layers, AlertTriangle, FileText,
  Mountain, Wind, ShieldCheck, FolderPlus, BarChart2, BookMarked,
} from 'lucide-react'
import { addIntelEventToCanvas, isEventOnCanvas, casesForEvent } from '@/lib/canvasEvents'
import { persistIntelEventsIfMissing, intelToUniversal } from '@/lib/eventPersist'
import {
  applyKeepToIntel,
  inferKeepDuration,
  retentionStatusLabel,
  isLiveFirehoseEvent,
  DEFAULT_LIVE_FEED_RETENTION,
} from '@/lib/eventRetention'
import type { EventKeepDuration } from '@/types/project'
import { SegControl } from '@/components/ui/SegControl'
import { isEventInJournal, journalEntryFromEvent } from '@/lib/journal'
import EventPaperSection from '@/components/EventPaperSection'
import type { GeoContext } from '@/app/api/geo-context/route'
import { haversineDistance } from '@/lib/haversine'
import type { VerificationResult } from '@/lib/verify'
import { displayCountry } from '@/lib/countryNames'
import { loadEffortLevel, getFeatureProvider } from '@/lib/aiConfig'
import { buildAnalysisHeaders, loadAnalysisEngine } from '@/lib/aiMode'
import { topicSourceBucket, topicSourceLabel, eventPublisherLabel, eventProvenanceLine } from '@/lib/topicIngest'
import { situationRelevance } from '@/lib/relevance'
import { userVisibleTags } from '@/lib/aimedIngest'
import { findContradictions } from '@/lib/contradictions'

const VERDICT_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  supported:      { label: 'Supported',    color: 'var(--verified)',        bg: 'var(--verified-bg)',      border: 'rgba(28,122,74,0.22)' },
  disputed:       { label: 'Disputed',     color: 'var(--warning)',         bg: 'var(--warning-bg)',       border: 'rgba(176,125,18,0.22)' },
  unverified:     { label: 'Unverified',   color: 'var(--text-muted)',      bg: 'var(--surface-elevated)', border: 'var(--border-subtle)' },
  'likely-false': { label: 'Likely false', color: 'var(--danger)',          bg: 'var(--danger-bg)',        border: 'rgba(207,43,52,0.22)' },
}

const SOURCE_LABELS: Record<string, string> = {
  gdelt: 'GDELT', gdacs: 'GDACS', reliefweb: 'ReliefWeb', usgs: 'USGS',
  who: 'WHO', firms: 'NASA FIRMS', rss: 'News RSS', ucdp: 'UCDP',
  acled: 'ACLED', ocha: 'OCHA', unhcr: 'UNHCR', fewsnet: 'FEWS NET',
}

const SEV_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: 'var(--critical)', bg: 'var(--sev-critical-bg)', border: 'var(--sev-critical-border)' },
  high:     { color: 'var(--high)',     bg: 'var(--sev-high-bg)',     border: 'var(--sev-high-border)' },
  medium:   { color: 'var(--medium)',   bg: 'var(--sev-medium-bg)',   border: 'var(--sev-medium-border)' },
  low:      { color: 'var(--low)',      bg: 'var(--sev-low-bg)',      border: 'var(--sev-low-border)' },
}

export default function EventDetailPanel() {
  // Per-slice subscriptions — open while you read an event, so a no-selector
  // subscribe re-rendered it on every 2s live tick. Select only what it uses.
  const selectedEvent = useMapStore(s => s.selectedEvent)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const events = useMapStore(s => s.events)
  const setEvents = useMapStore(s => s.setEvents)
  const flyTo = useMapStore(s => s.flyTo)
  const setMapFocusHighlights = useMapStore(s => s.setMapFocusHighlights)
  const clearMapFocusHighlights = useMapStore(s => s.clearMapFocusHighlights)
  const togglePanel = useMapStore(s => s.togglePanel)
  const pushToast = useMapStore(s => s.pushToast)
  const panels = useMapStore(s => s.panels)
  const { getActiveProject, updateEvent, createIncident, createCase, addEventToCase, addCanvasNode, addEvents, addJournalEntry } = useProjectStore()
  const project = getActiveProject()

  const [comment, setComment] = useState('')
  const [showComment, setShowComment] = useState(false)
  const [flagged, setFlagged] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tracked, setTracked] = useState(false)
  const [showFullBody, setShowFullBody] = useState(false)
  const [showCasePicker, setShowCasePicker] = useState(false)
  const [geoCtx, setGeoCtx] = useState<GeoContext | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verdict, setVerdict] = useState<VerificationResult | null>(null)
  const [verifyMap, setVerifyMap] = useState<Record<string, { title: string; url: string }>>({})
  const [keepDuration, setKeepDuration] = useState<EventKeepDuration | null>(null)

  const KEEP_OPTIONS: { value: EventKeepDuration; label: string }[] = [
    { value: '24h', label: '1 day' },
    { value: '7d', label: '1 week' },
    { value: '30d', label: '1 month' },
    { value: 'forever', label: 'Always' },
  ]

  // Clear any prior verdict when the analyst opens a different event.
  useEffect(() => { setVerdict(null); setVerifyMap({}) }, [selectedEvent?.id])
  useEffect(() => {
    if (selectedEvent) setKeepDuration(inferKeepDuration(selectedEvent))
  }, [selectedEvent?.id, selectedEvent?.expiresAt, selectedEvent?.tags])

  useEffect(() => {
    if (!selectedEvent) clearMapFocusHighlights()
  }, [selectedEvent, clearMapFocusHighlights])

  const onCanvas = useMemo(
    () => (selectedEvent ? isEventOnCanvas(project, selectedEvent.id) : false),
    [project, selectedEvent],
  )
  const eventCases = useMemo(
    () => (selectedEvent ? casesForEvent(project, selectedEvent.id) : []),
    [project, selectedEvent],
  )
  const inJournal = useMemo(
    () => (selectedEvent && project ? isEventInJournal(project, selectedEvent.id) : false),
    [project, selectedEvent],
  )

  const saveToJournal = () => {
    if (!selectedEvent || !project) return
    if (inJournal) {
      togglePanel('journal')
      return
    }
    persistIntelEventsIfMissing(project, [selectedEvent], addEvents, updateEvent, { keepDuration: 'forever', journalSaved: true })
    addJournalEntry(project.id, journalEntryFromEvent(selectedEvent, { significance: 'supporting' }))
    pushToast({
      title: 'Saved to journal',
      body: 'Event persisted with snapshot — open Journal to add notes',
      severity: 'info',
      type: 'system',
    })
  }

  const applyRetention = (duration: EventKeepDuration) => {
    if (!selectedEvent || !project) return
    const updated = applyKeepToIntel(selectedEvent, duration, { explicit: true })
    setKeepDuration(duration)
    setEvents(events.map(e => e.id === updated.id ? updated : e))
    setSelectedEvent(updated)
    const inProject = project.events.some(e => e.id === updated.id)
    if (inProject) {
      updateEvent(project.id, updated.id, {
        tags: updated.tags,
        expiresAt: updated.expiresAt,
        ingestedAt: updated.ingestedAt,
      })
    } else {
      addEvents(project.id, [intelToUniversal(updated, project.id, { keepDuration: duration })])
    }
    pushToast({
      title: 'Keep setting updated',
      body: retentionStatusLabel(updated, project.liveFeedRetention ?? DEFAULT_LIVE_FEED_RETENTION),
      severity: 'info',
      type: 'system',
    })
  }

  const runVerify = async () => {
    if (!selectedEvent) return
    setVerifying(true)
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-provider': getFeatureProvider('brief'),
          'x-effort': loadEffortLevel(),
          ...buildAnalysisHeaders(loadAnalysisEngine(project?.aiMode), project),
        },
        body: JSON.stringify({
          claim: selectedEvent,
          corpus: events,
          apiKey: project?.aiMode === 'byok' ? project.byokApiKey : undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setVerdict(data.result)
        setVerifyMap(data.sourceMap ?? {})
      }
    } catch { /* non-fatal */ } finally { setVerifying(false) }
  }

  useEffect(() => {
    setGeoCtx(null)
    if (!selectedEvent || (selectedEvent.lat === 0 && selectedEvent.lon === 0)) return
    fetch(`/api/geo-context?lat=${selectedEvent.lat}&lon=${selectedEvent.lon}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setGeoCtx(d))
      .catch(() => {})
  }, [selectedEvent])

  const ev = selectedEvent
  const hasLocation = ev ? (ev.lat !== 0 || ev.lon !== 0) : false

  // Nearby events — spatially within 200km and last 48h, sorted by recency
  const nearby = useMemo(() => {
    if (!ev || !hasLocation) return []
    const cutoff = Date.now() - 48 * 3_600_000
    return events
      .filter(e =>
        e.id !== ev.id &&
        (e.lat !== 0 || e.lon !== 0) &&
        new Date(e.timestamp).getTime() >= cutoff &&
        haversineDistance(ev.lat, ev.lon, e.lat, e.lon) <= 200
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5)
  }, [events, ev, hasLocation])

  // Related events — same country or same category, excluding self and nearby
  const nearbyIds = useMemo(() => new Set(nearby.map(e => e.id)), [nearby])
  const related = useMemo(() => {
    if (!ev) return []
    return events
      .filter(e =>
        e.id !== ev.id &&
        !nearbyIds.has(e.id) &&
        (e.country === ev.country || e.category === ev.category) &&
        e.severity !== 'low'
      )
      .sort((a, b) => {
        const sWeight = { critical: 4, high: 3, medium: 2, low: 1 }
        return (sWeight[b.severity as keyof typeof sWeight] ?? 0) - (sWeight[a.severity as keyof typeof sWeight] ?? 0)
      })
      .slice(0, 5)
  }, [events, ev, nearbyIds])

  const figureChecks = useMemo(() => {
    if (!ev) return []
    const pool = [ev, ...nearby, ...related]
    const unique = [...new Map(pool.map(e => [e.id, e])).values()]
    return findContradictions(unique.map(e => ({
      id: e.id,
      title: e.title,
      summary: e.summary,
      timestamp: e.timestamp,
    })))
  }, [ev, nearby, related])

  if (!ev) return null
  const articleBody = (ev as IntelEvent & { body?: string }).body
  const cleanSummary = ev.summary?.replace(/<[^>]*>/g, ' ').replace(/&\w+;/g, ' ').replace(/\s{2,}/g, ' ').trim() ?? ''
  const sourceBucket = topicSourceBucket(ev)
  const topicHit = project?.targeting ? situationRelevance(ev, project.targeting) : null
  const topicMatched = new Set((topicHit?.matched ?? []).map(m => m.toLowerCase()))
  const visibleTags = userVisibleTags(ev.tags).filter(t => !topicMatched.has(t.toLowerCase()))
  const sourceLabel = eventPublisherLabel(ev) ?? SOURCE_LABELS[ev.source] ?? ev.source?.toUpperCase() ?? '—'

  const sev = SEV_CONFIG[ev.severity] ?? SEV_CONFIG.low

  const focusOnMap = () => {
    if (!hasLocation) return
    flyTo(ev.lat, ev.lon, 7)
    const ids = [ev.id, ...nearby.map(n => n.id)]
    setMapFocusHighlights(
      ids,
      nearby.length > 0 ? `${ids.length} events within 200 km` : 'Selected event on map',
      { lat: ev.lat, lon: ev.lon, radiusKm: 200 },
    )
  }

  const createCaseFromEvent = () => {
    if (!project) return
    persistIntelEventsIfMissing(project, [ev], addEvents, updateEvent, { keepDuration: 'forever' })
    const c = createCase(project.id, {
      name: ev.title.slice(0, 72),
      researchQuestion: `What happens next around: ${ev.title.slice(0, 120)}`,
      notes: `${displayCountry(ev.country)} · ${ev.category}`,
    })
    addEventToCase(project.id, c.id, ev.id)
    setShowCasePicker(false)
    pushToast({ title: 'Case created', body: c.name, severity: 'info', type: 'system' })
    togglePanel('cases')
  }

  const copyLink = () => {
    const text = `[${ev.severity.toUpperCase()}] ${ev.title}\n${ev.country} · ${ev.source.toUpperCase()} · ${format(new Date(ev.timestamp), 'dd MMM yyyy HH:mm')}\n\n${ev.summary}\n\nSource: ${ev.url}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const saveComment = () => {
    if (!comment.trim()) return
    const { events: allEvts, setEvents } = useMapStore.getState()
    setEvents(allEvts.map(e =>
      e.id === ev.id
        ? { ...e, analystComments: [...(e.analystComments ?? []), comment.trim()] }
        : e
    ))
    setComment('')
    setShowComment(false)
  }

  // A full-screen workspace (canvas / ledger / project menu) covers the map, so
  // when one is open the detail uses the whole area. Otherwise it dodges the
  // feed / journal / side panels the way it always did in map view.
  // Which full-screen workspace is behind the detail (if any). When one is open
  // the detail covers the whole area; closing it returns you THERE (not the map).
  const workspaceLabel = panels.canvas ? 'canvas' : panels.ledger ? 'ledger' : panels.menu ? 'menu' : null
  const sideOpen = panels.velocity || panels.forecasts || panels.anomaly || panels.country || panels.alerts || panels.plotsPanel
  const posClass = workspaceLabel ? '' : [
    panels.eventFeed ? 'ui-event-fullscreen--feed' : '',
    panels.journal ? 'ui-event-fullscreen--journal' : '',
    sideOpen ? 'ui-event-fullscreen--side' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={`ui-event-fullscreen panel-slide-in ${posClass}`}>
      <div className="ui-event-drawer__stripe" style={{ background: sev.color }} />

      <header className="ui-event-drawer__header">
        <div className="ui-event-drawer__head-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ui-event-drawer__badges">
              <span className={`ui-chip ui-chip--xs ui-chip--sev-${ev.severity}`}>
                {ev.severity}
              </span>
              <span className="ui-chip">{ev.category}</span>
              <TrustChip event={ev} size="xs" />
            </div>
            <h2 className="ui-event-drawer__title">{ev.title}</h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.45 }}>
              {eventProvenanceLine(ev)}
            </p>
            {topicHit && topicHit.matched.length > 0 && (
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                Matched your topic: {topicHit.matched.slice(0, 4).join(', ')}
              </p>
            )}
            {eventCases.length > 0 && (
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                Cases: {eventCases.map(c => c.name).join(' · ')}
              </p>
            )}
            {visibleTags.length > 0 && (
              <div className="ui-event-drawer__tags">
                {visibleTags.map(tag => <span key={tag} className="ui-chip" style={{ fontSize: 9 }}>{tag}</span>)}
              </div>
            )}
          </div>
          <div className="ui-event-drawer__head-actions">
            <button
              type="button"
              className="ui-event-dismiss"
              onClick={() => setSelectedEvent(null)}
              aria-label="Close (Esc)"
              title="Close (Esc)"
            >
              <kbd>esc</kbd>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="ui-event-drawer__actions">
          <ActionBtn
            icon={MapPin}
            label="Map"
            onClick={focusOnMap}
            color={hasLocation ? 'var(--accent)' : 'var(--text-muted)'}
            disabled={!hasLocation}
          />
          <ActionBtn
            icon={copied ? Check : Copy}
            label={copied ? 'Copied' : 'Copy'}
            onClick={copyLink}
            color={copied ? 'var(--low)' : 'var(--text-secondary)'}
          />
          <ActionBtn
            icon={BookMarked}
            label={inJournal ? 'Journal' : 'Save'}
            onClick={saveToJournal}
            color={inJournal ? 'var(--accent)' : 'var(--text-secondary)'}
            active={inJournal}
          />
          <ActionBtn
            icon={Flag}
            label={flagged ? 'Flagged' : 'Flag'}
            onClick={() => setFlagged(v => !v)}
            color={flagged ? 'var(--medium)' : 'var(--text-secondary)'}
            active={flagged}
          />
          <ActionBtn
            icon={AlertTriangle}
            label={tracked ? 'Tracked' : 'Track'}
            onClick={() => {
              if (!tracked && project) {
                createIncident(project.id, {
                  title: ev.title,
                  summary: ev.summary,
                  severity: ev.severity as 'critical' | 'high' | 'medium' | 'low',
                  country: ev.country,
                  category: ev.category,
                  stage: 'monitoring',
                  linkedEventIds: [ev.id],
                  tags: [],
                })
                setTracked(true)
                togglePanel('incidents')
              }
            }}
            color={tracked ? 'var(--low)' : 'var(--text-secondary)'}
            active={tracked}
          />
          <ActionBtn
            icon={ExternalLink}
            label="Open article"
            onClick={() => ev.url && window.open(ev.url, '_blank')}
            color={ev.url ? 'var(--accent)' : 'var(--text-muted)'}
            disabled={!ev.url}
          />
          <ActionBtn
            icon={ShieldCheck}
            label={verifying ? 'Checking…' : verdict ? (VERDICT_CFG[verdict.verdict]?.label ?? 'Checked') : 'Cross-check'}
            onClick={runVerify}
            color={verdict ? (VERDICT_CFG[verdict.verdict]?.color ?? 'var(--text-secondary)') : 'var(--text-secondary)'}
            active={!!verdict}
            disabled={verifying}
          />
          <ActionBtn
            icon={FolderPlus}
            label="Case"
            onClick={() => {
              if (project && (project.cases ?? []).length === 0) {
                createCaseFromEvent()
              } else {
                setShowCasePicker(v => !v)
              }
            }}
            color="var(--text-secondary)"
            active={showCasePicker}
          />
          <ActionBtn
            icon={BarChart2}
            label={onCanvas ? 'On canvas' : 'Canvas'}
            onClick={() => {
              addIntelEventToCanvas(project, ev, addCanvasNode, {
                openCanvas: true,
                onOpenCanvas: () => togglePanel('canvas'),
                onAlready: () => pushToast({ title: 'Already on canvas', body: ev.title, severity: 'info', type: 'system' }),
                onAdded: () => pushToast({ title: 'Added to canvas', body: ev.title, severity: 'info', type: 'system' }),
                addEvents,
              })
            }}
            color={onCanvas ? 'var(--accent)' : 'var(--text-secondary)'}
            active={onCanvas}
            disabled={!project}
          />
        </div>
        {/* Case picker dropdown */}
        {showCasePicker && project && (project.cases ?? []).length > 0 && (
          <div className="ui-case-picker">
            <div className="ui-dropdown-head">Add to case</div>
            {(project.cases ?? []).filter(c => c.status !== 'closed').map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  if (project) {
                    persistIntelEventsIfMissing(project, [ev], addEvents, updateEvent, { keepDuration: 'forever' })
                    addEventToCase(project.id, c.id, ev.id)
                  }
                  setShowCasePicker(false)
                }}
                className={`ui-case-picker__row${c.eventIds.includes(ev.id) ? ' ui-case-picker__row--added' : ''}`}
              >
                {c.eventIds.includes(ev.id) ? '✓ ' : ''}{c.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setShowCasePicker(false); createCaseFromEvent() }}
              className="ui-case-picker__row ui-case-picker__row--link"
            >
              + New case from this event
            </button>
          </div>
        )}
      </header>

      <div className="ui-panel-body" style={{ padding: 0 }}>
        {/* Verification verdict — claim checked against the workspace's own graded corpus */}
        {verdict && (() => {
          const c = VERDICT_CFG[verdict.verdict] ?? VERDICT_CFG.unverified
          return (
            <div className="ui-event-verify" style={{ background: c.bg, borderColor: c.border }}>
              <div className="ui-event-verify__head">
                <ShieldCheck size={12} style={{ color: c.color }} />
                <span className="ui-kicker" style={{ marginBottom: 0, color: 'var(--text-muted)' }}>Source check</span>
                <span className="ui-chip ui-chip--xs" style={{ color: c.color, background: 'var(--surface)', borderColor: c.border }}>{c.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {Math.round((verdict.confidence ?? 0) * 100)}% confidence
                </span>
              </div>
              <div className="ui-event-drawer__prose" style={{ color: 'var(--text-primary)', marginBottom: verdict.sourceAssessment ? 6 : 0 }}>{verdict.reasoning}</div>
              {verdict.sourceAssessment && <div className="ui-event-drawer__prose" style={{ fontSize: 10.5, marginBottom: 8 }}>{verdict.sourceAssessment}</div>}
              <div className="ui-event-verify__bar">
                <div className="ui-event-verify__bar-fill" style={{ width: `${Math.round((verdict.confidence ?? 0) * 100)}%`, background: c.color }} />
              </div>
              {(verdict.supporting?.length > 0 || verdict.contradicting?.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  <EvidenceList label="Supporting" tags={verdict.supporting} map={verifyMap} color="var(--low)" />
                  <EvidenceList label="Contradicting" tags={verdict.contradicting} map={verifyMap} color="var(--critical)" />
                </div>
              )}
            </div>
          )
        })()}

        {/* Summary */}
        <div className="ui-event-drawer__section">
          <div className="ui-section-label">Summary</div>
          <div className="ui-event-drawer__prose">{cleanSummary || 'No summary available.'}</div>
        </div>

        {project && <EventPaperSection project={project} event={ev} />}

        {/* Article body — only for scraped/user-provided sources */}
        {articleBody && articleBody.length > 100 && (
          <div className="ui-event-drawer__section ui-event-drawer__section--compact">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <FileText size={9} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Source Article
                </span>
              </div>
              <span style={{ fontSize: 9, color: 'var(--badge-blue-fg)', background: 'var(--badge-blue-bg)', border: '1px solid var(--badge-blue-border)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
                {articleBody.length > 1000 ? `${(articleBody.length / 1000).toFixed(1)}k` : `${articleBody.length}`} chars
              </span>
            </div>
            <div style={{
              fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.7,
              maxHeight: showFullBody ? 'none' : 120,
              overflow: 'hidden',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {(() => {
                const clean = articleBody.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim()
                return showFullBody ? clean : clean.slice(0, 400) + (clean.length > 400 ? '…' : '')
              })()}
            </div>
            {articleBody.length > 400 && (
              <button
                type="button"
                onClick={() => setShowFullBody(v => !v)}
                className="ui-link"
                style={{ fontSize: 10, marginTop: 6, fontWeight: 600, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
              >
                {showFullBody ? 'Show less' : 'Read full article'}
              </button>
            )}
          </div>
        )}

        {/* Metadata grid */}
        <div className="ui-event-drawer__section ui-event-drawer__section--compact">
          <div className="ui-section-label">Details</div>
          <div className="ui-meta-grid">
            <MetaItem icon={Globe} label="Country" value={displayCountry(ev.country)} />
            <MetaItem icon={Layers} label="How it arrived" value={topicSourceLabel(sourceBucket)} />
            <MetaItem icon={ExternalLink} label="Publisher" value={sourceLabel} />
            <MetaItem icon={MapPin} label="Coordinates" value={hasLocation ? `${ev.lat.toFixed(2)}, ${ev.lon.toFixed(2)}` : 'Unknown'} mono />
            <MetaItem icon={Clock} label="Reported" value={formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })} />
            {geoCtx?.elevation != null && (
              <MetaItem icon={Mountain} label="Elevation" value={`${geoCtx.elevation.toLocaleString()} m`} />
            )}
            {geoCtx?.aqi != null && (
              <MetaItem icon={Wind} label="Air quality" value={`${geoCtx.aqi}${geoCtx.aqiCategory ? ` (${geoCtx.aqiCategory})` : ''}`} />
            )}
            {(ev as IntelEvent & { fatalities?: number }).fatalities !== undefined && (
              <MetaItem icon={Flag} label="Fatalities" value={String((ev as IntelEvent & { fatalities?: number }).fatalities)} color="var(--critical)" />
            )}
          </div>

          {/* Timestamp detail */}
          <div style={{ marginTop: 10, padding: '6px 10px', background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            <div>{format(new Date(ev.timestamp), "EEE dd MMM yyyy 'at' HH:mm 'UTC'")}</div>
            {geoCtx?.localTime && (
              <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                Local: {geoCtx.localTime}
              </div>
            )}
          </div>
        </div>

        {figureChecks.length > 0 && (
          <div className="ui-event-drawer__section ui-event-drawer__section--compact">
            <div className="ui-section-label">Conflicting figures</div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Different casualty counts in related reports — verify before citing.
            </p>
            {figureChecks.map((c, i) => (
              <div key={i} className="ui-callout" style={{ marginBottom: 8, fontSize: 10, lineHeight: 1.55, borderLeft: '3px solid var(--high)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                  <AlertTriangle size={11} color="var(--high)" />
                  {c.term}: {c.reports.map(r => r.value).join(' vs ')}
                  <span className="ui-chip ui-chip--xs" style={{ fontSize: 8 }}>
                    {c.kind === 'conflicting' ? 'same day' : 'figure walked back'}
                  </span>
                </div>
                {c.reports.map(r => (
                  <div key={r.eventId} style={{ color: 'var(--text-muted)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.value}</span>
                    {' — '}
                    <button
                      type="button"
                      className="ui-link"
                      style={{ fontSize: 10 }}
                      onClick={() => {
                        const evt = events.find(e => e.id === r.eventId)
                        if (evt) setSelectedEvent(evt)
                      }}
                    >
                      {r.title.slice(0, 60)}{r.title.length > 60 ? '…' : ''}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="ui-event-drawer__section ui-event-drawer__section--compact">
          <div className="ui-section-label">Keep this event</div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
            {isLiveFirehoseEvent(ev)
              ? `Otherwise it drops from the live feed after ${project?.liveFeedRetention ?? DEFAULT_LIVE_FEED_RETENTION}.`
              : retentionStatusLabel(ev, project?.liveFeedRetention ?? DEFAULT_LIVE_FEED_RETENTION)}
          </p>
          <SegControl
            size="sm"
            value={keepDuration}
            onChange={applyRetention}
            options={KEEP_OPTIONS}
          />
          {isLiveFirehoseEvent(ev) && (
            <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
              Choosing a duration saves this event to your project.
            </p>
          )}
        </div>

        {/* Nearby events — spatial 200km / 48h */}
        {nearby.length > 0 && (
          <div className="ui-event-drawer__section ui-event-drawer__section--compact">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <div className="ui-section-label" style={{ marginBottom: 0 }}>Nearby events ({nearby.length})</div>
              {hasLocation && (
                <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 9, padding: '2px 8px' }} onClick={focusOnMap}>
                  Show on map
                </button>
              )}
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 8px' }}>Within 200 km, last 48 hours</p>
            {nearby.map(r => {
              const rc = SEV_CONFIG[r.severity] ?? SEV_CONFIG.low
              const dist = Math.round(haversineDistance(ev.lat, ev.lon, r.lat, r.lon))
              return (
                <button
                  key={r.id}
                  type="button"
                  className="ui-related-row"
                  onClick={() => { setSelectedEvent(r); if (r.lat !== 0 || r.lon !== 0) flyTo(r.lat, r.lon, 6) }}
                >
                  <div className="ui-sev-dot" style={{ width: 6, height: 6, marginTop: 0, background: rc.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{dist} km · {formatDistanceToNow(new Date(r.timestamp), { addSuffix: true })}</div>
                  </div>
                  <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              )
            })}
          </div>
        )}

        {related.length > 0 && (
          <div className="ui-event-drawer__section ui-event-drawer__section--compact">
            <div className="ui-section-label">Related ({related.length})</div>
            {related.map(r => {
              const rc = SEV_CONFIG[r.severity] ?? SEV_CONFIG.low
              return (
                <button
                  key={r.id}
                  type="button"
                  className="ui-related-row"
                  onClick={() => { setSelectedEvent(r); if (r.lat !== 0 || r.lon !== 0) flyTo(r.lat, r.lon, 6) }}
                >
                  <div className="ui-sev-dot" style={{ width: 6, height: 6, marginTop: 0, background: rc.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {r.country === ev.country ? 'Same country' : 'Same category'} · {formatDistanceToNow(new Date(r.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                  <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              )
            })}
          </div>
        )}

        <div className="ui-event-drawer__section ui-event-drawer__section--compact" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showComment ? 8 : 0 }}>
            <span className="ui-section-label" style={{ marginBottom: 0 }}>Analyst notes</span>
            <button
              type="button"
              onClick={() => setShowComment(v => !v)}
              className="ui-link"
              style={{ fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
            >
              <MessageSquare size={10} /> {showComment ? 'Cancel' : 'Add note'}
            </button>
          </div>

          {(ev.analystComments ?? []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: showComment ? 8 : 0 }}>
              {ev.analystComments!.map((c, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--text-primary)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 8px', lineHeight: 1.5 }}>
                  {c}
                </div>
              ))}
            </div>
          )}

          {showComment && (
            <div>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Assessment, context, or action note…"
                rows={3}
                autoFocus
                className="ui-input"
                style={{ resize: 'none', lineHeight: 1.6 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" onClick={saveComment} disabled={!comment.trim()} className="ui-btn ui-btn--primary" style={{ fontSize: 11, padding: '6px 12px' }}>
                  Save note
                </button>
              </div>
            </div>
          )}

          {(ev.analystComments ?? []).length === 0 && !showComment && (
            <p className="ui-subtitle ui-subtitle--panel" style={{ margin: 0 }}>No notes yet — add context for your team.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ icon: Icon, label, onClick, color, active, disabled }: {
  icon: React.ElementType; label: string; onClick: () => void; color: string; active?: boolean; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`ui-btn ui-btn--ghost ui-event-action-btn${active ? ' ui-event-action-btn--active' : ''}`}
      style={{ color, opacity: disabled ? 0.45 : 1 }}
    >
      <Icon size={12} aria-hidden />
      <span className="ui-event-action-btn__label">{label}</span>
    </button>
  )
}

function EvidenceList({ label, tags, map, color }: {
  label: string; tags: string[]; map: Record<string, { title: string; url: string }>; color: string
}) {
  const items = (tags ?? []).map(t => ({ t, ...(map[t] ?? {}) })).filter(x => x.title)
  if (items.length === 0) return null
  return (
    <div>
      <div className="ui-event-evidence__label" style={{ color }}>{label} ({items.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(x => (
          <div key={x.t} className="ui-event-evidence__row">
            <span className="ui-event-evidence__tag" style={{ color }}>[{x.t}]</span>
            {x.url
              ? <a href={x.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</a>
              : <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function MetaItem({ icon: Icon, label, value, mono, color }: {
  icon: React.ElementType; label: string; value: string; mono?: boolean; color?: string
}) {
  return (
    <div>
      <div className="ui-event-meta-item__label">
        <Icon size={9} />
        <span>{label}</span>
      </div>
      <div className={`ui-event-meta-item__value${mono ? ' ui-event-meta-item__value--mono' : ''}`} style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  )
}
