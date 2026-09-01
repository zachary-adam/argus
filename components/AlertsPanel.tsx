'use client'
import { useMapStore } from '@/stores/mapStore'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '@/stores/projectStore'
import { X, XCircle, Flag, AlertTriangle, ChevronDown, ChevronUp, CheckCircle, Crosshair, Settings, RotateCcw, ToggleLeft, ToggleRight, Play, Loader } from 'lucide-react'
import { DEFAULT_CORRELATION_SETTINGS, CorrelationSettings } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { useClosePanel } from '@/lib/hooks/useClosePanel'

const SEV_STRIPE: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
}

const FILTER_LABELS: Record<'all' | 'unread' | 'acked', string> = {
  all: 'All',
  unread: 'New',
  acked: 'Done',
}

const SIGNAL_META: { key: keyof CorrelationSettings; label: string; hasRadius: boolean; hasHours: boolean }[] = [
  { key: 'maritime',                label: 'Maritime Activity',          hasRadius: true,  hasHours: true  },
  { key: 'conflictEscalation',      label: 'Conflict Escalation',        hasRadius: false, hasHours: true  },
  { key: 'compoundCrisis',          label: 'Compound Crisis',            hasRadius: false, hasHours: true  },
  { key: 'regionalInstability',     label: 'Regional Instability',       hasRadius: true,  hasHours: true  },
  { key: 'infrastructureThreat',    label: 'Infrastructure Threat',      hasRadius: true,  hasHours: false },
  { key: 'humanitarianConvergence', label: 'Humanitarian Convergence',   hasRadius: false, hasHours: true  },
  { key: 'politicalDestabilization',label: 'Political Destabilization',  hasRadius: false, hasHours: true  },
  { key: 'spillover',               label: 'Conflict Spillover',         hasRadius: false, hasHours: true  },
  { key: 'cascading',               label: 'Cascading Failure',          hasRadius: false, hasHours: false },
  { key: 'sanctionedVessel',        label: 'Sanctioned Vessel',          hasRadius: true,  hasHours: false },
  { key: 'milAviation',             label: 'Military Aviation',          hasRadius: true,  hasHours: true  },
  { key: 'isrOps',                  label: 'ISR Operations',             hasRadius: true,  hasHours: true  },
  { key: 'combinedArms',            label: 'Combined Arms',              hasRadius: true,  hasHours: false },
  { key: 'darkFleet',               label: 'Dark Fleet',                 hasRadius: true,  hasHours: false },
]

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export default function AlertsPanel() {
  const { handleClose, closing } = useClosePanel('alerts')
  const { alerts, setAlerts, flyTo, dismissAlert, flaggedAlerts, flagAlert, escalateAlert, highlightedAlertId, setHighlightedAlertId } = useMapStore(useShallow(s => ({
    alerts: s.alerts, setAlerts: s.setAlerts, flyTo: s.flyTo, dismissAlert: s.dismissAlert,
    flaggedAlerts: s.flaggedAlerts, flagAlert: s.flagAlert, escalateAlert: s.escalateAlert,
    highlightedAlertId: s.highlightedAlertId, setHighlightedAlertId: s.setHighlightedAlertId,
  })))
  const { getActiveProject, updateCorrelationSignal, resetCorrelationSettings } = useProjectStore()
  const project = getActiveProject()

  const critical = alerts.filter(a => a.severity === 'critical').length
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})
  const [noteText,      setNoteText]      = useState<Record<string, string>>({})
  const [escalated,     setEscalated]     = useState<Set<string>>(new Set())
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(sessionStorage.getItem('argus_acked_alerts') ?? '[]')) } catch { return new Set<string>() }
  })
  const [alertFilter,   setAlertFilter]   = useState<'all' | 'unread' | 'acked'>('all')
  const [showSettings,  setShowSettings]  = useState(false)
  const [applying,      setApplying]      = useState(false)

  const toggleAck = (id: string) => setAcknowledgedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    try { sessionStorage.setItem('argus_acked_alerts', JSON.stringify([...next])) } catch { /* noop */ }
    return next
  })

  const settings = project?.correlationSettings ?? DEFAULT_CORRELATION_SETTINGS

  async function applyNow() {
    if (!project || applying) return
    const evts = useMapStore.getState().events
    if (!evts.length) return
    setApplying(true)
    try {
      const res = await fetch('/api/correlations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: evts, settings: project.correlationSettings }),
      })
      setAlerts(await res.json())
    } catch { /* non-fatal */ }
    finally { setApplying(false) }
  }

  const filteredAlerts = alerts.filter(a =>
    alertFilter === 'all' ? true : alertFilter === 'unread' ? !acknowledgedIds.has(a.id) : acknowledgedIds.has(a.id),
  )

  return (
    <div className={`panel-right panel-slide-in${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Correlation</div>
            <div className="ui-title ui-title--panel">Alerts</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="ui-chip ui-chip--xs">{alerts.length} total</span>
              {critical > 0 && (
                <span className="ui-chip ui-chip--xs ui-chip--sev-critical">{critical} critical</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setShowSettings(s => !s)}
              title="Signal settings"
              className={`ui-btn ui-btn--ghost${showSettings ? ' ui-nav-btn--active' : ''}`}
              style={{ padding: 6 }}
            >
              <Settings size={14} />
            </button>
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>
      </header>

      {showSettings ? (
        <div className="ui-panel-body" style={{ paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
            <div>
              <div className="ui-section-label" style={{ marginBottom: 4 }}>Signal thresholds</div>
              <p className="ui-subtitle ui-subtitle--panel">Per-project · changes take effect on Apply</p>
            </div>
            {project && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" onClick={() => resetCorrelationSettings(project.id)} className="ui-btn ui-btn--ghost" style={{ fontSize: 9, padding: '4px 8px' }}>
                  <RotateCcw size={9} /> Reset
                </button>
                <button type="button" onClick={applyNow} disabled={applying} className="ui-btn ui-btn--primary" style={{ fontSize: 9, padding: '4px 8px' }}>
                  {applying ? <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={9} />}
                  {applying ? 'Running…' : 'Apply'}
                </button>
              </div>
            )}
          </div>

          {!project && (
            <div className="ui-panel-empty">
              <div className="ui-panel-empty__title">No project open</div>
              <p className="ui-feed-hint">Open a project to configure correlation thresholds.</p>
            </div>
          )}

          {project && (
            <>
              <div className="ui-callout" style={{ marginBottom: 12, fontSize: 9, lineHeight: 1.55 }}>
                <strong>Toggle</strong> signals on/off · <strong>km</strong> = proximity · <strong>hrs</strong> = time window · <strong>min</strong> = events needed to fire.
                Greyed fields are unused by that signal. Hit <strong>Apply</strong> to re-run immediately.
              </div>

              <div className="ui-alerts-threshold-grid" style={{ marginBottom: 4, padding: '0 4px' }}>
                <div className="ui-section-label" style={{ marginBottom: 0 }}>Signal</div>
                <div className="ui-section-label" style={{ marginBottom: 0, textAlign: 'center' }}>km</div>
                <div className="ui-section-label" style={{ marginBottom: 0, textAlign: 'center' }}>hrs</div>
                <div className="ui-section-label" style={{ marginBottom: 0, textAlign: 'center' }}>min</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {SIGNAL_META.map(({ key, label, hasRadius, hasHours }) => {
                  const sig = settings[key]
                  const def = DEFAULT_CORRELATION_SETTINGS[key]
                  const isModified = JSON.stringify(sig) !== JSON.stringify(def)
                  const gridClass = [
                    'ui-signal-grid',
                    !sig.enabled ? 'ui-signal-grid--off' : '',
                    isModified ? 'ui-signal-grid--mod' : '',
                  ].filter(Boolean).join(' ')

                  return (
                    <div key={key} className={gridClass}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <button
                          type="button"
                          onClick={() => updateCorrelationSignal(project.id, key, { enabled: !sig.enabled })}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                        >
                          {sig.enabled
                            ? <ToggleRight size={15} style={{ color: 'var(--accent)' }} />
                            : <ToggleLeft size={15} style={{ color: 'var(--text-muted)' }} />
                          }
                        </button>
                        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                        {isModified && <span className="ui-chip ui-chip--xs ui-chip--accent">mod</span>}
                      </div>

                      <input
                        type="number"
                        min={0}
                        disabled={!sig.enabled || !hasRadius}
                        value={sig.radiusKm}
                        onChange={e => updateCorrelationSignal(project.id, key, { radiusKm: Math.max(0, Number(e.target.value)) })}
                        className="ui-input--num"
                      />
                      <input
                        type="number"
                        min={0}
                        disabled={!sig.enabled || !hasHours}
                        value={sig.hoursBack}
                        onChange={e => updateCorrelationSignal(project.id, key, { hoursBack: Math.max(0, Number(e.target.value)) })}
                        className="ui-input--num"
                      />
                      <input
                        type="number"
                        min={1}
                        disabled={!sig.enabled}
                        value={sig.minEvents}
                        onChange={e => updateCorrelationSignal(project.id, key, { minEvents: Math.max(1, Number(e.target.value)) })}
                        className="ui-input--num"
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="ui-panel-body" style={{ paddingTop: 10 }}>
          {alerts.length > 0 && (
            <div className="ui-filter-row" style={{ marginBottom: 10 }}>
              {(['all', 'unread', 'acked'] as const).map(f => {
                const count = f === 'all' ? alerts.length
                  : f === 'unread' ? alerts.filter(a => !acknowledgedIds.has(a.id)).length
                  : acknowledgedIds.size
                const active = alertFilter === f
                return (
                  <button
                    key={f}
                    type="button"
                    className={`ui-filter-pill ui-filter-pill--accent${active ? ' ui-filter-pill--active' : ''}`}
                    onClick={() => setAlertFilter(f)}
                  >
                    {FILTER_LABELS[f]} {count}
                  </button>
                )
              })}
            </div>
          )}

          <div className="ui-callout" style={{ marginBottom: 12, fontSize: 10, lineHeight: 1.55 }}>
            <div className="ui-section-label" style={{ marginBottom: 4, color: 'var(--accent)' }}>What is this?</div>
            Fires when multiple event streams — vessels, conflict, aviation, infrastructure — converge in the same area within a time window. Each alert names the pattern and lists the events that triggered it.
            <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 9, color: 'var(--text-muted)' }}>
              <span>Click to fly to location</span>
              <span>Settings → tune sensitivity</span>
              <span>Flag for escalation</span>
            </div>
          </div>

          {alerts.length === 0 && (
            <div className="ui-panel-empty">
              <div className="ui-panel-empty__title">No correlation alerts</div>
              <p className="ui-feed-hint">Load events to run pattern analysis.</p>
            </div>
          )}

          {filteredAlerts.map(alert => {
            const stripe = SEV_STRIPE[alert.severity] ?? 'var(--text-muted)'
            const isFlagged = !!flaggedAlerts[alert.id]
            const isNotesOpen = !!expandedNotes[alert.id]
            const isEscalated = escalated.has(alert.id)
            const isAcked = acknowledgedIds.has(alert.id)
            const flagInfo = flaggedAlerts[alert.id]
            const sevChip = `ui-chip--sev-${alert.severity}` as const

            const cardClass = [
              'ui-alert-card',
              isFlagged ? 'ui-alert-card--flagged' : '',
              isAcked ? 'ui-alert-card--acked' : '',
            ].filter(Boolean).join(' ')

            return (
              <div key={alert.id} className={cardClass}>
                <div className="ui-alert-card__stripe" style={{ background: stripe }} />
                <div className="ui-alert-card__body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span className={`ui-chip ui-chip--xs ${sevChip}`}>{alert.severity}</span>
                    <span className="ui-chip ui-chip--xs">{alert.pattern}</span>
                    {isFlagged && (
                      <span className="ui-chip ui-chip--xs ui-chip--disinfo" style={{ marginLeft: 'auto' }}>
                        <Flag size={9} style={{ display: 'inline', verticalAlign: -1 }} /> flagged
                      </span>
                    )}
                    {isAcked && !isEscalated && (
                      <span className="ui-chip ui-chip--xs ui-chip--stage-closed" style={{ marginLeft: isFlagged ? 0 : 'auto' }}>
                        <CheckCircle size={9} style={{ display: 'inline', verticalAlign: -1 }} /> ack
                      </span>
                    )}
                    {isEscalated && (
                      <span className="ui-chip ui-chip--xs ui-chip--sev-critical" style={{ marginLeft: (isFlagged || isAcked) ? 0 : 'auto' }}>
                        <CheckCircle size={9} style={{ display: 'inline', verticalAlign: -1 }} /> escalated
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5, lineHeight: 1.4 }}>{alert.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>{alert.summary}</div>

                  <div className="ui-section-label" style={{ marginBottom: 6 }}>
                    {alert.signalCount} event{alert.signalCount !== 1 ? 's' : ''} matched
                  </div>

                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {alert.countries.map(c => (
                      <span key={c} className="ui-chip ui-chip--xs">{c}</span>
                    ))}
                  </div>

                  <div className="ui-callout" style={{ marginBottom: 10, padding: '8px 10px' }}>
                    <div className="ui-section-label" style={{ marginBottom: 5 }}>Triggering events</div>
                    {alert.signals.slice(0, 3).map((s, i) => (
                      <div key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4, padding: '2px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                        {decodeEntities(s)}
                      </div>
                    ))}
                  </div>

                  {isNotesOpen && (
                    <div className="ui-callout" style={{ marginBottom: 10 }}>
                      <div className="ui-section-label">Analyst note</div>
                      {flagInfo && (
                        <div style={{ fontSize: 10, color: 'var(--medium)', marginBottom: 6, fontStyle: 'italic' }}>
                          Flagged {formatDistanceToNow(new Date(flagInfo.flaggedAt), { addSuffix: true })}
                          {flagInfo.note && `: "${flagInfo.note}"`}
                        </div>
                      )}
                      <textarea
                        value={noteText[alert.id] || ''}
                        onChange={e => setNoteText(prev => ({ ...prev, [alert.id]: e.target.value }))}
                        placeholder="Assessment, context, or action note…"
                        rows={3}
                        className="ui-input"
                        style={{ fontSize: 10, padding: '6px 8px', resize: 'vertical', lineHeight: 1.5 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => {
                            flagAlert(alert.id, noteText[alert.id] || '')
                            setExpandedNotes(prev => ({ ...prev, [alert.id]: false }))
                          }}
                          className="ui-btn ui-btn--ghost"
                          style={{ fontSize: 10, padding: '3px 10px', color: 'var(--medium)', borderColor: 'var(--badge-yellow-border)' }}
                        >
                          <Flag size={9} /> {isFlagged ? 'Update flag' : 'Flag alert'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}</span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => flyTo(alert.lat, alert.lon, 5)} className="ui-btn ui-btn--ghost" style={{ fontSize: 10, padding: '3px 8px' }}>
                        Map
                      </button>
                      <button
                        type="button"
                        onClick={() => setHighlightedAlertId(highlightedAlertId === alert.id ? null : alert.id)}
                        title="Highlight triggering events on map"
                        className={`ui-btn ui-btn--ghost${highlightedAlertId === alert.id ? ' ui-nav-btn--danger' : ''}`}
                        style={{ fontSize: 10, padding: '3px 8px' }}
                      >
                        <Crosshair size={9} /> {highlightedAlertId === alert.id ? 'Clear' : 'Drill'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedNotes(prev => ({ ...prev, [alert.id]: !isNotesOpen }))}
                        className={`ui-btn ui-btn--ghost${isFlagged ? '' : ''}`}
                        style={{ fontSize: 10, padding: '3px 8px', color: isFlagged ? 'var(--medium)' : undefined }}
                      >
                        <Flag size={9} />
                        {isNotesOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                      </button>
                      {isFlagged && !isEscalated && (
                        <button
                          type="button"
                          onClick={() => {
                            escalateAlert(alert.id)
                            setEscalated(prev => new Set([...prev, alert.id]))
                          }}
                          className="ui-btn ui-btn--ghost ui-nav-btn--danger"
                          style={{ fontSize: 10, padding: '3px 8px' }}
                        >
                          <AlertTriangle size={9} /> Escalate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleAck(alert.id)}
                        title={isAcked ? 'Mark as new' : 'Mark as read'}
                        className={`ui-btn ui-btn--ghost${isAcked ? '' : ''}`}
                        style={{ fontSize: 10, padding: '3px 8px', color: isAcked ? 'var(--low)' : undefined }}
                      >
                        <CheckCircle size={9} /> {isAcked ? 'Done' : 'Mark read'}
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissAlert(alert.id)}
                        title="Dismiss permanently"
                        className="ui-btn ui-btn--ghost"
                        style={{ padding: '3px 6px' }}
                      >
                        <XCircle size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
