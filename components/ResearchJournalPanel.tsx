'use client'
import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '@/stores/projectStore'
import { X, Trash2, ExternalLink, FileDown, Plus, Search, Sparkles, Loader2, GitBranch, MoreHorizontal, Rss, BookMarked, ChevronLeft, BarChart2 } from 'lucide-react'
import { searchPapersFromApi } from '@/lib/fetchPapers'
import { formatDistanceToNow } from 'date-fns'
import { useActiveProject } from '@/lib/hooks/useActiveProject'
import { useDebouncedDraft } from '@/lib/hooks/useDebouncedDraft'
import {
  journalToMarkdown,
  isEventInJournal,
  journalEntryFromNote,
  journalEntryFromPaper,
  buildPaperSearchQuery,
  groupJournalByWeek,
  journalMemoMarkdown,
  hypothesisRevisionFromInput,
  toggleJournalLink,
  linkedJournalEntries,
  type PaperInput,
} from '@/lib/journal'
import { intelEventFromJournalEntry } from '@/lib/journalView'
import { addJournalEntryToCanvas } from '@/lib/journalCanvas'
import { isJournalEntryOnCanvas } from '@/lib/canvasEvents'
import { JournalEntryPaperLinks } from '@/components/JournalEntryPaperLinks'
import { buildAiFetchHeaders } from '@/lib/aiConfig'
import { loadAnalysisEngine } from '@/lib/aiMode'
import type { BriefEvidenceMode, JournalEntry, JournalEntryKind, HypothesisRevision, JournalSignificance } from '@/types/project'
import { SegControl } from '@/components/ui/SegControl'
import PatternsSection from '@/components/PatternsSection'
import { looksLikeDoi } from '@/lib/papersClient'
import { IS_CLOUD_MODE } from '@/lib/supabase/config'

const SIG_LABEL: Record<string, string> = {
  key: 'Key evidence',
  supporting: 'Supporting',
  background: 'Background',
}

const KIND_LABEL: Record<JournalEntryKind, string> = {
  event: 'Event',
  paper: 'Paper',
  note: 'Note',
}

const BRIEF_EVIDENCE_LABEL: Record<BriefEvidenceMode, string> = {
  live: 'Live feed',
  curated: 'Journal only',
  blended: 'Journal + live',
}

