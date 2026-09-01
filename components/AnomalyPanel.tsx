'use client'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { X, Activity } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { AnomalyAlert } from '@/types'
import { runLiveAnomalies } from '@/lib/anomalyEngine'
import { useClosePanel } from '@/lib/hooks/useClosePanel'

const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
}

const SCOPE_LABELS: Record<'global' | 'project', string> = {
  global: 'Global',
  project: 'Project',
}

function ZBar({ z, color }: { z: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--surface-elevated)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, (z / 5) * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span className="font-mono ui-chip ui-chip--xs" style={{ minWidth: 36, textAlign: 'right', color, borderColor: `color-mix(in srgb, ${color} 30%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}>
        {z.toFixed(1)}σ
      </span>
    </div>
  )
}

export default function AnomalyPanel() {
  const { handleClose, closing } = useClosePanel('anomaly')
  const flyTo = useMapStore(s => s.flyTo)
  const events = useMapStore(s => s.events)
  const [scope, setScope] = useState<'global' | 'project'>('global')

  const { data: globalAnomalies = [], isLoading: globalLoading } = useQuery<AnomalyAlert[]>({
    queryKey: ['anomalies'],
    queryFn: () => fetch('/api/anomalies').then(r => r.json()),
    refetchInterval: 3 * 60 * 1000,
    enabled: scope === 'global',
  })

  const projectAnomalies = useMemo(() => runLiveAnomalies(events), [events])

  const anomalies = scope === 'project' ? projectAnomalies : globalAnomalies
  const isLoading = scope === 'global' && globalLoading

  const critical = anomalies.filter(a => a.severity === 'critical').length
  const high = anomalies.filter(a => a.severity === 'high').length
  const medium = anomalies.length - critical - high

  return (
    <div className={`panel-right panel-slide-in${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Statistics</div>
            <div className="ui-title ui-title--panel">Anomaly Detection</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="ui-chip ui-chip--xs">{anomalies.length} detected</span>
              {critical > 0 && (
                <span className="ui-chip ui-chip--xs ui-chip--sev-critical">{critical} critical</span>
              )}
            </div>
          </div>
          <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="ui-filter-row" style={{ marginTop: 12, marginBottom: 0 }}>
          {(['global', 'project'] as const).map(s => {
            const active = scope === s
            return (
              <button
                key={s}
                type="button"
                className={`ui-filter-pill ui-filter-pill--accent${active ? ' ui-filter-pill--active' : ''}`}
                onClick={() => setScope(s)}
                title={s === 'project' ? 'This project only — no historical baseline' : 'Global feed with 30-day baseline'}
              >
                {SCOPE_LABELS[s]}
              </button>
            )
          })}
          <span className="ui-feed-hint" style={{ padding: 0, margin: 0, fontSize: 9 }}>
            {scope === 'global' ? '30-day baseline' : 'workspace events only'}
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="ui-stat">
          <div className="ui-stat__n" style={{ color: 'var(--critical)' }}>{critical}</div>
          <div className="ui-stat__label">Critical</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__n" style={{ color: 'var(--high)' }}>{high}</div>
          <div className="ui-stat__label">High</div>
        </div>
        <div className="ui-stat">
          <div className="ui-stat__n" style={{ color: 'var(--medium)' }}>{medium}</div>
          <div className="ui-stat__label">Medium</div>
        </div>
      </div>

      <div className="ui-panel-body" style={{ paddingTop: 10 }}>
        <div className="ui-callout" style={{ marginBottom: 12, fontSize: 10, lineHeight: 1.55 }}>
          Z-score + CUSUM over rolling baselines. Surfaces regions with statistically unusual event rates — elevated activity relative to recent history.
          {scope === 'project' && (
            <span style={{ display: 'block', marginTop: 6, fontSize: 9, color: 'var(--text-muted)' }}>
              Project scope has no historical archive — compares against the distribution of events already loaded.
            </span>
          )}
        </div>

        {isLoading && (
          <div className="ui-panel-empty">
            <Activity size={24} className="ui-panel-empty__icon" style={{ opacity: 0.5, color: 'var(--accent)' }} />
            <div className="ui-panel-empty__title">Running detection…</div>
          </div>
        )}

        {!isLoading && anomalies.length === 0 && (
          <div className="ui-panel-empty">
            <div className="ui-panel-empty__title">No statistical anomalies</div>
            <p className="ui-feed-hint">Nothing outside the usual range for now.</p>
          </div>
        )}

        {anomalies.map(a => {
          const color = SEV_VAR[a.severity] ?? 'var(--text-muted)'
          const sevChip = `ui-chip--sev-${a.severity}`

          return (
            <div key={a.id} className="ui-alert-card">
              <div className="ui-alert-card__stripe" style={{ background: color }} />
              <div className="ui-alert-card__body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className={`ui-chip ui-chip--xs ${sevChip}`}>{a.severity}</span>
                  <span className="ui-chip ui-chip--xs">{a.category}</span>
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
                  {a.country}
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div className="ui-section-label" style={{ marginBottom: 4 }}>Z-score deviation</div>
                  <ZBar z={a.zScore} color={color} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                  {[
                    { label: 'Observed', value: a.observed, color: 'var(--text-primary)' },
                    { label: 'Expected', value: a.expected, color: 'var(--text-secondary)' },
                    { label: 'Deviation', value: `${a.deviationPct >= 0 ? '+' : ''}${a.deviationPct}%`, color },
                  ].map(s => (
                    <div key={s.label} className="ui-stat" style={{ padding: '8px' }}>
                      <div className="ui-stat__label">{s.label}</div>
                      <div className="font-mono ui-stat__n" style={{ fontSize: 14, color: s.color, marginTop: 4 }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>{a.summary}</div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="ui-chip ui-chip--xs font-mono">CUSUM {a.cusum.toFixed(1)}</span>
                  {a.lat !== 0 && (
                    <button type="button" onClick={() => flyTo(a.lat, a.lon, 5)} className="ui-btn ui-btn--ghost" style={{ fontSize: 10, padding: '3px 10px' }}>
                      Map
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
