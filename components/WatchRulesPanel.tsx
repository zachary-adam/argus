'use client'
import { useState, useMemo } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { WatchRule, WatchCondition, WatchConditionField, WatchConditionOp } from '@/types/project'
import { eventsMatchingRule } from '@/lib/watchCondition'
import { topicWatchTerms } from '@/lib/topicWatchTerms'
import { X, Plus, Trash2, Bell, ToggleLeft, ToggleRight, Clock, Zap, Tag } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useClosePanel } from '@/lib/hooks/useClosePanel'

const FIELD_LABELS: Record<WatchConditionField, string> = {
  severity: 'Severity', category: 'Category', country: 'Country',
  fatalities: 'Fatalities', source: 'Source',
  title: 'Title', summary: 'Summary', text: 'Any text (topic/entity)',
}
const OP_LABELS: Record<WatchConditionOp, string> = {
  equals: '=', contains: 'contains', gte: '≥', lte: '≤',
}

const SEV_OPTS = ['critical', 'high', 'medium', 'low']
const CAT_OPTS = ['conflict', 'political', 'economic', 'social', 'humanitarian', 'health', 'environmental', 'disaster', 'cyber', 'elections']
const SRC_OPTS = ['gdelt', 'gdacs', 'reliefweb', 'usgs', 'who', 'firms', 'rss', 'ucdp', 'acled']
const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)', high: 'var(--high)', medium: 'var(--medium)', low: 'var(--low)',
}
const SEV_CHIP: Record<string, string> = {
  critical: 'ui-chip--sev-critical', high: 'ui-chip--sev-high', medium: 'ui-chip--sev-medium', low: 'ui-chip--sev-low',
}

const PRESETS: Omit<WatchRule, 'id' | 'projectId' | 'createdAt' | 'fireCount'>[] = [
  { name: 'Critical Event Spike', enabled: true, conditions: [{ field: 'severity', op: 'equals', value: 'critical' }], windowHours: 24, threshold: 3, action: 'both', incidentSeverity: 'critical' },
  { name: 'Mass Casualty Event', enabled: true, conditions: [{ field: 'fatalities', op: 'gte', value: 50 }], windowHours: 48, threshold: 1, action: 'both', incidentSeverity: 'critical' },
  { name: 'Conflict Escalation', enabled: true, conditions: [{ field: 'category', op: 'equals', value: 'conflict' }, { field: 'severity', op: 'equals', value: 'high' }], windowHours: 12, threshold: 2, action: 'incident', incidentSeverity: 'high' },
  { name: 'Humanitarian Crisis', enabled: true, conditions: [{ field: 'category', op: 'equals', value: 'humanitarian' }], windowHours: 72, threshold: 3, action: 'notify', incidentSeverity: 'high' },
]

const BLANK_RULE: Omit<WatchRule, 'id' | 'projectId' | 'createdAt' | 'fireCount'> = {
  name: '', enabled: true,
  conditions: [{ field: 'severity', op: 'equals', value: 'critical' }],
  windowHours: 24, threshold: 1,
  action: 'both', incidentSeverity: 'high',
  eventScope: 'all',
}

function conditionValueSuggestions(field: WatchConditionField): string[] {
  if (field === 'severity') return SEV_OPTS
  if (field === 'category') return CAT_OPTS
  if (field === 'source') return SRC_OPTS
  return []
}

function conditionOpsFor(field: WatchConditionField): WatchConditionOp[] {
  if (field === 'fatalities') return ['gte', 'lte', 'equals']
  if (field === 'title' || field === 'summary' || field === 'text') return ['contains']
  return ['equals', 'contains']
}

