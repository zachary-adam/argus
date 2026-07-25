'use client'
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMapStore } from '@/stores/mapStore'
import { hasValidGeo } from '@/lib/geo'
import { isLikelyEnglish } from '@/lib/lang'
import { useProjectStore } from '@/stores/projectStore'
import { IntelEvent } from '@/types'
import { SEVERITY_COLORS } from '@/lib/constants'
import { formatDistanceToNow } from 'date-fns'
import { FileDown, Trash2, Search, BarChart2, BookMarked, BookOpen, HelpCircle, X } from 'lucide-react'
import { isDemoEvent } from '@/lib/demoEvents'
import { addIntelEventToCanvas, canvasEventIds, eventCaseLabels } from '@/lib/canvasEvents'
import { persistIntelEventsIfMissing } from '@/lib/eventPersist'
import { isEventInJournal, journalEntryFromEvent } from '@/lib/journal'
import { displayCountry } from '@/lib/countryNames'
import { situationRelevance } from '@/lib/relevance'
import { topicSourceBucket, topicSourceShortLabel, eventPublisherLabel } from '@/lib/topicIngest'
import { hasTopicTargeting } from '@/lib/topicEvents'
import { getRelevanceScore } from '@/lib/relevanceClient'
import { SegControl } from '@/components/ui/SegControl'
import { EmptyState } from '@/components/ui/EmptyState'
import { EvidenceGapsBanner } from '@/components/EvidenceGapsBanner'
import { FeedPanelSkeleton } from '@/components/skeletons'
import { useDeepRelevanceFilter } from '@/lib/relevanceMode'
import { buildAiFetchHeaders } from '@/lib/aiConfig'
import { loadAnalysisEngine } from '@/lib/aiMode'
import { useDisplayEvents } from '@/lib/hooks/useDisplayEvents'
import {
  eventAgeAnchor,
  isCuratedEvent,
  isOutsideDateWindow,
  pruneMapAndProjectByDateFilter,
  applyKeepToIntel,
} from '@/lib/eventRetention'
import { intelToUniversal } from '@/lib/eventPersist'

const WINDOW_OPTIONS = [
  { label: '6h', value: '6h' as const },
  { label: '24h', value: '24h' as const },
  { label: '7d', value: '7d' as const },
  { label: '30d', value: '30d' as const },
  { label: 'All', value: 'all' as const },
]

const SOURCE_LABELS: Record<string, string> = {
  gdelt: 'GDELT', gdacs: 'GDACS', reliefweb: 'ReliefWeb', usgs: 'USGS',
  who: 'WHO', firms: 'NASA FIRMS', rss: 'News RSS', ucdp: 'UCDP',
  acled: 'ACLED', ocha: 'OCHA', unhcr: 'UNHCR', fewsnet: 'FEWS NET',
}

const CATEGORIES = ['all', 'conflict', 'political', 'disaster', 'health', 'humanitarian', 'environmental', 'disinfo']
const CATEGORY_LABELS: Record<string, string> = {
  all: 'All', conflict: 'Conflict', political: 'Political', disaster: 'Disaster',
  health: 'Health', humanitarian: 'Humanitarian', environmental: 'Environmental',
  disinfo: 'Disinfo',
}

const sessionStart = Date.now()


// Events older than this are dimmed (recency = relevance)
const DECAY_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2 hours

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="ui-mark">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// Urgency decay: 0 = fresh, 1 = fully decayed
function decayFactor(timestamp: string): number {
  const age = Date.now() - new Date(timestamp).getTime()
  return Math.min(1, age / DECAY_THRESHOLD_MS)
}

