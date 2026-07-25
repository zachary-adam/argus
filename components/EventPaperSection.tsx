'use client'
import { useMemo, useState } from 'react'
import { BookOpen, Plus, Trash2, Loader2, Search } from 'lucide-react'
import { searchPapersFromApi } from '@/lib/fetchPapers'
import type { IntelEvent } from '@/types'
import type { PaperAnalysisRole, Project } from '@/types/project'
import { useProjectStore } from '@/stores/projectStore'
import { useMapStore } from '@/stores/mapStore'
import { journalEntryFromPaper, type PaperInput } from '@/lib/journal'
import { createEventPaperLink, resolvedEventPapers } from '@/lib/eventPapers'
import { SegControl } from '@/components/ui/SegControl'

const ROLE_OPTIONS: { value: PaperAnalysisRole; label: string }[] = [
  { value: 'explains', label: 'Explains' },
  { value: 'context', label: 'Context' },
  { value: 'contradicts', label: 'Contradicts' },
  { value: 'method', label: 'Framework' },
  { value: 'forecast', label: 'Forecast' },
]

const ROLE_HINTS: Record<PaperAnalysisRole, string> = {
  explains: 'Why this happened or what it means',
  context: 'Background — not the main argument',
  contradicts: 'Pushes back on the reporting line',
  method: 'Theory or framework you are applying',
  forecast: 'What to watch for next',
}

interface Props {
  project: Project
  event: IntelEvent
}

