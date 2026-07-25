'use client'
import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { Play, Pause, Radio, SkipBack, X } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { CATEGORY_COLORS } from '@/lib/constants'
import { TimeTrack } from '@/components/ui/TimeTrack'
import { SegControl } from '@/components/ui/SegControl'
import { EmptyState } from '@/components/ui/EmptyState'
import { buildDensityBuckets, maxBucketTotal } from '@/lib/timeTrackUtils'

const SPEEDS = [
  { label: '5m', value: 5 },
  { label: '1h', value: 60 },
  { label: '6h', value: 360 },
  { label: '1d', value: 1440 },
  { label: '1w', value: 10080 },
]

function fmtLabel(ts: number, span: number): string {
  const d = new Date(ts)
  if (span < 3 * 3600000) return d.toISOString().slice(11, 16) + 'Z'
  if (span < 4 * 86400000) return `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)}Z`
  return d.toISOString().slice(0, 10)
}

function fmtFull(iso: string) {
  const d = new Date(iso)
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}Z`
}

export default function TimelineScrubber() {
  const events = useMapStore(s => s.events)
  const playback = useMapStore(s => s.playback)
  const setPlaybackTime = useMapStore(s => s.setPlaybackTime)
  const setPlaybackPlaying = useMapStore(s => s.setPlaybackPlaying)
  const setPlaybackSpeed = useMapStore(s => s.setPlaybackSpeed)
  const setPlaybackActive = useMapStore(s => s.setPlaybackActive)
  const togglePanel = useMapStore(s => s.togglePanel)

  const trackRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [hovered, setHovered] = useState<{ title: string; ts: string; frac: number } | null>(null)

  const sorted = useMemo(() => [...events]
    .filter(e => e.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()), [events])

  const minT = sorted.length ? new Date(sorted[0].timestamp).getTime() : Date.now() - 86400000
  const maxT = Date.now()
  const span = maxT - minT || 1

  const currentT = playback.time ? new Date(playback.time).getTime() : maxT
  const pct = Math.max(0, Math.min(1, (currentT - minT) / span))
  const isLive = !playback.active || !playback.time

  const buckets = useMemo(
    () => buildDensityBuckets(
      sorted.map(e => ({ ts: new Date(e.timestamp).getTime(), severity: e.severity })),
      minT,
      span,
    ),
    [sorted, minT, span],
  )
  const maxBucket = useMemo(() => maxBucketTotal(buckets), [buckets])

  const boundsRef = useRef({ minT, maxT })
  boundsRef.current = { minT, maxT }

  useEffect(() => {
    if (!playback.playing || !playback.active) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      const { minT: lo, maxT: hi } = boundsRef.current
      const t = useMapStore.getState().playback.time
      const cur = t ? new Date(t).getTime() : lo
      const next = cur + playback.speed * 60 * 1000 * 0.25
      if (next >= hi) {
        setPlaybackPlaying(false)
        setPlaybackTime(new Date(hi).toISOString())
      } else {
        setPlaybackTime(new Date(next).toISOString())
      }
    }, 250)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playback.playing, playback.active, playback.speed, setPlaybackPlaying, setPlaybackTime])

  const handleTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setPlaybackTime(new Date(minT + ratio * span).toISOString())
    if (!playback.active) setPlaybackActive(true)
  }, [minT, span, playback.active, setPlaybackTime, setPlaybackActive])

  const TICK_COUNT = 5
  const ticks = useMemo(() => Array.from({ length: TICK_COUNT }, (_, i) => {
    const t = minT + (span * i) / (TICK_COUNT - 1)
    return { frac: i / (TICK_COUNT - 1), label: fmtLabel(t, span) }
  }), [minT, span])

  const visibleCount = useMemo(() => {
    if (isLive) return sorted.length
    return sorted.filter(e => new Date(e.timestamp).getTime() <= currentT).length
  }, [sorted, isLive, currentT])

  const trackTimestamps = useMapStore(s => s.trackTimestamps)
  const hasTrackHistory = trackTimestamps.vessels.length > 0

  const stepTime = useCallback((dir: -1 | 1) => {
    if (sorted.length === 0) return
    const cur = playback.time ? new Date(playback.time).getTime() : maxT
    if (dir < 0) {
      const prev = [...sorted].reverse().find(e => new Date(e.timestamp).getTime() < cur - 1000)
      if (prev) {
        setPlaybackTime(prev.timestamp)
        setPlaybackActive(true)
      } else {
        setPlaybackTime(new Date(minT).toISOString())
        setPlaybackActive(true)
      }
    } else {
      const next = sorted.find(e => new Date(e.timestamp).getTime() > cur + 1000)
      if (next) {
        setPlaybackTime(next.timestamp)
        setPlaybackActive(true)
      } else {
        setPlaybackActive(false)
        setPlaybackPlaying(false)
      }
    }
  }, [sorted, playback.time, minT, maxT, setPlaybackTime, setPlaybackActive, setPlaybackPlaying])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === ' ') {
        e.preventDefault()
        if (!playback.active) setPlaybackActive(true)
        setPlaybackPlaying(!playback.playing)
      } else if (e.key === 'Escape') {
        if (playback.active) {
          setPlaybackActive(false)
          setPlaybackPlaying(false)
        } else {
          togglePanel('scrubber')
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepTime(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepTime(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playback.active, playback.playing, setPlaybackActive, setPlaybackPlaying, togglePanel, stepTime])

  const markers = useMemo(() => sorted.map((ev, i) => {
    const evFrac = (new Date(ev.timestamp).getTime() - minT) / span
    const col = CATEGORY_COLORS[ev.category] ?? 'var(--info)'
    const isVisible = isLive || new Date(ev.timestamp).getTime() <= currentT
    const isCrit = ev.severity === 'critical'
    return {
      id: ev.id ?? String(i),
      frac: evFrac,
      color: col,
      size: isCrit ? 10 : 7,
      dimmed: !isVisible,
      onClick: () => {
        setPlaybackTime(ev.timestamp)
        if (!playback.active) setPlaybackActive(true)
      },
      onMouseEnter: () => setHovered({ title: ev.title, ts: ev.timestamp, frac: evFrac }),
      onMouseLeave: () => setHovered(null),
    }
  }), [sorted, minT, span, isLive, currentT, playback.active, setPlaybackTime, setPlaybackActive])

  if (sorted.length === 0) {
    return (
      <div className="ui-scrubber-panel panel-slide-up">
        <EmptyState
          compact
          title="No events to replay"
          hint="Load events to scrub through time on the map"
          action={
            <button type="button" onClick={() => togglePanel('scrubber')} className="ui-btn ui-btn--ghost" style={{ padding: 4 }}>
              <X size={12} />
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="ui-scrubber-panel panel-slide-up">
      <header className="ui-scrubber-header">
        <div className="ui-scrubber-header__left">
          <button
            type="button"
            onClick={() => { setPlaybackActive(false); setPlaybackPlaying(false); setPlaybackTime(null) }}
            className={`ui-scrubber-mode${isLive ? ' ui-scrubber-mode--live' : ''}`}
          >
            <Radio size={10} />
            {isLive ? 'Live' : 'Scrubbing'}
          </button>

          <div className="ui-scrubber-controls">
            <button
              type="button"
              onClick={() => { if (!playback.active) setPlaybackActive(true); setPlaybackPlaying(!playback.playing) }}
              className={`ui-scrubber-icon-btn${playback.playing ? ' ui-scrubber-icon-btn--active' : ''}`}
              title={playback.playing ? 'Pause' : 'Play'}
              aria-label={playback.playing ? 'Pause replay' : 'Play replay'}
            >
              {playback.playing ? <Pause size={11} /> : <Play size={11} style={{ marginLeft: 1 }} />}
            </button>
            <button
              type="button"
              onClick={() => { setPlaybackTime(new Date(minT).toISOString()); setPlaybackActive(true) }}
              title="Jump to start"
              className="ui-scrubber-icon-btn"
              aria-label="Jump to start"
            >
              <SkipBack size={11} />
            </button>
            <SegControl
              options={SPEEDS}
              value={playback.active ? playback.speed : null}
              onChange={v => { setPlaybackSpeed(v); if (!playback.active) setPlaybackActive(true) }}
            />
          </div>
        </div>

        <div className="ui-scrubber-header__center font-mono">
          {isLive ? 'Showing all loaded events' : fmtFull(playback.time ?? new Date().toISOString())}
        </div>

        <div className="ui-scrubber-header__right">
          <span className="ui-scrubber-stat">{visibleCount}/{sorted.length} visible</span>
          {!isLive && !hasTrackHistory && (
            <span className="ui-scrubber-stat" title="Vessel/aviation replay needs a few minutes of session time to collect snapshots">
              tracks: collecting…
            </span>
          )}
          <button type="button" onClick={() => togglePanel('scrubber')} title="Close (Esc)" className="ui-btn ui-btn--ghost" style={{ padding: 4 }}>
            <X size={12} />
          </button>
        </div>
      </header>

      <div className="ui-scrubber-track-wrap">
        <TimeTrack
          trackRef={trackRef}
          ticks={ticks}
          buckets={buckets}
          maxBucket={maxBucket}
          markers={markers}
          scrubFrac={playback.active && !isLive ? pct : null}
          fillFrac={pct}
          fillDimmed={isLive}
          onTrackClick={handleTrackClick}
          hint="Space play/pause · ←/→ step events · Esc live or close"
          tooltip={hovered ? (
            <div className="ui-time-track-tooltip" style={{ left: `${hovered.frac * 100}%` }}>
              <div style={{ fontWeight: 700, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{hovered.title}</div>
              <div className="font-mono" style={{ color: 'var(--text-muted)', fontSize: 9 }}>{fmtFull(hovered.ts)}</div>
            </div>
          ) : undefined}
        />
      </div>
    </div>
  )
}
