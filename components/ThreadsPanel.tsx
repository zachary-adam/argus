'use client'
import { useMemo, useState } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { X, GitBranch, Briefcase, Check, AlertTriangle, CalendarClock, Plus } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { deriveThreads, type NarrativeThread, type ThreadEvent } from '@/lib/threads'
import { findContradictions } from '@/lib/contradictions'
import { sortKeyDates, keyDateDistance } from '@/lib/keyDates'

const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
}

export default function ThreadsPanel() {
  const { handleClose, closing } = useClosePanel('threads')
  const events = useMapStore(s => s.events)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const pushToast = useMapStore(s => s.pushToast)
  const { getActiveProject, createCase, addEventToCase, addKeyDate, removeKeyDate } = useProjectStore()
  const project = getActiveProject()

  const selectedId = useMapStore(s => s.selectedThreadId)
  const selectedThreadEventIds = useMapStore(s => s.selectedThreadEventIds)
  const setSelectedId = useMapStore(s => s.setSelectedThreadId)
  const [promoted, setPromoted] = useState<Set<string>>(new Set())
  const [dateLabel, setDateLabel] = useState('')
  const [dateValue, setDateValue] = useState('')

  const keyDates = useMemo(() => sortKeyDates(project?.keyDates ?? []), [project?.keyDates])

  function addDate() {
    if (!project || !dateLabel.trim() || !dateValue) return
    addKeyDate(project.id, {
      id: `kd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: dateLabel.trim(),
      date: dateValue,
    })
    setDateLabel(''); setDateValue('')
  }

  const threads = useMemo(
    () => deriveThreads(events as unknown as ThreadEvent[], project?.trackedActors ?? []),
    [events, project?.trackedActors],
  )
  const active: NarrativeThread | null = useMemo(() => {
    if (!selectedId) return null
    const direct = threads.find(t => t.id === selectedId)
    if (direct) return direct
    if (selectedThreadEventIds?.length) {
      const anchor = new Set(selectedThreadEventIds)
      let best: NarrativeThread | null = null
      let bestOverlap = 0
      for (const t of threads) {
        const overlap = t.events.filter(e => anchor.has(e.id)).length
        if (overlap > bestOverlap) {
          bestOverlap = overlap
          best = t
        }
      }
      if (best && bestOverlap > 0) return best
    }
    return null
  }, [threads, selectedId, selectedThreadEventIds])
  const contradictions = useMemo(
    () => (active ? findContradictions(active.events) : []),
    [active],
  )

  function promoteToCase(t: NarrativeThread) {
    if (!project) return
    const sc = createCase(project.id, {
      name: t.label,
      description: `Promoted from narrative thread — ${t.events.length} events, ${t.outlets.length} outlet${t.outlets.length !== 1 ? 's' : ''}, ${format(new Date(t.firstAt), 'd MMM')} → ${format(new Date(t.lastAt), 'd MMM')}.`,
      status: 'active',
      tags: ['thread'],
    })
    for (const e of t.events) addEventToCase(project.id, sc.id, e.id)
    setPromoted(prev => new Set(prev).add(t.id))
    pushToast({
      title: 'Thread promoted to case',
      body: `"${t.label}" saved with ${t.events.length} linked events — threads re-derive from the feed; cases persist.`,
      severity: 'info', type: 'system',
    })
  }

  return (
    <div className={`ui-map-float-panel${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Analyze</div>
            <div className="ui-title ui-title--panel">Threads</div>
            <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>
              Storylines linked by actors, places, and time — every link is auditable
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
            {/* Situation calendar — analyst-declared key dates, generic to any watch */}
            <div style={{ marginBottom: 14 }}>
              <div className="ui-section-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <CalendarClock size={11} /> Situation calendar
              </div>
              {keyDates.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0', fontSize: 11 }}>
                  <span className="font-mono" style={{ color: 'var(--text-muted)', flexShrink: 0, width: 74 }}>{d.date}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                  <span className="ui-chip ui-chip--xs" style={{ flexShrink: 0 }}>{keyDateDistance(d.date)}</span>
                  <button type="button" onClick={() => project && removeKeyDate(project.id, d.id)} className="ui-btn ui-btn--ghost" style={{ padding: 2, flexShrink: 0 }} aria-label="Remove date">
                    <X size={11} />
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  className="ui-input"
                  style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
                  placeholder="Key date — poll phase, ruling, summit…"
                  value={dateLabel}
                  onChange={e => setDateLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDate()}
                />
                <input
                  type="date"
                  className="ui-input"
                  style={{ fontSize: 11, padding: '6px 8px', width: 130, flexShrink: 0 }}
                  value={dateValue}
                  onChange={e => setDateValue(e.target.value)}
                />
                <button type="button" onClick={addDate} disabled={!dateLabel.trim() || !dateValue} className="ui-btn ui-btn--ghost" style={{ flexShrink: 0, padding: '6px 8px' }} aria-label="Add date">
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {threads.length > 0 && <div className="ui-section-label" style={{ marginBottom: 6 }}>Storylines</div>}
            {threads.map(t => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(t.id)}
                onKeyDown={e => e.key === 'Enter' && setSelectedId(t.id)}
                className="ui-incident-row"
                style={{ cursor: 'pointer' }}
              >
                <div className="ui-sev-dot" style={{ width: 7, height: 7, marginTop: 4, flexShrink: 0, background: SEV_VAR[t.topSeverity] }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <span
                      style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}
                      title={t.label}
                    >
                      {t.label}
                    </span>
                    {t.active && (
                      <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)', flexShrink: 0 }}>
                        active
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.events.length}</span>
                    {' events · '}
                    <span className="font-mono">{t.outlets.length}</span>
                    {` outlet${t.outlets.length !== 1 ? 's' : ''} · last ${formatDistanceToNow(new Date(t.lastAt), { addSuffix: true })}`}
                  </div>
                </div>
              </div>
            ))}

            {threads.length === 0 && (
              <div className="ui-panel-empty">
                <GitBranch size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div className="ui-panel-empty__title">No threads yet</div>
                <p className="ui-feed-hint">
                  Threads form when two or more events link through a shared tracked actor,
                  related reporting, or nearby locations within 14 days. Track actors and
                  keep collecting — storylines surface on their own.
                </p>
              </div>
            )}

            {threads.length > 0 && (
              <div className="ui-feed-hint" style={{ marginTop: 14 }}>
                Threads re-derive from the current corpus on every view — promote one to a case to make it permanent.
              </div>
            )}
          </>
        )}

        {active && (
          <>
            <button type="button" onClick={() => setSelectedId(null)} className="ui-link" style={{ fontSize: 10, marginBottom: 10, display: 'block' }}>
              ← All threads
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{active.label}</div>
                {active.events.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>
                    Latest: {active.events[active.events.length - 1].title}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => promoteToCase(active)}
                disabled={promoted.has(active.id)}
                className="ui-btn ui-btn--ghost"
                style={{ fontSize: 10, padding: '4px 8px', gap: 4, flexShrink: 0 }}
                title="Save as a permanent case with these events linked"
              >
                {promoted.has(active.id) ? <><Check size={11} /> Case created</> : <><Briefcase size={11} /> Promote to case</>}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <span className="ui-chip ui-chip--xs ui-chip--accent">{active.events.length} events</span>
              <span className="ui-chip ui-chip--xs">{active.outlets.length} outlet{active.outlets.length !== 1 ? 's' : ''}</span>
              <span className="ui-chip ui-chip--xs" style={{ color: SEV_VAR[active.topSeverity], fontWeight: 700 }}>{active.topSeverity}</span>
              {active.active
                ? <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)' }}>active</span>
                : <span className="ui-chip ui-chip--xs">dormant</span>}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 12 }}>
              {format(new Date(active.firstAt), 'd MMM yyyy')} → {format(new Date(active.lastAt), 'd MMM yyyy')}
              {active.outlets.length > 0 ? ` · ${active.outlets.slice(0, 4).join(', ')}` : ''}
            </div>

            {active.actorNames.length > 0 && (
              <>
                <div className="ui-section-label" style={{ marginBottom: 6 }}>Tracked actors in this thread</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
                  {active.actorNames.map(a => (
                    <span key={a} className="ui-chip ui-chip--xs">{a}</span>
                  ))}
                </div>
              </>
            )}

            {contradictions.length > 0 && (
              <>
                <div className="ui-section-label" style={{ marginBottom: 6 }}>Figure check — diverging reports</div>
                {contradictions.map((c, i) => (
                  <div key={i} className="ui-callout" style={{ marginBottom: 8, fontSize: 10, lineHeight: 1.6, borderLeft: '3px solid var(--high)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                      <AlertTriangle size={11} color="var(--high)" />
                      {c.term}: {c.reports.map(r => r.value).join(' vs ')}
                      <span className="ui-chip ui-chip--xs" style={{ fontSize: 8 }}>
                        {c.kind === 'conflicting' ? 'same-window conflict' : 'later report walks figure back'}
                      </span>
                    </div>
                    {c.reports.map(r => (
                      <div key={r.eventId} style={{ color: 'var(--text-muted)' }}>
                        <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.value}</span>
                        {' — '}
                        <button
                          type="button"
                          className="ui-link"
                          style={{ fontSize: 10 }}
                          onClick={() => {
                            const evt = active.events.find(e => e.id === r.eventId)
                            if (evt) setSelectedEvent(evt as never)
                          }}
                        >
                          {r.title.slice(0, 60)}{r.title.length > 60 ? '…' : ''}
                        </button>
                        {' · '}{format(new Date(r.timestamp), 'd MMM HH:mm')}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}

            <div className="ui-section-label" style={{ marginBottom: 6 }}>Timeline — oldest first</div>
            {active.events.map(e => {
              const reasons = active.links.find(l => l.eventId === e.id)?.reasons ?? []
              return (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedEvent(e as never)}
                  onKeyDown={ev => ev.key === 'Enter' && setSelectedEvent(e as never)}
                  className="ui-incident-row"
                  style={{ cursor: 'pointer' }}
                >
                  <div className="ui-sev-dot" style={{ width: 7, height: 7, marginTop: 4, flexShrink: 0, background: SEV_VAR[e.severity] ?? 'var(--text-muted)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                      {format(new Date(e.timestamp), 'd MMM · HH:mm')}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>{e.title}</div>
                    {reasons.length > 0 && reasons[0] !== 'thread origin' && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {reasons.map(r => (
                          <span key={r} className="ui-chip ui-chip--xs" style={{ fontSize: 8, letterSpacing: '0.03em' }}>{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
