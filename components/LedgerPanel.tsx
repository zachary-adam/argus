'use client'
import { useMemo, useState } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { useMapStore } from '@/stores/mapStore'
import type { PredictionEntry } from '@/types/project'
import {
  ChevronLeft, CheckCircle, XCircle, MinusCircle, ChevronDown, ChevronUp,
  Trash2, ClipboardList, Download, LayoutGrid,
} from 'lucide-react'
import { useClosePanel } from '@/lib/hooks/useClosePanel'

const STATUS_LABELS: Record<'all' | 'pending' | 'validated', string> = {
  all: 'All',
  pending: 'Pending',
  validated: 'Validated',
}

const TYPE_LABELS: Record<'all' | 'formula' | 'ach', string> = {
  all: 'All types',
  formula: 'Formulas',
  ach: 'ACH',
}

const OUTCOME_CHIP: Record<NonNullable<PredictionEntry['validatedOutcome']>, string> = {
  correct: 'ui-chip--sev-low',
  incorrect: 'ui-chip--sev-critical',
  partial: 'ui-chip--sev-medium',
}

const OUTCOME_LABEL: Record<NonNullable<PredictionEntry['validatedOutcome']>, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  partial: 'Partial',
}

function scoreColor(output: number): string {
  if (output >= 70) return 'var(--critical)'
  if (output >= 45) return 'var(--high)'
  if (output >= 25) return 'var(--medium)'
  return 'var(--low)'
}

function achColor(confidence?: string): string {
  if (confidence === 'high') return 'var(--low)'
  if (confidence === 'moderate') return 'var(--medium)'
  return 'var(--critical)'
}

function entryTitle(entry: PredictionEntry): string {
  if (entry.entryType === 'ach' && entry.leadHypothesis) return entry.leadHypothesis
  return entry.formulaName
}

