'use client'
import { useMemo } from 'react'
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { IntelEvent } from '@/types'
import { rateChangeSignificant } from '@/lib/velocityStats'
import { displayCountry } from '@/lib/countryNames'
import { useClosePanel } from '@/lib/hooks/useClosePanel'

const SEV_ORDER = ['critical', 'high', 'medium', 'low']
const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
}
const CAT_LABEL: Record<string, string> = {
  conflict: 'Conflict', political: 'Political', economic: 'Economic',
  humanitarian: 'Humanitarian', health: 'Health', earthquake: 'Earthquake',
  wildfire: 'Wildfire', disaster: 'Disaster', environmental: 'Environmental',
  cyber: 'Cyber', social: 'Social',
}

interface VelocityRow {
  key: string
  label: string
  recent: number
  prior: number
  pct: number
  significant: boolean
  sevBreakdown: Record<string, number>
}

function computeVelocity(events: IntelEvent[], groupBy: 'country' | 'category'): VelocityRow[] {
  const now  = Date.now()
  const D7   = 7  * 86_400_000
  const D30  = 30 * 86_400_000

  const recentCutoff = now - D7
  const windowCutoff = now - D30

  const recentMap: Record<string, IntelEvent[]> = {}
  const priorMap:  Record<string, IntelEvent[]> = {}

  for (const e of events) {
    const ts = new Date(e.timestamp).getTime()
    if (ts < windowCutoff) continue
    const rawKey = groupBy === 'country' ? e.country : e.category
    if (groupBy === 'country' && (!rawKey || rawKey === 'Unknown')) continue
    const key = rawKey || 'other'
    if (ts >= recentCutoff) {
      if (!recentMap[key]) recentMap[key] = []
      recentMap[key].push(e)
    } else {
      if (!priorMap[key]) priorMap[key] = []
      priorMap[key].push(e)
    }
  }

  const allKeys = new Set([...Object.keys(recentMap), ...Object.keys(priorMap)])

  return [...allKeys].map(key => {
    const recentEvs = recentMap[key] ?? []
    const priorEvs  = priorMap[key] ?? []
    const recent    = recentEvs.length
    const prior     = (priorEvs.length / 23) * 7
    const pct       = prior === 0 ? (recent > 0 ? 999 : 0) : Math.round(((recent - prior) / prior) * 100)

    const sevBreakdown: Record<string, number> = {}
    for (const e of recentEvs) {
      sevBreakdown[e.severity] = (sevBreakdown[e.severity] ?? 0) + 1
    }

    return {
      key,
      label: groupBy === 'category' ? (CAT_LABEL[key] ?? key) : displayCountry(key),
      recent,
      prior: Math.round(prior * 10) / 10,
      pct,
      significant: rateChangeSignificant(recent, prior),
      sevBreakdown,
    }
  }).sort((a, b) => {
    if (a.pct === 999 && b.pct !== 999) return 1
    if (b.pct === 999 && a.pct !== 999) return -1
    return Math.abs(b.pct) - Math.abs(a.pct)
  })
}

function velocityChipClass(pct: number): string {
  if (pct === 999) return 'ui-chip ui-chip--xs'
  if (pct > 20) return 'ui-chip ui-chip--xs ui-chip--sev-critical'
  if (pct < -20) return 'ui-chip ui-chip--xs ui-chip--sev-low'
  return 'ui-chip ui-chip--xs ui-chip--sev-medium'
}

function barColor(pct: number): string {
  if (pct > 20) return 'var(--critical)'
  if (pct < -20) return 'var(--low)'
  return 'var(--medium)'
}

