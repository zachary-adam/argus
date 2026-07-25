'use client'
import { useEffect } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { X, Radar, GitBranch, Users, AlertTriangle, TrendingUp, Trash2, Bell, BellOff, Target } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import type { MonitorSignal, MonitorSignalKind } from '@/lib/monitor'

const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)',
}

const KIND_ICON: Record<MonitorSignalKind, React.ReactNode> = {
  'new-thread': <GitBranch size={12} />,
  'thread-escalation': <TrendingUp size={12} />,
  'actor-spike': <Users size={12} />,
  'contradiction': <AlertTriangle size={12} />,
  'forecast-due': <Target size={12} />,
}

function signalHeadline(sig: MonitorSignal): string | null {
  if (sig.threadLabel) return sig.threadLabel
  if (sig.actorName) return sig.actorName
  return null
}

export default function MonitorPanel() {
  const { handleClose, closing } = useClosePanel('monitor')
  const signals = useMapStore(s => s.monitorSignals)
  const markSeen = useMapStore(s => s.markMonitorSeen)
  const clearSignals = useMapStore(s => s.clearMonitorSignals)
  const events = useMapStore(s => s.events)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const openThreads = useMapStore(s => s.openThreads)
  const openActors = useMapStore(s => s.openActors)
  const togglePanel = useMapStore(s => s.togglePanel)

  useEffect(() => { markSeen() }, [markSeen])

  const notifState = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'

  function openLinked(eventId?: string) {
    if (!eventId) return
    const ev = events.find(e => e.id === eventId)
    if (ev) setSelectedEvent(ev)
  }

  function openSignal(sig: MonitorSignal) {
    if (sig.threadId) {
      openThreads(sig.threadId, sig.eventIds)
      return
    }
    if (sig.actorId) {
      openActors(sig.actorId)
      return
    }
    if (sig.forecastId) {
      togglePanel('forecasts')
      return
    }
    openLinked(sig.eventIds?.[0])
  }

  return (
    <div className={`ui-map-float-panel${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Watch floor</div>
            <div className="ui-title ui-title--panel">Monitor</div>
            <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>
              Alerts when a derived storyline or tracked actor moves — click any alert to open it in Threads or Actors
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {signals.length > 0 && (
              <button type="button" onClick={clearSignals} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Clear" title="Clear all">
                <Trash2 size={13} />
              </button>
            )}
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className="ui-panel-body" style={{ paddingTop: 10 }}>
        {notifState !== 'granted' && (
          <div className="ui-callout" style={{ marginBottom: 12, fontSize: 10, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 8 }}>
            {notifState === 'unsupported'
              ? <><BellOff size={13} /> Desktop notifications aren&apos;t supported in this browser — alerts still appear here and as in-app toasts.</>
              : <>
                  <Bell size={13} />
                  <span style={{ flex: 1 }}>Enable desktop notifications to get paged even when this tab is in the background.</span>
                  <button type="button" onClick={() => Notification.requestPermission()} className="ui-btn ui-btn--primary" style={{ fontSize: 10, padding: '4px 8px', flexShrink: 0 }}>
                    Enable
                  </button>
                </>}
          </div>
        )}

        {signals.length === 0 && (
          <div className="ui-panel-empty">
            <Radar size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
            <div className="ui-panel-empty__title">Watching your situation</div>
            <p className="ui-feed-hint">
              Every ~90 seconds ARGUS compares your feed to the last check. New or growing storylines (Threads),
              actor spikes, and figure conflicts show up here. The first check after opening a project is silent —
              it only establishes a baseline. This log resets when you refresh; use Cases to save a storyline permanently.
            </p>
          </div>
        )}

        {signals.map(sig => {
          const headline = signalHeadline(sig)
          const clickable = !!(sig.threadId || sig.actorId || sig.forecastId || sig.eventIds?.length)
          return (
            <div
              key={sig.id}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => openSignal(sig)}
              onKeyDown={e => e.key === 'Enter' && openSignal(sig)}
              className="ui-incident-row"
              style={{ cursor: clickable ? 'pointer' : 'default' }}
            >
              <div className="ui-sev-dot" style={{ width: 7, height: 7, marginTop: 4, flexShrink: 0, background: SEV_VAR[sig.severity] }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: headline ? 4 : 3 }}>
                  <span style={{ color: 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}>{KIND_ICON[sig.kind]}</span>
                  <span className="ui-chip ui-chip--xs" style={{ flexShrink: 0 }}>{sig.title}</span>
                </div>
                {headline && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45, marginBottom: 4, paddingLeft: 18 }}>
                    {headline}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, paddingLeft: 18 }}>{sig.detail}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, paddingLeft: 18, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{formatDistanceToNow(new Date(sig.at), { addSuffix: true })}</span>
                  {sig.threadId && (
                    <button type="button" onClick={e => { e.stopPropagation(); openThreads(sig.threadId, sig.eventIds) }} className="ui-link" style={{ fontSize: 9 }}>
                      View in Threads →
                    </button>
                  )}
                  {sig.actorId && (
                    <button type="button" onClick={e => { e.stopPropagation(); openActors(sig.actorId) }} className="ui-link" style={{ fontSize: 9 }}>
                      View actor →
                    </button>
                  )}
                  {sig.forecastId && (
                    <button type="button" onClick={e => { e.stopPropagation(); togglePanel('forecasts') }} className="ui-link" style={{ fontSize: 9 }}>
                      Resolve forecast →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {signals.length > 0 && (
          <div className="ui-feed-hint" style={{ marginTop: 14 }}>
            Monitor watches derived Threads (not Cases). Click an alert → Threads shows every linked event.
            Promote a thread to a Case to keep it after refresh. No AI — rules only.
          </div>
        )}
      </div>
    </div>
  )
}
