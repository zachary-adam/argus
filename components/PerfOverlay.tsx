'use client'
import { useEffect, useRef, useState } from 'react'
import { useMapStore } from '@/stores/mapStore'

interface PerfStats {
  fps: number
  frameMs: number
  events: number
  vessels: number
  aircraft: number
  alerts: number
}

const IS_DEV = process.env.NODE_ENV === 'development'

export function PerfOverlay() {
  const [visible, setVisible] = useState(false)
  const [stats, setStats] = useState<PerfStats>({ fps: 0, frameMs: 0, events: 0, vessels: 0, aircraft: 0, alerts: 0 })

  const events   = useMapStore(s => s.events.length)
  const vessels  = useMapStore(s => s.vesselPositions.length)
  const alerts   = useMapStore(s => s.alerts.length)

  const frameTimesRef = useRef<number[]>([])
  const lastFrameRef  = useRef<number>(performance.now())
  const rafRef        = useRef<number | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F' && e.shiftKey && e.metaKey) setVisible(v => !v)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!visible) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    let aircraft = 0
    // Read aircraft count from the MapboxGL source if available
    try {
      const map = (window as any).__argusMapRef?.getMap?.()
      const src = map?.getSource('aircraft')
      aircraft = (src as any)?._data?.features?.length ?? 0
    } catch {}

    function frame() {
      const now = performance.now()
      const delta = now - lastFrameRef.current
      lastFrameRef.current = now

      frameTimesRef.current.push(delta)
      if (frameTimesRef.current.length > 60) frameTimesRef.current.shift()

      const avg = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
      const fps = Math.round(1000 / avg)

      setStats(s => ({ ...s, fps, frameMs: Math.round(avg * 10) / 10, events, vessels, aircraft, alerts }))
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [visible, events, vessels, alerts])

  if (!IS_DEV) return null

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed', bottom: 192, right: 12, zIndex: 400,
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 'var(--radius-sm)', padding: '3px 7px', fontSize: 9, fontWeight: 700,
          color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'monospace',
          letterSpacing: '0.06em',
        }}
        title="Show perf overlay (⌘⇧F)"
      >
        PERF
      </button>
    )
  }

  const fpsColor = stats.fps >= 55 ? '#3D7C66' : stats.fps >= 30 ? '#9A7517' : '#BE1E3A'
  const grade    = stats.fps >= 55 ? 'SMOOTH' : stats.fps >= 30 ? 'OK' : 'LAGGING'

  return (
    <div style={{
      position: 'fixed', bottom: 192, right: 12, zIndex: 400,
      background: 'rgba(10,15,26,0.92)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 'var(--radius-md)', padding: '10px 12px', fontFamily: 'monospace',
      fontSize: 11, color: '#e2e8f0', minWidth: 160,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#4a6080', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Performance</span>
        <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: '#4a6080', cursor: 'pointer', fontSize: 11, padding: 0 }}>×</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: fpsColor, lineHeight: 1 }}>{stats.fps}</span>
        <div>
          <div style={{ fontSize: 9, color: '#4a6080' }}>FPS</div>
          <div style={{ fontSize: 8, fontWeight: 700, color: fpsColor }}>{grade}</div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4a6080' }}>{stats.frameMs}ms</span>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { label: 'Events',   value: stats.events,   warn: stats.events > 300 },
          { label: 'Vessels',  value: stats.vessels,  warn: stats.vessels > 500 },
          { label: 'Aircraft', value: stats.aircraft, warn: stats.aircraft > 2000 },
          { label: 'Alerts',   value: stats.alerts,   warn: false },
        ].map(({ label, value, warn }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#4a6080' }}>{label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: warn ? '#9A7517' : '#e2e8f0' }}>
              {value.toLocaleString()}{warn ? ' !' : ''}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, fontSize: 8, color: '#2d3f5c', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 6 }}>
        ⌘⇧F to toggle
      </div>
    </div>
  )
}