export default function VelocityPanel() {
  const events = useMapStore(s => s.events)
  const { handleClose, closing } = useClosePanel('velocity')

  const { byCountry, byCategory, recent7, overallPct } = useMemo(() => {
    const byCountry  = computeVelocity(events, 'country')
    const byCategory = computeVelocity(events, 'category')
    const now = Date.now()
    const D7  = 7  * 86_400_000
    const D30 = 30 * 86_400_000
    const r7  = events.filter(e => now - new Date(e.timestamp).getTime() < D7).length
    const prior23 = events.filter(e => {
      const age = now - new Date(e.timestamp).getTime()
      return age >= D7 && age < D30
    }).length
    const priorNorm = (prior23 / 23) * 7
    const oPct = priorNorm === 0 ? (r7 > 0 ? 999 : 0) : Math.round(((r7 - priorNorm) / priorNorm) * 100)
    return { byCountry, byCategory, recent7: r7, overallPct: oPct }
  }, [events])

  const priorRatePerWeek = overallPct === 999
    ? null
    : overallPct === 0 && recent7 === 0
    ? 0
    : Math.round((recent7 / (1 + overallPct / 100)) * 10) / 10

  return (
    <div className={`panel-right panel-slide-in${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Trends</div>
            <div className="ui-title ui-title--panel">Event Velocity</div>
            <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>
              7-day rate vs. prior 23-day baseline
            </p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="ui-chip ui-chip--xs">{events.length.toLocaleString()} events</span>
              <span className="ui-chip ui-chip--xs ui-chip--accent">{recent7} this week</span>
            </div>
          </div>
          <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </header>

      <div className="ui-panel-body" style={{ paddingTop: 10 }}>
        <div className="ui-callout" style={{ marginBottom: 14, fontSize: 10, lineHeight: 1.6 }}>
          Compares how fast events are arriving this week against the monthly average.
          Sustained readings above <strong>+100%</strong> can signal escalation.
          <span style={{ display: 'block', marginTop: 6, fontSize: 9, color: 'var(--text-muted)' }}>
            &quot;NEW&quot; means no baseline yet — treat with caution.
          </span>
        </div>

        <div
          className="ui-callout"
          style={{
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderLeft: '3px solid var(--accent)',
          }}
        >
          <div>
            <div className="ui-stat__n" style={{ fontSize: 28 }}>{recent7}</div>
            <div className="ui-stat__label" style={{ marginTop: 4 }}>events in last 7 days</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <VelocityBadge pct={overallPct} large />
            {priorRatePerWeek !== null && (
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                vs. {priorRatePerWeek}/wk baseline
              </div>
            )}
          </div>
        </div>

        {byCountry.length > 0 && (
          <>
            <div className="ui-section-label">By country</div>
            {byCountry.slice(0, 8).map(row => (
              <VelocityRowCard key={row.key} row={row} />
            ))}
          </>
        )}

        {byCategory.length > 0 && (
          <>
            <div className="ui-section-label" style={{ marginTop: 12 }}>By category</div>
            {byCategory.slice(0, 8).map(row => (
              <VelocityRowCard key={row.key} row={row} />
            ))}
          </>
        )}

        {events.length === 0 && (
          <div className="ui-panel-empty">
            <div className="ui-panel-empty__title">No events yet</div>
            <p className="ui-feed-hint">Add a data source to compare event velocity.</p>
          </div>
        )}

        <div className="ui-feed-hint" style={{ marginTop: 16 }}>
          +100% means twice the monthly average. Labels marked ~noise are within Poisson variance.
        </div>
      </div>
    </div>
  )
}

function VelocityBadge({ pct, large = false }: { pct: number; large?: boolean }) {
  const isNew = pct === 999
  const accelerating = !isNew && pct > 20
  const decelerating = !isNew && pct < -20
  const Icon = isNew ? Minus : accelerating ? TrendingUp : decelerating ? TrendingDown : Minus
  const label = isNew ? 'NEW' : `${pct > 0 ? '+' : ''}${pct}%`

  return (
    <span
      className={velocityChipClass(pct)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: large ? '4px 10px' : undefined,
        fontSize: large ? 13 : undefined,
        fontFamily: 'var(--font-mono)',
      }}
    >
      <Icon size={large ? 13 : 10} />
      {label}
    </span>
  )
}

function VelocityRowCard({ row }: { row: VelocityRow }) {
  const maxSev = SEV_ORDER.find(s => (row.sevBreakdown[s] ?? 0) > 0)
  const accentCol = maxSev ? SEV_VAR[maxSev] : 'var(--text-muted)'

  const isNew = row.pct === 999
  const barPct = isNew ? 0 : Math.min(Math.abs(row.pct), 300) / 300

  return (
    <div className="ui-velocity-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <div className="ui-sev-dot" style={{ width: 7, height: 7, marginTop: 0, background: accentCol }} />
        <span style={{
          flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {row.label}
        </span>
        {!row.significant && row.pct !== 999 && (
          <span
            title="Change is within statistical noise (Poisson) — low confidence"
            className="ui-chip ui-chip--xs"
            style={{ fontSize: 8, letterSpacing: '0.04em' }}
          >
            ~noise
          </span>
        )}
        <VelocityBadge pct={row.pct} />
      </div>

      <div className="ui-velocity-bar">
        <div
          className="ui-velocity-bar__fill"
          style={{ width: `${barPct * 100}%`, background: barColor(row.pct) }}
        />
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.recent}</span>
        {' events this week · avg '}
        <span className="font-mono">{row.prior}</span>
        {'/wk baseline'}
      </div>
    </div>
  )
}
