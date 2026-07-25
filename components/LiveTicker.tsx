'use client'
import { useMemo, useCallback } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { formatDistanceToNow } from 'date-fns'

const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)',
  high:     'var(--high)',
  medium:   'var(--medium)',
  low:      'var(--low)',
}

const CAT_ABBR: Record<string, string> = {
  conflict: 'CONF', political: 'POL', economic: 'ECON', humanitarian: 'HUM',
  health: 'HLTH', earthquake: 'EQ', wildfire: 'FIRE', disaster: 'DIS',
  environmental: 'ENV', cyber: 'CYB', social: 'SOC',
}

type LiveStatus = 'connected' | 'reconnecting' | 'disconnected'

const STATUS_CLASS: Record<LiveStatus, { dot: string; label: string }> = {
  connected:    { dot: 'ui-ticker__status-dot--live', label: 'ui-ticker__status-label--live' },
  reconnecting: { dot: 'ui-ticker__status-dot--sync', label: 'ui-ticker__status-label--sync' },
  disconnected: { dot: 'ui-ticker__status-dot--off', label: 'ui-ticker__status-label--off' },
}

const STATUS_TEXT: Record<LiveStatus, string> = {
  connected: 'LIVE',
  reconnecting: 'SYNC',
  disconnected: 'OFF',
}

export function LiveTicker() {
  const events           = useMapStore(s => s.events)
  const alerts           = useMapStore(s => s.alerts)
  const liveStatus       = useMapStore(s => s.liveStatus) as LiveStatus
  const timelineOpen     = useMapStore(s => s.panels.timeline)
  const scrubberOpen     = useMapStore(s => s.panels.scrubber)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const flyTo            = useMapStore(s => s.flyTo)
  const togglePanel      = useMapStore(s => s.togglePanel)

  const connectors = useProjectStore(s => s.getActiveProject()?.connectors)

  const bottomOffset = timelineOpen ? 220 : scrubberOpen ? 170 : 14

  const { criticalCount, highCount, medCount, latestEvent } = useMemo(() => {
    let criticalCount = 0, highCount = 0, medCount = 0
    let latestEvent = null as typeof events[0] | null
    let latestTs = 0
    for (const e of events) {
      if (e.severity === 'critical') criticalCount++
      else if (e.severity === 'high') highCount++
      else if (e.severity === 'medium') medCount++
      const ts = new Date(e.timestamp).getTime()
      if (ts > latestTs) { latestTs = ts; latestEvent = e }
    }
    return { criticalCount, highCount, medCount, latestEvent }
  }, [events])

  const { alertCount, critAlerts } = useMemo(() => {
    let critAlerts = 0
    for (const a of alerts) { if (a.severity === 'critical') critAlerts++ }
    return { alertCount: alerts.length, critAlerts }
  }, [alerts])

  const failedCount = useMemo(() => connectors?.filter(c => c.enabled && c.error).length ?? 0, [connectors])

  const handleLatestClick = useCallback(() => {
    if (!latestEvent) return
    setSelectedEvent(latestEvent)
    flyTo(latestEvent.lat, latestEvent.lon, 6)
  }, [latestEvent, setSelectedEvent, flyTo])

  if (events.length === 0) return null
  // Scrubber dock has its own status row — avoid duplicate ticker pill
  if (scrubberOpen) return null

  const status = STATUS_CLASS[liveStatus] ?? STATUS_CLASS.disconnected

  return (
    <div className="ui-ticker" style={{ bottom: bottomOffset }}>
      <div className="ui-ticker__segment" title="Stream status">
        <span className={`ui-ticker__status-dot ${status.dot}`} />
        <span className={`ui-ticker__status-label ${status.label}`}>
          {STATUS_TEXT[liveStatus] ?? STATUS_TEXT.disconnected}
        </span>
      </div>

      <div className="ui-ticker__divider" />

      <button
        type="button"
        className="ui-ticker__segment ui-ticker__segment--clickable"
        onClick={() => togglePanel('eventFeed')}
        title="Open event feed"
      >
        <span className="ui-ticker__count">{events.length}</span>
        <span className="ui-ticker__hint">events</span>
        {criticalCount > 0 && (
          <span className="ui-ticker__sev ui-ticker__sev--critical">·{criticalCount}C</span>
        )}
        {highCount > 0 && (
          <span className="ui-ticker__sev ui-ticker__sev--high">·{highCount}H</span>
        )}
        {medCount > 0 && (
          <span className="ui-ticker__sev ui-ticker__sev--medium">·{medCount}M</span>
        )}
      </button>

      {latestEvent && (
        <>
          <div className="ui-ticker__divider" />
          <button
            type="button"
            className="ui-ticker__segment ui-ticker__segment--clickable ui-ticker__segment--wide"
            onClick={handleLatestClick}
            title="Open latest event on map"
          >
            <span
              className="ui-ticker__cat"
              style={{ color: SEV_VAR[latestEvent.severity] ?? 'var(--text-muted)' }}
            >
              {CAT_ABBR[latestEvent.category] ?? latestEvent.category.slice(0, 4).toUpperCase()}
            </span>
            <span className="ui-ticker__title">{latestEvent.title}</span>
            <span className="ui-ticker__time">
              {formatDistanceToNow(new Date(latestEvent.timestamp), { addSuffix: true })}
            </span>
          </button>
        </>
      )}

      {alertCount > 0 && (
        <>
          <div className="ui-ticker__divider" />
          <button
            type="button"
            className="ui-ticker__segment ui-ticker__segment--clickable"
            onClick={() => togglePanel('alerts')}
            title="Open correlation alerts"
          >
            <span
              className="ui-ticker__badge"
              style={{ color: critAlerts > 0 ? 'var(--critical)' : 'var(--high)' }}
            >
              {alertCount} alert{alertCount !== 1 ? 's' : ''}
            </span>
          </button>
        </>
      )}

      {failedCount > 0 && (
        <>
          <div className="ui-ticker__divider" />
          <button
            type="button"
            className="ui-ticker__segment ui-ticker__segment--clickable"
            onClick={() => togglePanel('connectors')}
            title="Open live feeds — connector errors"
          >
            <span className="ui-ticker__badge" style={{ color: 'var(--critical)' }}>
              {failedCount} failed
            </span>
          </button>
        </>
      )}
    </div>
  )
}
