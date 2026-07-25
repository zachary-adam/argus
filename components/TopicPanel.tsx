'use client'
import { useEffect, useMemo, useState } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { topicMatchedEvents, hasTopicTargeting } from '@/lib/topicEvents'
import { buildTopicClusters, type ClusterSource } from '@/lib/topicClusters'
import { countByBucket, topicSourceLabel, topicSourceShortLabel } from '@/lib/topicIngest'
import { eventsMatchingRule } from '@/lib/watchCondition'
import { runTopicPull } from '@/lib/topicPull'
import { topicWatchTerms } from '@/lib/topicWatchTerms'
import { buildAiFetchHeaders } from '@/lib/aiConfig'
import { loadAnalysisEngine } from '@/lib/aiMode'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { formatDistanceToNow } from 'date-fns'
import {
  X, Settings, Bell, Bookmark, Radio, AlertCircle,
  ChevronRight, ChevronDown, Sparkles, RefreshCw, Check, Minus,
} from 'lucide-react'

/**
 * Topic dossier — one perfected surface for what you're tracking.
 * Story clusters first; alerts/monitors secondary. No fake archive claims.
 */

const CLUSTER_SOURCE_LABEL: Record<ClusterSource, string> = {
  aimed: topicSourceShortLabel('aimed'),
  yours: topicSourceShortLabel('yours'),
  firehose: topicSourceShortLabel('firehose'),
  mixed: 'Mixed sources',
}

