'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { GOAL_TEMPLATES } from '@/lib/goalTemplates'
import { CATEGORY_COLORS } from '@/lib/constants'
import { projectRisk } from '@/lib/projectRisk'
import { formatDistanceToNow } from 'date-fns'
import {
  X, RefreshCw, Zap, BarChart2, Download, Database,
  CheckCircle, Vote, Crosshair, TrendingDown, Landmark, Heart, FolderOpen,
  ArrowRight, AlertTriangle, Sparkles,
} from 'lucide-react'
import { useClosePanel } from '@/lib/hooks/useClosePanel'

const SEV_VAR: Record<string, { color: string; label: string }> = {
  critical: { color: 'var(--critical)', label: 'Critical' },
  high:     { color: 'var(--high)',     label: 'High' },
  medium:   { color: 'var(--medium)',   label: 'Medium' },
  low:      { color: 'var(--low)',      label: 'Low' },
}

const TMPL_ICON: Record<string, React.ReactNode> = {
  'elections':           <Vote size={18} strokeWidth={1.5} />,
  'civil-unrest':        <Zap size={18} strokeWidth={1.5} />,
  'armed-conflict':      <Crosshair size={18} strokeWidth={1.5} />,
  'economic-crisis':     <TrendingDown size={18} strokeWidth={1.5} />,
  'political-stability': <Landmark size={18} strokeWidth={1.5} />,
  'humanitarian':        <Heart size={18} strokeWidth={1.5} />,
}

