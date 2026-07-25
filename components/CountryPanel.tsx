'use client'
import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { usePlotsStore } from '@/stores/plotsStore'
import { CountryProfile } from '@/types'
import type { CountryBriefData } from '@/types/brief'
import { X, Sparkles, Loader, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { formatDistanceToNow } from 'date-fns'
import { buildCountryBriefPayload } from '@/lib/workspaceIntel'
import { fetchCountryBriefStream, countryBriefToMarkdown } from '@/lib/countryBriefClient'
import { saveBriefToHistory } from '@/lib/saveBriefHistory'
import { loadAnalysisEngine } from '@/lib/aiMode'
import { formatBriefInputsLine } from '@/lib/briefInputsSummary'

const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)', info: 'var(--info)',
}

function riskColor(score: number): string {
  if (score < 30) return 'var(--low)'
  if (score < 60) return 'var(--medium)'
  if (score < 80) return 'var(--high)'
  return 'var(--critical)'
}

function riskLabel(score: number): string {
  if (score < 30) return 'Low'
  if (score < 60) return 'Moderate'
  if (score < 80) return 'High'
  return 'Critical'
}

function RiskGauge({ score }: { score: number }) {
  const r = 38
  const circ = 2 * Math.PI * r
  const dashoffset = circ * (1 - score / 100)
  const color = riskColor(score)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width={88} height={88} viewBox="0 0 96 96">
        <circle cx={48} cy={48} r={r} fill="none" stroke="var(--surface-elevated)" strokeWidth={7} />
        <circle
          cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={circ} strokeDashoffset={dashoffset}
          strokeLinecap="round" transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
        <text x={48} y={44} textAnchor="middle" fontSize={24} fontWeight={700} fill={color} fontFamily="var(--font-mono)">{score}</text>
        <text x={48} y={58} textAnchor="middle" fontSize={8} fill="var(--text-muted)" fontFamily="var(--font-sans)" letterSpacing={1}>/100</text>
      </svg>
      <div>
        <div className="ui-section-label" style={{ marginBottom: 4 }}>Risk score</div>
        <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '0.05em' }}>{riskLabel(score)}</div>
        <p className="ui-subtitle" style={{ fontSize: 9, marginTop: 4, maxWidth: 120 }}>
          Base profile + live event adjustment
        </p>
      </div>
    </div>
  )
}

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div style={{ height: 3, background: 'var(--surface-elevated)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${(value / max) * 100}%`, background: color, borderRadius: 2, transition: 'width 400ms ease' }} />
    </div>
  )
}

const BRIEF_LABEL_STYLE: CSSProperties = {
  fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
}

const CONF_VAR: Record<string, string> = {
  HIGH: 'var(--low)', MODERATE: 'var(--medium)', MEDIUM: 'var(--medium)', LOW: 'var(--high)',
}

function ConfChip({ level }: { level: string }) {
  const up = (level || '').toUpperCase()
  return (
    <span style={{
      fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 'var(--radius-sm)',
      color: CONF_VAR[up] ?? 'var(--text-muted)', border: `1px solid ${CONF_VAR[up] ?? 'var(--border)'}`,
      whiteSpace: 'nowrap',
    }}>{up}</span>
  )
}

function CiteTags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return (
    <span style={{ marginLeft: 4 }}>
      {tags.map(t => (
        <sup key={t} style={{ fontSize: 8, color: 'var(--accent)', fontWeight: 700, marginLeft: 1 }}>[{t}]</sup>
      ))}
    </span>
  )
}

