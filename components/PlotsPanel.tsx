'use client'
import { useState, useEffect, useRef } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { usePlotsStore } from '@/stores/plotsStore'
import { useScopedPlots } from '@/lib/hooks/useScopedPlots'
import { useProjectStore } from '@/stores/projectStore'
import { useWorkspace } from '@/lib/hooks/useWorkspace'
import { usePlots } from '@/lib/hooks/usePlots'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { cleanNotes } from '@/lib/plotNotes'
import { Plot } from '@/types'
import {
  X, MapPin, Circle, Pen, Trash2, BrainCircuit, BrainCog,
  Crosshair, ChevronDown, ChevronUp, Check, Pencil, Square, Radio,
} from 'lucide-react'

const PLOT_MODES = [
  { key: 'point',        label: 'Point', icon: MapPin },
  { key: 'zone',         label: 'Zone',  icon: Circle },
  { key: 'draw',         label: 'Draw',  icon: Pen },
  { key: 'zone-builder', label: 'Area',  icon: Square },
] as const

const THREAT_VAR: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)', info: 'var(--info)',
}
const THREAT_CHIP: Record<string, string> = {
  critical: 'ui-chip--sev-critical', high: 'ui-chip--sev-high', medium: 'ui-chip--sev-medium', low: 'ui-chip--sev-low', info: '',
}
const THREAT_ORDER = ['critical', 'high', 'medium', 'low', 'info']

const CATEGORIES = ['military', 'economic', 'political', 'infrastructure', 'humanitarian', 'intelligence', 'custom']
const THREATS = ['critical', 'high', 'medium', 'low', 'info']
const CONFIDENCES = ['confirmed', 'probable', 'possible', 'unconfirmed']

function TypeIcon({ type }: { type: Plot['type'] }) {
  if (type === 'point') return <MapPin size={11} />
  if (type === 'zone') return <Circle size={11} />
  return <Pen size={11} />
}

interface EditState {
  label: string
  category: string
  threat_level: string
  confidence: string
  notes: string
  ai_include: boolean
}

