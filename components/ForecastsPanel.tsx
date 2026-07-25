'use client'
import { useMemo, useState } from 'react'
import { X, Check, Trash2, TrendingUp, AlertTriangle } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useMapStore } from '@/stores/mapStore'
import { accuracyStats, calibrationBins, isDue } from '@/lib/forecasting'
import { useClosePanel } from '@/lib/hooks/useClosePanel'

export default function ForecastsPanel() {
  const { handleClose, closing } = useClosePanel('forecasts')
  const project = useProjectStore(s => s.getActiveProject())
  const { addForecast, resolveForecast, removeForecast } = useProjectStore()

  const forecasts = useMemo(() => project?.forecasts ?? [], [project?.forecasts])

  const [statement, setStatement] = useState('')
  const [prob, setProb] = useState(50)
  const [due, setDue] = useState('')

  const stats = useMemo(() => accuracyStats(forecasts), [forecasts])
  const bins = useMemo(() => calibrationBins(forecasts, 5), [forecasts])
  const open = forecasts.filter(f => !f.resolved)
  const resolved = forecasts.filter(f => f.resolved)

  const submit = () => {
    if (!project || statement.trim().length < 5 || !due) return
    addForecast(project.id, { statement: statement.trim(), probability: prob / 100, dueDate: due })
    setStatement(''); setProb(50); setDue('')
  }

  const brierColor = stats.meanBrier == null
    ? 'var(--text-muted)'
    : stats.meanBrier <= 0.15
    ? 'var(--low)'
    : stats.meanBrier <= 0.25
    ? 'var(--medium)'
    : 'var(--critical)'

  const canSubmit = !!project && statement.trim().length >= 5 && !!due

  return (
    <div className={`panel-right panel-slide-in${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Tracking</div>
            <div className="ui-title ui-title--panel">Forecasts</div>
            <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>
              Your probabilistic claims — synced with this project.{' '}
              <button type="button" className="ui-link" onClick={() => {
                handleClose()
                useMapStore.getState().togglePanel('ledger')
              }}>
                Ledger
              </button>
              {' '}tracks formula & ACH scores from canvas.
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="ui-chip ui-chip--xs">{forecasts.length} logged</span>
              {open.length > 0 && (
                <span className="ui-chip ui-chip--xs ui-chip--accent">{open.length} open</span>
              )}
            </div>
          </div>
          <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="ui-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div className="ui-stat" title="Forecasts you have resolved">
            <div className="ui-stat__n">{stats.resolved}</div>
            <div className="ui-stat__label">Resolved</div>
          </div>
          <div className="ui-stat" title="Lower is better (0 = perfect)">
            <div className="ui-stat__n" style={{ color: brierColor }}>
              {stats.meanBrier == null ? '—' : stats.meanBrier.toFixed(3)}
            </div>
            <div className="ui-stat__label">Brier</div>
          </div>
          <div className="ui-stat" title="vs. guessing the base rate">
            <div className="ui-stat__n" style={{ color: (stats.skillScore ?? 0) > 0 ? 'var(--low)' : 'var(--text-muted)' }}>
              {stats.skillScore == null ? '—' : `${stats.skillScore > 0 ? '+' : ''}${(stats.skillScore * 100).toFixed(0)}%`}
            </div>
            <div className="ui-stat__label">Skill</div>
          </div>
        </div>

        {stats.resolved >= 3 && (
          <div>
            <div className="ui-section-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <TrendingUp size={10} /> Calibration (predicted vs observed)
            </div>
            <div className="ui-cal-chart">
              {bins.map((b, i) => (
                <div
                  key={i}
                  className="ui-cal-col"
                  title={`${Math.round(b.from * 100)}–${Math.round(b.to * 100)}% · ${b.count} forecasts`}
                >
                  <div className="ui-cal-bars">
                    <div className="ui-cal-bar ui-cal-bar--pred" style={{ height: `${b.predicted * 100}%` }} />
                    <div
                      className="ui-cal-bar ui-cal-bar--obs"
                      style={{ height: `${b.observed * 100}%`, opacity: b.count ? 1 : 0 }}
                    />
                  </div>
                  <div style={{ fontSize: 7, color: 'var(--text-muted)', marginTop: 2 }}>{Math.round(b.from * 100)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ui-forecast-form">
          <div className="ui-section-label" style={{ marginBottom: 0 }}>New forecast</div>
          <textarea
            value={statement}
            onChange={e => setStatement(e.target.value)}
            rows={2}
            placeholder="e.g. Violence rises in Bihar before Aug 12"
            className="ui-input"
            style={{ resize: 'vertical', minHeight: 56, lineHeight: 1.45 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={1}
              max={99}
              value={prob}
              onChange={e => setProb(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span className="font-mono ui-chip ui-chip--xs ui-chip--accent" style={{ minWidth: 42, justifyContent: 'center' }}>
              {prob}%
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="date"
              value={due}
              onChange={e => setDue(e.target.value)}
              className="ui-input"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="ui-btn ui-btn--primary"
              style={{ padding: '0 14px' }}
            >
              Log
            </button>
          </div>
        </div>

        {open.length > 0 && (
          <div className="ui-section-label">Open ({open.length})</div>
        )}
        {open.map(f => (
          <div key={f.id} className={`ui-forecast-card${isDue(f) ? ' ui-forecast-card--due' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{f.statement}</span>
              <span className="font-mono ui-chip ui-chip--xs ui-chip--accent" style={{ flexShrink: 0 }}>
                {Math.round(f.probability * 100)}%
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 9,
                  color: isDue(f) ? 'var(--high)' : 'var(--text-muted)',
                  fontWeight: isDue(f) ? 700 : 400,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {isDue(f) && <AlertTriangle size={10} />}
                {isDue(f) ? 'Due — resolve it' : `Due ${f.dueDate}`}
              </span>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => project && resolveForecast(project.id, f.id, 1)}
                  title="It happened"
                  className="ui-btn ui-btn--success"
                  style={{ fontSize: 10, padding: '3px 8px' }}
                >
                  <Check size={10} /> Happened
                </button>
                <button
                  type="button"
                  onClick={() => project && resolveForecast(project.id, f.id, 0)}
                  title="It did not happen"
                  className="ui-btn ui-btn--ghost"
                  style={{ fontSize: 10, padding: '3px 8px' }}
                >
                  Didn&apos;t
                </button>
                <button
                  type="button"
                  onClick={() => project && removeForecast(project.id, f.id)}
                  className="ui-btn ui-btn--danger-ghost"
                  style={{ padding: 4 }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {resolved.length > 0 && (
          <div className="ui-section-label" style={{ marginTop: 4 }}>Resolved ({resolved.length})</div>
        )}
        {resolved.map(f => {
          const b = (f.probability - (f.outcome ?? 0)) ** 2
          return (
            <div key={f.id} className="ui-forecast-card ui-forecast-card--resolved">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f.statement}</span>
                <button
                  type="button"
                  onClick={() => project && removeForecast(project.id, f.id)}
                  className="ui-btn ui-btn--ghost"
                  style={{ padding: 2, flexShrink: 0 }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <span className={`ui-chip ui-chip--xs ${f.outcome ? 'ui-chip--sev-low' : 'ui-chip--sev-critical'}`}>
                  {f.outcome ? 'Happened' : 'Did not'}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>predicted {Math.round(f.probability * 100)}%</span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Brier {b.toFixed(2)}</span>
              </div>
            </div>
          )
        })}

        {forecasts.length === 0 && (
          <div className="ui-panel-empty">
            <div className="ui-panel-empty__title">No forecasts logged</div>
            <p className="ui-feed-hint">Log a claim and a due date. Resolve it when you know what happened.</p>
          </div>
        )}

        <div className="ui-feed-hint">
          Brier score measures forecast accuracy. Resolve open items when the due date passes.
        </div>
      </div>
    </div>
  )
}