export default function ResearchJournalPanel() {
  const focusWorkbench = useMapStore(s => s.focusWorkbench)
  const { setSelectedEvent, pushToast, setAddSourceOpen, togglePanel, events: liveEvents, journalTab, openJournal } = useMapStore(useShallow(s => ({
    setSelectedEvent: s.setSelectedEvent, pushToast: s.pushToast, setAddSourceOpen: s.setAddSourceOpen,
    togglePanel: s.togglePanel, events: s.events, journalTab: s.journalTab, openJournal: s.openJournal,
  })))
  const {
    addJournalEntry,
    updateJournalEntry,
    removeJournalEntry,
    addHypothesisRevision,
    removeHypothesisRevision,
    updateProject,
    addCanvasNode,
    addEvents,
    updateEvent,
  } = useProjectStore()
  const project = useActiveProject()

  const view = journalTab

  const [filter, setFilter] = useState<'all' | JournalEntryKind>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [search, setSearch] = useState('')
  const [addTab, setAddTab] = useState<'search' | 'doi' | 'note'>('search')
  const [addExpanded, setAddExpanded] = useState(false)
  const [paperQuery, setPaperQuery] = useState('')
  const [paperResults, setPaperResults] = useState<PaperInput[]>([])
  const [paperLoading, setPaperLoading] = useState(false)
  const [paperError, setPaperError] = useState<string | null>(null)
  const [paperSort, setPaperSort] = useState<'relevance' | 'citations' | 'year'>('relevance')
  const [doiInput, setDoiInput] = useState('')
  const [doiLoading, setDoiLoading] = useState(false)
  const paperTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [layout] = useState<'list' | 'timeline'>('list')
  const [hyStatement, setHyStatement] = useState('')
  const [hyRationale, setHyRationale] = useState('')
  const [hyConfidence, setHyConfidence] = useState<HypothesisRevision['confidence']>('moderate')
  const [showHyForm, setShowHyForm] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [assessing, setAssessing] = useState(false)
  const [assessResult, setAssessResult] = useState<{
    score: number
    suggestedSignificance: JournalSignificance
    missionFit: string
    summary: string
    aiEnhanced?: boolean
  } | null>(null)
  const [linksExpanded, setLinksExpanded] = useState(false)
  const [researchCloudOk, setResearchCloudOk] = useState(true)

  useEffect(() => {
    if (!IS_CLOUD_MODE) return
    fetch('/api/cloud/schema')
      .then(r => r.ok ? r.json() : null)
      .then((d: { missing?: string[] } | null) => {
        if (d?.missing) setResearchCloudOk(!d.missing.includes('research_journal'))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setAssessResult(null)
    setLinksExpanded(false)
  }, [selectedId, view])

  useEffect(() => {
    if (!selectedId || view !== 'entries') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedId, view])

  const entries = useMemo(() => {
    const list = [...(project?.journal ?? [])].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    const q = search.trim().toLowerCase()
    return list.filter(e => {
      if (filter !== 'all' && e.kind !== filter) return false
      if (!q) return true
      return `${e.title} ${e.summary ?? ''} ${e.note ?? ''} ${e.country ?? ''}`.toLowerCase().includes(q)
    })
  }, [project?.journal, filter, search])

  const sortedPaperResults = useMemo(() => {
    if (paperSort === 'relevance') return paperResults
    const r = [...paperResults]
    if (paperSort === 'citations') r.sort((a, b) => (b.citations ?? 0) - (a.citations ?? 0))
    else r.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    return r
  }, [paperResults, paperSort])

  const weekGroups = useMemo(() => groupJournalByWeek(entries), [entries])

  const savedPaperTitles = useMemo(
    () => new Set((project?.journal ?? []).filter(e => e.kind === 'paper').map(e => e.title.toLowerCase())),
    [project?.journal],
  )

  const hypotheses = useMemo(
    () => [...(project?.hypothesisLog ?? [])].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [project?.hypothesisLog],
  )

  const selectedEntry = view === 'entries' && selectedId
    ? entries.find(e => e.id === selectedId) ?? null
    : null
  const selectedEntryIdRef = useRef<string | null>(null)
  selectedEntryIdRef.current = selectedEntry?.id ?? null

  const { saved: noteSaved, schedule: scheduleNoteSave, flush: flushNoteSave, valueRef: noteValueRef } = useDebouncedDraft(
    useCallback((note: string) => {
      const id = selectedEntryIdRef.current
      if (!project || !id) return
      updateJournalEntry(project.id, id, { note: note || undefined })
    }, [project, updateJournalEntry]),
    { trim: true },
  )

  function openJournalEntry(id: string, note = '') {
    flushNoteSave()
    setSelectedId(id)
    setNoteDraft(note)
    noteValueRef.current = note
  }

  useEffect(() => {
    if (selectedEntry) {
      setNoteDraft(selectedEntry.note ?? '')
      noteValueRef.current = selectedEntry.note ?? ''
    }
  }, [selectedEntry?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const selectedHy = view === 'hypotheses' && selectedId
    ? hypotheses.find(h => h.id === selectedId) ?? null
    : null

  const entryOnCanvas = useMemo(() => {
    if (!project || !selectedEntry) return false
    return isJournalEntryOnCanvas(project, selectedEntry)
  }, [project, selectedEntry])

  const briefEvidenceMode = project?.briefEvidenceMode ?? 'blended'

  const counts = useMemo(() => {
    const j = project?.journal ?? []
    return {
      all: j.length,
      event: j.filter(e => e.kind === 'event').length,
      paper: j.filter(e => e.kind === 'paper').length,
      note: j.filter(e => e.kind === 'note').length,
    }
  }, [project?.journal])

  const openEvent = (entry: JournalEntry) => {
    if (entry.kind !== 'event' || !entry.eventId) return
    const live = useMapStore.getState().events
    const ev = live.find(e => e.id === entry.eventId) ?? intelEventFromJournalEntry(entry)
    if (ev) setSelectedEvent(ev)
    else pushToast({ title: 'Event not in live feed', body: 'Saved snapshot remains in journal', severity: 'info', type: 'system' })
  }

  const toggleLink = (targetId: string) => {
    if (!project || !selectedEntry) return
    updateJournalEntry(project.id, selectedEntry.id, {
      linkedEntryIds: toggleJournalLink(selectedEntry, targetId),
    })
  }

  const setSignificance = (significance: JournalSignificance) => {
    if (!project || !selectedEntry) return
    updateJournalEntry(project.id, selectedEntry.id, { significance })
  }

  const saveNote = () => {
    flushNoteSave()
    pushToast({ title: 'Journal updated', body: 'Analyst note saved', severity: 'info', type: 'system' })
  }

  const runAssess = async () => {
    if (!project || !selectedEntry) return
    setAssessing(true)
    setAssessResult(null)
    try {
      const engine = loadAnalysisEngine(project.aiMode)
      const res = await fetch('/api/journal/assess', {
        method: 'POST',
        headers: buildAiFetchHeaders('brief', engine, project),
        body: JSON.stringify({
          entry: selectedEntry,
          researchQuestion: project.researchQuestion,
          hypothesis: hypotheses[0]?.statement,
          targeting: project.targeting,
          countryCodes: project.countryCodes,
          apiKey: project.aiMode === 'byok' ? project.byokApiKey : undefined,
        }),
      })
      if (!res.ok) {
        pushToast({ title: 'Assessment failed', body: 'Could not score this entry', severity: 'medium', type: 'system' })
        return
      }
      const data = await res.json() as {
        score: number
        suggestedSignificance: JournalSignificance
        missionFit: string
        summary: string
        aiEnhanced?: boolean
      }
      setAssessResult(data)
    } catch {
      pushToast({ title: 'Assessment failed', body: 'Network error', severity: 'medium', type: 'system' })
    } finally {
      setAssessing(false)
    }
  }

  const applyAssessSignificance = () => {
    if (!project || !selectedEntry || !assessResult) return
    updateJournalEntry(project.id, selectedEntry.id, { significance: assessResult.suggestedSignificance })
    pushToast({
      title: 'Significance updated',
      body: `Set to ${SIG_LABEL[assessResult.suggestedSignificance] ?? assessResult.suggestedSignificance}`,
      severity: 'info',
      type: 'system',
    })
  }

  const sendToCanvas = () => {
    if (!project || !selectedEntry) return
    const result = addJournalEntryToCanvas(project, selectedEntry, addCanvasNode, {
      liveEvents,
      openCanvas: true,
      onOpenCanvas: () => togglePanel('canvas'),
      addEvents,
      updateEvent,
    })
    if (result === 'already') {
      pushToast({ title: 'Already on canvas', body: selectedEntry.title.slice(0, 80), severity: 'info', type: 'system' })
    } else if (result === 'added') {
      pushToast({ title: 'Added to canvas', body: selectedEntry.title.slice(0, 80), severity: 'info', type: 'system' })
    } else {
      pushToast({ title: 'Could not add', body: 'Entry type not supported on canvas', severity: 'medium', type: 'system' })
    }
  }

  const setBriefEvidenceMode = (mode: BriefEvidenceMode) => {
    if (!project) return
    updateProject(project.id, { briefEvidenceMode: mode })
    pushToast({
      title: 'Brief evidence updated',
      body: `AI briefs will use ${BRIEF_EVIDENCE_LABEL[mode].toLowerCase()} for [E#] events`,
      severity: 'info',
      type: 'system',
    })
  }

  const addFieldNote = () => {
    if (!project || !noteBody.trim()) return
    addJournalEntry(project.id, journalEntryFromNote(noteTitle, noteBody))
    setNoteTitle('')
    setNoteBody('')
    setShowNoteForm(false)
    setAddExpanded(false)
    pushToast({ title: 'Field note added', body: 'Saved to research journal', severity: 'info', type: 'system' })
  }

  const exportMd = () => {
    if (!project) return
    const blob = new Blob([journalToMarkdown(project)], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ARGUS-journal-${project.name.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
  }

  const exportMemo = () => {
    if (!project) return
    const blob = new Blob([journalMemoMarkdown(project)], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ARGUS-memo-${project.name.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    pushToast({ title: 'Memo exported', body: 'Key evidence + hypothesis trail — no AI synthesis', severity: 'info', type: 'system' })
  }

  const saveHypothesis = () => {
    if (!project || !hyStatement.trim()) return
    const prev = hypotheses[0]
    const keyIds = (project.journal ?? [])
      .filter(e => e.significance === 'key')
      .map(e => e.id)
    const linkedJournalIds = selectedEntry && !keyIds.includes(selectedEntry.id)
      ? [...keyIds, selectedEntry.id]
      : keyIds
    addHypothesisRevision(project.id, hypothesisRevisionFromInput(hyStatement, {
      confidence: hyConfidence,
      rationale: hyRationale,
      supersedesId: prev?.id,
      linkedJournalIds: linkedJournalIds.length ? linkedJournalIds : undefined,
    }))
    setHyStatement('')
    setHyRationale('')
    setShowHyForm(false)
    pushToast({ title: 'Hypothesis recorded', body: prev ? 'Revision linked to prior view' : 'First entry in revision log', severity: 'info', type: 'system' })
  }

  const saveSuggestedPaper = (paper: PaperInput) => {
    if (!project) return
    addJournalEntry(project.id, journalEntryFromPaper(paper, { significance: 'supporting' }))
    pushToast({ title: 'Paper saved', body: paper.doi ? `DOI ${paper.doi}` : 'Added to research library', severity: 'info', type: 'system' })
    setAddExpanded(false)
  }

  const runPaperSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setPaperResults([])
      setPaperError(null)
      return
    }
    setPaperLoading(true)
    setPaperError(null)
    const data = await searchPapersFromApi(
      looksLikeDoi(trimmed) ? { doi: trimmed } : { q: trimmed },
    )
    setPaperResults(data.papers)
    if (data.papers.length === 0) setPaperError(data.error ?? null)
    else setPaperError(null)
    setPaperLoading(false)
  }, [])

  const onPaperQueryChange = (q: string) => {
    setPaperQuery(q)
    if (paperTimer.current) clearTimeout(paperTimer.current)
    if (!q.trim()) {
      setPaperResults([])
      setPaperError(null)
      return
    }
    paperTimer.current = setTimeout(() => { void runPaperSearch(q) }, 450)
  }

  const resolveDoi = async () => {
    if (!doiInput.trim()) return
    setDoiLoading(true)
    setPaperError(null)
    const data = await searchPapersFromApi({ doi: doiInput.trim() })
    setDoiLoading(false)
    if (data.papers.length === 0) {
      pushToast({ title: 'DOI not found', body: data.error ?? 'No record in paper databases', severity: 'medium', type: 'system' })
      return
    }
    saveSuggestedPaper(data.papers[0])
    setDoiInput('')
  }

  const searchFromMission = () => {
    if (!project) return
    const q = buildPaperSearchQuery(project)
    if (!q) {
      pushToast({ title: 'Nothing to search', body: 'Set a research question in project settings, or use keywords above', severity: 'info', type: 'system' })
      return
    }
    setAddTab('search')
    setAddExpanded(true)
    setPaperQuery(q)
    void runPaperSearch(q)
  }

  const renderEntryButton = (e: JournalEntry) => (
    <button
      key={e.id}
      type="button"
      onClick={() => openJournalEntry(e.id, e.note ?? '')}
      className={`ui-journal-row${selectedEntry?.id === e.id ? ' ui-journal-row--active' : ''}`}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ui-journal-row__title">{e.title}</div>
        <div className="ui-journal-row__meta">
          <span className="ui-chip ui-chip--xs ui-chip--accent">{KIND_LABEL[e.kind]}</span>
          {e.significance && (
            <span className="ui-chip ui-chip--xs">{SIG_LABEL[e.significance] ?? e.significance}</span>
          )}
          {e.country && <span className="ui-chip ui-chip--xs">{e.country}</span>}
          <span className="ui-journal-row__time">
            {formatDistanceToNow(new Date(e.savedAt), { addSuffix: true })}
          </span>
        </div>
      </div>
    </button>
  )

  const renderAddPanel = () => (
    <div className="ui-panel-inline-form">
      <SegControl<'search' | 'doi' | 'note'>
        size="sm"
        value={addTab}
        onChange={v => { setAddTab(v); if (v === 'note') setShowNoteForm(true) }}
        options={[
          { value: 'search', label: 'Find papers' },
          { value: 'doi', label: 'DOI' },
          { value: 'note', label: 'Note' },
        ]}
      />

      {addTab === 'search' && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <div className="ui-input-wrap" style={{ flex: 1 }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                value={paperQuery}
                onChange={e => onPaperQueryChange(e.target.value)}
                placeholder="Keywords, topic, or DOI…"
                className="ui-input"
                style={{ paddingLeft: 28 }}
                onKeyDown={e => { if (e.key === 'Enter') void runPaperSearch(paperQuery) }}
              />
            </div>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              style={{ padding: '6px 12px', flexShrink: 0 }}
              onClick={() => void runPaperSearch(paperQuery)}
              disabled={paperLoading || paperQuery.trim().length < 2}
            >
              {paperLoading ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Search'}
            </button>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn--ghost"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }}
            onClick={searchFromMission}
            disabled={paperLoading}
          >
            <Sparkles size={11} /> Search from mission context
          </button>
          {paperLoading && <p className="ui-feed-hint" style={{ padding: 0 }}>Searching Semantic Scholar + OpenAlex…</p>}
          {paperError && !paperLoading && <p className="ui-feed-hint" style={{ padding: 0, color: 'var(--warning)' }}>{paperError}</p>}
          {paperResults.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, margin: '2px 0 6px' }}>
                <span className="ui-feed-hint" style={{ padding: 0, margin: 0 }}>{paperResults.length} result{paperResults.length === 1 ? '' : 's'}</span>
                <SegControl<'relevance' | 'citations' | 'year'>
                  size="sm"
                  value={paperSort}
                  onChange={setPaperSort}
                  options={[
                    { value: 'relevance', label: 'Relevant' },
                    { value: 'citations', label: 'Most cited' },
                    { value: 'year', label: 'Newest' },
                  ]}
                />
              </div>
              <div className="ui-journal-paper-results">
                {sortedPaperResults.map(p => {
                  const saved = savedPaperTitles.has(p.title.toLowerCase())
                  return (
                    <div key={p.id ?? p.title} className="ui-journal-paper-hit">
                      <div className="ui-journal-paper-hit__title">{p.title}</div>
                      <div className="ui-journal-paper-hit__meta">
                        {(p.authors ?? []).slice(0, 3).join(', ')}{(p.authors?.length ?? 0) > 3 ? ' et al.' : ''}
                        {p.year ? ` · ${p.year}` : ''}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                        <button type="button" className="ui-btn ui-btn--primary" style={{ padding: '4px 10px' }} disabled={saved} onClick={() => saveSuggestedPaper(p)}>
                          {saved ? 'In library' : <><Plus size={10} /> Save</>}
                        </button>
                        {(p.url || p.doi) && (
                          <button type="button" className="ui-btn ui-btn--ghost" style={{ padding: '4px 10px' }} onClick={() => window.open(p.url ?? `https://doi.org/${p.doi}`, '_blank', 'noopener')}>
                            <ExternalLink size={10} /> Open
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {addTab === 'doi' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <input
            value={doiInput}
            onChange={e => setDoiInput(e.target.value)}
            placeholder="10.1038/… or https://doi.org/…"
            className="ui-input ui-data"
            style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') void resolveDoi() }}
          />
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => void resolveDoi()} disabled={doiLoading || !doiInput.trim()}>
            {doiLoading ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Add'}
          </button>
        </div>
      )}

      {addTab === 'note' && showNoteForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Title (optional)" className="ui-input" />
          <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Observation, source tip, or reflection…" className="ui-input" rows={3} style={{ resize: 'vertical' }} />
          <button type="button" className="ui-btn ui-btn--primary" style={{ alignSelf: 'flex-start' }} onClick={addFieldNote} disabled={!noteBody.trim()}>
            Save note
          </button>
        </div>
      )}
    </div>
  )

  if (!project) return null

  const entryDetailOverlay = selectedEntry && view === 'entries' ? (
    <div className="ui-journal-detail-fullscreen panel-slide-in">
      <header className="ui-journal-detail-fullscreen__head">
        <div className="ui-journal-detail-fullscreen__badges">
          <span className="ui-chip ui-chip--xs ui-chip--accent">{KIND_LABEL[selectedEntry.kind]}</span>
          {selectedEntry.significance && (
            <span className="ui-chip ui-chip--xs">{SIG_LABEL[selectedEntry.significance] ?? selectedEntry.significance}</span>
          )}
          {selectedEntry.country && <span className="ui-chip ui-chip--xs">{selectedEntry.country}</span>}
        </div>
        <button
          type="button"
          className="ui-event-dismiss"
          onClick={() => setSelectedId(null)}
          aria-label="Close (Esc)"
          title="Close (Esc)"
        >
          <kbd>esc</kbd>
        </button>
      </header>

      <div className="ui-journal-detail-fullscreen__body">
        <h2 className="ui-journal-detail-fullscreen__title">{selectedEntry.title}</h2>
        {selectedEntry.summary && (
          <p className="ui-journal-detail-fullscreen__summary">{selectedEntry.summary}</p>
        )}

        <div className="ui-journal-detail-fullscreen__section">
          <div className="ui-journal-detail-fullscreen__section-label">Significance</div>
          <SegControl<JournalSignificance>
            size="sm"
            value={selectedEntry.significance ?? 'supporting'}
            onChange={setSignificance}
            options={[
              { value: 'key', label: 'Key' },
              { value: 'supporting', label: 'Supporting' },
              { value: 'background', label: 'Background' },
            ]}
          />
          <div className="ui-journal-detail-fullscreen__row">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => void runAssess()} disabled={assessing}>
              {assessing
                ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Sparkles size={12} />}
              Check relevance
            </button>
            {assessResult && assessResult.suggestedSignificance !== (selectedEntry.significance ?? 'supporting') && (
              <button type="button" className="ui-btn ui-btn--primary" onClick={applyAssessSignificance}>
                Apply {SIG_LABEL[assessResult.suggestedSignificance] ?? assessResult.suggestedSignificance}
              </button>
            )}
          </div>
          {assessResult && (
            <p className="ui-feed-hint ui-journal-detail-fullscreen__hint">
              {assessResult.aiEnhanced && (
                <span className="ui-chip ui-chip--xs ui-chip--accent" style={{ marginRight: 6 }}>AI</span>
              )}
              {assessResult.summary}
            </p>
          )}
        </div>

        <JournalEntryPaperLinks project={project} entry={selectedEntry} liveEvents={liveEvents} />

        {selectedEntry.authors?.length ? (
          <p className="ui-journal-meta-line">{selectedEntry.authors.join(', ')}</p>
        ) : null}
        {selectedEntry.doi && (
          <p className="ui-journal-meta-line">
            <a href={`https://doi.org/${selectedEntry.doi}`} target="_blank" rel="noopener noreferrer" className="ui-link ui-data">
              doi.org/{selectedEntry.doi}
            </a>
          </p>
        )}
        {selectedEntry.abstract && selectedEntry.abstract !== selectedEntry.summary && (
          <p className="ui-journal-abstract">{selectedEntry.abstract.slice(0, 600)}</p>
        )}

        <div className="ui-journal-detail-fullscreen__section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div className="ui-journal-detail-fullscreen__section-label" style={{ marginBottom: 0 }}>Analyst note</div>
            <span style={{ fontSize: 9, color: noteSaved ? 'var(--text-muted)' : 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
              {noteSaved ? 'saved' : 'saving…'}
            </span>
          </div>
          <textarea
            value={noteDraft}
            onChange={e => {
              const next = e.target.value
              setNoteDraft(next)
              scheduleNoteSave(next)
            }}
            onBlur={() => flushNoteSave()}
            onKeyDown={e => e.stopPropagation()}
            placeholder="Why you saved this — link to hypothesis, gap, or forecast…"
            className="ui-input"
            rows={4}
            style={{ resize: 'vertical', width: '100%' }}
          />
          <button type="button" className="ui-btn ui-btn--ghost" style={{ marginTop: 8, fontSize: 10 }} onClick={saveNote}>
            Save now
          </button>
        </div>

        {(project.journal ?? []).filter(e => e.id !== selectedEntry.id).length > 0 && (
          <div className="ui-journal-detail-fullscreen__section">
            <div className="ui-journal-detail-fullscreen__section-head">
              <div className="ui-journal-detail-fullscreen__section-label">Linked evidence</div>
              <button type="button" className="ui-link" onClick={() => setLinksExpanded(v => !v)}>
                {linksExpanded ? 'Done' : '+ Link'}
              </button>
            </div>
            {linkedJournalEntries(project, selectedEntry).length > 0 && (
              <div className="ui-journal-detail-fullscreen__links">
                {linkedJournalEntries(project, selectedEntry).map(link => (
                  <button
                    key={link.id}
                    type="button"
                    className="ui-journal-detail-fullscreen__link-row"
                    onClick={() => openJournalEntry(link.id, link.note ?? '')}
                  >
                    {link.title}
                  </button>
                ))}
              </div>
            )}
            {linksExpanded && (
              <div className="ui-journal-detail-fullscreen__link-pick">
                {(project.journal ?? [])
                  .filter(e => e.id !== selectedEntry.id && !(selectedEntry.linkedEntryIds ?? []).includes(e.id))
                  .slice(0, 12)
                  .map(e => (
                    <button
                      key={e.id}
                      type="button"
                      className="ui-journal-detail-fullscreen__link-row"
                      onClick={() => { toggleLink(e.id); setLinksExpanded(false) }}
                    >
                      + {e.title}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="ui-journal-detail-fullscreen__foot">
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          style={{ color: entryOnCanvas ? 'var(--accent)' : undefined }}
          onClick={sendToCanvas}
        >
          <BarChart2 size={12} /> {entryOnCanvas ? 'On canvas' : 'Canvas'}
        </button>
        {selectedEntry.kind === 'event' && selectedEntry.eventId && (
          <button type="button" className="ui-btn ui-btn--ghost" onClick={() => openEvent(selectedEntry)}>
            Open event
          </button>
        )}
        {selectedEntry.url && (
          <button type="button" className="ui-btn ui-btn--ghost" onClick={() => window.open(selectedEntry.url!, '_blank')}>
            <ExternalLink size={12} /> Source
          </button>
        )}
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          style={{ color: 'var(--critical)', marginLeft: 'auto' }}
          onClick={() => {
            removeJournalEntry(project.id, selectedEntry.id)
            setSelectedId(null)
          }}
        >
          <Trash2 size={12} /> Remove
        </button>
      </footer>
    </div>
  ) : null

  return (
    <>
    <div className="ui-map-float-panel ui-map-float-panel--journal">
      <div className="ui-map-float-panel__body">
      <header className="ui-journal-header ui-journal-header--float">
        <div className="ui-journal-header__row">
          <div className="ui-journal-header__title">
            <h2 className="ui-title ui-title--panel">Research</h2>
            <p className="ui-journal-header__sub">{counts.all} saved</p>
          </div>
          <div className="ui-journal-header__actions">
            {view === 'entries' && !selectedEntry && (
              <button type="button" className="ui-btn ui-btn--primary ui-journal-header__add" onClick={() => setAddExpanded(v => !v)}>
                <Plus size={14} /> Add
              </button>
            )}
            <div style={{ position: 'relative' }}>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon" onClick={() => setShowActions(v => !v)} aria-label="More">
                <MoreHorizontal size={14} />
              </button>
              {showActions && (
                <div className="ui-dropdown-menu" style={{ right: 0, left: 'auto', top: '100%', marginTop: 4, minWidth: 200, zIndex: 20 }}>
                  <button type="button" className="ui-dropdown-item" onClick={() => { openJournal('hypotheses'); setShowActions(false) }}>
                    <GitBranch size={11} /> Hypotheses ({hypotheses.length})
                  </button>
                  <button type="button" className="ui-dropdown-item" onClick={() => { setAddSourceOpen(true); setShowActions(false) }}>
                    <Rss size={11} /> Import news
                  </button>
                  <button type="button" className="ui-dropdown-item" onClick={() => { exportMd(); setShowActions(false) }} disabled={counts.all === 0}>
                    <FileDown size={11} /> Export all
                  </button>
                  <button type="button" className="ui-dropdown-item" onClick={() => { exportMemo(); setShowActions(false) }} disabled={counts.all === 0 && hypotheses.length === 0}>
                    <FileDown size={11} /> Export memo
                  </button>
                  <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
                    <div className="ui-section-label" style={{ marginBottom: 6 }}>Brief evidence ([E#])</div>
                    <SegControl<BriefEvidenceMode>
                      size="sm"
                      value={briefEvidenceMode}
                      onChange={v => { setBriefEvidenceMode(v); setShowActions(false) }}
                      options={[
                        { value: 'blended', label: 'Both' },
                        { value: 'curated', label: 'Journal' },
                        { value: 'live', label: 'Live' },
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>
            <button type="button" onClick={() => focusWorkbench('map')} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {view !== 'hypotheses' ? (
          <nav className="ui-seg-nav ui-seg-nav--panel" aria-label="Research views">
            <button type="button" className={`ui-seg-nav__btn${view === 'entries' ? ' ui-seg-nav__btn--active' : ''}`} onClick={() => { openJournal('entries'); setSelectedId(null); setAddExpanded(false) }}>
              Notes
            </button>
            <button type="button" className={`ui-seg-nav__btn${view === 'patterns' ? ' ui-seg-nav__btn--active' : ''}`} onClick={() => { openJournal('patterns'); setSelectedId(null); setAddExpanded(false) }}>
              Patterns
            </button>
          </nav>
        ) : (
          <button type="button" className="ui-link ui-journal-back" onClick={() => openJournal('entries')}>
            <ChevronLeft size={14} /> Back to notes
          </button>
        )}
      </header>

      {!researchCloudOk && (
        <div className="ui-callout ui-callout--warn" style={{ margin: '0 0 12px', fontSize: 11 }}>
          Research journal is not syncing to cloud — run <code>20260701_research_journal.sql</code> (see <code>supabase/MIGRATIONS.md</code>).
        </div>
      )}

      {view === 'entries' && !selectedEntry && addExpanded && renderAddPanel()}

      <div className="ui-journal-body">

        {view === 'patterns' ? (
          <div className="ui-journal-scroll ui-journal-scroll--patterns">
            <PatternsSection />
          </div>
        ) : view === 'hypotheses' ? (
          selectedHy ? (
            <div className="ui-journal-detail">
              <div className="ui-journal-detail__nav">
                <button type="button" className="ui-btn ui-btn--ghost" style={{ padding: '4px 8px' }} onClick={() => setSelectedId(null)}>
                  <ChevronLeft size={14} /> Revisions
                </button>
                {selectedHy.confidence && (
                  <span className="ui-chip ui-chip--xs">{selectedHy.confidence} confidence</span>
                )}
              </div>
              <div className="ui-journal-detail__body">
                <div className="ui-journal-card">
                  <h3 className="ui-journal-card__title">{selectedHy.statement}</h3>
                  <p style={{ color: 'var(--text-muted)', margin: '0 0 8px' }}>
                    Recorded {formatDistanceToNow(new Date(selectedHy.recordedAt), { addSuffix: true })}
                  </p>
                  {selectedHy.rationale && (
                    <p className="ui-journal-card__summary">
                      <strong>Why revised:</strong> {selectedHy.rationale}
                    </p>
                  )}
                  {(selectedHy.linkedJournalIds ?? []).length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div className="ui-section-label" style={{ marginBottom: 4 }}>Linked evidence</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {(selectedHy.linkedJournalIds ?? []).map(id => {
                          const entry = (project.journal ?? []).find(e => e.id === id)
                          if (!entry) return null
                          return (
                            <button
                              key={id}
                              type="button"
                              className="ui-btn ui-btn--ghost"
                              style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                              onClick={() => { openJournal('entries'); openJournalEntry(id, entry.note ?? '') }}
                            >
                              {entry.title.slice(0, 80)}{entry.title.length > 80 ? '…' : ''}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {selectedHy.supersedesId && (() => {
                    const prev = hypotheses.find(x => x.id === selectedHy.supersedesId)
                    return prev ? (
                      <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0 0' }}>
                        Supersedes ({prev.recordedAt.slice(0, 10)}): {prev.statement}
                      </p>
                    ) : null
                  })()}
                </div>
              </div>
              <div className="ui-journal-detail__foot">
                <button type="button" className="ui-btn ui-btn--ghost" style={{ color: 'var(--critical)' }} onClick={() => { removeHypothesisRevision(project.id, selectedHy.id); setSelectedId(null) }}>
                  <Trash2 size={10} /> Remove
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="ui-journal-toolbar">
                <button type="button" className="ui-btn ui-btn--ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setShowHyForm(v => !v)}>
                  <GitBranch size={11} /> {showHyForm ? 'Cancel' : 'Revise hypothesis'}
                </button>
                {showHyForm && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--surface-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <textarea value={hyStatement} onChange={e => setHyStatement(e.target.value)} placeholder="Current working hypothesis…" className="ui-input" rows={2} style={{ resize: 'vertical' }} />
                    <textarea value={hyRationale} onChange={e => setHyRationale(e.target.value)} placeholder="What changed your mind? New evidence, counter-argument, source…" className="ui-input" rows={2} style={{ resize: 'vertical' }} />
                    <SegControl<'high' | 'moderate' | 'low'>
                      size="sm"
                      value={hyConfidence ?? 'moderate'}
                      onChange={setHyConfidence}
                      options={[
                        { value: 'high', label: 'High' },
                        { value: 'moderate', label: 'Moderate' },
                        { value: 'low', label: 'Low' },
                      ]}
                    />
                    <button type="button" className="ui-btn ui-btn--primary" style={{ alignSelf: 'flex-start' }} onClick={saveHypothesis} disabled={!hyStatement.trim()}>
                      Record revision
                    </button>
                  </div>
                )}
              </div>
              <div className="ui-journal-scroll">
                {hypotheses.length === 0 ? (
                  <div className="ui-panel-empty">
                    <GitBranch size={24} className="ui-panel-empty__icon" />
                    <div className="ui-panel-empty__title">No revisions yet</div>
                    <p className="ui-feed-hint" style={{ lineHeight: 1.6 }}>
                      Record how your reading of the situation evolves — each revision links to the prior view.
                    </p>
                  </div>
                ) : hypotheses.map(h => (
                  <button key={h.id} type="button" onClick={() => setSelectedId(h.id)} className="ui-journal-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ui-journal-row__title">{h.statement}</div>
                      <div className="ui-journal-row__meta">
                        <span className="ui-chip ui-chip--xs">{h.recordedAt.slice(0, 10)}</span>
                        {h.confidence && <span className="ui-chip ui-chip--xs ui-chip--accent">{h.confidence}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )
        ) : (
          <>
            <div className="ui-journal-toolbar">
              <div className="ui-input-wrap ui-feed-search">
                <Search size={14} className="ui-input-wrap__icon" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter library…"
                  className="ui-input"
                  style={{ paddingLeft: 32 }}
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {([
                  ['all', `All (${counts.all})`],
                  ['event', `Events (${counts.event})`],
                  ['paper', `Papers (${counts.paper})`],
                  ['note', `Notes (${counts.note})`],
                ] as const).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setFilter(kind)}
                    className={`ui-filter-pill ui-filter-pill--accent${filter === kind ? ' ui-filter-pill--active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ui-feed-hint">
              {entries.length === counts.all
                ? `${counts.all} entr${counts.all === 1 ? 'y' : 'ies'} in library`
                : `${entries.length} shown · ${counts.all} total`}
            </div>
            <div className="ui-journal-scroll">
              {entries.length === 0 ? (
                <div className="ui-panel-empty">
                  <BookMarked size={24} className="ui-panel-empty__icon" />
                  <div className="ui-panel-empty__title">{counts.all === 0 ? 'Nothing saved yet' : 'No matches'}</div>
                  <p className="ui-feed-hint" style={{ lineHeight: 1.6 }}>
                    {counts.all === 0
                      ? 'Tap Add to search papers, save events from the feed, or import news via Add Source.'
                      : 'Try a different filter or search term.'}
                  </p>
                </div>
              ) : layout === 'timeline' ? weekGroups.map(group => (
                <div key={group.weekKey}>
                  <div className="ui-journal-week-header">
                    Week · {group.weekLabel}
                  </div>
                  {group.entries.map(renderEntryButton)}
                </div>
              )) : entries.map(renderEntryButton)}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
    {entryDetailOverlay}
    </>
  )
}

export { isEventInJournal }