export default function CountryPanel() {
  const { handleClose, closing } = useClosePanel('country')
  const { selectedCountry, selectedCountryCode, flyTo, events, alerts, situations, flaggedAlerts, threatenedCableData, setHighlightedCableId, highlightedCableId, pushToast } = useMapStore()
  const project = useProjectStore(s => s.getActiveProject())
  const allPlots = usePlotsStore(s => s.plots)
  const [cablesExpanded, setCablesExpanded] = useState(false)
  const [briefLoading, setBriefLoading] = useState(false)
  const [brief, setBrief] = useState<CountryBriefData | null>(null)
  const [briefExpanded, setBriefExpanded] = useState(true)
  const [copied, setCopied] = useState(false)

  const { data: profile, isLoading } = useQuery<CountryProfile>({
    queryKey: ['country', selectedCountryCode],
    queryFn: () => fetch(`/api/country/${selectedCountryCode}`).then(r => r.json()),
    enabled: !!selectedCountryCode && selectedCountryCode !== 'XX',
  })

  const liveCountryEvents = events
    .filter(e =>
      e.countryCode === selectedCountryCode ||
      e.country.toLowerCase().includes((selectedCountry || '').toLowerCase())
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15)

  const liveRiskScore = (() => {
    if (!profile) return null
    const critCount = liveCountryEvents.filter(e => e.severity === 'critical').length
    const highCount = liveCountryEvents.filter(e => e.severity === 'high').length
    const base = profile.riskScore
    const delta = Math.min(20, critCount * 4 + highCount * 1)
    return Math.min(95, base + delta)
  })()

  if (!selectedCountry) return null

  const formatGDP = (v: number) => {
    if (!v) return '—'
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
    return `$${(v / 1e6).toFixed(0)}M`
  }

  const SkeletonLine = ({ w }: { w: number }) => (
    <div className="skeleton" style={{ width: w, height: 13, borderRadius: 'var(--radius-sm)' }} />
  )

  const displayName = (profile?.name && profile.name !== selectedCountryCode) ? profile.name : (selectedCountry || selectedCountryCode || 'Unknown')
  const critCount = liveCountryEvents.filter(e => e.severity === 'critical').length
  const briefInputsLine = formatBriefInputsLine(project)

  const generateBrief = async () => {
    if (!selectedCountry || !selectedCountryCode || briefLoading) return
    setBriefLoading(true)
    setBrief(null)
    try {
      const payload = buildCountryBriefPayload(
        selectedCountry,
        selectedCountryCode,
        project,
        { events, alerts, situations, flaggedAlerts },
        allPlots,
      )
      const result = await fetchCountryBriefStream(payload, undefined, {
        engine: loadAnalysisEngine(project?.aiMode),
        project,
      })
      setBrief(result.brief)
      setBriefExpanded(true)
      if (result.mode === 'template') {
        pushToast({
          title: result.offline ? 'Template brief (rules mode)' : 'Template brief used',
          body: result.warning ?? 'Add API keys in Settings for AI-generated assessment.',
          severity: 'medium',
          type: 'system',
        })
      }
      void saveBriefToHistory({
        type: 'country',
        title: `${displayName} country brief`,
        country: displayName,
        countryCode: selectedCountryCode,
        projectId: project?.id,
        brief: result.brief as unknown as Record<string, unknown>,
      })
    } catch (err) {
      pushToast({
        title: 'Country brief failed',
        body: err instanceof Error ? err.message : 'Add API keys in Settings',
        severity: 'medium',
        type: 'system',
      })
    } finally {
      setBriefLoading(false)
    }
  }

  const copyBrief = () => {
    if (!brief || !selectedCountry) return
    navigator.clipboard.writeText(countryBriefToMarkdown(brief, displayName)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className={`panel-right panel-slide-in${closing ? ' panel-closing' : ''}`} style={{ overflowY: 'auto' }}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div className="ui-chip ui-chip--accent" style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', padding: 0 }}>
            {(selectedCountryCode || '??').slice(0, 2)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 2 }}>
                <SkeletonLine w={160} /><SkeletonLine w={100} />
              </div>
            ) : (
              <>
                <div className="ui-kicker" style={{ marginBottom: 4 }}>Country</div>
                <div className="ui-title ui-title--panel">{displayName}</div>
                <div className="ui-subtitle" style={{ marginTop: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {[profile?.capital, profile?.region].filter(v => v && v !== 'Unknown').join(' · ')}
                </div>
              </>
            )}
          </div>
          <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="ui-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {isLoading ? (
            <div className="skeleton" style={{ width: 200, height: 88, borderRadius: 'var(--radius-md)' }} />
          ) : (
            <RiskGauge score={liveRiskScore ?? profile?.riskScore ?? 0} />
          )}
          {!isLoading && profile?.population ? (
            <div className="ui-stat" style={{ textAlign: 'right', minWidth: 88 }}>
              <div className="ui-stat__label">Population</div>
              <div className="ui-stat__n" style={{ fontSize: 16 }}>
                {(profile.population / 1e6).toFixed(1)}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>M</span>
              </div>
            </div>
          ) : null}
        </div>

        {briefInputsLine && (
          <p className="ui-feed-hint" style={{ margin: 0, lineHeight: 1.5 }}>
            {briefInputsLine}
          </p>
        )}

        <button
          type="button"
          onClick={generateBrief}
          disabled={briefLoading || isLoading}
          className={`ui-btn${brief ? ' ui-btn--ghost' : ' ui-btn--primary'}`}
          style={{ width: '100%', justifyContent: 'center', gap: 6, fontSize: 11 }}
        >
          {briefLoading ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Sparkles size={12} />}
          {briefLoading ? 'Synthesizing brief…' : brief ? 'Regenerate country brief' : `AI country brief (${liveCountryEvents.length} events)`}
        </button>

        {brief && (
          <div className="ui-intel-card ui-intel-card--accent">
            <div className="ui-intel-card__head">
              <Sparkles size={12} style={{ color: 'var(--accent)' }} />
              Workspace brief
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button type="button" onClick={copyBrief} className="ui-btn ui-btn--ghost" style={{ padding: '4px 6px' }} title="Copy brief">
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </button>
                <button type="button" onClick={() => setBriefExpanded(e => !e)} className="ui-btn ui-btn--ghost" style={{ padding: '4px 6px' }}>
                  {briefExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              </div>
            </div>
            <div className="ui-intel-card__body">
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.55 }}>
              {brief.executiveSummary}
            </p>
            {briefExpanded && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {brief.keyJudgments && brief.keyJudgments.length > 0 && (
                  <div>
                    <div style={BRIEF_LABEL_STYLE}>Key judgments</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {brief.keyJudgments.map((j, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <ConfChip level={j.confidence} />
                          <span style={{ flex: 1 }}>
                            {j.judgment}<CiteTags tags={j.citations} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div style={BRIEF_LABEL_STYLE}>30-day outlook</div>
                  {brief.outlook30}
                </div>
                {brief.competingHypotheses && brief.competingHypotheses.length > 0 && (
                  <div>
                    <div style={BRIEF_LABEL_STYLE}>Competing hypotheses</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {brief.competingHypotheses.map((h, i) => (
                        <div key={i}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>H{i + 1}</span>
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}> · {h.likelihood}</span>
                          {' — '}{h.hypothesis}<CiteTags tags={h.citations} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {brief.watchItems.length > 0 && (
                  <div>
                    <div style={BRIEF_LABEL_STYLE}>Watch</div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {brief.watchItems.slice(0, 4).map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                {brief.intelligenceGaps && brief.intelligenceGaps.length > 0 && (
                  <div>
                    <div style={BRIEF_LABEL_STYLE}>Intelligence gaps</div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {brief.intelligenceGaps.slice(0, 5).map((g, i) => <li key={i}>{g}</li>)}
                    </ul>
                  </div>
                )}
                {brief.sources && brief.sources.length > 0 && (
                  <div>
                    <div style={BRIEF_LABEL_STYLE}>Sources ({brief.sources.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {brief.sources.map(s => (
                        <div key={s.tag} style={{ fontSize: 10, display: 'flex', gap: 5 }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>[{s.tag}]</span>
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noreferrer" className="ui-link" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.title}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>{s.title}</span>
                          )}
                          {s.source && <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>· {s.source}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{brief.confidenceLevel}</div>
              </div>
            )}
            </div>
          </div>
        )}

        <div>
          <div className="ui-section-label">Economic indicators</div>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 52, borderRadius: 'var(--radius-md)' }} />)}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'GDP', value: formatGDP(profile?.gdp || 0) },
                {
                  label: 'GDP growth',
                  value: profile?.gdpGrowth !== undefined ? `${profile.gdpGrowth > 0 ? '+' : ''}${profile.gdpGrowth.toFixed(1)}%` : '—',
                  color: profile?.gdpGrowth !== undefined ? (profile.gdpGrowth > 0 ? 'var(--low)' : 'var(--critical)') : undefined,
                },
                {
                  label: 'Inflation',
                  value: profile?.inflation !== undefined ? `${profile.inflation.toFixed(1)}%` : '—',
                  color: profile?.inflation !== undefined ? (profile.inflation > 10 ? 'var(--critical)' : profile.inflation > 5 ? 'var(--medium)' : 'var(--text-primary)') : undefined,
                },
                { label: 'Military', value: profile?.militarySpending ? `${profile.militarySpending.toFixed(1)}% GDP` : '—' },
              ].map(item => (
                <div key={item.label} className="ui-stat" style={{ padding: '9px 11px', textAlign: 'left' }}>
                  <div className="ui-stat__label">{item.label}</div>
                  <div className="ui-stat__n font-mono" style={{ fontSize: 13, color: item.color ?? 'var(--text-primary)' }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isLoading && profile?.economicHistory && profile.economicHistory.length > 1 && (
          <div>
            <div className="ui-section-label">GDP trend</div>
            <Sparkline data={profile.economicHistory.map((d: { gdp: number }) => d.gdp)} />
          </div>
        )}

        {!isLoading && (
          <div>
            <div className="ui-section-label">Governance</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Freedom index</span>
                  <span className="font-mono" style={{ fontSize: 10, fontWeight: 700 }}>{profile?.freedomScore ?? '—'}/100</span>
                </div>
                <ScoreBar value={profile?.freedomScore || 0} color="var(--low)" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fragility index</span>
                  <span className="font-mono" style={{ fontSize: 10, fontWeight: 700 }}>{profile?.fragilityScore ?? '—'}/120</span>
                </div>
                <ScoreBar value={profile?.fragilityScore || 0} max={120} color="var(--high)" />
              </div>
            </div>
          </div>
        )}

        {liveCountryEvents.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="ui-section-label" style={{ marginBottom: 0 }}>Events in country</div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {critCount > 0 && (
                  <span className="ui-chip ui-chip--xs ui-chip--sev-critical">{critCount} critical</span>
                )}
                <span className="ui-chip ui-chip--xs">{liveCountryEvents.length}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {liveCountryEvents.slice(0, 6).map(e => (
                <div
                  key={e.id}
                  className="ui-notif-row"
                  onClick={() => { flyTo(e.lat, e.lon, 6); useMapStore.getState().setSelectedEvent(e) }}
                >
                  <div className="ui-sev-dot" style={{ width: 5, height: 5, marginTop: 4, background: SEV_VAR[e.severity] ?? 'var(--text-muted)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{e.source} · {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {liveCountryEvents.length === 0 && !isLoading && (
          <div className="ui-panel-empty">
            <div className="ui-panel-empty__title">No events in feed</div>
            <p className="ui-feed-hint">Nothing loaded for this country in the current event stream.</p>
          </div>
        )}

        {threatenedCableData.length > 0 && (
          <div>
            <div className="ui-section-label">Infrastructure at risk</div>
            <div className="ui-callout" style={{ background: 'var(--badge-red-bg)', borderColor: 'var(--badge-red-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--critical)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--critical)' }}>
                  {threatenedCableData.length} submarine cable{threatenedCableData.length !== 1 ? 's' : ''} near active events
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {(cablesExpanded ? threatenedCableData : threatenedCableData.slice(0, 5)).map(c => {
                  const isActive = highlightedCableId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        flyTo(c.lat, c.lon, 5)
                        setHighlightedCableId(isActive ? null : c.id)
                      }}
                      className={`ui-btn ui-btn--ghost${isActive ? ' ui-btn--primary' : ''}`}
                      style={{
                        justifyContent: 'flex-start',
                        fontSize: 10,
                        padding: '4px 6px',
                        color: isActive ? 'var(--accent)' : 'var(--badge-red-fg)',
                        width: '100%',
                      }}
                    >
                      {c.name}
                    </button>
                  )
                })}
                {threatenedCableData.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setCablesExpanded(e => !e)}
                    className="ui-link"
                    style={{ fontSize: 10, marginTop: 4, textAlign: 'left' }}
                  >
                    {cablesExpanded ? 'Show less' : `+${threatenedCableData.length - 5} more`}
                  </button>
                )}
              </div>
              <div className="ui-feed-hint" style={{ padding: 0, marginTop: 8, fontSize: 9 }}>
                {highlightedCableId ? 'Highlighted on map — click again to clear' : 'Click a cable to highlight on map'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const w = 260, h = 56, pad = 2
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2))
  const ys = data.map(v => h - pad - ((v - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
