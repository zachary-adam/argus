'use client'
import { Marker, Popup, Source, Layer } from '@/components/map/MapGL'
import { useState, useMemo, useCallback, memo } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { usePlotsStore } from '@/stores/plotsStore'
import { useScopedPlots } from '@/lib/hooks/useScopedPlots'
import { useProjectStore } from '@/stores/projectStore'
import { Plot } from '@/types'
import { cleanNotes } from '@/lib/plotNotes'
import { Trash2, BrainCircuit, BrainCog, ExternalLink, Radio } from 'lucide-react'

const THREAT_COLORS: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)', info: 'var(--info)',
}

function popupNoteStyle(): React.CSSProperties {
  return {
    fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10, whiteSpace: 'pre-wrap',
    background: 'var(--surface-elevated)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', borderLeft: '2px solid var(--border)',
  }
}

function centroid(coords: number[][]): [number, number] {
  const pts = coords.length > 1 && coords[0][0] === coords[coords.length - 1][0]
    ? coords.slice(0, -1) : coords
  const lon = pts.reduce((s, c) => s + c[0], 0) / pts.length
  const lat = pts.reduce((s, c) => s + c[1], 0) / pts.length
  return [lon, lat]
}

const popupBodyStyle: React.CSSProperties = { padding: 14, minWidth: 220, fontFamily: 'system-ui, sans-serif' }