export default function TopicPanel() {
  const togglePanel = useMapStore(s => s.togglePanel)
  const { handleClose, closing } = useClosePanel('topic')
  const events = useMapStore(s => s.events)
  const topicPull = useMapStore(s => s.topicPull)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const setNlqHighlights = useMapStore(s => s.setNlqHighlights)
  const flyTo = useMapStore(s => s.flyTo)
  const project = useProjectStore(s => s.getActiveProject())
  const createWatchRule = useProjectStore(s => s.createWatchRule)
  const recordMonitorRun = useProjectStore(s => s.recordMonitorRun)

  const [runningMonitor, setRunningMonitor] = useState<string | null>(null)
  const [nlqErr, setNlqErr] = useState<string | null>(null)
  const [refreshErr, setRefreshErr] = useState<string | null>(null)
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null)
  const [openSection, setOpenSection] = useState<'monitors' | 'watches' | 'sources' | null>(null)
  const [webKeys, setWebKeys] = useState<{ serper: boolean; brave: boolean } | null>(null)

  const targeting = project?.targeting
  const configured = hasTopicTargeting(targeting)
  const matches = useMemo(() => topicMatchedEvents(events, targeting, 40), [events, targeting])
  const clusters = useMemo(() => buildTopicClusters(matches), [matches])
  const sourceCounts = useMemo(() => countByBucket(events), [events])
  const monitors = project?.savedMonitors ?? []
  const topicRules = (project?.watchRules ?? []).filter(r =>
    r.conditions.some(c => c.field === 'text' || c.field === 'title' || c.field === 'summary'),
  )
  const activeWatches = topicRules.filter(r => r.enabled).length

  useEffect(() => {
    fetch('/api/connectors/websearch')
      .then(r => r.json())
      .then(d => setWebKeys({ serper: !!d.serper, brave: !!d.brave }))
      .catch(() => setWebKeys({ serper: false, brave: false }))
  }, [])

  const runMonitor = async (monitorId: string, query: string) => {
    if (!project || runningMonitor) return
    setRunningMonitor(monitorId)
    setNlqErr(null)
    try {
      const res = await fetch('/api/nlq', {
        method: 'POST',
        headers: buildAiFetchHeaders('ask', loadAnalysisEngine(project.aiMode), project),
        body: JSON.stringify({
          query,
          events,
          apiKey: project.aiMode === 'byok' ? project.byokApiKey : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Query failed')
      setNlqHighlights(data.matchingIds ?? [], data.summary ?? null)
      recordMonitorRun(project.id, monitorId, data.matchingIds?.length ?? 0)
      if (data.flyTo && data.matchingIds?.length > 0) {
        flyTo(data.flyTo.lat, data.flyTo.lon, data.flyTo.zoom)
      }
    } catch (e) {
      setNlqErr(e instanceof Error ? e.message : 'Query failed')
    } finally {
      setRunningMonitor(null)
    }
  }

  const addTopicWatches = () => {
    if (!project || !targeting) return
    const terms = topicWatchTerms(targeting, project?.countryCodes ?? [])
    for (const term of terms) {
      const exists = project.watchRules?.some(r =>
        r.conditions.some(c => c.field === 'text' && String(c.value).toLowerCase() === term.toLowerCase()),
      )
      if (exists) continue
      createWatchRule(project.id, {
        name: `Topic: ${term}`,
        enabled: true,
        conditions: [{ field: 'text', op: 'contains', value: term }],
        windowHours: 24,
        threshold: 1,
        action: 'notify',
        incidentSeverity: 'medium',
        eventScope: 'topic',
      })
    }
    togglePanel('watchRules')
  }

  const refreshTopic = async () => {
    if (!targeting || topicPull.querying) return
    setRefreshErr(null)
    const result = await runTopicPull(targeting, project?.regionCenter, project?.countryCodes ?? [], project?.researchQuestion)
    if (!result.ok && result.error) setRefreshErr(result.error)
  }

  if (!project) return null

  const aimedOk = topicPull.lastAt && !topicPull.error
  const webOk = webKeys?.serper || webKeys?.brave

  return (
    <div className="ui-panel-overlay" onClick={handleClose}>
      <div className={`ui-panel-drawer panel-slide-in${closing ? ' panel-closing' : ''}`} onClick={e => e.stopPropagation()}>
        <header className="ui-panel-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="ui-kicker" style={{ marginBottom: 4 }}>Your topic</div>
              <div className="ui-title ui-title--panel">{project.name}</div>
              {project.researchQuestion && (
                <p className="ui-subtitle" style={{ marginTop: 6, fontSize: 12 }}>{project.researchQuestion}</p>
              )}
            </div>
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="ui-panel-body">
          {configured && (
            <div className="ui-health">
              <span className={`ui-health-pill ${aimedOk ? 'ui-health-pill--ok' : ''}`}>
                {aimedOk ? <Check size={10} /> : <Minus size={10} />}
                Your beat {topicPull.lastAt ? formatDistanceToNow(new Date(topicPull.lastAt), { addSuffix: true }) : 'not run'}
              </span>
              <span className={`ui-health-pill ${webOk ? 'ui-health-pill--ok' : 'ui-health-pill--warn'}`}>
                {webOk ? <Check size={10} /> : <Minus size={10} />}
                Web search {webOk ? 'on' : 'off — add Serper/Brave in Vault'}
              </span>
              <span className={`ui-health-pill ${activeWatches > 0 ? 'ui-health-pill--ok' : ''}`}>
                {activeWatches > 0 ? <Check size={10} /> : <Minus size={10} />}
                {activeWatches} watch{activeWatches !== 1 ? 'es' : ''}
              </span>
            </div>
          )}

          {!configured ? (
            <EmptyTargeting onSettings={() => togglePanel('settings')} />
          ) : (
            <>
              <section style={{ marginBottom: 20 }}>
                <div className="ui-section-label">Watching</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {targeting?.placeName && <span className="ui-chip ui-chip--accent">{targeting.placeName}</span>}
                  {(targeting?.keywords ?? []).map(k => <span key={k} className="ui-chip">{k}</span>)}
                  {(targeting?.watchEntities ?? []).map(e => <span key={e} className="ui-chip ui-chip--accent">{e}</span>)}
                </div>
                <button type="button" className="ui-link" style={{ marginTop: 10, fontSize: 11 }} onClick={() => togglePanel('settings')}>
                  Edit targeting →
                </button>
              </section>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div className="ui-stat">
                  <div className="ui-stat__n">{clusters.length}</div>
                  <div className="ui-stat__label">Stories</div>
                </div>
                <div className="ui-stat">
                  <div className="ui-stat__n">{sourceCounts.aimed}</div>
                  <div className="ui-stat__label">Your beat</div>
                </div>
                <div className="ui-stat">
                  <div className="ui-stat__n">{sourceCounts.yours}</div>
                  <div className="ui-stat__label">Your sources</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary"
                  style={{ flex: 1 }}
                  disabled={topicPull.querying}
                  onClick={refreshTopic}
                >
                  <RefreshCw size={14} className={topicPull.querying ? 'ui-spin' : undefined} />
                  {topicPull.querying ? 'Pulling…' : 'Refresh topic'}
                </button>
                <button type="button" className="ui-btn ui-btn--ghost" onClick={addTopicWatches} title="Create topic-scoped watch rules">
                  <Bell size={14} />
                </button>
                <button type="button" className="ui-btn ui-btn--ghost" onClick={() => { togglePanel('topic'); togglePanel('connectors') }} title="Add feeds">
                  <Radio size={14} />
                </button>
              </div>
              {(topicPull.error || refreshErr) && (
                <div className="ui-callout ui-callout--error" style={{ margin: '-12px 0 16px', fontSize: 11 }}>
                  {topicPull.error || refreshErr}
                </div>
              )}

              <section style={{ marginBottom: 20 }}>
                <div className="ui-section-label">Today&apos;s stories ({clusters.length})</div>
                {clusters.length === 0 ? (
                  <div className="ui-panel-empty" style={{ padding: '20px 16px' }}>
                    <div className="ui-panel-empty__title">No stories yet</div>
                    <ol className="ui-feed-hint" style={{ margin: '8px auto 0', paddingLeft: 18, maxWidth: 280, textAlign: 'left' }}>
                      <li>Hit <strong>Refresh topic</strong> to pull stories for your keywords</li>
                      <li>Use specific keywords (country names, actors) — not just &quot;cabinet&quot;</li>
                      <li>Add RSS or paste links for niche beats</li>
                    </ol>
                  </div>
                ) : (
                  clusters.map(cluster => {
                    const open = expandedCluster === cluster.id
                    const lead = cluster.events[0]
                    return (
                      <div key={cluster.id}>
                        <button
                          type="button"
                          className="ui-topic-cluster"
                          onClick={() => {
                            setSelectedEvent(lead)
                            setExpandedCluster(open ? null : cluster.id)
                          }}
                        >
                          <div className="ui-topic-cluster__title">{cluster.headline}</div>
                          <div className="ui-topic-cluster__meta">
                            <span>{formatDistanceToNow(new Date(cluster.latestAt), { addSuffix: true })}</span>
                            <span>·</span>
                            <span style={{ color: cluster.source === 'aimed' ? 'var(--accent)' : undefined }}>
                              {CLUSTER_SOURCE_LABEL[cluster.source]}
                            </span>
                            {cluster.sourceCount > 1 && (
                              <>
                                <span>·</span>
                                <span>{cluster.sourceCount} reports</span>
                              </>
                            )}
                            {cluster.matched[0] && (
                              <>
                                <span>·</span>
                                <span style={{ color: 'var(--accent)' }}>{cluster.matched[0]}</span>
                              </>
                            )}
                          </div>
                          {cluster.outlets.length > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                              {cluster.outlets.join(' · ')}
                            </div>
                          )}
                          {open && cluster.events.length > 1 && (
                            <div className="ui-topic-cluster__alts">
                              {cluster.events.slice(1, 4).map(e => (
                                <div key={e.id} style={{ marginBottom: 4 }}>
                                  <button
                                    type="button"
                                    className="ui-link"
                                    style={{ fontSize: 10, textAlign: 'left' }}
                                    onClick={ev => { ev.stopPropagation(); setSelectedEvent(e) }}
                                  >
                                    {e.title}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </button>
                      </div>
                    )
                  })
                )}
              </section>

              <div className="ui-callout" style={{ marginBottom: 16 }}>
                Loaded workspace only ({events.length} events) — not a full archive.
                {sourceCounts.firehose > 0 && ` ${sourceCounts.firehose} global-feed events hidden from stories unless on-topic.`}
              </div>

              {nlqErr && (
                <div className="ui-callout ui-callout--error" style={{ marginBottom: 12, fontSize: 11 }}>
                  {nlqErr}
                </div>
              )}

              <Accordion
                title={`Sources (${sourceCounts.aimed + sourceCounts.yours + sourceCounts.firehose})`}
                open={openSection === 'sources'}
                onToggle={() => setOpenSection(openSection === 'sources' ? null : 'sources')}
              >
                {(['aimed', 'yours', 'firehose'] as const).map(bucket => (
                  <div key={bucket} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>
                    <span>{topicSourceLabel(bucket)}</span>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{sourceCounts[bucket]}</span>
                  </div>
                ))}
              </Accordion>

              {monitors.length > 0 && (
                <Accordion
                  title={`Saved queries (${monitors.length})`}
                  open={openSection === 'monitors'}
                  onToggle={() => setOpenSection(openSection === 'monitors' ? null : 'monitors')}
                >
                  {monitors.map(m => (
                    <div key={m.id} className="ui-topic-monitor-row">
                      <Bookmark size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <div className="ui-command-row__label" style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600 }}>{m.label}</div>
                      <button
                        type="button"
                        className="ui-btn ui-btn--primary"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                        disabled={!!runningMonitor}
                        onClick={() => runMonitor(m.id, m.query)}
                        title="Run saved query on map"
                      >
                        {runningMonitor === m.id ? '…' : <Sparkles size={12} />}
                      </button>
                    </div>
                  ))}
                </Accordion>
              )}

              {topicRules.length > 0 && (
                <Accordion
                  title={`Watch rules (${topicRules.length})`}
                  open={openSection === 'watches'}
                  onToggle={() => setOpenSection(openSection === 'watches' ? null : 'watches')}
                >
                  {topicRules.map(rule => {
                    const n = eventsMatchingRule(rule, events, {
                      targeting: project?.targeting,
                      countryCodes: project?.countryCodes ?? [],
                    }).length
                    return (
                      <div key={rule.id} style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{rule.name}{rule.eventScope === 'topic' ? ' · topic' : ''}{!rule.enabled ? ' (off)' : ''}</span>
                        <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{n}/{rule.threshold}</span>
                      </div>
                    )
                  })}
                </Accordion>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyTargeting({ onSettings }: { onSettings: () => void }) {
  return (
    <div className="ui-panel-empty">
      <AlertCircle size={32} className="ui-panel-empty__icon" />
      <div className="ui-panel-empty__title">Define your topic first</div>
      <p className="ui-feed-hint" style={{ maxWidth: 280, margin: '0 auto 20px', lineHeight: 1.55 }}>
        Keywords, entities, or a place — then ARGUS can pull on-topic stories and filter noise for you.
      </p>
      <button type="button" className="ui-btn ui-btn--primary" onClick={onSettings}>
        <Settings size={14} /> Set targeting
      </button>
    </div>
  )
}

function Accordion({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="ui-accordion">
      <button type="button" className="ui-accordion__head" onClick={onToggle}>
        {title}
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="ui-accordion__body">{children}</div>}
    </div>
  )
}
