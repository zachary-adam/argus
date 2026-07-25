'use client'
import { useState, useMemo } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { Incident, IncidentStage } from '@/types/project'
import { IntelEvent } from '@/types'
import { X, Plus, ChevronRight, Clock, MessageSquare, ArrowRight, Trash2, MapPin } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { useClosePanel } from '@/lib/hooks/useClosePanel'

const SEV_DOT: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
}

const STAGES: { id: IncidentStage; label: string; chipClass: string }[] = [
  { id: 'monitoring', label: 'Monitoring', chipClass: 'ui-chip--stage-monitoring' },
  { id: 'active',     label: 'Active',     chipClass: 'ui-chip--stage-active' },
  { id: 'escalated',  label: 'Escalated',  chipClass: 'ui-chip--stage-escalated' },
  { id: 'closed',     label: 'Closed',     chipClass: 'ui-chip--stage-closed' },
]

function stageConfig(stage: IncidentStage) {
  return STAGES.find(s => s.id === stage) ?? STAGES[0]
}

interface NewIncidentForm {
  title: string
  summary: string
  severity: Incident['severity']
  country: string
  category: string
  assignee: string
}

const BLANK_FORM: NewIncidentForm = {
  title: '', summary: '', severity: 'medium', country: '', category: 'conflict', assignee: '',
}