function PlotsLayer() {
  const layerOn   = useMapStore(s => s.layers.plots)
  const togglePanel = useMapStore(s => s.togglePanel)
  const { removePlot, updatePlot, setSelectedPlotId } = usePlotsStore()
  const scopedPlots = useScopedPlots()
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null)

  const openInPanel = useCallback((plot: Plot) => {
    setSelectedPlotId(plot.id)
    if (!useMapStore.getState().panels.plotsPanel) togglePanel('plotsPanel')
    setSelectedPlot(null)
  }, [setSelectedPlotId, togglePanel])

  const deletePlot = useCallback(async (id: string) => {
    if (!id.startsWith('local_')) {
      await fetch('/api/plots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {})
    }
    removePlot(id)
    const project = useProjectStore.getState().getActiveProject()
    if (project?.plots?.some(p => p.id === id)) {
      useProjectStore.getState().removePlot(project.id, id)
    }
    setSelectedPlot(null)
  }, [removePlot])

  const persistProps = (plot: Plot, newProps: Plot['properties']) => {
    updatePlot(plot.id, { properties: newProps }) // optimistic
    setSelectedPlot(p => p?.id === plot.id ? { ...p, properties: newProps } : p)
    if (!plot.id.startsWith('local_')) {
      fetch('/api/plots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plot.id, label: plot.label ?? '', properties: newProps }),
      }).then(r => r.ok ? r.json() : null).then(updated => {
        if (updated) updatePlot(plot.id, updated)
      }).catch(() => {})
    }
  }

  const togglePromote = useCallback((plot: Plot) => {
    persistProps(plot, { ...plot.properties, promoted: !plot.properties?.promoted })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatePlot])

  const toggleAiInclude = useCallback(async (plot: Plot) => {
    const newProps = { ...plot.properties, ai_include: !(plot.properties?.ai_include ?? true) }
    updatePlot(plot.id, { properties: newProps }) // optimistic
    setSelectedPlot(p => p?.id === plot.id ? { ...p, properties: newProps } : p)
    if (!plot.id.startsWith('local_')) {
      fetch('/api/plots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plot.id, label: plot.label ?? '', properties: newProps }),
      }).then(r => r.ok ? r.json() : null).then(updated => {
        if (updated) updatePlot(plot.id, updated)
      }).catch(() => {})
    }
  }, [updatePlot])

  // Recompute shape GeoJSON only when plots change
  const { shapeFeatures, shapesGeoJSON } = useMemo(() => {
    const features: GeoJSON.Feature[] = scopedPlots
      .filter(p => p.type === 'zone' || p.type === 'polygon')
      .map(p => ({
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [p.coordinates as number[][]] },
        properties: {
          id: p.id,
          color: THREAT_COLORS[p.properties?.threat_level ?? 'info'] ?? 'var(--info)',
          label: p.label,
        },
      }))
    return {
      shapeFeatures: features,
      shapesGeoJSON: { type: 'FeatureCollection' as const, features },
    }
  }, [scopedPlots])

  // Pre-compute centroids for zone/polygon plots so markers don't recalculate per render
  const centroids = useMemo(() => {
    const map: Record<string, [number, number]> = {}
    for (const p of scopedPlots) {
      if (p.type !== 'point') {
        map[p.id] = centroid(p.coordinates as number[][])
      }
    }
    return map
  }, [scopedPlots])

  if (!layerOn) return null

  const popupPos = (plot: Plot): { lat: number; lon: number } => {
    if (plot.type === 'point') {
      const [lon, lat] = plot.coordinates as number[]
      return { lat, lon }
    }
    const [lon, lat] = centroids[plot.id] ?? centroid(plot.coordinates as number[][])
    return { lat, lon }
  }

  return (
    <>
      {shapeFeatures.length > 0 && (
        <Source id="plots-shapes" type="geojson" data={shapesGeoJSON}>
          <Layer id="plots-shapes-fill" type="fill"
            paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 }} />
          <Layer id="plots-shapes-outline" type="line"
            paint={{ 'line-color': ['get', 'color'], 'line-width': 2 }} />
        </Source>
      )}

      {scopedPlots.map(plot => {
        const color = THREAT_COLORS[plot.properties?.threat_level ?? 'info'] ?? 'var(--info)'

        if (plot.type === 'point') {
          const [lon, lat] = plot.coordinates as number[]
          return (
            <Marker key={plot.id} latitude={lat} longitude={lon}
              onClick={() => setSelectedPlot(p => p?.id === plot.id ? null : plot)}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid white', boxShadow: `0 0 0 2px ${color}60` }} />
                {plot.label && (
                  <div style={{ fontSize: 9, color, fontWeight: 700, background: 'white', padding: '1px 4px', borderRadius: 'var(--radius-sm)', marginTop: 2, whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}>
                    {plot.label.slice(0, 24)}
                  </div>
                )}
              </div>
            </Marker>
          )
        }

        const [lon, lat] = centroids[plot.id] ?? [0, 0]
        return (
          <Marker key={plot.id} latitude={lat} longitude={lon}
            onClick={() => setSelectedPlot(p => p?.id === plot.id ? null : plot)}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{
                width: 10, height: 10, background: color, border: '2px solid white',
                transform: 'rotate(45deg)', boxShadow: `0 0 0 2px ${color}60`,
              }} />
              {plot.label && (
                <div style={{ fontSize: 9, color, fontWeight: 700, background: 'white', padding: '1px 4px', borderRadius: 'var(--radius-sm)', marginTop: 4, whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', transform: 'none' }}>
                  {plot.label.slice(0, 24)}
                </div>
              )}
            </div>
          </Marker>
        )
      })}

      {selectedPlot && (() => {
        const { lat, lon } = popupPos(selectedPlot)
        const aiOn = selectedPlot.properties?.ai_include ?? true
        const promoted = selectedPlot.properties?.promoted ?? false
        const conf = selectedPlot.properties?.confidence
        return (
          <Popup latitude={lat} longitude={lon} onClose={() => setSelectedPlot(null)} anchor="bottom" maxWidth="260px">
            <div style={popupBodyStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{selectedPlot.label || 'Plot'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {selectedPlot.type} · {selectedPlot.properties?.category ?? 'custom'} · {selectedPlot.properties?.threat_level ?? 'info'}
                  </div>
                  {conf && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>Confidence: {conf}</div>}
                  {selectedPlot.type !== 'point' && selectedPlot.properties?.radius && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{selectedPlot.properties.radius} km radius</div>
                  )}
                </div>
                <button onClick={() => deletePlot(selectedPlot.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--critical)', padding: 2, flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              </div>

              {selectedPlot.properties?.snapshot && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selectedPlot.properties.snapshot}
                  alt={`Recon snapshot — ${selectedPlot.label ?? 'plot'}`}
                  loading="lazy"
                  style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'block', marginBottom: 8 }}
                />
              )}

              {cleanNotes(selectedPlot.properties?.notes) && (
                <div style={popupNoteStyle()}>{cleanNotes(selectedPlot.properties?.notes)}</div>
              )}

              <button
                onClick={() => togglePromote(selectedPlot)}
                title="Surface this mark in the event feed so it counts in correlation, velocity, actor stats and the AI"
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                  padding: '6px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: promoted ? 'color-mix(in srgb, var(--high) 8%, var(--surface))' : 'var(--surface-elevated)',
                  border: `1px solid ${promoted ? 'color-mix(in srgb, var(--high) 35%, var(--border))' : 'var(--border)'}`,
                  marginBottom: 6,
                }}
              >
                <Radio size={13} style={{ color: promoted ? 'var(--high)' : 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: promoted ? 'var(--high)' : 'var(--text-muted)' }}>
                  {promoted ? 'In event feed (counts in analysis)' : 'Promote to event feed'}
                </span>
              </button>

              <button
                onClick={() => toggleAiInclude(selectedPlot)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                  padding: '6px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: aiOn ? 'color-mix(in srgb, var(--accent) 7%, var(--surface))' : 'var(--surface-elevated)',
                  border: `1px solid ${aiOn ? 'color-mix(in srgb, var(--accent) 25%, var(--border))' : 'var(--border)'}`,
                  marginBottom: 6,
                }}
              >
                {aiOn
                  ? <BrainCircuit size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  : <BrainCog size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                }
                <span style={{ fontSize: 10, fontWeight: 600, color: aiOn ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {aiOn ? 'Included in AI analysis' : 'Excluded from AI analysis'}
                </span>
              </button>

              <button
                onClick={() => openInPanel(selectedPlot)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  padding: '5px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: 'none', border: '1px solid var(--border)',
                }}
              >
                <ExternalLink size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Open in Plots panel</span>
              </button>
            </div>
          </Popup>
        )
      })()}
    </>
  )
}

// memo: re-renders only when plots array or layer toggle changes, not on every
// vessel position update, event stream tick, or other global store changes
export default memo(PlotsLayer)