function exportLedgerCsv(entries: PredictionEntry[], projectName: string) {
  const rows = [
    ['id', 'type', 'title', 'score', 'label', 'status', 'validated_at', 'note', 'recorded_at', 'narrative'],
    ...entries.map(e => [
      e.id,
      e.entryType === 'ach' ? 'ach' : 'formula',
      entryTitle(e),
      String(e.output),
      e.outputLabel,
      e.validatedOutcome ?? 'pending',
      e.validatedAt ?? '',
      e.validationNote ?? '',
      e.timestamp,
      (e.narrative ?? '').replace(/\n/g, ' '),
    ]),
  ]
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName.replace(/\s+/g, '-').toLowerCase() || 'argus'}-ledger.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function LedgerPanel() {
  const { handleClose, closing } = useClosePanel('ledger')
  const togglePanel = useMapStore(s => s.togglePanel)
  const project = useProjectStore(s => s.getActiveProject())
  const validatePrediction = useProjectStore(s => s.validatePrediction)
  const removePrediction = useProjectStore(s => s.removePrediction)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterFormula, setFilterFormula] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'validated'>('all')
  const [filterType, setFilterType] = useState<'all' | 'formula' | 'ach'>('all')
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  const ledger = project?.predictionLedger ?? []
  const pending = useMemo(() => ledger.filter(e => !e.validatedOutcome), [ledger])
  const validated = useMemo(() => ledger.filter(e => e.validatedOutcome), [ledger])
  const correct = validated.filter(e => e.validatedOutcome === 'correct').length
  const accuracy = validated.length > 0 ? Math.round((correct / validated.length) * 100) : null
  const formulaNames = [...new Set(ledger.map(e => e.formulaName))]

  const filtered = ledger
    .filter(e => filterFormula === 'all' || e.formulaName === filterFormula)
    .filter(e => filterStatus === 'all' ? true : filterStatus === 'pending' ? !e.validatedOutcome : !!e.validatedOutcome)
    .filter(e => {
      if (filterType === 'all') return true
      if (filterType === 'ach') return e.entryType === 'ach'
      return e.entryType !== 'ach'
    })
    .slice()
    .reverse()

  const validate = (entry: PredictionEntry, outcome: PredictionEntry['validatedOutcome']) => {
    if (!project) return
    const note = noteDrafts[entry.id] ?? entry.validationNote
    validatePrediction(project.id, entry.id, outcome, note)
  }

  const remove = (entryId: string) => {
    if (!project) return
    removePrediction(project.id, entryId)
  }

  const accuracyColor = accuracy === null
    ? 'var(--text-muted)'
    : accuracy >= 70
    ? 'var(--low)'
    : accuracy >= 40
    ? 'var(--medium)'
    : 'var(--critical)'

  return (
    <div className={`ui-ledger-root${closing ? ' panel-closing' : ''}`}>
      <header className="ui-ledger-toolbar">
        <button
          type="button"
          onClick={handleClose}
          className="ui-btn ui-btn--ghost"
          style={{ fontSize: 11, padding: '4px 9px' }}
        >
          <ChevronLeft size={12} /> Map
        </button>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <div>
          <div className="ui-kicker" style={{ marginBottom: 0, fontSize: 9 }}>Validation</div>
          <div className="ui-title ui-title--panel">Prediction Ledger</div>
        </div>
        {project && (
          <span className="ui-chip ui-chip--xs" style={{ marginLeft: 4 }}>{project.name}</span>
        )}
        <div style={{ flex: 1 }} />
        {ledger.length > 0 && (
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            style={{ fontSize: 10, padding: '4px 8px' }}
            onClick={() => exportLedgerCsv(ledger, project?.name ?? 'argus')}
            title="Export ledger as CSV"
          >
            <Download size={11} /> Export
          </button>
        )}
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          style={{ fontSize: 10, padding: '4px 8px' }}
          onClick={() => useMapStore.getState().focusWorkbench('canvas')}
          title="Open canvas"
        >
          <LayoutGrid size={11} /> Canvas
        </button>
        <span className="ui-chip ui-chip--xs">{ledger.length} entries</span>
      </header>

      <p className="ui-feed-hint ui-ledger-hint">
        Formula and ACH scores from the canvas land here for validation.
        Dated probability calls live in{' '}
        <button type="button" className="ui-link" onClick={() => togglePanel('forecasts')}>
          Forecasts
        </button>
        .
      </p>

      {pending.length > 0 && (
        <div className="ui-ledger-pending">
          <span>
            <strong>{pending.length}</strong> pending judgment{pending.length === 1 ? '' : 's'} — mark correct, partial, or incorrect when you know the outcome.
          </span>
          {filterStatus !== 'pending' && (
            <button type="button" className="ui-link" onClick={() => setFilterStatus('pending')}>
              Show pending
            </button>
          )}
        </div>
      )}

      {ledger.length > 0 && (
        <div className="ui-ledger-stats">
          <div className="ui-stat" style={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border)' }}>
            <div className="ui-stat__n">{ledger.length}</div>
            <div className="ui-stat__label">Total</div>
          </div>
          <div className="ui-stat" style={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border)' }}>
            <div className="ui-stat__n">{pending.length}</div>
            <div className="ui-stat__label">Pending</div>
          </div>
          <div className="ui-stat" style={{ borderRadius: 0, border: 'none', borderRight: '1px solid var(--border)' }}>
            <div className="ui-stat__n" style={{ color: 'var(--accent)' }}>{validated.length}</div>
            <div className="ui-stat__label">Validated</div>
          </div>
          <div className="ui-stat" style={{ borderRadius: 0, border: 'none' }}>
            <div className="ui-stat__n" style={{ color: accuracyColor }}>
              {accuracy !== null ? `${accuracy}%` : '—'}
            </div>
            <div className="ui-stat__label">Accuracy</div>
          </div>
        </div>
      )}

      {ledger.length > 0 && (
        <div className="ui-ledger-filters">
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as typeof filterType)}
            className="ui-input ui-input--compact"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 10 }}
            aria-label="Filter by type"
          >
            {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map(k => (
              <option key={k} value={k}>{TYPE_LABELS[k]}</option>
            ))}
          </select>
          <select
            value={filterFormula}
            onChange={e => setFilterFormula(e.target.value)}
            className="ui-input ui-input--compact"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 10 }}
            aria-label="Filter by formula"
          >
            <option value="all">All formulas</option>
            {formulaNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {(['all', 'pending', 'validated'] as const).map(s => (
            <button
              key={s}
              type="button"
              className={`ui-filter-pill ui-filter-pill--accent${filterStatus === s ? ' ui-filter-pill--active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {ledger.length === 0 && (
        <div className="ui-panel-empty ui-ledger-empty">
          <ClipboardList size={32} className="ui-panel-empty__icon" />
          <div className="ui-panel-empty__title">No predictions recorded</div>
          <ol className="ui-ledger-empty__steps">
            <li>Open the canvas and add a formula or ACH card</li>
            <li>Link events (formulas auto-score; ACH needs a judgment)</li>
            <li>Come back here to validate outcomes over time</li>
          </ol>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            style={{ marginTop: 14, fontSize: 12 }}
            onClick={() => useMapStore.getState().focusWorkbench('canvas')}
          >
            Open canvas
          </button>
        </div>
      )}

      {ledger.length > 0 && filtered.length === 0 && (
        <div className="ui-panel-empty">
          <div className="ui-panel-empty__title">No matching entries</div>
          <p className="ui-feed-hint">Try a different type, formula, or status filter.</p>
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            style={{ marginTop: 10, fontSize: 11 }}
            onClick={() => { setFilterType('all'); setFilterFormula('all'); setFilterStatus('all') }}
          >
            Clear filters
          </button>
        </div>
      )}

      <div className="ui-panel-body" style={{ flex: 1, padding: 0 }}>
        {filtered.map(entry => {
          const isOpen = expanded === entry.id
          const outcome = entry.validatedOutcome
          const isACH = entry.entryType === 'ach'
          const color = isACH ? achColor(entry.achConfidence) : scoreColor(entry.output)
          const date = new Date(entry.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

          return (
            <div key={entry.id} className={`ui-ledger-entry${!outcome ? ' ui-ledger-entry--pending' : ''}`}>
              <div
                className="ui-ledger-entry__head"
                onClick={() => setExpanded(isOpen ? null : entry.id)}
              >
                <div
                  className="ui-ledger-score"
                  style={{ borderColor: `color-mix(in srgb, ${color} 35%, var(--border))`, background: `color-mix(in srgb, ${color} 10%, var(--surface-elevated))` }}
                >
                  {isACH ? (
                    <span style={{ fontSize: 7, fontWeight: 800, color, letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.2, padding: '0 2px' }}>
                      {entry.achConfidence ?? 'mod'}
                    </span>
                  ) : (
                    <>
                      <span className="font-mono" style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>{entry.output}</span>
                      <span style={{ fontSize: 7, color, fontWeight: 600, letterSpacing: '0.04em' }}>/100</span>
                    </>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entryTitle(entry)}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {isACH ? 'ACH lead hypothesis' : entry.outputLabel} · {date}
                    {isACH ? '' : ` · ${entry.formulaName}`}
                  </div>
                  {entry.narrative && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%', fontStyle: 'italic' }}>
                      {entry.narrative}
                    </div>
                  )}
                </div>

                {!outcome && (
                  <div className="ui-ledger-quick" onClick={e => e.stopPropagation()}>
                    {(['correct', 'partial', 'incorrect'] as const).map(o => (
                      <button
                        key={o}
                        type="button"
                        className="ui-ledger-quick__btn"
                        title={OUTCOME_LABEL[o]}
                        aria-label={`Mark ${OUTCOME_LABEL[o]}`}
                        onClick={() => validate(entry, o)}
                      >
                        {o === 'correct' ? <CheckCircle size={12} /> : o === 'incorrect' ? <XCircle size={12} /> : <MinusCircle size={12} />}
                      </button>
                    ))}
                  </div>
                )}

                {outcome ? (
                  <span className={`ui-chip ui-chip--xs ${OUTCOME_CHIP[outcome]}`}>
                    {OUTCOME_LABEL[outcome]}
                  </span>
                ) : (
                  <span className="ui-chip ui-chip--xs">Pending</span>
                )}

                {isOpen ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
              </div>

              {isOpen && (
                <div className="ui-ledger-detail">
                  {isACH && entry.achHypotheses && (
                    <div style={{ marginTop: 12, marginBottom: 10 }}>
                      <div className="ui-section-label">Hypothesis rankings</div>
                      {entry.achHypotheses.map((h, i) => {
                        const isLead = h.text === entry.leadHypothesis
                        const netColor = h.net > 0 ? 'var(--low)' : h.net < 0 ? 'var(--critical)' : 'var(--text-muted)'
                        return (
                          <div
                            key={i}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                              background: isLead ? `color-mix(in srgb, ${color} 10%, transparent)` : 'transparent',
                              border: isLead ? `1px solid color-mix(in srgb, ${color} 30%, var(--border))` : '1px solid transparent',
                            }}
                          >
                            <span style={{ fontSize: 9, color: isLead ? color : 'var(--text-muted)', fontWeight: isLead ? 700 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {isLead && '★ '}{h.text}
                            </span>
                            <span style={{ fontSize: 8, color: 'var(--low)', flexShrink: 0 }}>{h.supports}✓</span>
                            <span style={{ fontSize: 8, color: 'var(--critical)', flexShrink: 0 }}>{h.contradicts}✗</span>
                            <span className="font-mono" style={{ fontSize: 9, fontWeight: 700, color: netColor, flexShrink: 0, minWidth: 24, textAlign: 'right' }}>
                              {h.net > 0 ? `+${h.net}` : h.net}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {!isACH && (
                    <div style={{ marginTop: 12, marginBottom: 10 }}>
                      <div className="ui-section-label">Variable inputs</div>
                      {Object.entries(entry.inputs).map(([key, val]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 160, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</span>
                          <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${val * 100}%`, height: '100%', background: color, borderRadius: 2 }} />
                          </div>
                          <span className="font-mono" style={{ fontSize: 10, color: 'var(--text-primary)', width: 28, textAlign: 'right', flexShrink: 0 }}>{Math.round(val * 100)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {entry.narrative && (
                    <div className="ui-callout" style={{ marginBottom: 12, fontStyle: 'italic' }}>
                      {entry.narrative}
                    </div>
                  )}

                  <div className="ui-section-label">Validate outcome</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(['correct', 'partial', 'incorrect'] as const).map(o => {
                      const active = outcome === o
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() => validate(entry, active ? undefined : o)}
                          className={`ui-btn ui-btn--ghost${active ? ` ${OUTCOME_CHIP[o]}` : ''}`}
                          style={{ fontSize: 10, padding: '5px 11px', fontWeight: 700 }}
                        >
                          {o === 'correct' ? <CheckCircle size={11} /> : o === 'incorrect' ? <XCircle size={11} /> : <MinusCircle size={11} />}
                          {OUTCOME_LABEL[o]}
                        </button>
                      )
                    })}

                    {entry.validatedAt && (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                        Validated {new Date(entry.validatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                    )}

                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      onClick={() => remove(entry.id)}
                      className="ui-btn ui-btn--danger-ghost"
                      style={{ fontSize: 9, padding: '4px 8px' }}
                    >
                      <Trash2 size={9} /> Delete
                    </button>
                  </div>

                  <label className="ui-ledger-note">
                    <span className="ui-section-label" style={{ marginBottom: 4 }}>Validation note</span>
                    <textarea
                      className="ui-input"
                      rows={2}
                      placeholder="Why this outcome? (optional)"
                      value={noteDrafts[entry.id] ?? entry.validationNote ?? ''}
                      onChange={e => setNoteDrafts(d => ({ ...d, [entry.id]: e.target.value }))}
                      onBlur={() => {
                        if (!project || !outcome) return
                        const note = noteDrafts[entry.id]
                        if (note === undefined || note === (entry.validationNote ?? '')) return
                        validatePrediction(project.id, entry.id, outcome, note)
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
