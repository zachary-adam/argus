'use client'
import { useMemo, useState } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import type { TrackedActor } from '@/types/project'
import { X, Plus, Trash2, Users, TrendingUp, TrendingDown, Minus, Tag } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { deriveAllDossiers, suggestActors, makeTrackedActor, type ActorDossier, type ActorEvent } from '@/lib/actors'

const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
}
const SEV_ORDER = ['critical', 'high', 'medium', 'low']

const TYPE_LABEL: Record<TrackedActor['type'], string> = {
  state: 'State', 'non-state': 'Non-state', individual: 'Individual',
  organization: 'Organization', unknown: 'Unclassified',
}

function TrendBadge({ pct }: { pct: number }) {
  const isNew = pct === 999
  const up = !isNew && pct > 20
  const down = !isNew && pct < -20
  const Icon = isNew ? Minus : up ? TrendingUp : down ? TrendingDown : Minus
  const cls = isNew ? 'ui-chip ui-chip--xs'
    : up ? 'ui-chip ui-chip--xs ui-chip--sev-critical'
    : down ? 'ui-chip ui-chip--xs ui-chip--sev-low'
    : 'ui-chip ui-chip--xs'
  return (
    <span className={cls} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)' }}>
      <Icon size={10} />
      {isNew ? 'NEW' : `${pct > 0 ? '+' : ''}${pct}%`}
    </span>
  )
}