export default function EventFeed() {
  const events = useDisplayEvents()
  const evidenceView = useMapStore(s => s.evidenceView)
  const setEvidenceView = useMapStore(s => s.setEvidenceView)
  const eventFilter = useMapStore(s => s.eventFilter)
  const setEventFilter = useMapStore(s => s.setEventFilter)
  const severityFilter = useMapStore(s => s.severityFilter)
  const setSeverityFilter = useMapStore(s => s.setSeverityFilter)
  const dateFilter = useMapStore(s => s.dateFilter)
  const setDateFilter = useMapStore(s => s.setDateFilter)
  const searchQuery = useMapStore(s => s.searchQuery)
  const setSearchQuery = useMapStore(s => s.setSearchQuery)
  const flyTo = useMapStore(s => s.flyTo)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const selectedEvent = useMapStore(s => s.selectedEvent)
  const removeEvent = useMapStore(s => s.removeEvent)
  const setEvents = useMapStore(s => s.setEvents)
  const mapEvents = useMapStore(s => s.events)
  const togglePanel = useMapStore(s => s.togglePanel)
  const setAddSourceOpen = useMapStore(s => s.setAddSourceOpen)
  const focusWorkbench = useMapStore(s => s.focusWorkbench)
  const eventsLoading = useMapStore(s => s.eventsLoading)
  const pushToast = useMapStore(s => s.pushToast)
  const { getActiveProject, removeEvent: removeProjectEvent, addCanvasNode, addEvents, updateEvent, addJournalEntry } = useProjectStore()
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('argus_read_ids')
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>()
    } catch { return new Set<string>() }
  })
  const [focusIdx, setFocusIdx] = useState(-1)
  const [beatFilter, setBeatFilter] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [keysHelpOpen, setKeysHelpOpen] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [prevSessionCount] = useState(() => {
    try { return parseInt(localStorage.getItem('argus_prev_event_count') || '0', 10) } catch { return 0 }
  })
  const project = getActiveProject()
  const deepFilter = useDeepRelevanceFilter()
  const onCanvasIds = useMemo(() => canvasEventIds(project), [project])
  const journalEventIds = useMemo(
    () => new Set((project?.journal ?? []).filter(e => e.kind === 'event' && e.eventId).map(e => e.eventId!)),
    [project?.journal],
  )
  const paperCountByEventId = useMemo(() => {
    const m = new Map<string, number>()
    for (const link of project?.eventPaperLinks ?? []) {
      m.set(link.eventId, (m.get(link.eventId) ?? 0) + 1)
    }
    return m
  }, [project?.eventPaperLinks])
  const caseLabelsByEvent = useMemo(() => eventCaseLabels(project), [project])
  const targeting = project?.targeting
  const topicConfigured = hasTopicTargeting(targeting)

  const beatCount = useMemo(() => events.filter(e => {
    const b = topicSourceBucket(e)
    return b === 'aimed' || b === 'yours'
  }).length, [events])

  const relevanceById = useMemo(() => {
    if (!targeting) return new Map<string, string[]>()
    const m = new Map<string, string[]>()
    for (const e of events) {
      const r = situationRelevance(e, targeting)
      if (r.matched.length > 0) m.set(e.id, r.matched)
    }
    return m
  }, [events, targeting])

  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (events.length > 0) {
      try { localStorage.setItem('argus_prev_event_count', String(events.length)) } catch { /* noop */ }
    }
  }, [events.length])

  const q = searchQuery.trim().toLowerCase()
  const filtered = useMemo(() => events.filter(e => {
    // Info-ops (fact-check/social noise) are quarantined: only visible under the
    // dedicated "Disinfo" tab, hidden from every normal view.
    if (eventFilter === 'disinfo') { if (!e.infoOps) return false }
    else {
      if (e.infoOps) return false
      if (eventFilter !== 'all' && e.category !== eventFilter) return false
    }
    if (severityFilter !== 'all' && e.severity !== severityFilter) return false
    if (beatFilter) {
      const b = topicSourceBucket(e)
      if (b !== 'aimed' && b !== 'yours') return false
    }
    if (dateFilter !== 'all') {
      const ms = dateFilter === '6h' ? 6 : dateFilter === '24h' ? 24 : dateFilter === '7d' ? 168 : dateFilter === '30d' ? 720 : 0
      if (ms > 0 && Date.now() - eventAgeAnchor(e) > ms * 3600 * 1000) return false
    }
    if (!q) return true
    return e.title.toLowerCase().includes(q) || e.country.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q)
  }), [events, eventFilter, severityFilter, dateFilter, beatFilter, q])

  const criticalCount = useMemo(() => filtered.filter(e => e.severity === 'critical').length, [filtered])

  const newSinceLastSession = prevSessionCount > 0 && events.length > prevSessionCount
    ? events.length - prevSessionCount : 0

  const headerSubtitle = useMemo(() => {
    const parts = [`${filtered.length} event${filtered.length === 1 ? '' : 's'}`]
    if (newSinceLastSession > 0) parts.push(`${newSinceLastSession} new`)
    if (evidenceView === 'journal') parts.push('saved only')
    else if (beatFilter) parts.push('your beat')
    return parts.join(' · ')
  }, [filtered.length, newSinceLastSession, evidenceView, beatFilter])
  const uniqueSources = useMemo(() => new Set(events.map(e => e.source)).size, [events])
  const infoOpsCount  = useMemo(() => events.filter(e => e.infoOps).length, [events])
  const demoCount     = useMemo(() => events.filter(isDemoEvent).length, [events])

  const hiddenByDateCount = useMemo(() => {
    if (dateFilter === 'all') return 0
    return mapEvents.filter(e => !isCuratedEvent(e) && isOutsideDateWindow(e, dateFilter)).length
  }, [mapEvents, dateFilter])

  const pruneHiddenByDate = useCallback(() => {
    if (dateFilter === 'all' || !project) return
    const pruned = pruneMapAndProjectByDateFilter(mapEvents, dateFilter, project, removeProjectEvent)
    const removed = mapEvents.length - pruned.length
    if (removed === 0) return
    setEvents(pruned)
    pushToast({
      title: `Removed ${removed} older event${removed !== 1 ? 's' : ''}`,
      body: 'Saved and journal events were kept.',
      severity: 'info',
      type: 'system',
    })
  }, [dateFilter, mapEvents, setEvents, pushToast, project, removeProjectEvent])

  const applyDateFilter = useCallback((next: typeof dateFilter) => {
    setDateFilter(next)
    if (next === 'all') return
    const proj = getActiveProject()
    const current = useMapStore.getState().events
    const pruned = pruneMapAndProjectByDateFilter(current, next, proj, removeProjectEvent)
    const removed = current.length - pruned.length
    if (removed === 0) return
    setEvents(pruned)
    pushToast({
      title: `Removed ${removed} older event${removed !== 1 ? 's' : ''}`,
      body: 'Saved and journal events were kept.',
      severity: 'info',
      type: 'system',
    })
  }, [setDateFilter, getActiveProject, removeProjectEvent, setEvents, pushToast])

  const virtualizer = useVirtualizer({
    count:         filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize:  () => 72,
    overscan:      6,          // render 6 items above/below viewport
  })

  // Session digest: new events since last visit (shown in header subtitle)

  const isNew = (e: IntelEvent) => {
    const ts = new Date(e.timestamp).getTime()
    return ts > sessionStart - 1000 * 60 * 30 && !readIds.has(e.id)
  }

  // Correlation: same country as selected event
  const correlatedCountry = selectedEvent?.country ?? null

  // Only animate the 3 most recent unread critical events — not all of them
  const animatedCriticalIds = useMemo(() => {
    return new Set(
      filtered
        .filter(e => e.severity === 'critical' && !readIds.has(e.id))
        .slice(0, 3)
        .map(e => e.id)
    )
  }, [filtered, readIds])

  const markRead = useCallback((id: string) => {
    setReadIds(prev => {
      const next = new Set([...prev, id])
      try { sessionStorage.setItem('argus_read_ids', JSON.stringify([...next])) } catch { /* noop */ }
      return next
    })
  }, [])

  const handleClick = useCallback((event: IntelEvent, idx: number) => {
    if (batchMode) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(event.id)) next.delete(event.id)
        else next.add(event.id)
        return next
      })
      return
    }
    markRead(event.id)
    setFocusIdx(idx)
    // Only move the camera if the event actually has a real location — otherwise
    // we'd fly to 0,0 (Null Island, Gulf of Guinea). The detail panel still opens.
    if (hasValidGeo(event.lat, event.lon)) flyTo(event.lat, event.lon, 6)
    setSelectedEvent(event)
  }, [markRead, flyTo, setSelectedEvent, batchMode])

  const handleSaveToJournal = useCallback((event: IntelEvent) => {
    if (!project) return
    if (isEventInJournal(project, event.id)) {
      togglePanel('journal')
      return
    }
    persistIntelEventsIfMissing(project, [event], addEvents, updateEvent, { keepDuration: 'forever', journalSaved: true })
    addJournalEntry(project.id, journalEntryFromEvent(event))
    pushToast({ title: 'Saved to journal', body: event.title.slice(0, 80), severity: 'info', type: 'system' })
  }, [project, addEvents, updateEvent, addJournalEntry, togglePanel, pushToast])

  const handleBatchSaveToJournal = useCallback(() => {
    if (!project || selectedIds.size === 0) return
    const picked = events.filter(e => selectedIds.has(e.id))
    persistIntelEventsIfMissing(project, picked, addEvents, updateEvent, { keepDuration: 'forever', journalSaved: true })
    for (const event of picked) {
      if (!isEventInJournal(project, event.id)) {
        addJournalEntry(project.id, journalEntryFromEvent(event))
      }
    }
    pushToast({
      title: `Saved ${picked.length} to journal`,
      body: 'Events kept permanently',
      severity: 'info',
      type: 'system',
    })
    setSelectedIds(new Set())
    setBatchMode(false)
  }, [project, selectedIds, events, addEvents, updateEvent, addJournalEntry, pushToast])

  const handleBatchKeep = useCallback(() => {
    if (!project || selectedIds.size === 0) return
    const picked = events.filter(e => selectedIds.has(e.id))
    const updatedMap = new Map<string, IntelEvent>()
    for (const event of picked) {
      const updated = applyKeepToIntel(event, '7d', { explicit: true })
      updatedMap.set(updated.id, updated)
      const inProject = project.events.some(e => e.id === updated.id)
      if (inProject) {
        updateEvent(project.id, updated.id, {
          tags: updated.tags,
          expiresAt: updated.expiresAt,
          ingestedAt: updated.ingestedAt,
        })
      } else {
        addEvents(project.id, [intelToUniversal(updated, project.id, { keepDuration: '7d' })])
      }
    }
    setEvents(events.map(e => updatedMap.get(e.id) ?? e))
    pushToast({
      title: `Keeping ${picked.length} for 1 week`,
      body: 'Change per-event in detail panel if needed',
      severity: 'info',
      type: 'system',
    })
    setSelectedIds(new Set())
    setBatchMode(false)
  }, [project, selectedIds, events, setEvents, updateEvent, addEvents, pushToast])

  const handleAddToCanvas = useCallback((event: IntelEvent, openCanvas = false) => {
    addIntelEventToCanvas(project, event, addCanvasNode, {
      openCanvas,
      onOpenCanvas: openCanvas ? () => togglePanel('canvas') : undefined,
      onAlready: () => pushToast({ title: 'Already on canvas', body: event.title, severity: 'info', type: 'system' }),
      onAdded: () => pushToast({ title: 'Added to canvas', body: event.title, severity: 'info', type: 'system' }),
      addEvents,
      updateEvent,
    })
  }, [project, addCanvasNode, addEvents, updateEvent, togglePanel, pushToast])

  const handleDelete = useCallback((id: string) => {
    removeEvent(id)
    const project = getActiveProject()
    if (project) removeProjectEvent(project.id, id)
  }, [removeEvent, removeProjectEvent, getActiveProject])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); setKeysHelpOpen(v => !v); return }
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && focusIdx >= 0 && filtered[focusIdx]) handleClick(filtered[focusIdx], focusIdx)
      if (e.key === 'Escape') { setFocusIdx(-1); searchRef.current?.blur(); setSearchQuery('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, focusIdx, handleClick, setSearchQuery])

  useEffect(() => {
    if (focusIdx < 0) return
    virtualizer.scrollToIndex(focusIdx, { align: 'auto', behavior: 'smooth' })
  }, [focusIdx, virtualizer])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (severityFilter !== 'all') n++
    if (dateFilter !== 'all') n++
    if (eventFilter !== 'all') n++
    if (beatFilter) n++
    if (evidenceView === 'journal') n++
    return n
  }, [severityFilter, dateFilter, eventFilter, beatFilter, evidenceView])

  if (eventsLoading && events.length === 0) {
    return <FeedPanelSkeleton />
  }

  return (
    <div className="ui-map-float-panel ui-map-float-panel--feed">
      <div className="ui-map-float-panel__body ui-feed-simple">
      <div className="ui-feed-header ui-feed-header--simple">
        <div className="ui-feed-header__row">
          <div>
            <div className="ui-title ui-title--panel">Events</div>
            <div className="ui-feed-header__sub">{headerSubtitle}</div>
          </div>
          <div className="ui-map-float-panel__head-actions">
            {criticalCount > 0 && (
              <span className="ui-chip ui-chip--xs ui-chip--sev-critical">{criticalCount} critical</span>
            )}
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--icon"
              onClick={() => focusWorkbench('map')}
              aria-label="Close events"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="ui-input-wrap ui-feed-search">
          <Search size={14} className="ui-input-wrap__icon" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search events…"
            className="ui-input"
            style={{ paddingLeft: 32 }}
          />
          {searchQuery && (
            <button type="button" className="ui-input-wrap__clear" onClick={() => { setSearchQuery(''); searchRef.current?.focus() }} aria-label="Clear">×</button>
          )}
        </div>

        <div className="ui-feed-toolbar">
          <button
            type="button"
            className={`ui-btn ui-btn--ghost ui-feed-toolbar__btn${filtersOpen ? ' ui-feed-toolbar__btn--active' : ''}`}
            onClick={() => setFiltersOpen(v => !v)}
          >
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
          <button
            type="button"
            className={`ui-btn ui-btn--ghost ui-feed-toolbar__btn${evidenceView === 'journal' ? ' ui-feed-toolbar__btn--active' : ''}`}
            onClick={() => setEvidenceView(evidenceView === 'journal' ? 'live' : 'journal')}
          >
            {evidenceView === 'journal' ? 'Saved only' : 'All events'}
          </button>
          <button
            type="button"
            className={`ui-btn ui-btn--ghost ui-feed-toolbar__btn${batchMode ? ' ui-feed-toolbar__btn--active' : ''}`}
            onClick={() => {
              setBatchMode(v => {
                if (v) setSelectedIds(new Set())
                return !v
              })
            }}
          >
            {batchMode ? 'Cancel' : 'Select'}
          </button>
          <button
            type="button"
            className={`ui-btn ui-btn--ghost ui-feed-toolbar__btn ui-feed-toolbar__btn--help${keysHelpOpen ? ' ui-feed-toolbar__btn--active' : ''}`}
            onClick={() => setKeysHelpOpen(v => !v)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            <HelpCircle size={12} />
          </button>
        </div>

        {keysHelpOpen && (
          <div className="ui-feed-keys-help">
            <div className="ui-feed-keys-help__title">Keyboard shortcuts</div>
            <ul className="ui-feed-keys-help__list">
              <li><kbd>/</kbd> Search</li>
              <li><kbd>j</kbd> <kbd>k</kbd> Move up / down</li>
              <li><kbd>Enter</kbd> Open event</li>
              <li><kbd>Esc</kbd> Clear search</li>
              <li><kbd>?</kbd> Toggle this help</li>
            </ul>
          </div>
        )}

        {filtersOpen && (
          <div className="ui-feed-filters-panel">
            <div className="ui-filter-row">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => {
                const active = severityFilter === sev
                const count = sev === 'all' ? events.length : events.filter(e => e.severity === sev).length
                return (
                  <button
                    key={sev}
                    type="button"
                    className={`ui-filter-pill ui-filter-pill--sev-${sev}${active ? ' ui-filter-pill--active' : ''}`}
                    onClick={() => setSeverityFilter(sev)}
                  >
                    {sev === 'all' ? `All ${count}` : `${sev} ${count}`}
                  </button>
                )
              })}
            </div>
            <div className="ui-filter-row" style={{ alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="ui-section-label" style={{ marginBottom: 0 }}>Window</span>
              <SegControl options={WINDOW_OPTIONS} value={dateFilter} onChange={applyDateFilter} />
              {hiddenByDateCount > 0 && (
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  style={{ fontSize: 10, padding: '4px 8px', marginLeft: 'auto' }}
                  onClick={pruneHiddenByDate}
                >
                  Remove {hiddenByDateCount} hidden
                </button>
              )}
            </div>
            {topicConfigured && (
              <div className="ui-filter-row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={`ui-filter-pill ui-filter-pill--accent${beatFilter ? ' ui-filter-pill--active' : ''}`}
                  onClick={() => setBeatFilter(v => !v)}
                >
                  Your beat · {beatCount}
                </button>
              </div>
            )}
            <div className="ui-feed-tabs" style={{ marginTop: 8 }}>
              {CATEGORIES.map(cat => {
                if (cat === 'disinfo' && infoOpsCount === 0) return null
                const active = eventFilter === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`ui-feed-tab${active ? ' ui-feed-tab--active' : ''}${cat === 'disinfo' ? ' ui-feed-tab--warn' : ''}`}
                    onClick={() => setEventFilter(cat)}
                  >
                    {CATEGORY_LABELS[cat]}{cat === 'disinfo' ? ` ${infoOpsCount}` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {demoCount > 0 && (
          <div className="ui-callout ui-callout--warn" style={{ marginTop: 8, padding: '8px 10px', fontSize: 12 }}>
            Sample data only — check connectors or API keys.
          </div>
        )}

        <EvidenceGapsBanner />

      </div>

      <div ref={listRef} className="ui-feed-scroll" style={{ flex: 1, overflowY: 'auto' }} role="list">
        {filtered.length === 0 && (
          <EmptyState
            compact
            title={
              events.length === 0
                ? (q ? 'No matching events' : 'No events yet')
                : (q ? 'No matching events' : 'No events matching filters')
            }
            hint={
              events.length === 0
                ? 'Paste a clip or turn on feeds — they will show up here.'
                : (q ? `Try a different search than "${searchQuery}"` : 'Widen the time window or clear severity filters')
            }
            action={events.length === 0 && !q ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <button type="button" className="ui-btn ui-btn--primary" style={{ fontSize: 12 }} onClick={() => setAddSourceOpen(true)}>
                  Add a clip
                </button>
                <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 12 }} onClick={() => togglePanel('connectors')}>
                  Turn on feeds
                </button>
              </div>
            ) : undefined}
          />
        )}
        {filtered.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vItem => {
              const event = filtered[vItem.index]
              return (
                <div
                  key={event.id}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vItem.start}px)` }}
                >
                  <EventCard
                    event={event}
                    searchQuery={q}
                    topicMatches={relevanceById.get(event.id)}
                    isNew={isNew(event)}
                    isRead={readIds.has(event.id)}
                    isFocused={focusIdx === vItem.index}
                    isCorrelated={correlatedCountry !== null && event.country === correlatedCountry && event.id !== selectedEvent?.id}
                    decay={decayFactor(event.timestamp)}
                    isAnimated={animatedCriticalIds.has(event.id)}
                    isOnCanvas={onCanvasIds.has(event.id)}
                    inJournal={journalEventIds.has(event.id)}
                    paperCount={paperCountByEventId.get(event.id) ?? 0}
                    caseLabels={caseLabelsByEvent.get(event.id)}
                    showRelevance={topicConfigured}
                    showAiRel={deepFilter}
                    batchMode={batchMode}
                    batchSelected={selectedIds.has(event.id)}
                    onClick={() => handleClick(event, vItem.index)}
                    onDelete={handleDelete}
                    onAddToCanvas={handleAddToCanvas}
                    onSaveToJournal={handleSaveToJournal}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {batchMode && selectedIds.size > 0 && (
        <div className="ui-feed-batch-bar">
          <span>{selectedIds.size} selected</span>
          <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 10 }} onClick={handleBatchSaveToJournal}>
            Save to journal
          </button>
          <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 10 }} onClick={handleBatchKeep}>
            Keep 1 week
          </button>
          <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 10 }} onClick={() => setSelectedIds(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="ui-feed-footer">
        <span>{events.length} events · {uniqueSources} sources</span>
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          style={{ fontSize: 9, padding: '3px 8px' }}
          onClick={() => {
            const rows = [
              ['ID', 'Title', 'Country', 'Category', 'Severity', 'Source', 'Timestamp', 'Fatalities', 'URL'],
              ...filtered.map(e => [e.id, `"${e.title.replace(/"/g, '""')}"`, e.country, e.category, e.severity, e.source, e.timestamp, e.fatalities ?? '', e.url ?? '']),
            ]
            const csv = rows.map(r => r.join(',')).join('\n')
            const blob = new Blob([csv], { type: 'text/csv' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `ARGUS-events-${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
          }}
          title="Export filtered events as CSV"
        >
          <FileDown size={10} /> CSV
        </button>
      </div>
      </div>
    </div>
  )
}

const EventCard = memo(function EventCard({ event, onClick, onDelete, onAddToCanvas, onSaveToJournal, searchQuery, topicMatches, isNew, isRead, isFocused, isCorrelated, decay, isAnimated, isOnCanvas, inJournal, paperCount, caseLabels: _caseLabels, showRelevance, showAiRel, batchMode, batchSelected }: {
  event: IntelEvent; onClick: () => void; onDelete: (id: string) => void
  onAddToCanvas: (event: IntelEvent, openCanvas?: boolean) => void
  onSaveToJournal: (event: IntelEvent) => void
  searchQuery: string
  topicMatches?: string[]
  isNew: boolean; isRead: boolean; isFocused: boolean
  isCorrelated: boolean; decay: number; isAnimated: boolean
  isOnCanvas: boolean
  inJournal: boolean
  paperCount: number
  caseLabels?: string[]
  showRelevance?: boolean
  showAiRel?: boolean
  batchMode?: boolean
  batchSelected?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const project = useProjectStore(s => s.getActiveProject())
  const [translated, setTranslated] = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const nonEnglish = !isLikelyEnglish(event.title)
  const severityColor = SEVERITY_COLORS[event.severity]
  const isCritical = event.severity === 'critical'
  const sourceLabel = eventPublisherLabel(event) ?? SOURCE_LABELS[event.source] ?? event.source?.toUpperCase()
  const dimmed = isRead && decay > 0.5
  const relScore = showAiRel ? (event.relevanceScore ?? getRelevanceScore(event.id)) : undefined

  const translate = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setTranslating(true)
    try {
      const engine = loadAnalysisEngine(project?.aiMode)
      const r = await fetch('/api/translate', {
        method: 'POST',
        headers: buildAiFetchHeaders('enrich', engine, project),
        body: JSON.stringify({ texts: [event.title] }),
      })
      const d = await r.json() as { translations?: string[] }
      if (d.translations?.[0]) setTranslated(d.translations[0])
    } catch { /* ignore */ } finally { setTranslating(false) }
  }

  const copyEvent = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = [
      `[${event.severity.toUpperCase()}] ${event.title}`,
      `${event.country} · ${event.category} · ${event.source}`,
      event.summary,
      event.fatalities ? `Fatalities: ${event.fatalities.toLocaleString()}` : '',
      new Date(event.timestamp).toUTCString(),
      event.url ?? '',
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDelete) {
      onDelete(event.id)
    } else {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 2000)
    }
  }

  const cardClass = [
    'ui-feed-card',
    'ui-feed-card--calm',
    isFocused ? 'ui-feed-card--focused' : '',
    isCorrelated ? 'ui-feed-card--correlated' : '',
    dimmed ? 'ui-feed-card--read' : '',
    isCritical && !isRead ? 'ui-feed-card--critical-unread' : '',
    batchSelected ? 'ui-feed-card--batch-selected' : '',
  ].filter(Boolean).join(' ')

  const bucket = topicSourceBucket(event)
  const feedKind = topicSourceShortLabel(bucket)
  const subtitle = [
    event.category,
    sourceLabel,
    feedKind !== 'Global feed' && (bucket === 'aimed' || !sourceLabel) ? feedKind : null,
    inJournal ? 'Saved' : relScore != null ? `Relevance ${relScore}` : null,
    event.fatalities ? `${event.fatalities.toLocaleString()} casualties` : null,
    event.infoOps ? 'Disinfo' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      className={cardClass}
      role="listitem"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ opacity: dimmed ? 0.55 : 1 }}
    >
      <div
        className={`ui-feed-card__stripe${isAnimated ? ' ui-feed-card__stripe--pulse' : ''}`}
        style={{ background: severityColor, opacity: isRead ? 0.3 : 0.9 }}
      />

      <div className="ui-feed-card__body">
        <div className="ui-feed-card__head">
          {batchMode ? (
            <span className={`ui-feed-card__check${batchSelected ? ' ui-feed-card__check--on' : ''}`} aria-hidden />
          ) : !isRead ? <div className="ui-feed-card__dot" /> : null}
          <div className={`ui-feed-card__title ${isRead ? 'ui-feed-card__title--read' : 'ui-feed-card__title--unread'}`}>
            {translated ? translated : highlight(event.title, searchQuery)}
            {nonEnglish && (
              translated
                ? <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-muted)', fontWeight: 400 }}>· translated</span>
                : <button type="button" onClick={translate} disabled={translating} title="Translate to English"
                    className="ui-chip ui-chip--xs" style={{ marginLeft: 6, verticalAlign: 'middle', cursor: 'pointer' }}>
                    {translating ? '…' : 'EN'}
                  </button>
            )}
          </div>
          {isNew && !isRead && (
            <span className="ui-feed-card__new">New</span>
          )}
          {paperCount > 0 && (
            <span
              className="ui-feed-card__paper"
              title={`${paperCount} research paper${paperCount === 1 ? '' : 's'} linked — used in AI briefs`}
            >
              <BookOpen size={9} aria-hidden />
              {paperCount > 1 ? <span>{paperCount}</span> : null}
            </span>
          )}
        </div>

        <p className={`ui-feed-card__subtitle${isRead ? ' ui-feed-card__subtitle--read' : ''}`}>{subtitle}</p>
        {showRelevance && topicMatches && topicMatches.length > 0 && (
          <p className="ui-feed-card__match">
            Matched: {topicMatches.slice(0, 3).join(', ')}{topicMatches.length > 3 ? ` +${topicMatches.length - 3}` : ''}
          </p>
        )}

        <div className={`ui-feed-card__foot${isRead ? ' ui-feed-card__foot--read' : ''}`}>
          <span style={{ fontSize: 10, color: isCorrelated ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: isCorrelated ? 600 : 500 }}>
            {highlight(event.country && event.country !== 'Unknown' ? displayCountry(event.country) : '—', searchQuery)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {hovered && !batchMode && (
              <div className="ui-feed-card__actions">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSaveToJournal(event) }}
                  className={`ui-feed-card__action${inJournal ? ' ui-feed-card__action--active' : ''}`}
                >
                  <BookMarked size={10} aria-hidden />
                  <span>{inJournal ? 'Journal' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAddToCanvas(event, isOnCanvas) }}
                  className={`ui-feed-card__action${isOnCanvas ? ' ui-feed-card__action--active' : ''}`}
                >
                  <BarChart2 size={10} aria-hidden />
                  <span>{isOnCanvas ? 'Canvas' : 'Add'}</span>
                </button>
                <button type="button" onClick={copyEvent} className={`ui-feed-card__action${copied ? ' ui-feed-card__action--active' : ''}`}>
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  className={`ui-feed-card__action ui-feed-card__action--danger${confirmDelete ? ' ui-feed-card__action--confirm' : ''}`}
                >
                  <Trash2 size={10} aria-hidden />
                  <span>{confirmDelete ? 'Sure?' : 'Delete'}</span>
                </button>
              </div>
            )}
            <span style={{ fontSize: 10, color: decay > 0.7 ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: decay > 0.7 ? 0.6 : 1 }}>
              {(() => { const d = new Date((event as IntelEvent & { publishedAt?: string }).publishedAt ?? event.timestamp); return isNaN(d.getTime()) ? 'just now' : formatDistanceToNow(d, { addSuffix: true }) })()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
})