export default function WatchRulesPanel() {
  const { handleClose, closing } = useClosePanel('watchRules')
  const events = useMapStore(s => s.events)
  const { getActiveProject, createWatchRule, deleteWatchRule, toggleWatchRule } = useProjectStore()
  const project = getActiveProject()
  const watchCtx = useMemo(
    () => ({ targeting: project?.targeting, countryCodes: project?.countryCodes ?? [] }),
    [project?.targeting, project?.countryCodes],
  )

  const [showNew, setShowNew] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [form, setForm] = useState({ ...BLANK_RULE })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const rules = useMemo(() => project?.watchRules ?? [], [project?.watchRules])
  const activeRules = rules.filter(r => r.enabled).length
  const topicTerms = topicWatchTerms(project?.targeting, project?.countryCodes ?? [])

  const eventCountries = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of events) {
      if (e.country && e.country !== 'Unknown' && !seen.has(e.country)) {
        seen.add(e.country)
        out.push(e.country)
      }
    }
    return out.sort()
  }, [events])

  const previewFormCount = useMemo(() => {
    if (form.conditions.length === 0) return 0
    return eventsMatchingRule(
      { conditions: form.conditions, windowHours: form.windowHours, eventScope: form.eventScope },
      events,
      watchCtx,
    ).length
  }, [form.conditions, form.windowHours, form.eventScope, events, watchCtx])

  const previewCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const rule of rules) counts[rule.id] = eventsMatchingRule(rule, events, watchCtx).length
    return counts
  }, [rules, events, watchCtx])

  const addCondition = () => {
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: 'country' as WatchConditionField, op: 'contains' as WatchConditionOp, value: '' }] }))
  }

  const updateCondition = (i: number, updates: Partial<WatchCondition>) => {
    setForm(f => {
      const conds = [...f.conditions]
      conds[i] = { ...conds[i], ...updates }
      if (updates.field) { conds[i].value = ''; conds[i].op = conditionOpsFor(updates.field)[0] }
      return { ...f, conditions: conds }
    })
  }

  const createTopicMonitors = () => {
    if (!project || topicTerms.length === 0) return
    for (const term of topicTerms) {
      const exists = rules.some(r =>
        r.conditions.some(c => c.field === 'text' && String(c.value).toLowerCase() === term.toLowerCase()),
      )
      if (exists) continue
      createWatchRule(project.id, {
        name: `Topic: ${term}`,
        enabled: true,
        conditions: [{ field: 'text', op: 'contains', value: term }],
        windowHours: 24,
        threshold: 1,
        action: 'notify',
        incidentSeverity: 'medium',
        eventScope: 'topic',
      })
    }
    setShowPresets(false)
  }

  if (!project) return null

  return (
    <div className="ui-panel-overlay" onClick={handleClose}>
      <div className={`ui-panel-drawer panel-slide-in${closing ? ' panel-closing' : ''}`} onClick={e => e.stopPropagation()}>
        <header className="ui-panel-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="ui-kicker" style={{ marginBottom: 4 }}>Alerts</div>
              <div className="ui-title ui-title--panel">Watch rules</div>
              <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 4 }}>
                {activeRules} active · {rules.length} total · 5 min cooldown
              </p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '6px 10px' }}
                onClick={() => { setShowPresets(v => !v); setShowNew(false) }}>
                Presets
              </button>
              <button type="button" className="ui-btn ui-btn--primary" style={{ fontSize: 11, padding: '6px 10px' }}
                onClick={() => { setShowNew(v => !v); setShowPresets(false) }}>
                <Plus size={12} /> New
              </button>
              <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
            <div className="ui-callout" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={12} />
              <span style={{ flex: 1 }}>Enable browser notifications for alerts.</span>
              <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 10, padding: '4px 8px' }}
                onClick={() => Notification.requestPermission()}>
                Enable
              </button>
            </div>
          )}
        </header>

        {showPresets && (
          <div className="ui-panel-inline-form">
            <div className="ui-section-label">Quick start</div>
            {topicTerms.length > 0 && (
              <button type="button" className="ui-topic-cluster" style={{ marginBottom: 8 }} onClick={createTopicMonitors}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Tag size={14} color="var(--accent)" />
                  <div>
                    <div className="ui-topic-cluster__title" style={{ marginBottom: 2 }}>Watch your beat</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Entities & country terms only: {topicTerms.join(', ')}
                    </div>
                  </div>
                </div>
              </button>
            )}
            {PRESETS.map((p, i) => (
              <button key={i} type="button" className="ui-rule-card" onClick={() => { setForm({ ...p }); setShowPresets(false); setShowNew(true) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="ui-sev-dot" style={{ width: 6, height: 6, marginTop: 0, background: SEV_VAR[p.incidentSeverity] }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.threshold}+ events · {p.windowHours}h · {p.action}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {showNew && (
          <div className="ui-panel-inline-form" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            <div className="ui-section-label">New rule</div>
            <input className="ui-input" style={{ marginBottom: 10 }} autoFocus value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Rule name" />
            <div className="ui-section-label">Conditions (all must match)</div>
            {form.conditions.map((cond, i) => (
              <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5, alignItems: 'center' }}>
                <select className="ui-input" style={{ flex: 1, padding: '6px 8px', fontSize: 11 }}
                  value={cond.field} onChange={e => updateCondition(i, { field: e.target.value as WatchConditionField })}>
                  {(Object.keys(FIELD_LABELS) as WatchConditionField[]).map(f => (
                    <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                  ))}
                </select>
                <select className="ui-input" style={{ width: 72, padding: '6px 4px', fontSize: 11 }}
                  value={cond.op} onChange={e => updateCondition(i, { op: e.target.value as WatchConditionOp })}>
                  {conditionOpsFor(cond.field).map(op => <option key={op} value={op}>{OP_LABELS[op]}</option>)}
                </select>
                {(cond.field === 'country' ? eventCountries : conditionValueSuggestions(cond.field)).length > 0 ? (
                  <select className="ui-input" style={{ flex: 1, padding: '6px 8px', fontSize: 11 }}
                    value={String(cond.value)} onChange={e => updateCondition(i, { value: e.target.value })}>
                    {(cond.field === 'country' ? eventCountries : conditionValueSuggestions(cond.field)).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <input className="ui-input" style={{ flex: 1, padding: '6px 8px', fontSize: 11 }}
                    value={String(cond.value)}
                    onChange={e => updateCondition(i, { value: cond.field === 'fatalities' ? Number(e.target.value) : e.target.value })}
                    placeholder="value" type={cond.field === 'fatalities' ? 'number' : 'text'} />
                )}
                {form.conditions.length > 1 && (
                  <button type="button" className="ui-btn ui-btn--ghost" style={{ padding: 4 }} onClick={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="ui-link" style={{ fontSize: 11, marginBottom: 12 }} onClick={addCondition}>
              <Plus size={10} /> Add condition
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div>
                <div className="ui-section-label">Min events</div>
                <input className="ui-input" type="number" min={1} value={form.threshold}
                  onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))} />
              </div>
              <div>
                <div className="ui-section-label">Window (hours)</div>
                <input className="ui-input" type="number" min={1} value={form.windowHours}
                  onChange={e => setForm(f => ({ ...f, windowHours: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="ui-section-label">Event scope</div>
            <div className="ui-filter-row" style={{ marginBottom: 10 }}>
              {([['all', 'All events'], ['topic', 'Your beat only']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`ui-filter-pill ui-filter-pill--accent${(form.eventScope ?? 'all') === id ? ' ui-filter-pill--active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, eventScope: id }))}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={`ui-callout ${previewFormCount >= form.threshold ? 'ui-rule-card--armed' : ''}`} style={{ marginBottom: 10 }}>
              <strong>{previewFormCount}</strong> match now
              {previewFormCount >= form.threshold ? ' — would fire if saved' : ` — needs ${form.threshold}`}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button type="button" className="ui-btn ui-btn--primary" disabled={!form.name.trim()}
                onClick={() => {
                  if (!form.name.trim()) return
                  createWatchRule(project.id, form)
                  setForm({ ...BLANK_RULE })
                  setShowNew(false)
                }}>
                Create
              </button>
            </div>
          </div>
        )}

        <div className="ui-panel-body">
          <div className="ui-callout" style={{ marginBottom: 16 }}>
            <strong>Topic rules</strong> only alert on your beat (topic matches + your sources, must mention your countries).
            Regional presets below are for wider spikes.
          </div>

          {rules.length === 0 && !showNew && !showPresets ? (
            <div className="ui-panel-empty">
              <Bell size={32} className="ui-panel-empty__icon" />
              <div className="ui-panel-empty__title">No watch rules yet</div>
              <p className="ui-feed-hint">Use Presets for quick starts or New to build a custom rule.</p>
            </div>
          ) : (
            [...rules].reverse().map(rule => {
              const isOpen = expanded === rule.id
              const matchCount = previewCounts[rule.id] ?? 0
              const willFire = rule.enabled && matchCount >= rule.threshold

              return (
                <div key={rule.id} className={`ui-rule-card ${willFire ? 'ui-rule-card--armed' : ''} ${!rule.enabled ? 'ui-rule-card--off' : ''}`}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      onClick={() => toggleWatchRule(project.id, rule.id)}
                      className="ui-btn ui-btn--ghost"
                      style={{ padding: 0, color: rule.enabled ? 'var(--accent)' : 'var(--text-muted)' }}
                    >
                      {rule.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpanded(isOpen ? null : rule.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{rule.name}</span>
                        <span className={`ui-chip ui-chip--xs${willFire ? ` ${SEV_CHIP[rule.incidentSeverity] ?? ''}` : ''}`}>
                          {matchCount}/{rule.threshold}{willFire ? ' · live' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                        {rule.eventScope === 'topic' && <span className="ui-chip ui-chip--accent">your beat</span>}
                        {rule.conditions.map((c, i) => (
                          <span key={i} className="ui-chip" style={{ fontSize: 9 }}>
                            {FIELD_LABELS[c.field]} {OP_LABELS[c.op]} {String(c.value)}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                        <span><Clock size={9} style={{ display: 'inline', verticalAlign: -1 }} /> {rule.windowHours}h</span>
                        <span><Zap size={9} style={{ display: 'inline', verticalAlign: -1 }} /> {rule.fireCount} triggered</span>
                        {rule.lastFiredAt && <span>last {formatDistanceToNow(new Date(rule.lastFiredAt), { addSuffix: true })}</span>}
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      {confirmDelete === rule.id ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--critical)' }}>Delete this rule?</span>
                          <button
                            type="button"
                            className="ui-btn ui-btn--danger-ghost"
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => { deleteWatchRule(project.id, rule.id); setConfirmDelete(null); setExpanded(null) }}
                          >
                            Delete
                          </button>
                          <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </div>
                      ) : (
                        <button type="button" className="ui-link" style={{ fontSize: 11, color: 'var(--critical)' }} onClick={() => setConfirmDelete(rule.id)}>
                          <Trash2 size={11} style={{ display: 'inline', verticalAlign: -2 }} /> Delete rule
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="ui-feed-footer">
          {events.length.toLocaleString()} events in workspace
        </div>
      </div>
    </div>
  )
}