export default function EventPaperSection({ project, event }: Props) {
  const pushToast = useMapStore(s => s.pushToast)
  const { addJournalEntry, attachEventPaper, updateEventPaperLink, removeEventPaperLink } = useProjectStore()

  const attached = useMemo(() => resolvedEventPapers(project, event.id), [project, event.id])
  const libraryPapers = useMemo(
    () => (project.journal ?? []).filter(e => e.kind === 'paper'),
    [project.journal],
  )

  const [expanded, setExpanded] = useState(false)
  const [paperId, setPaperId] = useState('')
  const [analysisMark, setAnalysisMark] = useState('')
  const [role, setRole] = useState<PaperAnalysisRole>('explains')
  const [searchQ, setSearchQ] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<PaperInput[]>([])

  const [searchError, setSearchError] = useState<string | null>(null)

  const searchPapers = async () => {
    const q = searchQ.trim()
    if (q.length < 2) return
    setSearchLoading(true)
    setSearchError(null)
    const data = await searchPapersFromApi({ q })
    setSearchResults(data.papers)
    if (data.papers.length === 0) setSearchError(data.error ?? 'No papers found')
    setSearchLoading(false)
  }

  const saveAndAttach = (paperEntryId: string) => {
    if (!analysisMark.trim()) {
      pushToast({ title: 'Note required', body: 'Say how this paper helps read this event', severity: 'medium', type: 'system' })
      return
    }
    if (attached.some(a => a.link.paperEntryId === paperEntryId)) {
      pushToast({ title: 'Already linked', body: 'This paper is attached to this event', severity: 'info', type: 'system' })
      return
    }
    attachEventPaper(project.id, createEventPaperLink(event.id, paperEntryId, analysisMark, role))
    setAnalysisMark('')
    setPaperId('')
    setSearchQ('')
    setSearchResults([])
    setExpanded(false)
    pushToast({ title: 'Paper linked', body: 'Saved — will be included in AI briefs', severity: 'info', type: 'system' })
  }

  const attachFromLibrary = () => {
    if (!paperId) return
    saveAndAttach(paperId)
  }

  const attachNewPaper = (paper: PaperInput) => {
    const existing = libraryPapers.find(p => p.title.toLowerCase() === paper.title.toLowerCase())
    if (existing) {
      saveAndAttach(existing.id)
      return
    }
    const entry = journalEntryFromPaper(paper, { significance: 'supporting' })
    addJournalEntry(project.id, entry)
    saveAndAttach(entry.id)
  }

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BookOpen size={11} style={{ color: 'var(--accent)' }} />
          <span className="ui-section-label" style={{ marginBottom: 0 }}>Research papers</span>
          {attached.length > 0 && (
            <span className="ui-chip ui-chip--xs ui-chip--accent">{attached.length}</span>
          )}
        </div>
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          style={{ fontSize: 10, padding: '2px 8px' }}
          onClick={() => setExpanded(v => !v)}
        >
          <Plus size={10} /> Link paper
        </button>
      </div>

      <p className="ui-feed-hint" style={{ marginBottom: attached.length ? 8 : 0, lineHeight: 1.55 }}>
        Link a paper to this event and note how it helps you read the story. Saved with your project and included when you generate AI briefs.
      </p>
      {attached.length > 0 && (
        <p style={{ fontSize: 10, color: 'var(--accent)', margin: '0 0 10px', lineHeight: 1.45 }}>
          {attached.length} paper{attached.length === 1 ? '' : 's'} linked — used in AI briefs and workspace context
        </p>
      )}

      {attached.map(({ link, paper }) => (
        <div
          key={link.id}
          style={{
            marginBottom: 8,
            padding: '8px 10px',
            background: 'var(--surface-elevated)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 4 }}>
            {paper.title}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
            {(paper.authors ?? []).slice(0, 2).join(', ')}{paper.year ? ` · ${paper.year}` : ''}
            {link.role ? ` · ${link.role}` : ''}
          </div>
          <textarea
            value={link.analysisMark}
            onChange={e => updateEventPaperLink(project.id, link.id, { analysisMark: e.target.value })}
            className="ui-input"
            rows={2}
            style={{ fontSize: 10, width: '100%', resize: 'vertical', marginBottom: 6 }}
            placeholder="What this paper contributes to reading this event…"
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <SegControl<PaperAnalysisRole>
              size="sm"
              value={link.role ?? 'explains'}
              onChange={v => updateEventPaperLink(project.id, link.id, { role: v })}
              options={ROLE_OPTIONS}
            />
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              style={{ fontSize: 9, color: 'var(--critical)', marginLeft: 'auto' }}
              onClick={() => removeEventPaperLink(project.id, link.id)}
            >
              <Trash2 size={9} /> Remove
            </button>
          </div>
        </div>
      ))}

      {expanded && (
        <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div className="ui-section-label" style={{ marginBottom: 4 }}>Your note</div>
          <textarea
            value={analysisMark}
            onChange={e => setAnalysisMark(e.target.value)}
            className="ui-input"
            rows={2}
            style={{ fontSize: 10, width: '100%', resize: 'vertical', marginBottom: 8 }}
            placeholder="e.g. Smith (2024) explains audience-cost escalation after border incidents — use for H2"
          />
          <SegControl<PaperAnalysisRole>
            size="sm"
            value={role}
            onChange={setRole}
            options={ROLE_OPTIONS}
          />
          <p className="ui-feed-hint" style={{ margin: '6px 0 0', fontSize: 9 }}>{ROLE_HINTS[role]}</p>

          {libraryPapers.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="ui-section-label" style={{ marginBottom: 4 }}>From your library</div>
              <select
                value={paperId}
                onChange={e => setPaperId(e.target.value)}
                className="ui-input"
                style={{ fontSize: 10, width: '100%', marginBottom: 6 }}
              >
                <option value="">Choose saved paper…</option>
                {libraryPapers.map(p => (
                  <option key={p.id} value={p.id}>{p.title.slice(0, 80)}</option>
                ))}
              </select>
              <button type="button" className="ui-btn ui-btn--primary" style={{ fontSize: 10 }} onClick={attachFromLibrary} disabled={!paperId || !analysisMark.trim()}>
                Attach from library
              </button>
            </div>
          )}

          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div className="ui-section-label" style={{ marginBottom: 4 }}>Search & save new paper</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Keywords or DOI…"
                className="ui-input"
                style={{ fontSize: 10, flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter') void searchPapers() }}
              />
              <button type="button" className="ui-btn ui-btn--primary" style={{ fontSize: 10 }} onClick={() => void searchPapers()} disabled={searchLoading || searchQ.trim().length < 2}>
                {searchLoading ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={11} />}
              </button>
            </div>
            {searchError && <p className="ui-feed-hint" style={{ color: 'var(--warning)', marginBottom: 6 }}>{searchError}</p>}
            {searchResults.slice(0, 5).map(p => (
              <button
                key={p.id ?? p.title}
                type="button"
                className="ui-btn ui-btn--ghost"
                style={{ fontSize: 10, width: '100%', justifyContent: 'flex-start', textAlign: 'left', marginBottom: 4 }}
                disabled={!analysisMark.trim()}
                onClick={() => attachNewPaper(p)}
              >
                + {p.title.slice(0, 70)}{p.title.length > 70 ? '…' : ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
