'use client'
import { useMemo, useState, useRef, useEffect } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useScopedPlots } from '@/lib/hooks/useScopedPlots'
import { useLiveAviation } from '@/lib/hooks/useLiveAviation'
import { Layers, ChevronDown } from 'lucide-react'
import { liveTrackingExplainer } from '@/lib/liveTracking'
import { useProjectStore } from '@/stores/projectStore'
import { USE_MAPBOX } from '@/lib/mapProvider'

const SIMPLE_LAYERS = [
  { key: 'events', label: 'Events' },
  { key: 'disasters', label: 'Disasters' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'plots', label: 'Plots' },
  { key: 'aviation', label: 'Aviation', cap: 'aviation' as const },
  { key: 'vessels', label: 'Vessels', cap: 'vessels' as const },
] as const

const ADVANCED_LAYERS = [
  { key: 'chokepoints', label: 'Chokepoints' },
  { key: 'threatDensity', label: 'Heatmap' },
  { key: 'cables', label: 'Cables' },
  ...(USE_MAPBOX ? [{ key: 'terrain' as const, label: '3D terrain' }] : []),
] as const

export default function LayerControls() {
  const [open, setOpen] = useState(false)
  const [proOpen, setProOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const layers = useMapStore(s => s.layers)
  const toggleLayer = useMapStore(s => s.toggleLayer)

  const eventCount    = useMapStore(s => s.events.length)
  const disasterCount = useMapStore(s => s.events.filter(e => e.category === 'disaster' || e.category === 'environmental').length)
  const alertCount    = useMapStore(s => s.alerts.length)
  // Length-only selectors — avoid re-filtering the full AIS list in this chrome control.
  const vesselCount = useMapStore(s => s.vesselPositions.length)
  const plots = useScopedPlots()
  const liveEnabled = useMapStore(s => s.liveTrackingCaps)
  const project = useProjectStore(s => s.projects.find(p => p.id === s.activeProjectId))

  // Only subscribe to aviation while the menu is open (ArgusMap owns the live layer).
  const { data: aircraftRaw = [] } = useLiveAviation(liveEnabled.aviation && open)
  const aircraftCount = aircraftRaw.length

  const layerCounts = useMemo<Record<string, number | null>>(() => ({
    events: eventCount,
    disasters: disasterCount,
    alerts: alertCount,
    aviation: liveEnabled.aviation && layers.aviation ? aircraftCount : null,
    vessels: liveEnabled.vessels && layers.vessels ? vesselCount : null,
    plots: plots.length,
  }), [eventCount, disasterCount, alertCount, liveEnabled.aviation, liveEnabled.vessels, layers.aviation, aircraftCount, layers.vessels, vesselCount, plots.length])

  const visibleSimple = useMemo(
    () => SIMPLE_LAYERS.filter(row => !('cap' in row) || liveEnabled[row.cap]),
    [liveEnabled],
  )

  const activeCount = useMemo(() =>
    [...visibleSimple, ...ADVANCED_LAYERS].filter(({ key }) => layers[key as keyof typeof layers]).length,
  [layers, visibleSimple])

  const liveExplainer = useMemo(
    () => liveTrackingExplainer(project, {
      aviation: aircraftCount,
      vessels: vesselCount,
    }),
    [project, aircraftCount, vesselCount],
  )

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const renderLayer = (key: string, label: string) => {
    const active = layers[key as keyof typeof layers]
    const count = layerCounts[key]
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggleLayer(key as keyof typeof layers)}
        className={`ui-layer-row${active ? ' ui-layer-row--on' : ''}`}
      >
        <span className="ui-layer-toggle" aria-hidden>
          <span className="ui-layer-toggle__knob" />
        </span>
        <span className="ui-layer-row__label">{label}</span>
        {count != null && count > 0 && (
          <span className="ui-layer-row__count">{count > 999 ? `${Math.floor(count / 1000)}k` : count}</span>
        )}
      </button>
    )
  }

  return (
    <div ref={rootRef} className="ui-map-layers">
      <button
        type="button"
        className={`ui-map-layers__trigger${open ? ' ui-map-layers__trigger--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label="Map layers"
      >
        <Layers size={15} strokeWidth={2} />
        <span>Layers</span>
        {activeCount > 0 && <span className="ui-map-layers__badge">{activeCount}</span>}
        <ChevronDown size={13} className={`ui-map-layers__chev${open ? ' ui-map-layers__chev--open' : ''}`} />
      </button>

      {open && (
        <aside className="ui-layer-controls ui-layer-controls--map">
          {liveExplainer && (
            <p className="ui-layer-controls__explainer">{liveExplainer}</p>
          )}
          <div className="ui-layer-controls__list">
            {visibleSimple.map(({ key, label }) => renderLayer(key, label))}
          </div>
          <button
            type="button"
            className="ui-layer-controls__pro-toggle"
            onClick={() => setProOpen(v => !v)}
            aria-expanded={proOpen}
          >
            <span>More</span>
            <ChevronDown size={13} style={{ transform: proOpen ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
          </button>
          {proOpen && (
            <div className="ui-layer-controls__list ui-layer-controls__list--pro">
              {ADVANCED_LAYERS.map(({ key, label }) => renderLayer(key, label))}
            </div>
          )}
        </aside>
      )}
    </div>
  )
}
