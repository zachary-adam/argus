'use client'
import { useMemo, useState } from 'react'
import { BookOpen, Plus, Trash2 } from 'lucide-react'
import type { JournalEntry, PaperAnalysisRole, Project } from '@/types/project'
import type { IntelEvent } from '@/types'
import { useProjectStore } from '@/stores/projectStore'
import { useMapStore } from '@/stores/mapStore'
import { createEventPaperLink, eventPaperLinksForEvent, resolvedEventPapers } from '@/lib/eventPapers'
import { journalEntryToIntelEvent } from '@/lib/journalCanvas'
import { SegControl } from '@/components/ui/SegControl'

const ROLE_OPTIONS: { value: PaperAnalysisRole; label: string }[] = [
  { value: 'explains', label: 'Explains' },
  { value: 'context', label: 'Context' },
  { value: 'contradicts', label: 'Contradicts' },
  { value: 'method', label: 'Framework' },
  { value: 'forecast', label: 'Forecast' },
]

export function JournalEntryPaperLinks({
  project,
  entry,
  liveEvents,
}: {
  project: Project
  entry: JournalEntry
  liveEvents?: IntelEvent[]
}) {
  const pushToast = useMapStore(s => s.pushToast)
  const { attachEventPaper, updateEventPaperLink, removeEventPaperLink } = useProjectStore()

  const [paperId, setPaperId] = useState('')
  const [analysisMark, setAnalysisMark] = useState('')
  const [role, setRole] = useState<PaperAnalysisRole>('explains')
  const [expanded, setExpanded] = useState(false)

  const libraryPapers = useMemo(
    () => (project.journal ?? []).filter(e => e.kind === 'paper'),
    [project.journal],
  )

  if (entry.kind === 'event' && entry.eventId) {
    const attached = resolvedEventPapers(project, entry.eventId)
    const attach = () => {
      if (!paperId || !analysisMark.trim()) {
        pushToast({ title: 'Paper + mark required', body: 'Choose a paper and say what it contributes', severity: 'medium', type: 'system' })
        return
      }
      if (attached.some(a => a.link.paperEntryId === paperId)) {
        pushToast({ title: 'Already linked', body: 'This paper is attached to this event', severity: 'info', type: 'system' })
        return
      }
      attachEventPaper(project.id, createEventPaperLink(entry.eventId!, paperId, analysisMark, role))
      setPaperId('')
      setAnalysisMark('')
      setExpanded(false)
      pushToast({ title: 'Paper linked', body: 'Analysis mark saved for briefs', severity: 'info', type: 'system' })
    }

    return (
      <div className="ui-journal-detail-fullscreen__section">
        <div className="ui-journal-detail-fullscreen__section-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BookOpen size={13} style={{ color: 'var(--accent)' }} />
            <span className="ui-journal-detail-fullscreen__section-label">Linked papers</span>
            {attached.length > 0 && <span className="ui-chip ui-chip--xs ui-chip--accent">{attached.length}</span>}
          </div>
          <button type="button" className="ui-link" onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Cancel' : '+ Link paper'}
          </button>
        </div>

        {attached.map(({ link, paper }) => (
          <div key={link.id} className="ui-journal-paper-link-card">
            <div className="ui-journal-paper-link-card__title">{paper.title}</div>
            <textarea
              value={link.analysisMark}
              onChange={e => updateEventPaperLink(project.id, link.id, { analysisMark: e.target.value })}
              className="ui-input"
              rows={2}
              style={{ fontSize: 10, width: '100%', resize: 'vertical', marginBottom: 6 }}
            />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <SegControl size="sm" value={link.role ?? 'explains'} onChange={v => updateEventPaperLink(project.id, link.id, { role: v })} options={ROLE_OPTIONS} />
              <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 9, color: 'var(--critical)', marginLeft: 'auto' }} onClick={() => removeEventPaperLink(project.id, link.id)}>
                <Trash2 size={9} /> Remove
              </button>
            </div>
          </div>
        ))}

        {expanded && libraryPapers.length > 0 && (
          <div style={{ padding: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--surface-elevated)' }}>
            <textarea
              value={analysisMark}
              onChange={e => setAnalysisMark(e.target.value)}
              placeholder="What this paper contributes to reading this event…"
              className="ui-input"
              rows={2}
              style={{ fontSize: 10, width: '100%', marginBottom: 6 }}
            />
            <SegControl size="sm" value={role} onChange={setRole} options={ROLE_OPTIONS} />
            <select value={paperId} onChange={e => setPaperId(e.target.value)} className="ui-input" style={{ fontSize: 10, width: '100%', marginTop: 8, marginBottom: 6 }}>
              <option value="">Choose saved paper…</option>
              {libraryPapers.map(p => (
                <option key={p.id} value={p.id}>{p.title.slice(0, 80)}</option>
              ))}
            </select>
            <button type="button" className="ui-btn ui-btn--primary" style={{ fontSize: 10 }} onClick={attach} disabled={!paperId || !analysisMark.trim()}>
              <Plus size={10} /> Attach
            </button>
          </div>
        )}
        {expanded && libraryPapers.length === 0 && (
          <p className="ui-feed-hint" style={{ lineHeight: 1.5 }}>Save papers to the library first, then link them here.</p>
        )}
      </div>
    )
  }

  if (entry.kind === 'paper') {
    const links = (project.eventPaperLinks ?? []).filter(l => l.paperEntryId === entry.id)
    if (links.length === 0) return null
    return (
      <div style={{ marginBottom: 12 }}>
        <div className="ui-section-label" style={{ marginBottom: 6 }}>Linked events</div>
        {links.map(link => {
          const ev = journalEntryToIntelEvent(
            (project.journal ?? []).find(e => e.kind === 'event' && e.eventId === link.eventId) ?? {
              id: link.eventId,
              kind: 'event',
              eventId: link.eventId,
              title: link.eventId,
              savedAt: link.attachedAt,
              updatedAt: link.attachedAt,
            },
            liveEvents,
          )
          const title = ev?.title ?? link.eventId
          return (
            <div key={link.id} style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.5 }}>
              <strong>{title.slice(0, 70)}{title.length > 70 ? '…' : ''}</strong>
              {link.role ? ` · ${link.role}` : ''}
              {link.analysisMark ? ` — ${link.analysisMark.slice(0, 120)}` : ''}
            </div>
          )
        })}
      </div>
    )
  }

  return null
}

/** Paper links for an event id without a full journal entry context. */
export function eventPaperLinkCount(project: Project, eventId: string): number {
  return eventPaperLinksForEvent(project, eventId).length
}
