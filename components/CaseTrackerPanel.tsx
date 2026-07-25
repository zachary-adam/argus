'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { SituationCase, CaseStatus } from '@/types/project'
import { X, Plus, Trash2, FileText, Clock, FolderSearch, BarChart2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { addCaseEventsToCanvas, canvasEventIds, isEventOnCanvas } from '@/lib/canvasEvents'

const STATUS_CFG: Record<CaseStatus, { label: string; chipClass: string }> = {
  active:     { label: 'Active',     chipClass: 'ui-chip--stage-active' },
  monitoring: { label: 'Monitoring', chipClass: 'ui-chip--stage-monitoring' },
  closed:     { label: 'Closed',     chipClass: 'ui-chip--stage-closed' },
}

interface NewCaseForm {
  name: string
  researchQuestion: string
  description: string
  status: CaseStatus
}

const BLANK: NewCaseForm = { name: '', researchQuestion: '', description: '', status: 'active' }

export default function CaseTrackerPanel() {
  const { handleClose, closing } = useClosePanel('cases')
  const { events, setSelectedEvent, togglePanel, pushToast } = useMapStore()
  const { getActiveProject, createCase, updateCase, deleteCase, removeEventFromCase, addCanvasNode, addEvents } = useProjectStore()
  const project = getActiveProject()
  const onCanvasIds = useMemo(() => canvasEventIds(project), [project])

  const [selected, setSelected] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState<NewCaseForm>({ ...BLANK })
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSaved, setNoteSaved] = useState(true)
  const [filterStatus, setFilterStatus] = useState<CaseStatus | 'all'>('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const noteDraftRef = useRef('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const activeCaseIdRef = useRef<string | null>(null)

  const cases = useMemo(() => (project?.cases ?? []).slice().reverse(), [project?.cases])
  const visible = filterStatus === 'all' ? cases : cases.filter(c => c.status === filterStatus)

  const activeCase = cases.find(c => c.id === selected) ?? null

  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, monitoring: 0, closed: 0, all: cases.length }
    for (const sc of cases) c[sc.status] = (c[sc.status] ?? 0) + 1
    return c
  }, [cases])

  const caseEvents = useMemo(() => {
    if (!activeCase) return []
    return activeCase.eventIds
      .map(id => events.find(e => e.id === id))
      .filter(Boolean) as typeof events
  }, [activeCase, events])

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!project || !form.name.trim()) return
    const sc = createCase(project.id, {
      name: form.name.trim(),
      researchQuestion: form.researchQuestion.trim() || undefined,
      description: form.description.trim() || undefined,
      status: form.status,
    })
    setSelected(sc.id)
    setShowNew(false)
    setForm({ ...BLANK })
  }

  const persistNotes = useCallback((caseId: string, notes: string) => {
    if (!project) return
    updateCase(project.id, caseId, { notes })
    setNoteSaved(true)
  }, [project, updateCase])

  const flushNotes = useCallback((caseId?: string | null, notes?: string) => {
    const id = caseId ?? activeCaseIdRef.current
    if (!id) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
    persistNotes(id, notes ?? noteDraftRef.current)
  }, [persistNotes])

  const scheduleNotesSave = useCallback((notes: string) => {
    if (!activeCaseIdRef.current) return
    setNoteSaved(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined
      if (activeCaseIdRef.current) persistNotes(activeCaseIdRef.current, notes)
    }, 400)
  }, [persistNotes])

  useEffect(() => {
    noteDraftRef.current = noteDraft
  }, [noteDraft])

  useEffect(() => {
    activeCaseIdRef.current = activeCase?.id ?? null
    if (activeCase) {
      setNoteDraft(activeCase.notes ?? '')
      setNoteSaved(true)
    }
  }, [activeCase?.id]) // only when switching cases — not on every save

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const id = activeCaseIdRef.current
    if (project && id) persistNotes(id, noteDraftRef.current)
  }, [project, persistNotes])

  function selectCase(sc: SituationCase | null) {
    const currentId = activeCaseIdRef.current
    if (currentId) {
      const current = cases.find(c => c.id === currentId)
      if (noteDraftRef.current !== (current?.notes ?? '')) {
        flushNotes(currentId)
      }
    }
    setSelected(sc?.id ?? null)
    if (sc) {
      setNoteDraft(sc.notes ?? '')
      setNoteSaved(true)
    }
  }

  function handleAddCaseToCanvas(sc: SituationCase) {
    addCaseEventsToCanvas(project, sc, addCanvasNode, {
      openCanvas: true,
      onOpenCanvas: () => togglePanel('canvas'),
      liveEvents: events,
      addEvents,
      onResult: (r) => {
        if (r.status === 'no-events') {
          pushToast({ title: 'No events in case', body: sc.name, severity: 'info', type: 'system' })
        } else if (r.status === 'already') {
          pushToast({ title: 'Case already on canvas', body: `${r.total} events linked`, severity: 'info', type: 'system' })
        } else if (r.status === 'added') {
          const body = r.skipped > 0
            ? `Added ${r.added} · ${r.skipped} already on canvas`
            : `Added ${r.added} event${r.added !== 1 ? 's' : ''}`
          pushToast({ title: 'Case added to canvas', body, severity: 'info', type: 'system' })
        }
      },
    })
  }

  if (!project) return null

  return (
    <div className="ui-panel-overlay" onClick={handleClose}>
      <div
        className={`ui-panel-drawer panel-slide-in${closing ? ' panel-closing' : ''}`}
        style={{ width: 480, maxWidth: '95vw' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="ui-panel-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--accent-tint)', border: '1px solid var(--badge-blue-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FolderSearch size={15} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <div className="ui-kicker" style={{ marginBottom: 4 }}>Cases</div>
                <div className="ui-title ui-title--panel">Case Tracker</div>
                <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>
                  Name a thread and attach events — send the lot to the canvas when ready
                </p>
              </div>
            </div>
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>

          <div className="ui-panel-tabs ui-feed-tabs">
            {(['all', 'active', 'monitoring', 'closed'] as const).map(st => (
              <button
                key={st}
                type="button"
                className={`ui-feed-tab${filterStatus === st ? ' ui-feed-tab--active' : ''}`}
                onClick={() => setFilterStatus(st)}
              >
                {st === 'all' ? `All (${counts.all})` : `${STATUS_CFG[st as CaseStatus]?.label ?? st}${counts[st] > 0 ? ` (${counts[st]})` : ''}`}
              </button>
            ))}
          </div>
        </header>

        {showNew ? (
          <form onSubmit={handleCreate} className="ui-panel-inline-form">
            <div className="ui-section-label">New case</div>
            <input
              autoFocus
              required
              placeholder="Case name *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="ui-input"
              style={{ marginBottom: 6, padding: '7px 10px', fontSize: 11 }}
            />
            <textarea
              placeholder="Research question (optional)"
              value={form.researchQuestion}
              onChange={e => setForm(f => ({ ...f, researchQuestion: e.target.value }))}
              rows={2}
              className="ui-input"
              style={{ marginBottom: 6, padding: '7px 10px', fontSize: 11, resize: 'none' }}
            />
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as CaseStatus }))}
              className="ui-input"
              style={{ marginBottom: 8, padding: '6px 8px', fontSize: 11 }}
            >
              <option value="active">Active</option>
              <option value="monitoring">Monitoring</option>
              <option value="closed">Closed</option>
            </select>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" className="ui-btn ui-btn--primary" style={{ flex: 1, fontSize: 11, padding: '6px 0' }}>
                Create case
              </button>
              <button type="button" onClick={() => { setShowNew(false); setForm({ ...BLANK }) }} className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '6px 10px' }}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="ui-btn ui-btn--ghost"
            style={{ width: '100%', padding: '10px 16px', borderRadius: 0, borderBottom: '1px solid var(--border)', justifyContent: 'flex-start', color: 'var(--accent)', fontWeight: 700, fontSize: 11 }}
          >
            <Plus size={11} /> New case
          </button>
        )}

        <div className="ui-panel-body" style={{ padding: 0, flex: activeCase ? undefined : 1 }}>
          {visible.length === 0 && (
            <div className="ui-panel-empty">
              <FolderSearch size={24} className="ui-panel-empty__icon" />
              <div className="ui-panel-empty__title">
                {filterStatus === 'all' ? 'No cases yet' : `No ${STATUS_CFG[filterStatus as CaseStatus]?.label?.toLowerCase() ?? filterStatus} cases`}
              </div>
              <p className="ui-feed-hint">
                {filterStatus === 'all'
                  ? 'Create a case to group related events into named investigations.'
                  : 'Switch to All to see cases with a different status.'}
              </p>
            </div>
          )}

          {visible.map(sc => {
            const cfg = STATUS_CFG[sc.status]
            const isSelected = sc.id === selected
            const onCanvasCount = sc.eventIds.filter(id => onCanvasIds.has(id)).length
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => selectCase(isSelected ? null : sc)}
                className={`ui-incident-row${isSelected ? ' ui-incident-row--open' : ''}`}
              >
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span className={`ui-chip ui-chip--xs ${cfg.chipClass}`}>{cfg.label}</span>
                    <span className="ui-chip ui-chip--xs">{sc.eventIds.length} event{sc.eventIds.length !== 1 ? 's' : ''}</span>
                    {onCanvasCount > 0 && (
                      <span title={`${onCanvasCount} on analyst canvas`} className="ui-chip ui-chip--xs ui-chip--accent">
                        canvas {onCanvasCount === sc.eventIds.length ? '✓' : `${onCanvasCount}/${sc.eventIds.length}`}
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={8} />
                      {formatDistanceToNow(new Date(sc.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{sc.name}</div>
                  {sc.researchQuestion && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{sc.researchQuestion}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {activeCase && (
          <div style={{ borderTop: '2px solid var(--border)', flexShrink: 0, maxHeight: '50%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <FileText size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeCase.name}
              </span>
              <select
                value={activeCase.status}
                onClick={e => e.stopPropagation()}
                onChange={e => { if (project) updateCase(project.id, activeCase.id, { status: e.target.value as CaseStatus }) }}
                className={`ui-input ui-chip ui-chip--xs ${STATUS_CFG[activeCase.status].chipClass}`}
                style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', width: 'auto' }}
              >
                <option value="active">Active</option>
                <option value="monitoring">Monitoring</option>
                <option value="closed">Closed</option>
              </select>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); handleAddCaseToCanvas(activeCase) }}
                className="ui-btn ui-btn--ghost"
                style={{ padding: '2px 8px', fontSize: 9, gap: 4, color: 'var(--accent)' }}
                title={activeCase.eventIds.length === 0 ? 'Add events to this case first' : 'Add case events to analyst canvas'}
                disabled={activeCase.eventIds.length === 0}
              >
                <BarChart2 size={10} />
                {activeCase.eventIds.every(id => onCanvasIds.has(id)) && activeCase.eventIds.length > 0 ? 'Canvas' : 'To canvas'}
              </button>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  if (confirmDelete === activeCase.id) {
                    if (project) { deleteCase(project.id, activeCase.id); setSelected(null) }
                    setConfirmDelete(null)
                  } else {
                    setConfirmDelete(activeCase.id)
                    setTimeout(() => setConfirmDelete(null), 2500)
                  }
                }}
                className={`ui-btn ui-btn--ghost${confirmDelete === activeCase.id ? ' ui-nav-btn--danger' : ''}`}
                style={{ padding: confirmDelete === activeCase.id ? '2px 6px' : 4, fontSize: 9 }}
              >
                {confirmDelete === activeCase.id ? 'DEL?' : <Trash2 size={11} />}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {caseEvents.length > 0 ? (
                <div>
                  <div className="ui-section-label" style={{ padding: '8px 16px', marginBottom: 0, background: 'var(--surface-elevated)', borderBottom: '1px solid var(--border)' }}>
                    Events ({caseEvents.length})
                  </div>
                  {caseEvents.map(ev => (
                    <div key={ev.id} className="ui-related-row" style={{ margin: '0 12px 6px', width: 'calc(100% - 24px)' }}>
                      <span className={`ui-chip ui-chip--xs ui-chip--sev-${ev.severity}`} style={{ flexShrink: 0 }}>{ev.severity}</span>
                      {isEventOnCanvas(project, ev.id) && (
                        <span title="On analyst canvas" className="ui-chip ui-chip--xs ui-chip--accent" style={{ flexShrink: 0 }}>canvas</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(ev)}
                        className="ui-link"
                        style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: 0, fontSize: 11, lineHeight: 1.4, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)' }}
                      >
                        {ev.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (project) removeEventFromCase(project.id, activeCase.id, ev.id) }}
                        className="ui-btn ui-btn--ghost"
                        style={{ padding: 2, minWidth: 0 }}
                        title="Remove from case"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ui-callout" style={{ margin: 12, fontSize: 10 }}>
                  No events linked. Open an event and use the <strong>Case</strong> action to add it here.
                </div>
              )}

              <div style={{ padding: '8px 16px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div className="ui-section-label" style={{ marginBottom: 0 }}>Notes</div>
                  <span style={{ fontSize: 9, color: noteSaved ? 'var(--text-muted)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                    {noteSaved ? 'saved' : 'saving…'}
                  </span>
                </div>
                <textarea
                  value={noteDraft}
                  onChange={e => {
                    const next = e.target.value
                    setNoteDraft(next)
                    scheduleNotesSave(next)
                  }}
                  onBlur={() => flushNotes()}
                  onKeyDown={e => e.stopPropagation()}
                  placeholder="Research notes, findings, hypotheses…"
                  rows={4}
                  className="ui-input"
                  style={{ fontSize: 11, padding: '7px 8px', resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="ui-feed-footer">
          <span>{cases.length} case{cases.length !== 1 ? 's' : ''}</span>
          <span>{cases.reduce((n, c) => n + c.eventIds.length, 0)} linked events</span>
        </div>
      </div>
    </div>
  )
}
