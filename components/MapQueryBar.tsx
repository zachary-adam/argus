'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { Search, X, Sparkles, Bookmark, BookmarkPlus, Loader, History } from 'lucide-react'
import { buildAiFetchHeaders } from '@/lib/aiConfig'
import { buildWorkspaceContextBlock } from '@/lib/workspaceIntel'
import { loadAnalysisEngine, saveAnalysisEngine, type AnalysisEngine } from '@/lib/aiMode'
import { AnalysisEngineToggle } from '@/components/ui/AnalysisEngineToggle'
import { usePlotsStore } from '@/stores/plotsStore'
import { saveNlqToHistory, fetchNlqHistory } from '@/lib/saveNlqHistory'
import { getNlqQueryCache, setNlqQueryCache } from '@/lib/nlqQueryCache'
import type { NlqHistoryRecord } from '@/lib/nlqHistory'
import { useAiAvailable } from '@/lib/hooks/useStatus'

const EXAMPLES = [
  'Conflict events in Iran last 48h',
  'Critical events near the Strait of Hormuz',
  'High severity events in Middle East',
  'Disasters in the last 24 hours',
]

export default function MapQueryBar() {
  const allPlots          = usePlotsStore(s => s.plots)
  const flyTo             = useMapStore(s => s.flyTo)
  const setNlqHighlights  = useMapStore(s => s.setNlqHighlights)
  const clearNlqHighlights= useMapStore(s => s.clearNlqHighlights)
  const nlqHighlightIds   = useMapStore(s => s.nlqHighlightIds)
  const nlqSummary        = useMapStore(s => s.nlqSummary)
  const openBriefHistory  = useMapStore(s => s.openBriefHistory)
  const mapQueryFocusTick = useMapStore(s => s.mapQueryFocusTick)
  const project           = useProjectStore(s => s.getActiveProject())
  const saveMonitor       = useProjectStore(s => s.saveMonitor)
  const deleteMonitor     = useProjectStore(s => s.deleteMonitor)
  const recordMonitorRun  = useProjectStore(s => s.recordMonitorRun)
  const savedMonitors = useMemo(() => project?.savedMonitors ?? [], [project?.savedMonitors])

  const [query,        setQuery]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [filters,      setFilters]      = useState<string | null>(null)
  const [focused,      setFocused]      = useState(false)
  const [fromCache,    setFromCache]    = useState(false)
  const [offlineMode,  setOfflineMode]  = useState(false)
  const [analysisEngine, setAnalysisEngine] = useState<AnalysisEngine>('ai')
  const aiAvailable = useAiAvailable()
  const [serverHistory, setServerHistory] = useState<NlqHistoryRecord[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const loadServerHistory = useCallback(async () => {
    if (!project?.id) {
      setServerHistory([])
      return
    }
    const rows = await fetchNlqHistory(project.id, 6)
    setServerHistory(rows)
  }, [project?.id])

  useEffect(() => {
    if (focused) loadServerHistory()
  }, [focused, loadServerHistory])

  useEffect(() => {
    setAnalysisEngine(loadAnalysisEngine(project?.aiMode))
  }, [project?.id, project?.aiMode])

  const applyResult = useCallback((
    data: { matchingIds: string[]; summary: string; appliedFilters: string; flyTo: { lat: number; lon: number; zoom: number } | null; offline?: boolean },
    q: string,
    fromCacheHit: boolean,
  ) => {
    setNlqHighlights(data.matchingIds, data.summary)
    setFilters(data.appliedFilters)
    setFromCache(fromCacheHit)
    setOfflineMode(!!data.offline)
    if (data.flyTo && data.matchingIds.length > 0) {
      flyTo(data.flyTo.lat, data.flyTo.lon, data.flyTo.zoom)
    }
    if (!fromCacheHit && data.summary && project?.id) {
      void saveNlqToHistory({
        query: q.trim(),
        summary: data.summary,
        appliedFilters: data.appliedFilters,
        matchCount: data.matchingIds?.length ?? 0,
        projectId: project.id,
      }).then(() => loadServerHistory())
    }
    if (project?.id) {
      const mon = savedMonitors.find(m => m.query.toLowerCase() === q.trim().toLowerCase())
      if (mon) recordMonitorRun(project.id, mon.id, data.matchingIds?.length ?? 0)
    }
  }, [flyTo, setNlqHighlights, project, savedMonitors, recordMonitorRun, loadServerHistory])

  const hasResults = nlqHighlightIds.length > 0
  const panelOpen = focused || hasResults || !!error

  useEffect(() => {
    if (mapQueryFocusTick === 0) return
    inputRef.current?.focus()
    setFocused(true)
  }, [mapQueryFocusTick])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focused) {
        inputRef.current?.blur()
        setFocused(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focused])

  useEffect(() => {
    useMapStore.setState({ mapQueryPanelOpen: panelOpen })
    return () => { useMapStore.setState({ mapQueryPanelOpen: false }) }
  }, [panelOpen])

  const run = useCallback(async (q: string) => {
    if (!q.trim() || loading) return
    setError(null); setFilters(null); setFromCache(false); setOfflineMode(false)
    const cacheKey = q.trim().toLowerCase()
    const { events } = useMapStore.getState()
    const cached = getNlqQueryCache(cacheKey, events.length)
    if (cached) {
      applyResult(cached, q, true)
      return
    }
    setLoading(true)
    try {
      const { events, alerts, situations, flaggedAlerts } = useMapStore.getState()
      const workspaceContext = project
        ? buildWorkspaceContextBlock(project, { events, alerts, situations, flaggedAlerts }, allPlots)
        : undefined
      const res = await fetch('/api/nlq', {
        method: 'POST',
        headers: buildAiFetchHeaders('ask', analysisEngine, project),
        body: JSON.stringify({
          query: q.trim(),
          events,
          workspaceContext,
          apiKey: project?.aiMode === 'byok' ? project.byokApiKey : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.hint ?? data.error ?? 'Query failed')
      setNlqQueryCache(cacheKey, events.length, data)
      applyResult(data, q, false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed')
    } finally {
      setLoading(false)
    }
  }, [allPlots, loading, project, applyResult, analysisEngine])

  const pinQuery = () => {
    const q = query.trim()
    if (!project?.id || !q) return
    if (savedMonitors.some(m => m.query.toLowerCase() === q.toLowerCase())) return
    saveMonitor(project.id, { label: q.slice(0, 48), query: q })
  }

  const clear = () => {
    setQuery('')
    setFilters(null)
    setError(null)
    setFromCache(false)
    clearNlqHighlights()
  }

  const placeholder = hasResults
    ? `${nlqHighlightIds.length} on map — ask another question`
    : 'Ask about events on this map…'

  return (
    <div className="ui-map-query-anchor">
      <div className={`ui-map-query-wrap${panelOpen ? ' ui-map-query-wrap--open' : ''}`}>
        <div className={`ui-map-query-bar${focused ? ' ui-map-query-bar--focused' : ''}`}>
          {loading
            ? <Loader size={15} className="ui-map-query-bar__icon ui-map-query-bar__icon--spin" />
            : <Search size={15} className="ui-map-query-bar__icon" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            onKeyDown={e => {
              if (e.key === 'Enter') run(query)
              if (e.key === 'Escape') { clear(); inputRef.current?.blur() }
            }}
            placeholder={placeholder}
            aria-label="Search events on map"
          />
          {(hasResults || query) && !loading && (
            <button type="button" onClick={clear} className="ui-map-query-bar__clear" aria-label="Clear">
              <X size={13} />
            </button>
          )}
          {!query && !hasResults && !loading && !focused && (
            <kbd className="ui-map-query-kbd">⌘K</kbd>
          )}
        </div>

        {panelOpen && (
          <div className="ui-map-query-panel">
            {hasResults && nlqSummary && (
              <div className="ui-map-query-result">
                <span className="ui-map-query-result__count">{nlqHighlightIds.length}</span>
                <p className="ui-map-query-result__text">{nlqSummary}</p>
                {filters && (
                  <span className="ui-map-query-result__meta">
                    {filters}{offlineMode ? ' · rules' : ' · ai'}{fromCache ? ' · cached' : ''}
                  </span>
                )}
              </div>
            )}

            {error && (
              <div className="ui-map-query-error">{error}</div>
            )}

            {focused && !query && !hasResults && !loading && (
              <div className="ui-map-query-suggest">
                {savedMonitors.length > 0 && (
                  <section className="ui-map-query-block">
                    <h3 className="ui-map-query-block__title">Saved monitors</h3>
                    <ul className="ui-map-query-list">
                      {savedMonitors.map(m => (
                        <li key={m.id} className="ui-map-query-list__row">
                          <button
                            type="button"
                            className="ui-map-query-item"
                            onMouseDown={() => { setQuery(m.query); run(m.query) }}
                          >
                            <Bookmark size={13} className="ui-map-query-item__icon" />
                            <span className="ui-map-query-item__label">{m.label}</span>
                            {m.lastMatchCount != null && (
                              <span className="ui-map-query-item__badge">{m.lastMatchCount}</span>
                            )}
                          </button>
                          {project?.id && (
                            <button
                              type="button"
                              className="ui-map-query-list__remove"
                              onMouseDown={() => deleteMonitor(project.id, m.id)}
                              aria-label="Remove monitor"
                            >
                              <X size={11} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {serverHistory.length > 0 && (
                  <section className="ui-map-query-block">
                    <div className="ui-map-query-block__head">
                      <h3 className="ui-map-query-block__title">Recent</h3>
                      <button
                        type="button"
                        className="ui-map-query-block__link"
                        onMouseDown={() => openBriefHistory('nlq')}
                      >
                        History
                      </button>
                    </div>
                    <ul className="ui-map-query-list">
                      {serverHistory.map(h => (
                        <li key={h.id}>
                          <button
                            type="button"
                            className="ui-map-query-item"
                            onMouseDown={() => { setQuery(h.query); run(h.query) }}
                          >
                            <History size={13} className="ui-map-query-item__icon" />
                            <span className="ui-map-query-item__label">{h.query}</span>
                            <span className="ui-map-query-item__badge">{h.match_count}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="ui-map-query-block">
                  <h3 className="ui-map-query-block__title">Try asking</h3>
                  <div className="ui-map-query-chips">
                    {EXAMPLES.map(ex => (
                      <button
                        key={ex}
                        type="button"
                        className="ui-map-query-chip"
                        onMouseDown={() => { setQuery(ex); run(ex) }}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}

            <footer className="ui-map-query-foot">
              <AnalysisEngineToggle
                compact
                value={analysisEngine}
                aiAvailable={aiAvailable}
                onChange={v => { setAnalysisEngine(v); saveAnalysisEngine(v) }}
              />
              <span className="ui-map-query-foot__hint">↵ run</span>
              {query.trim() && !loading && (
                <>
                  <button type="button" className="ui-map-query-foot__pin" onClick={pinQuery} title="Save monitor">
                    <BookmarkPlus size={12} />
                  </button>
                  <button type="button" className="ui-btn ui-btn--primary ui-map-query-foot__run" onClick={() => run(query)}>
                    <Sparkles size={12} /> Search
                  </button>
                </>
              )}
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}
