'use client'
import { useRef, useState, useMemo, useCallback } from 'react'
import { X } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { IntelEvent, CorrelationAlert } from '@/types'
import { formatDistanceToNow, format } from 'date-fns'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { TimeTrack } from '@/components/ui/TimeTrack'
import { SegControl } from '@/components/ui/SegControl'
import { EmptyState } from '@/components/ui/EmptyState'
import { buildDensityBuckets, maxBucketTotal, sevColor } from '@/lib/timeTrackUtils'

type TimelineItem =
  | { kind: 'event'; data: IntelEvent; ts: number }
  | { kind: 'alert'; data: CorrelationAlert; ts: number }

const WINDOWS = [
  { label: '6H', value: 6 },
  { label: '24H', value: 24 },
  { label: '48H', value: 48 },
  { label: '7D', value: 168 },
]

export default function TimelinePanel() {
  const { handleClose, closing } = useClosePanel('timeline')
  const events = useMapStore(s => s.events)
  const alerts = useMapStore(s => s.alerts)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const flyTo = useMapStore(s => s.flyTo)

  const [windowHours, setWindowHours] = useState(24)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ frac: number; item: TimelineItem } | null>(null)
  const [scrubPos, setScrubPos] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const now = Date.now()
  const windowMs = windowHours * 60 * 60 * 1000
  const windowStart = now - windowMs

  const items = useMemo<TimelineItem[]>(() => {
    const evItems: TimelineItem[] = events
      .map(e => ({ kind: 'event' as const, data: e, ts: new Date(e.timestamp).getTime() }))
      .filter(i => i.ts >= windowStart && i.ts <= now)

    const alItems: TimelineItem[] = alerts
      .map(a => ({ kind: 'alert' as const, data: a, ts: new Date(a.timestamp).getTime() }))
      .filter(i => i.ts >= windowStart && i.ts <= now)

    return [...evItems, ...alItems].sort((a, b) => a.ts - b.ts)
  }, [events, alerts, windowStart, now])

  const densityBuckets = useMemo(
    () => buildDensityBuckets(
      items.map(i => ({ ts: i.ts, severity: i.data.severity })),
      windowStart,
      windowMs,
    ),
    [items, windowStart, windowMs],
  )
  const maxBucket = useMemo(() => maxBucketTotal(densityBuckets), [densityBuckets])

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    setScrubPos(frac)
  }, [])

  const handleTrackMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const hoverTs = windowStart + frac * windowMs

    const threshold = windowMs * 0.015
    let nearest: TimelineItem | null = null
    let nearestDist = Infinity
    for (const item of items) {
      const dist = Math.abs(item.ts - hoverTs)
      if (dist < threshold && dist < nearestDist) { nearest = item; nearestDist = dist }
    }

    if (nearest) {
      setHoveredId(nearest.data.id)
      setTooltip({ frac, item: nearest })
    } else {
      setHoveredId(null)
      setTooltip(null)
    }
  }, [items, windowStart, windowMs])

  const scrubTime = scrubPos !== null ? new Date(windowStart + scrubPos * windowMs) : null

  const visibleItems = useMemo(() => {
    if (scrubPos === null) return items
    const cutoff = windowStart + scrubPos * windowMs
    return items.filter(i => i.ts <= cutoff)
  }, [items, scrubPos, windowStart, windowMs])

  const critCount = visibleItems.filter(i => i.data.severity === 'critical').length
  const highCount = visibleItems.filter(i => i.data.severity === 'high').length

  const handleItemClick = useCallback((item: TimelineItem) => {
    if (item.kind === 'event') {
      setSelectedEvent(item.data)
      flyTo(item.data.lat, item.data.lon, 5)
    } else {
      flyTo(item.data.lat, item.data.lon, 5)
    }
  }, [setSelectedEvent, flyTo])

  const ticks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map(frac => ({
    frac,
    label: format(new Date(windowStart + frac * windowMs), windowHours <= 24 ? 'HH:mm' : 'dd MMM HH:mm'),
  })), [windowStart, windowMs, windowHours])

  const markers = useMemo(() => items.map(item => {
    const frac = (item.ts - windowStart) / windowMs
    const color = sevColor(item.data.severity)
    const isFaded = scrubPos !== null && frac > scrubPos
    const isHovered = hoveredId === item.data.id
    return {
      id: `${item.kind}-${item.data.id}`,
      frac,
      color,
      size: item.kind === 'alert' ? 8 : 6,
      shape: item.kind === 'alert' ? 'square' as const : 'circle' as const,
      dimmed: isFaded,
      hovered: isHovered,
      onClick: () => handleItemClick(item),
      onMouseEnter: () => setHoveredId(item.data.id),
      onMouseLeave: () => setHoveredId(null),
    }
  }), [items, windowStart, windowMs, scrubPos, hoveredId, handleItemClick])

  const legend = (
    <div className="ui-timeline-legend">
      {['critical', 'high', 'medium', 'low'].map(sev => (
        <div key={sev} className="ui-timeline-legend__item">
          <div className="ui-sev-dot" style={{ width: 6, height: 6, marginTop: 0, background: sevColor(sev) }} />
          <span>{sev}</span>
        </div>
      ))}
      <div className="ui-timeline-legend__item">
        <div style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--text-muted)' }} />
        <span>Alert (square)</span>
      </div>
    </div>
  )

  return (
    <div className={`ui-timeline-panel panel-slide-up${closing ? ' panel-closing' : ''}`}>
      <header className="ui-timeline-header">
        <div>
          <div className="ui-kicker" style={{ marginBottom: 0 }}>Analyze</div>
          <div className="ui-title ui-title--panel">Chronology</div>
          <div className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 2 }}>Density view — does not filter map</div>
        </div>

        <SegControl
          options={WINDOWS}
          value={windowHours}
          onChange={h => { setWindowHours(h); setScrubPos(null) }}
        />

        <div style={{ flex: 1 }} />

        <span className="ui-chip ui-chip--xs" style={{ fontWeight: 500 }}>
          {visibleItems.length} items
          {scrubPos !== null
            ? ` · ${format(scrubTime!, 'HH:mm dd MMM')}`
            : ` · last ${windowHours}h`}
        </span>
        {critCount > 0 && (
          <span className="ui-chip ui-chip--xs ui-chip--sev-critical">{critCount} critical</span>
        )}
        {highCount > 0 && (
          <span className="ui-chip ui-chip--xs ui-chip--sev-high">{highCount} high</span>
        )}

        {scrubPos !== null && (
          <button
            type="button"
            onClick={() => setScrubPos(null)}
            className="ui-btn ui-btn--ghost"
            style={{ fontSize: 9, padding: '2px 8px' }}
          >
            Reset
          </button>
        )}

        <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost" style={{ padding: 4 }}>
          <X size={13} />
        </button>
      </header>

      <div className="ui-timeline-body">
        <TimeTrack
          trackRef={trackRef}
          ticks={ticks}
          buckets={densityBuckets}
          maxBucket={maxBucket}
          markers={markers}
          scrubFrac={scrubPos}
          fadeBucketsAfterFrac={scrubPos}
          onTrackClick={handleTrackClick}
          onTrackMouseMove={handleTrackMouseMove}
          onTrackMouseLeave={() => { setHoveredId(null); setTooltip(null) }}
          legend={legend}
          hint="Click track to scrub · click dot to jump"
          tooltip={tooltip ? (
            <div
              className="ui-time-track-tooltip"
              style={{
                left: `${tooltip.frac * 100}%`,
                borderColor: sevColor(tooltip.item.data.severity),
              }}
            >
              <div style={{
                fontSize: 8, color: sevColor(tooltip.item.data.severity), fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2,
              }}>
                {tooltip.item.kind === 'alert' ? 'Alert' : 'Event'} · {tooltip.item.data.severity}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>
                {tooltip.item.data.title}
              </div>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 3 }}>
                {format(new Date(tooltip.item.ts), 'HH:mm · dd MMM yyyy')}
                {tooltip.item.kind === 'event' && tooltip.item.data.country && ` · ${tooltip.item.data.country}`}
              </div>
              <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>Click dot to fly to location</div>
            </div>
          ) : undefined}
        />
      </div>

      <div className="ui-timeline-strip">
        {[...visibleItems].reverse().slice(0, 20).map(item => {
          const sev = item.data.severity
          const title = item.data.title
          const isHovered = hoveredId === item.data.id
          const color = sevColor(sev)
          return (
            <div
              key={`chip-${item.kind}-${item.data.id}`}
              className={`ui-timeline-chip${isHovered ? ' ui-timeline-chip--hover' : ''}`}
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => setHoveredId(item.data.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                borderColor: isHovered ? color : undefined,
                background: isHovered ? `color-mix(in srgb, ${color} 10%, var(--surface-elevated))` : undefined,
              }}
            >
              <div className="ui-timeline-chip__kind" style={{ color }}>
                {item.kind === 'alert' ? 'Alert' : 'Event'} · {sev}
              </div>
              <div className="ui-timeline-chip__title">{title}</div>
              <div className="ui-timeline-chip__time">
                {formatDistanceToNow(new Date(item.ts), { addSuffix: true })}
              </div>
            </div>
          )
        })}
        {visibleItems.length === 0 && (
          <EmptyState compact title="No events or alerts in this window" hint="Try a wider time window or load more sources" />
        )}
      </div>
    </div>
  )
}