export default function IncidentPanel() {
  const { handleClose, closing } = useClosePanel('incidents')
  const { togglePanel, events, selectedEvent, setNlqHighlights } = useMapStore()
  const { getActiveProject, createIncident, setIncidentStage, addIncidentNote, deleteIncident } = useProjectStore()
  const project = getActiveProject()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState<NewIncidentForm>({ ...BLANK_FORM })
  const [noteText, setNoteText] = useState('')
  const [filterStage, setFilterStage] = useState<IncidentStage | 'all'>('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const incidents = useMemo(() => (project?.incidents ?? []).slice().reverse(), [project?.incidents])

  const visible = filterStage === 'all'
    ? incidents
    : incidents.filter(i => i.stage === filterStage)

  const counts = useMemo(() => {
    const c: Record<string, number> = { monitoring: 0, active: 0, escalated: 0, closed: 0 }
    for (const i of incidents) c[i.stage] = (c[i.stage] ?? 0) + 1
    return c
  }, [incidents])

  const prefillFromEvent = (ev: IntelEvent) => {
    setForm({
      title: ev.title,
      summary: ev.summary,
      severity: ev.severity as Incident['severity'],
      country: ev.country,
      category: ev.category,
      assignee: '',
    })
    setShowNew(true)
  }

  const handleCreate = () => {
    if (!project || !form.title.trim()) return
    createIncident(project.id, {
      title: form.title,
      summary: form.summary,
      severity: form.severity,
      country: form.country,
      category: form.category,
      assignee: form.assignee || undefined,
      stage: 'monitoring',
      linkedEventIds: [],
      tags: [],
    })
    setForm({ ...BLANK_FORM })
    setShowNew(false)
  }

  const handleAddNote = (incident: Incident) => {
    if (!project || !noteText.trim()) return
    addIncidentNote(project.id, incident.id, {
      text: noteText,
      author: 'Analyst',
      timestamp: new Date().toISOString(),
    })
    setNoteText('')
  }

  const nextStage = (current: IncidentStage): IncidentStage | null => {
    const idx = STAGES.findIndex(s => s.id === current)
    return idx < STAGES.length - 1 ? STAGES[idx + 1].id : null
  }

  if (!project) return null

  const openCount = incidents.filter(i => i.stage !== 'closed').length

  return (
    <div className="ui-panel-overlay" onClick={handleClose}>
      <div className={`ui-panel-drawer panel-slide-in${closing ? ' panel-closing' : ''}`} onClick={e => e.stopPropagation()}>
        <header className="ui-panel-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div className="ui-kicker" style={{ marginBottom: 4 }}>Incidents</div>
              <div className="ui-title ui-title--panel">Incident Tracker</div>
              <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>{project.name}</p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => selectedEvent ? prefillFromEvent(selectedEvent) : setShowNew(v => !v)}
                className="ui-btn ui-btn--primary"
                style={{ fontSize: 10, padding: '5px 10px' }}
              >
                <Plus size={10} />
                {selectedEvent ? 'From event' : 'New'}
              </button>
              <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="ui-filter-row" style={{ marginBottom: 0 }}>
            <StageChip label="All" count={incidents.length} active={filterStage === 'all'} onClick={() => setFilterStage('all')} />
            {STAGES.map(s => (
              <StageChip
                key={s.id}
                label={s.label}
                count={counts[s.id] ?? 0}
                active={filterStage === s.id}
                onClick={() => setFilterStage(s.id)}
              />
            ))}
          </div>
        </header>

        {showNew && (
          <div className="ui-panel-inline-form">
            <div className="ui-section-label">New incident</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                autoFocus
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Incident title"
                className="ui-input"
                style={{ padding: '7px 10px', fontSize: 12 }}
              />
              <textarea
                value={form.summary}
                onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                placeholder="Brief summary"
                rows={2}
                className="ui-input"
                style={{ padding: '7px 10px', fontSize: 11, resize: 'none' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <select
                  value={form.severity}
                  onChange={e => setForm(f => ({ ...f, severity: e.target.value as Incident['severity'] }))}
                  className="ui-input"
                  style={{ padding: '6px 8px', fontSize: 11 }}
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input
                  value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="Country"
                  className="ui-input"
                  style={{ padding: '6px 8px', fontSize: 11 }}
                />
                <input
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="Category"
                  className="ui-input"
                  style={{ padding: '6px 8px', fontSize: 11 }}
                />
                <input
                  value={form.assignee}
                  onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                  placeholder="Assignee (optional)"
                  className="ui-input"
                  style={{ padding: '6px 8px', fontSize: 11 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowNew(false)} className="ui-btn ui-btn--ghost" style={{ fontSize: 10, padding: '5px 12px' }}>Cancel</button>
                <button type="button" onClick={handleCreate} disabled={!form.title.trim()} className="ui-btn ui-btn--primary" style={{ fontSize: 10, padding: '5px 14px' }}>
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="ui-panel-body" style={{ padding: 0 }}>
          {visible.length === 0 && (
            <div className="ui-panel-empty">
              <div className="ui-panel-empty__title">
                {filterStage === 'all' ? 'No incidents yet' : `No ${filterStage} incidents`}
              </div>
              <p className="ui-feed-hint">
                {filterStage === 'all' ? 'Create one or promote from an event.' : 'Try a different stage filter.'}
              </p>
            </div>
          )}

          {visible.map(incident => {
            const sc = stageConfig(incident.stage)
            const isOpen = expanded === incident.id
            const sevChip = `ui-chip--sev-${incident.severity}`

            return (
              <div key={incident.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : incident.id)}
                  className={`ui-incident-row${isOpen ? ' ui-incident-row--open' : ''}`}
                >
                  <div className="ui-sev-dot" style={{ background: SEV_DOT[incident.severity] ?? 'var(--text-muted)' }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span className={`ui-chip ui-chip--xs ${sc.chipClass}`}>{sc.label}</span>
                      {incident.assignee && (
                        <span className="ui-chip ui-chip--xs">{incident.assignee}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {incident.title}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {incident.country && (
                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{incident.country}</span>
                      )}
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Clock size={8} />
                        {formatDistanceToNow(new Date(incident.createdAt), { addSuffix: true })}
                      </span>
                      {incident.notes.length > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
                          <MessageSquare size={8} />
                          {incident.notes.length}
                        </span>
                      )}
                      {incident.linkedEventIds.length > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 2 }}>
                          <MapPin size={8} />
                          {incident.linkedEventIds.length}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform 150ms' }} />
                </button>

                {isOpen && (
                  <div className="ui-incident-detail">
                    {incident.summary && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 12, paddingTop: 4 }}>
                        {incident.summary}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                      <span className="ui-section-label" style={{ marginBottom: 0 }}>Move to</span>
                      {STAGES.filter(s => s.id !== incident.stage).map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => project && setIncidentStage(project.id, incident.id, s.id)}
                          className={`ui-btn ui-btn--ghost ui-chip ui-chip--xs ${s.chipClass}`}
                          style={{ fontSize: 9, padding: '3px 8px' }}
                        >
                          {s.id === nextStage(incident.stage) && <ArrowRight size={8} />}
                          {s.label}
                        </button>
                      ))}
                    </div>

                    {incident.linkedEventIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setNlqHighlights(incident.linkedEventIds, incident.title)
                          togglePanel('incidents')
                        }}
                        className="ui-btn ui-btn--ghost"
                        style={{ width: '100%', marginBottom: 12, fontSize: 10, justifyContent: 'flex-start', color: 'var(--accent)', borderColor: 'var(--badge-blue-border)', background: 'var(--accent-tint)' }}
                      >
                        <MapPin size={10} />
                        View {incident.linkedEventIds.length} linked event{incident.linkedEventIds.length !== 1 ? 's' : ''} on map
                      </button>
                    )}

                    <div className="ui-meta-grid" style={{ marginBottom: 12 }}>
                      <div>
                        <div className="ui-section-label" style={{ marginBottom: 2 }}>Category</div>
                        <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>{incident.category}</div>
                      </div>
                      <div>
                        <div className="ui-section-label" style={{ marginBottom: 2 }}>Severity</div>
                        <span className={`ui-chip ui-chip--xs ${sevChip}`}>{incident.severity}</span>
                      </div>
                      <div>
                        <div className="ui-section-label" style={{ marginBottom: 2 }}>Opened</div>
                        <div className="font-mono" style={{ fontSize: 9, color: 'var(--text-primary)' }}>{format(new Date(incident.createdAt), 'dd MMM HH:mm')}</div>
                      </div>
                      {incident.closedAt && (
                        <div>
                          <div className="ui-section-label" style={{ marginBottom: 2 }}>Closed</div>
                          <div className="font-mono" style={{ fontSize: 9, color: 'var(--text-primary)' }}>{format(new Date(incident.closedAt), 'dd MMM HH:mm')}</div>
                        </div>
                      )}
                    </div>

                    {incident.notes.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div className="ui-section-label">Notes</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {incident.notes.map(note => (
                            <div key={note.id} className="ui-callout" style={{ padding: '7px 10px' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>{note.text}</div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                                {note.author} · {formatDistanceToNow(new Date(note.timestamp), { addSuffix: true })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(incident.updates ?? []).length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div className="ui-section-label">Stage history</div>
                        <div style={{ position: 'relative', paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
                          <div style={{ position: 'absolute', left: 3, top: 4, bottom: 4, width: 1, background: 'var(--border)' }} />
                          {[...incident.updates].reverse().map((u, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingBottom: 8, position: 'relative' }}>
                              <div style={{
                                position: 'absolute', left: 0, width: 7, height: 7, borderRadius: '50%',
                                background: u.stageChange === 'closed' ? 'var(--text-muted)' : u.stageChange === 'escalated' ? 'var(--critical)' : u.stageChange === 'active' ? 'var(--high)' : 'var(--low)',
                                border: '1px solid var(--surface)', marginTop: 2,
                              }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-primary)' }}>{u.text}</div>
                                <div className="font-mono" style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{format(new Date(u.ts), 'dd MMM HH:mm')}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(incident) } }}
                        placeholder="Add a note…"
                        className="ui-input"
                        style={{ flex: 1, padding: '6px 10px', fontSize: 11 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddNote(incident)}
                        disabled={!noteText.trim()}
                        className="ui-btn ui-btn--primary"
                        style={{ fontSize: 10, padding: '5px 10px' }}
                      >
                        Add
                      </button>
                    </div>

                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                      {confirmDelete === incident.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: 'var(--critical)' }}>Delete this incident?</span>
                          <button
                            type="button"
                            onClick={() => { project && deleteIncident(project.id, incident.id); setConfirmDelete(null); setExpanded(null) }}
                            className="ui-btn ui-btn--primary"
                            style={{ fontSize: 10, padding: '3px 8px', background: 'var(--critical)', border: 'none' }}
                          >
                            Yes, delete
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(null)} className="ui-btn ui-btn--ghost" style={{ fontSize: 10, padding: '3px 8px' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(incident.id)}
                          className="ui-btn ui-btn--ghost"
                          style={{ fontSize: 9, padding: '3px 6px', color: 'var(--text-muted)' }}
                        >
                          <Trash2 size={9} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="ui-feed-footer">
          <span>{incidents.length} incident{incidents.length !== 1 ? 's' : ''} · {openCount} open</span>
          <span>{events.length} events loaded</span>
        </div>
      </div>
    </div>
  )
}

function StageChip({ label, count, active, onClick }: {
  label: string; count: number; active: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-filter-pill ui-filter-pill--accent${active ? ' ui-filter-pill--active' : ''}`}
    >
      {label} {count}
    </button>
  )
}