function PlotRow({
  plot,
  isSelected,
  onSelect,
  onFly,
  onDelete,
  onSave,
  onTogglePromote,
}: {
  plot: Plot
  isSelected: boolean
  onSelect: () => void
  onFly: () => void
  onDelete: () => void
  onSave: (edit: EditState) => void
  onTogglePromote: () => void
}) {
  const promoted = plot.properties?.promoted ?? false
  const threat = plot.properties?.threat_level ?? 'info'
  const color = THREAT_VAR[threat] ?? 'var(--info)'
  const aiOn = plot.properties?.ai_include ?? true
  const [editing, setEditing] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [edit, setEdit] = useState<EditState>({
    label: plot.label ?? '',
    category: plot.properties?.category ?? 'custom',
    threat_level: threat,
    confidence: plot.properties?.confidence ?? 'unconfirmed',
    notes: plot.properties?.notes ?? '',
    ai_include: aiOn,
  })

  useEffect(() => {
    setEdit({
      label: plot.label ?? '',
      category: plot.properties?.category ?? 'custom',
      threat_level: plot.properties?.threat_level ?? 'info',
      confidence: plot.properties?.confidence ?? 'unconfirmed',
      notes: plot.properties?.notes ?? '',
      ai_include: plot.properties?.ai_include ?? true,
    })
  }, [plot.label, plot.properties])

  const handleSave = () => {
    onSave(edit)
    setEditing(false)
  }

  return (
    <div className={`ui-plot-row${isSelected ? ' ui-plot-row--selected' : ''}`}>
      <div className="ui-plot-row__head" onClick={onSelect}>
        <div className="ui-sev-dot" style={{ width: 8, height: 8, marginTop: 0, background: color }} />
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}><TypeIcon type={plot.type} /></span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {plot.label || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Unnamed</span>}
        </span>
        {plot.properties?.category && (
          <span className={`ui-chip ui-chip--xs ${THREAT_CHIP[threat] ?? ''}`} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {plot.properties.category}
          </span>
        )}
        <span title={aiOn ? 'Included in AI' : 'Excluded from AI'} style={{ flexShrink: 0, color: aiOn ? 'var(--accent)' : 'var(--border-strong)' }}>
          {aiOn ? <BrainCircuit size={11} /> : <BrainCog size={11} />}
        </span>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {isSelected ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </div>

      {isSelected && (
        <div style={{ padding: '0 16px 14px' }}>
          <div className="ui-plot-actions">
            <button type="button" onClick={onFly} className="ui-btn ui-btn--ghost" style={{ fontSize: 10, padding: '4px 9px' }}>
              <Crosshair size={10} /> Fly to
            </button>
            <button
              type="button"
              onClick={() => setEditing(e => !e)}
              className={`ui-btn ui-btn--ghost${editing ? ' ui-btn--primary' : ''}`}
              style={{ fontSize: 10, padding: '4px 9px' }}
            >
              <Pencil size={10} /> {editing ? 'Cancel' : 'Edit'}
            </button>
            <button type="button" onClick={onDelete} className="ui-btn ui-btn--danger-ghost" style={{ fontSize: 10, padding: '4px 9px' }}>
              <Trash2 size={10} /> Delete
            </button>
          </div>

          <button
            type="button"
            onClick={onTogglePromote}
            title="Surface this mark in the event feed for correlation and velocity"
            className={`ui-btn ui-btn--ghost${promoted ? ' ui-btn--primary' : ''}`}
            style={{ width: '100%', justifyContent: 'center', marginBottom: 10, fontSize: 10, padding: '6px 9px' }}
          >
            <Radio size={10} /> {promoted ? 'In feed — click to remove' : 'Promote to event feed'}
          </button>

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div>
                <label className="ui-section-label">Label</label>
                <input value={edit.label} onChange={e => setEdit(s => ({ ...s, label: e.target.value }))} className="ui-input ui-input--compact" placeholder="Plot label…" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label className="ui-section-label">Category</label>
                  <select value={edit.category} onChange={e => setEdit(s => ({ ...s, category: e.target.value }))} className="ui-input ui-input--compact">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ui-section-label">Threat</label>
                  <select value={edit.threat_level} onChange={e => setEdit(s => ({ ...s, threat_level: e.target.value }))} className="ui-input ui-input--compact">
                    {THREATS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="ui-section-label">Confidence</label>
                <select value={edit.confidence} onChange={e => setEdit(s => ({ ...s, confidence: e.target.value }))} className="ui-input ui-input--compact">
                  {CONFIDENCES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="ui-section-label">Notes</label>
                <textarea
                  value={edit.notes}
                  onChange={e => setEdit(s => ({ ...s, notes: e.target.value }))}
                  rows={4}
                  className="ui-input"
                  style={{ resize: 'vertical', lineHeight: 1.5, padding: '7px 10px', fontSize: 11 }}
                  placeholder={'Asset: \nActivity: \nSignificance: '}
                />
              </div>
              <button
                type="button"
                onClick={() => setEdit(s => ({ ...s, ai_include: !s.ai_include }))}
                className={`ui-btn ui-btn--ghost${edit.ai_include ? ' ui-btn--primary' : ''}`}
                style={{ justifyContent: 'flex-start', fontSize: 10, padding: '6px 8px' }}
              >
                {edit.ai_include ? <BrainCircuit size={12} /> : <BrainCog size={12} />}
                {edit.ai_include ? 'Include in AI analysis' : 'Exclude from AI analysis'}
              </button>
              <button type="button" onClick={handleSave} className="ui-btn ui-btn--primary" style={{ justifyContent: 'center', fontSize: 11 }}>
                <Check size={12} /> Save changes
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <span className="ui-chip ui-chip--xs">type: {plot.type}</span>
                <span className={`ui-chip ui-chip--xs ${THREAT_CHIP[threat] ?? ''}`}>threat: {threat}</span>
                <span className="ui-chip ui-chip--xs">confidence: {plot.properties?.confidence ?? '—'}</span>
              </div>
              {plot.properties?.snapshot && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={plot.properties.snapshot}
                  alt={`Snapshot — ${plot.label ?? 'plot'}`}
                  loading="lazy"
                  onClick={() => setZoomed(true)}
                  title="Click to enlarge"
                  style={{ width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', display: 'block', cursor: 'zoom-in' }}
                />
              )}
              {zoomed && plot.properties?.snapshot && (
                <div
                  onClick={() => setZoomed(false)}
                  className="ui-panel-overlay"
                  style={{ cursor: 'zoom-out', zIndex: 'var(--z-lightbox)' as unknown as number }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={plot.properties.snapshot}
                    alt={`Snapshot — ${plot.label ?? 'plot'}`}
                    style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 'var(--radius-md)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
                  />
                </div>
              )}
              {cleanNotes(plot.properties?.notes) ? (
                <div className="ui-callout" style={{ fontSize: 11, whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--border-strong)' }}>
                  {cleanNotes(plot.properties?.notes)}
                </div>
              ) : (
                <div className="ui-feed-hint" style={{ padding: 0 }}>No notes — click Edit to add.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PlotsPanel() {
  const { handleClose, closing } = useClosePanel('plotsPanel')
  const flyTo = useMapStore(s => s.flyTo)
  const plottingMode = useMapStore(s => s.plottingMode)
  const setPlottingMode = useMapStore(s => s.setPlottingMode)
  const { removePlot, updatePlot, selectedPlotId, setSelectedPlotId } = usePlotsStore()
  const plots = useScopedPlots()
  const project = useProjectStore(s => s.getActiveProject())
  const { workspace } = useWorkspace()
  const { updatePlotProps } = usePlots(workspace?.id)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (selectedPlotId && rowRefs.current[selectedPlotId]) {
      rowRefs.current[selectedPlotId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedPlotId])

  const sorted = [...plots].sort((a, b) => {
    return THREAT_ORDER.indexOf(a.properties?.threat_level ?? 'info') -
           THREAT_ORDER.indexOf(b.properties?.threat_level ?? 'info')
  })

  const counts: Record<string, number> = {}
  plots.forEach(p => { const t = p.properties?.threat_level ?? 'info'; counts[t] = (counts[t] ?? 0) + 1 })

  const flyToPlot = (plot: Plot) => {
    const [lon, lat] = plot.type === 'point'
      ? (plot.coordinates as number[])
      : (() => {
          const pts = plot.coordinates as number[][]
          return [pts.reduce((s, c) => s + c[0], 0) / pts.length, pts.reduce((s, c) => s + c[1], 0) / pts.length]
        })()
    flyTo(lat, lon, 9)
  }

  const deletePlot = async (id: string) => {
    if (!id.startsWith('local_')) {
      await fetch('/api/plots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {})
    }
    removePlot(id)
    if (project?.plots?.some(p => p.id === id)) {
      useProjectStore.getState().removePlot(project.id, id)
    }
    if (selectedPlotId === id) setSelectedPlotId(null)
  }

  const savePlot = async (plot: Plot, edit: EditState) => {
    const props: Plot['properties'] = {
      ...plot.properties,
      category: edit.category as Plot['properties']['category'],
      threat_level: edit.threat_level as Plot['properties']['threat_level'],
      confidence: edit.confidence as Plot['properties']['confidence'],
      notes: edit.notes,
      ai_include: edit.ai_include,
    }
    updatePlot(plot.id, { label: edit.label || null, properties: props })
    await updatePlotProps(plot.id, edit.label, props)
  }

  const togglePromote = async (plot: Plot) => {
    const props: Plot['properties'] = { ...plot.properties, promoted: !plot.properties?.promoted }
    updatePlot(plot.id, { properties: props })
    await updatePlotProps(plot.id, plot.label ?? '', props)
  }

  return (
    <div className={`panel-right panel-slide-in${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Map marks</div>
            <div className="ui-title ui-title--panel">Analyst Plots</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="ui-chip ui-chip--xs ui-chip--accent">{plots.length} on map</span>
              {plottingMode !== 'none' && (
                <span className="ui-chip ui-chip--xs ui-chip--sev-high">Placing…</span>
              )}
            </div>
          </div>
          <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </header>

      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="ui-section-label" style={{ marginBottom: 5 }}>New plot</div>
        <div className="ui-plot-modes">
          {PLOT_MODES.map(({ key, label, icon: Icon }) => {
            const active = plottingMode === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPlottingMode(active ? 'none' : key)}
                title={label}
                className={`ui-plot-mode-btn${active ? ' ui-plot-mode-btn--active' : ''}`}
              >
                <Icon size={11} />
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
              </button>
            )
          })}
        </div>
        {plottingMode !== 'none' && (
          <button
            type="button"
            onClick={() => setPlottingMode('none')}
            className="ui-btn ui-btn--danger-ghost"
            style={{ marginTop: 6, width: '100%', fontSize: 9, padding: '4px 0' }}
          >
            Cancel — click on the map to place
          </button>
        )}
      </div>

      {plots.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
          {THREAT_ORDER.filter(t => counts[t]).map(t => (
            <span key={t} className={`ui-chip ui-chip--xs ${THREAT_CHIP[t]}`}>
              {counts[t]} {t}
            </span>
          ))}
        </div>
      )}

      <div className="ui-panel-body" style={{ flex: 1, padding: 0 }}>
        {sorted.length === 0 ? (
          <div className="ui-panel-empty">
            <div className="ui-panel-empty__title">No plots yet</div>
            <p className="ui-feed-hint">Use the tools above to drop a point, zone, or draw a boundary.</p>
          </div>
        ) : (
          sorted.map(plot => (
            <div key={plot.id} ref={el => { rowRefs.current[plot.id] = el }}>
              <PlotRow
                plot={plot}
                isSelected={selectedPlotId === plot.id}
                onSelect={() => setSelectedPlotId(selectedPlotId === plot.id ? null : plot.id)}
                onFly={() => flyToPlot(plot)}
                onDelete={() => deletePlot(plot.id)}
                onSave={(edit) => savePlot(plot, edit)}
                onTogglePromote={() => togglePromote(plot)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