export default function ActorsPanel() {
  const { handleClose, closing } = useClosePanel('actors')
  const events = useMapStore(s => s.events)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const { getActiveProject, addTrackedActor, updateTrackedActor, removeTrackedActor } = useProjectStore()
  const project = getActiveProject()
  const tracked = useMemo(() => project?.trackedActors ?? [], [project?.trackedActors])

  const selectedId = useMapStore(s => s.selectedActorId)
  const setSelectedId = useMapStore(s => s.setSelectedActorId)
  const [nameDraft, setNameDraft] = useState('')
  const [aliasDraft, setAliasDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const corpus = events as unknown as ActorEvent[]
  const dossiers = useMemo(() => deriveAllDossiers(tracked, corpus), [tracked, corpus])
  const suggestions = useMemo(
    () => suggestActors(corpus, project?.targeting, tracked),
    [corpus, project?.targeting, tracked],
  )
  const active: ActorDossier | null = dossiers.find(d => d.actor.id === selectedId) ?? null

  function addActor(name: string) {
    if (!project || !name.trim()) return
    const actor = makeTrackedActor(name, 'organization')
    addTrackedActor(project.id, actor)
    setSelectedId(actor.id)
    setNameDraft('')
  }

  function addAlias() {
    if (!project || !active || !aliasDraft.trim()) return
    const alias = aliasDraft.trim()
    if (!active.actor.aliases.some(a => a.toLowerCase() === alias.toLowerCase())) {
      updateTrackedActor(project.id, active.actor.id, { aliases: [...active.actor.aliases, alias] })
    }
    setAliasDraft('')
  }

  function removeAlias(alias: string) {
    if (!project || !active) return
    updateTrackedActor(project.id, active.actor.id, {
      aliases: active.actor.aliases.filter(a => a !== alias),
    })
  }

  return (
    <div className={`ui-map-float-panel${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Analyze</div>
            <div className="ui-title ui-title--panel">Actors</div>
            <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>
              Who is doing what — every number traces to specific events in your corpus
            </p>
          </div>
          <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="ui-panel-body" style={{ paddingTop: 10 }}>
        {!active && (
          <>
            {/* Add actor */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                className="ui-input"
                style={{ flex: 1 }}
                placeholder="Track an actor — party, candidate, commission, group…"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addActor(nameDraft)}
              />
              <button
                type="button"
                onClick={() => addActor(nameDraft)}
                disabled={!nameDraft.trim()}
                className="ui-btn ui-btn--primary"
                style={{ flexShrink: 0, padding: '8px 12px' }}
                aria-label="Add actor"
              >
                <Plus size={13} />
              </button>
            </div>

            {suggestions.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="ui-section-label" style={{ marginBottom: 6 }}>
                  Suggested from your {suggestions.some(s => s.source === 'watchlist') ? 'watchlist & ' : ''}corpus
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {suggestions.map(s => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => addActor(s.name)}
                      className="ui-chip ui-chip--xs"
                      title={s.source === 'watchlist' ? 'From mission watch entities' : `Named in ${s.count} events`}
                    >
                      + {s.name}{s.count > 1 ? ` · ${s.count}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actor list */}
            {dossiers.map(d => {
              const topSev = SEV_ORDER.find(s => (d.severityMix[s] ?? 0) > 0)
              return (
                <div
                  key={d.actor.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(d.actor.id)}
                  onKeyDown={e => e.key === 'Enter' && setSelectedId(d.actor.id)}
                  className="ui-incident-row"
                  style={{ cursor: 'pointer' }}
                >
                  <div className="ui-sev-dot" style={{ width: 7, height: 7, marginTop: 4, flexShrink: 0, background: topSev ? SEV_VAR[topSev] : 'var(--text-muted)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.actor.name}
                      </span>
                      {d.total > 0 && !d.significant && d.trendPct !== 999 && (
                        <span
                          title="Change is within statistical noise (Poisson) — low confidence"
                          className="ui-chip ui-chip--xs"
                          style={{ fontSize: 8, letterSpacing: '0.04em', flexShrink: 0 }}
                        >
                          ~noise
                        </span>
                      )}
                      {d.total > 0 && <TrendBadge pct={d.trendPct} />}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {d.total === 0
                        ? 'No mentions in current corpus'
                        : <>
                            <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{d.recent7}</span>
                            {' this week · '}
                            <span className="font-mono">{d.total}</span>
                            {' total'}
                            {d.lastSeen ? ` · last ${formatDistanceToNow(new Date(d.lastSeen), { addSuffix: true })}` : ''}
                          </>}
                    </div>
                  </div>
                </div>
              )
            })}

            {tracked.length === 0 && (
              <div className="ui-panel-empty">
                <Users size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div className="ui-panel-empty__title">No tracked actors yet</div>
                <p className="ui-feed-hint">
                  Add the parties, candidates, and institutions in your situation.
                  Dossiers are derived from your event corpus by name matching — nothing is generated.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Dossier detail ── */}
        {active && (
          <>
            <button type="button" onClick={() => { setSelectedId(null); setConfirmDelete(null) }} className="ui-link" style={{ fontSize: 10, marginBottom: 10, display: 'block' }}>
              ← All actors
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{active.actor.name}</div>
                <select
                  className="ui-input"
                  value={active.actor.type}
                  onChange={e => project && updateTrackedActor(project.id, active.actor.id, { type: e.target.value as TrackedActor['type'] })}
                  style={{ fontSize: 10, padding: '2px 4px', width: 'auto', marginTop: 4 }}
                >
                  {(Object.keys(TYPE_LABEL) as TrackedActor['type'][]).map(t => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete === active.actor.id) {
                    if (project) removeTrackedActor(project.id, active.actor.id)
                    setSelectedId(null)
                    setConfirmDelete(null)
                  } else setConfirmDelete(active.actor.id)
                }}
                className={`ui-btn ui-btn--ghost${confirmDelete === active.actor.id ? ' ui-nav-btn--danger' : ''}`}
                style={{ fontSize: 10, padding: '4px 8px', gap: 4 }}
              >
                <Trash2 size={11} /> {confirmDelete === active.actor.id ? 'Confirm' : 'Untrack'}
              </button>
            </div>

            {/* Aliases */}
            <div className="ui-section-label" style={{ marginBottom: 6 }}>Aliases matched in event text</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {active.actor.aliases.map(a => (
                <span key={a} className="ui-chip ui-chip--xs" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Tag size={9} /> {a}
                  <button type="button" onClick={() => removeAlias(a)} aria-label={`Remove alias ${a}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'inline-flex' }}>
                    <X size={9} />
                  </button>
                </span>
              ))}
              {active.actor.aliases.length === 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>None — add acronyms or local-script spellings</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <input
                className="ui-input"
                style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
                placeholder='Add alias — e.g. "TMC", "তৃণমূল"'
                value={aliasDraft}
                onChange={e => setAliasDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAlias()}
              />
              <button type="button" onClick={addAlias} disabled={!aliasDraft.trim()} className="ui-btn ui-btn--ghost" style={{ flexShrink: 0, padding: '6px 10px' }} aria-label="Add alias">
                <Plus size={12} />
              </button>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <span className="ui-chip ui-chip--xs ui-chip--accent">{active.recent7} this week</span>
              <span className="ui-chip ui-chip--xs">{active.total} total</span>
              {active.total > 0 && <TrendBadge pct={active.trendPct} />}
              {active.total > 0 && !active.significant && active.trendPct !== 999 && (
                <span title="Change is within statistical noise (Poisson) — low confidence" className="ui-chip ui-chip--xs" style={{ fontSize: 8, letterSpacing: '0.04em' }}>
                  ~noise
                </span>
              )}
              {active.total > 0 && (
                <span className="ui-chip ui-chip--xs" title="Share of mentions carrying A/B-grade sources">
                  {Math.round(active.gradedShare * 100)}% graded A/B
                </span>
              )}
            </div>
            {active.total > 0 && (
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 12 }}>
                Trend vs prior 23-day baseline ({active.priorWeekly}/wk)
                {active.firstSeen ? ` · first seen ${formatDistanceToNow(new Date(active.firstSeen), { addSuffix: true })}` : ''}
              </div>
            )}

            {/* Co-actors */}
            {active.coActors.length > 0 && (
              <>
                <div className="ui-section-label" style={{ marginBottom: 6 }}>Co-mentioned with</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
                  {active.coActors.map(c => (
                    <button key={c.actor.id} type="button" onClick={() => setSelectedId(c.actor.id)} className="ui-chip ui-chip--xs">
                      {c.actor.name} · {c.shared}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Mention timeline */}
            <div className="ui-section-label" style={{ marginBottom: 6 }}>
              Activity — {active.mentions.length} cited event{active.mentions.length !== 1 ? 's' : ''}
            </div>
            {active.mentions.length === 0 && (
              <div className="ui-feed-hint">
                No events in the current corpus mention this actor or its aliases.
                Add aliases (acronyms, local-script names) to widen the match.
              </div>
            )}
            {active.mentions.slice(0, 60).map(({ event: e, matchedAs }) => (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedEvent(e as never)}
                onKeyDown={ev => ev.key === 'Enter' && setSelectedEvent(e as never)}
                className="ui-incident-row"
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <div className="ui-sev-dot" style={{ width: 7, height: 7, marginTop: 4, background: SEV_VAR[e.severity] ?? 'var(--text-muted)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{e.title}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
                      {formatDistanceToNow(new Date(e.timestamp), { addSuffix: true })}
                      {e.sourceReliability ? ` · grade ${e.sourceReliability}` : ''}
                      {matchedAs.toLowerCase() !== active.actor.name.toLowerCase() ? ` · matched as “${matchedAs}”` : ''}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
