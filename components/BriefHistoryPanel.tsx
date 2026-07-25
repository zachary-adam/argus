'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { cacheBriefsForProject, loadCachedBriefs } from '@/lib/briefCache'
import { IS_CLOUD_MODE } from '@/lib/supabase/config'
import { X, Sparkles, Copy, Check, Trash2, Loader, RefreshCw, Search, Cloud } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  BRIEF_TYPE_LABEL,
  briefToMarkdown,
  type BriefHistoryRecord,
} from '@/lib/briefRender'
import { nlqToMarkdown, type NlqHistoryRecord } from '@/lib/nlqHistory'
import { BriefHistoryContent, NlqHistoryContent } from '@/components/BriefHistoryContent'
import { formatBriefInputsLine } from '@/lib/briefInputsSummary'

type BriefHistoryPanelProps = {
  variant?: 'modal' | 'page'
  projectName?: string
  onBack?: () => void
}

export default function BriefHistoryPanel({
  variant = 'modal',
  projectName,
  onBack,
}: BriefHistoryPanelProps = {}) {
  const isPage = variant === 'page'
  const router = useRouter()
  const { handleClose, closing } = useClosePanel('briefHistory')
  const close = isPage ? (onBack ?? handleClose) : handleClose
  const project = useProjectStore(s => s.getActiveProject())
  const pushToast = useMapStore(s => s.pushToast)
  const tab = useMapStore(s => s.briefHistoryTab)
  const setTab = useMapStore(s => s.setBriefHistoryTab)

  const [items, setItems] = useState<BriefHistoryRecord[]>([])
  const [nlqItems, setNlqItems] = useState<NlqHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'project' | 'all'>('project')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedNlqId, setSelectedNlqId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const activeTab = isPage ? 'briefs' : tab
  const briefInputsLine = formatBriefInputsLine(project)

  const loadBriefs = useCallback(async () => {
    const qs = new URLSearchParams({ limit: '40' })
    const useProjectScope = isPage || scope === 'project'
    if (useProjectScope && project?.id) qs.set('projectId', project.id)
    const res = await fetch(`/api/briefs?${qs}`)
    if (res.status === 401) throw new Error('Sign in to view saved history.')
    if (!res.ok) throw new Error('Could not load brief history')
    const data = await res.json() as BriefHistoryRecord[]
    setItems(data)
    if (project?.id) cacheBriefsForProject(project.id, data)
    setSelectedId(prev => (prev && data.some(d => d.id === prev) ? prev : data[0]?.id ?? null))
  }, [scope, project?.id, isPage])

  const loadNlq = useCallback(async () => {
    const qs = new URLSearchParams({ limit: '40' })
    const useProjectScope = isPage || scope === 'project'
    if (useProjectScope && project?.id) qs.set('projectId', project.id)
    const res = await fetch(`/api/nlq-history?${qs}`)
    if (res.status === 401) throw new Error('Sign in to view saved history.')
    if (!res.ok) throw new Error('Could not load NLQ history')
    const data = await res.json() as NlqHistoryRecord[]
    setNlqItems(data)
    setSelectedNlqId(prev => (prev && data.some(d => d.id === prev) ? prev : data[0]?.id ?? null))
  }, [scope, project?.id, isPage])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (activeTab === 'briefs') await loadBriefs()
      else await loadNlq()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Load failed'
      if (isPage && project?.id && activeTab === 'briefs') {
        const cached = loadCachedBriefs(project.id)
        if (cached.length > 0) {
          setItems(cached)
          setSelectedId(cached[0]?.id ?? null)
          setError(msg.includes('Sign in') ? msg : null)
          return
        }
      }
      setError(msg)
      setItems([])
      setNlqItems([])
    } finally {
      setLoading(false)
    }
  }, [activeTab, loadBriefs, loadNlq, isPage, project?.id])

  useEffect(() => { load() }, [load])

  const selectedBrief = items.find(i => i.id === selectedId) ?? null
  const selectedNlq = nlqItems.find(i => i.id === selectedNlqId) ?? null
  const selected = activeTab === 'briefs' ? selectedBrief : selectedNlq

  const copyMarkdown = () => {
    if (!selected) return
    const text = activeTab === 'briefs'
      ? briefToMarkdown(selectedBrief!)
      : nlqToMarkdown(selectedNlq!)
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const deleteItem = async (id: string) => {
    setDeletingId(id)
    const endpoint = activeTab === 'briefs' ? `/api/briefs/${id}` : `/api/nlq-history/${id}`
    try {
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      if (activeTab === 'briefs') {
        setItems(prev => prev.filter(i => i.id !== id))
        if (selectedId === id) setSelectedId(null)
      } else {
        setNlqItems(prev => prev.filter(i => i.id !== id))
        if (selectedNlqId === id) setSelectedNlqId(null)
      }
      pushToast({ title: 'Removed', body: 'Deleted from history', severity: 'info', type: 'system' })
    } catch {
      pushToast({ title: 'Delete failed', body: 'Could not remove entry', severity: 'medium', type: 'system' })
    } finally {
      setDeletingId(null)
    }
  }

  const list = activeTab === 'briefs' ? items : nlqItems
  const activeId = activeTab === 'briefs' ? selectedId : selectedNlqId
  const setActiveId = activeTab === 'briefs' ? setSelectedId : setSelectedNlqId

  const panelBody = (
    <>
        <header className="ui-panel-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div>
                {isPage ? (
                  <>
                    <div className="ui-kicker" style={{ marginBottom: 2 }}>{projectName ?? project?.name}</div>
                    <div className="ui-title ui-title--panel">AI brief history</div>
                    <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 4 }}>
                      Saved intelligence briefs for this project
                    </p>
                  </>
                ) : (
                  <>
                    <div className="ui-kicker" style={{ marginBottom: 2 }}>Workspace</div>
                    <div className="ui-title ui-title--panel">Intelligence history</div>
                    <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 4 }}>
                      Briefs and map queries (⌘K) auto-save here
                    </p>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={load} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Refresh" title="Refresh">
                <RefreshCw size={13} />
              </button>
              {!isPage && (
                <button type="button" onClick={close} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </header>

        {!isPage && briefInputsLine && activeTab === 'briefs' && (
          <div className="ui-brief-inputs-banner">
            {briefInputsLine}
          </div>
        )}

        {!isPage && (
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`ui-chip${tab === 'briefs' ? ' ui-chip--accent' : ''}`}
            onClick={() => setTab('briefs')}
            style={{ cursor: 'pointer', border: 'none' }}
          >
            Briefs
          </button>
          <button
            type="button"
            className={`ui-chip${tab === 'nlq' ? ' ui-chip--accent' : ''}`}
            onClick={() => setTab('nlq')}
            style={{ cursor: 'pointer', border: 'none' }}
          >
            NLQ queries
          </button>
          <span style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
          <button
            type="button"
            className={`ui-chip${scope === 'project' ? ' ui-chip--accent' : ''}`}
            onClick={() => setScope('project')}
            style={{ cursor: 'pointer', border: 'none' }}
          >
            This project
          </button>
          <button
            type="button"
            className={`ui-chip${scope === 'all' ? ' ui-chip--accent' : ''}`}
            onClick={() => setScope('all')}
            style={{ cursor: 'pointer', border: 'none' }}
          >
            All
          </button>
        </div>
        )}

        <div className={`ui-brief-history-layout ui-panel-body${isPage ? ' ui-brief-history-layout--page' : ''}`} style={{ padding: 0 }}>
          <div className="ui-brief-history-sidebar" style={{ width: 240, borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0 }}>
            {loading && (
              <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading…
              </div>
            )}
            {!loading && error && (
              <div className="ui-callout ui-callout--error" style={{ margin: 12, fontSize: 11 }}>
                {error}
                {error.includes('Sign in') && IS_CLOUD_MODE && (
                  <button
                    type="button"
                    className="ui-btn ui-btn--primary"
                    style={{ marginTop: 10, width: '100%', justifyContent: 'center', fontSize: 11 }}
                    onClick={() => router.push('/auth/login')}
                  >
                    <Cloud size={12} /> Sign in
                  </button>
                )}
              </div>
            )}
            {!loading && !error && list.length === 0 && (
              <div className={isPage ? 'mobile-brief-empty' : ''} style={{ padding: 16, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                {isPage ? (
                  <>
                    <p className="mobile-brief-empty__title">No briefs yet</p>
                    <p className="mobile-brief-empty__desc">
                      Briefs are saved when you generate them on desktop — open this project on a computer to create your first one.
                    </p>
                  </>
                ) : activeTab === 'briefs' ? (
                  <>
                    No saved briefs yet. Generate a country, canvas, or project brief.
                    {briefInputsLine && (
                      <p style={{ marginTop: 10, color: 'var(--accent)' }}>{briefInputsLine}</p>
                    )}
                  </>
                ) : (
                  'No saved queries yet. Run a map query with ⌘K.'
                )}
              </div>
            )}
            {activeTab === 'briefs' && items.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveId(item.id)}
                className="ui-command-row"
                style={{
                  width: '100%',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: activeId === item.id ? 'var(--surface-elevated)' : 'transparent',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>
                  {BRIEF_TYPE_LABEL[item.type]}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                  {item.title}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </div>
              </button>
            ))}
            {activeTab === 'nlq' && nlqItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveId(item.id)}
                className="ui-command-row"
                style={{
                  width: '100%',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: activeId === item.id ? 'var(--surface-elevated)' : 'transparent',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Search size={9} /> {item.match_count} matches
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                  {item.query}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </div>
              </button>
            ))}
          </div>

          <div className="ui-brief-history-detail">
            {selected ? (
              <>
                <div className="ui-brief-history-detail__toolbar">
                  <button type="button" onClick={copyMarkdown} className="ui-btn ui-btn--ghost" style={{ fontSize: 11 }}>
                    {copied ? <Check size={11} /> : <Copy size={11} />}
                    {copied ? 'Copied' : 'Copy markdown'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteItem(selected.id)}
                    disabled={deletingId === selected.id}
                    className="ui-btn ui-btn--ghost"
                    style={{ fontSize: 11, color: 'var(--critical)' }}
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
                <div className="ui-brief-history-detail__scroll">
                  {activeTab === 'briefs' && selectedBrief
                    ? <BriefHistoryContent record={selectedBrief} />
                    : selectedNlq
                      ? <NlqHistoryContent record={selectedNlq} />
                      : null}
                </div>
              </>
            ) : (
              <div style={{ padding: 20, fontSize: 11, color: 'var(--text-muted)' }}>
                Select an entry to view the full text.
              </div>
            )}
          </div>
        </div>
    </>
  )

  if (isPage) {
    return (
      <div className="mobile-brief-panel mobile-brief-panel--page">
        {panelBody}
      </div>
    )
  }

  return (
    <div className="ui-modal-overlay" onClick={close}>
      <div
        className={`ui-command-palette panel-slide-in${closing ? ' panel-closing' : ''}`}
        style={{ maxWidth: 720, width: 'min(720px, 96vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {panelBody}
      </div>
    </div>
  )
}