export default function ProjectOverview() {
  const { handleClose, closing } = useClosePanel('overview')
  const { togglePanel, events, alerts } = useMapStore()
  const { getActiveProject, updateConnector } = useProjectStore()
  const project = getActiveProject()
  const [mounted, setMounted] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetchDone, setFetchDone] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const goal = project ? GOAL_TEMPLATES.find(t => t.id === project.goalTemplateId) : null

  const sev = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const e of events) sev[e.severity as keyof typeof sev]++
  const total = events.length

  const catCounts: Record<string, number> = {}
  for (const e of events) catCounts[e.category] = (catCounts[e.category] ?? 0) + 1
  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const maxCat = topCats[0]?.[1] ?? 1

  const countryCounts: Record<string, number> = {}
  for (const e of events) countryCounts[e.country] = (countryCounts[e.country] ?? 0) + 1
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const countryRisks = useMemo(() => projectRisk(events, 6), [events])

  const recent = [...events]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 6)

  const activeConns = project?.connectors.filter(c => c.enabled) ?? []
  const lastFetched = project?.connectors
    .filter(c => c.lastFetched).map(c => new Date(c.lastFetched!).getTime())
    .sort((a, b) => b - a)[0]
  const critAlerts = alerts.filter(a => a.severity === 'critical').length
  const forecastCount = project?.forecasts?.length ?? 0
  const openForecasts = (project?.forecasts ?? []).filter(f => !f.resolved).length

  const fetchAll = useCallback(async () => {
    if (!project || fetching) return
    setFetching(true)
    await Promise.allSettled(project.connectors.filter(c => c.enabled).map(async c => {
      try {
        const res = await fetch(`/api/events?source=${c.id}`)
        if (res.ok) updateConnector(project.id, c.id, { lastFetched: new Date().toISOString(), eventCount: (await res.json()).length ?? 0 })
      } catch {}
    }))
    setFetching(false); setFetchDone(true)
    setTimeout(() => setFetchDone(false), 3000)
  }, [project, fetching, updateConnector])

  if (!mounted || !project) return null
  const hasData = total > 0
  const hasCrit = sev.critical > 0

  return (
    <div className="ui-modal-overlay" onClick={handleClose}>
      <div
        className={`ui-command-palette panel-slide-in${closing ? ' panel-closing' : ''}`}
        style={{ maxWidth: 720, maxHeight: 'min(88vh, 700px)', display: 'flex', flexDirection: 'column', width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        {hasCrit && <div className="ui-overview-stripe" />}

        <header className="ui-panel-header" style={{ paddingBottom: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ color: hasCrit ? 'var(--critical)' : 'var(--accent)', flexShrink: 0, marginTop: 1 }}>
              {(project.goalTemplateId ? TMPL_ICON[project.goalTemplateId] : null) ?? <FolderOpen size={18} strokeWidth={1.5} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ui-kicker" style={{ marginBottom: 4 }}>Project</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <div className="ui-title ui-title--panel">{project.name}</div>
                {goal && <span className="ui-chip ui-chip--xs ui-chip--accent">{goal.name}</span>}
                {hasCrit && (
                  <span className="ui-chip ui-chip--xs ui-chip--sev-critical">
                    <AlertTriangle size={8} /> {sev.critical} critical
                  </span>
                )}
              </div>
              <div className="ui-subtitle" style={{ fontSize: 10, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{project.regionName}</span>
                <Dot />
                <span>Created {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}</span>
                {lastFetched && (
                  <>
                    <Dot />
                    <span>Data {formatDistanceToNow(new Date(lastFetched), { addSuffix: true })}</span>
                  </>
                )}
              </div>
            </div>
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="ui-panel-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 6 }}>
            <OverviewStat n={total} label="Events" sub={hasData ? `${sev.critical} critical` : 'No data'} urgent={hasCrit && hasData} color={hasData ? (hasCrit ? 'var(--critical)' : 'var(--accent)') : undefined} />
            <OverviewStat n={alerts.length} label="Alerts" sub={critAlerts > 0 ? `${critAlerts} critical` : alerts.length > 0 ? 'Active' : 'None'} urgent={critAlerts > 0} color={alerts.length > 0 ? (critAlerts > 0 ? 'var(--critical)' : 'var(--high)') : undefined} />
            <OverviewStat n={activeConns.length} label="Sources" sub={`of ${project.connectors.length}`} color={activeConns.length > 0 ? 'var(--low)' : undefined} />
            <OverviewStat n={project.predictionLedger.length} label="Ledger" sub={project.predictionLedger.filter(e => !e.validatedOutcome).length > 0 ? 'Pending' : 'None'} color={project.predictionLedger.length > 0 ? 'var(--accent)' : undefined} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 12 }}>
            <OverviewStat n={forecastCount} label="Forecasts" sub={openForecasts > 0 ? `${openForecasts} open` : 'None'} color={forecastCount > 0 ? 'var(--medium)' : undefined} />
            <OverviewStat n={(project.cases ?? []).length} label="Cases" sub={`${(project.cases ?? []).filter(c => c.status === 'active').length} active`} color={(project.cases ?? []).length > 0 ? 'var(--accent)' : undefined} />
          </div>

          {!hasData && (
            <div className="ui-callout" style={{ textAlign: 'center', marginBottom: 12, borderStyle: 'dashed' }}>
              <p className="ui-subtitle" style={{ marginBottom: 14, lineHeight: 1.6 }}>
                No events loaded yet. Fetch from your active sources to populate this workspace.
              </p>
              <button
                type="button"
                onClick={fetchAll}
                disabled={fetching}
                className="ui-btn ui-btn--primary"
                style={fetchDone ? { background: 'var(--low)' } : undefined}
              >
                <RefreshCw size={12} style={{ animation: fetching ? 'spin 0.8s linear infinite' : 'none' }} />
                {fetching ? 'Fetching…' : fetchDone ? 'Updated' : 'Fetch data'}
              </button>
              {goal && goal.keyIndicators.length > 0 && (
                <div style={{ marginTop: 16, textAlign: 'left' }}>
                  <div className="ui-section-label">Key indicators — {goal.name}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 }}>
                    {goal.keyIndicators.map((ind, i) => (
                      <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', fontSize: 11, color: 'var(--text-muted)' }}>
                        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border)', flexShrink: 0, marginTop: 5 }} />
                        {ind}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasData && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <OverviewPanel label="Severity">
                  {(Object.entries(sev) as [keyof typeof SEV_VAR, number][]).map(([k, n]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: SEV_VAR[k].color, width: 42, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{SEV_VAR[k].label}</span>
                      <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${total > 0 ? (n / total) * 100 : 0}%`, background: SEV_VAR[k].color, borderRadius: 2, transition: 'width 500ms' }} />
                      </div>
                      <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', width: 18, textAlign: 'right', flexShrink: 0 }}>{n}</span>
                    </div>
                  ))}
                </OverviewPanel>

                <OverviewPanel label="Categories">
                  {topCats.map(([cat, n]) => {
                    const col = CATEGORY_COLORS[cat] ?? 'var(--info)'
                    return (
                      <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: col, width: 58, textTransform: 'capitalize', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                        <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${(n / maxCat) * 100}%`, background: col, borderRadius: 2, transition: 'width 500ms' }} />
                        </div>
                        <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', width: 18, textAlign: 'right', flexShrink: 0 }}>{n}</span>
                      </div>
                    )
                  })}
                </OverviewPanel>

                {countryRisks.length > 0 && (
                  <OverviewPanel label="Country risk">
                    {countryRisks.map(r => (
                      <div key={r.country} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.country}</span>
                        <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: r.level === 'CRITICAL' || r.level === 'HIGH' ? 'var(--high)' : r.level === 'MEDIUM' ? 'var(--medium)' : 'var(--low)', flexShrink: 0 }}>
                          {r.score} · {r.level}
                        </span>
                      </div>
                    ))}
                  </OverviewPanel>
                )}

                {topCountries.length > 0 && countryRisks.length === 0 && (
                  <OverviewPanel label="Countries">
                    {topCountries.map(([c, n]) => (
                      <div key={c} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c}</span>
                        <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{n}</span>
                      </div>
                    ))}
                  </OverviewPanel>
                )}
              </div>

              <OverviewPanel label="Recent events">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {recent.map(e => (
                    <div key={e.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <div className="ui-sev-dot" style={{ background: SEV_VAR[e.severity as keyof typeof SEV_VAR]?.color ?? 'var(--info)', marginTop: 4, width: 5, height: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.title}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{e.country} · {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </OverviewPanel>
            </div>
          )}

          {hasData && goal && goal.keyIndicators.length > 0 && (
            <div className="ui-callout" style={{ marginTop: 8 }}>
              <div className="ui-section-label" style={{ marginBottom: 6 }}>Indicators — {goal.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 }}>
                {goal.keyIndicators.map((ind, i) => (
                  <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', fontSize: 10, color: 'var(--text-secondary)' }}>
                    <CheckCircle size={9} style={{ color: 'var(--low)', flexShrink: 0, marginTop: 2 }} />
                    <span style={{ lineHeight: 1.3 }}>{ind}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ui-feed-footer" style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
          <FooterBtn icon={RefreshCw} label={fetching ? 'Fetching…' : fetchDone ? 'Updated' : 'Fetch data'} disabled={fetching} spin={fetching} onClick={fetchAll} />
          <FooterBtn icon={BarChart2} label="Canvas" onClick={() => { togglePanel('canvas'); handleClose() }} />
          <FooterBtn icon={Download} label="Export" onClick={() => { togglePanel('export'); handleClose() }} />
          <FooterBtn icon={Sparkles} label="Briefs" onClick={() => { togglePanel('briefHistory'); handleClose() }} />
          <FooterBtn icon={Database} label="Sources" onClick={() => { togglePanel('connectors'); handleClose() }} />
          <div style={{ flex: 1 }} />
          <button type="button" onClick={handleClose} className="ui-btn ui-btn--primary" style={{ fontSize: 11 }}>
            Open workspace <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

function OverviewStat({ n, label, sub, color, urgent }: { n: number; label: string; sub: string; color?: string; urgent?: boolean }) {
  return (
    <div className={`ui-stat${urgent && n > 0 ? ' ui-overview-stat--urgent' : ''}`} style={{ padding: '10px 12px' }}>
      <div className="ui-stat__n" style={{ fontSize: 22, color: color ?? 'var(--text-muted)' }}>{n}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 9, color: urgent && n > 0 ? color : 'var(--text-muted)', fontWeight: urgent && n > 0 ? 600 : 400 }}>{sub}</div>
    </div>
  )
}

function OverviewPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ui-overview-panel">
      <div className="ui-section-label" style={{ marginBottom: 0 }}>{label}</div>
      {children}
    </div>
  )
}

function FooterBtn({ icon: Icon, label, onClick, disabled, spin }: { icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; spin?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '6px 10px' }}>
      <Icon size={11} style={{ animation: spin ? 'spin 0.8s linear infinite' : 'none' }} />
      {label}
    </button>
  )
}

function Dot() {
  return <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block', opacity: 0.4 }} />
}
