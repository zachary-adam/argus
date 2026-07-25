'use client'
import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft, Trash2, Link2, ZoomIn, ZoomOut, Maximize2, LayoutGrid,
  Activity, FileText, Globe, BookOpen, Search, Loader,
  ExternalLink, BarChart2, CheckSquare, Square, ChevronDown,
  Newspaper, Copy, X as XIcon, Clock, AlertTriangle, Sparkles, Plus, MoreHorizontal,
  User, Building2, MapPin, Check, type LucideIcon,
} from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { FORMULA_LIBRARY, executeFormula, computeConfidence } from '@/lib/formulas'
import { autoScoreFromEvents } from '@/lib/autoScore'
import { displayCountry } from '@/lib/countryNames'
import { eventCaseLabels } from '@/lib/canvasEvents'
import { createStarterACHNode } from '@/lib/achTemplates'
import { evaluateIndicator, createStarterIndicatorNode } from '@/lib/indicators'
import { severityToNumber } from '@/lib/severityNum'
import { computeTidyCanvasPositions, computeTimelinePositions } from '@/lib/canvasLayout'
import { persistIntelEventsIfMissing } from '@/lib/eventPersist'
import { TrustChip } from '@/components/TrustChip'
import { eventConfidence, confidenceLabel } from '@/lib/sourceWeight'
import type { IntelEvent } from '@/types'
import type { Forecast } from '@/lib/forecasting'
import type {
  CanvasNode, CanvasEdge, CanvasEdgeKind,
  CanvasEventNode, CanvasNoteNode, CanvasEntityNode, CanvasSourceNode,
  CanvasAssessmentNode, CanvasACHNode, CanvasIndicatorNode, CanvasIndicator, UniversalEvent,
} from '@/types/project'
import { useSettingsStore } from '@/stores/settingsStore'
import { searchPapersFromApi } from '@/lib/fetchPapers'
import type { PaperResult } from '@/lib/papersClient'
import { buildAiFetchHeaders, loadEffortLevel } from '@/lib/aiConfig'
import { loadAnalysisEngine, saveAnalysisEngine, type AnalysisEngine } from '@/lib/aiMode'
import { AnalysisEngineToggle } from '@/components/ui/AnalysisEngineToggle'
import { buildWorkspaceContextBlock } from '@/lib/workspaceIntel'
import { saveBriefToHistory } from '@/lib/saveBriefHistory'
import { formatBriefInputsLine } from '@/lib/briefInputsSummary'
import { usePlotsStore } from '@/stores/plotsStore'
import { collectCanvasPapers, journalEntryFromPaper, journalPapersForBrief, journalEntryToAchEvidence } from '@/lib/journal'

// ── Constants ──────────────────────────────────────────────────────────────────

// Formulas shown per analysis profile. null = show all.

const NODE_W: Record<string, number> = { event: 280, note: 240, entity: 220, source: 280, assessment: 300, ach: 380, indicator: 350 }
const NODE_H: Record<string, number> = { event: 172, note: 120, entity: 98,  source: 170, assessment: 260, ach: 200 }

const EDGE_COLORS: Record<CanvasEdgeKind, string> = {
  causes:       'var(--critical)',
  correlates:   'var(--accent)',
  funds:        'var(--low)',
  threatens:    'var(--high)',
  depends_on:   'var(--medium)',
  contradicts:  'var(--critical)',
  supports:     'var(--info)',
  leads_to:     'var(--medium)',
  linked:       'var(--text-muted)',
}

const SEV_COLOR = (s: number) =>
  s >= 8 ? 'var(--critical)' : s >= 6 ? 'var(--high)' : s >= 4 ? 'var(--medium)' : 'var(--low)'

const CAT_COLOR: Record<string, string> = {
  conflict: 'var(--critical)', political: 'var(--accent)', economic: 'var(--low)',
  social: 'var(--info)', environmental: 'var(--low)', cyber: 'var(--medium)',
  disaster: 'var(--medium)', humanitarian: 'var(--high)', health: 'var(--info)',
  elections: 'var(--accent)',
}

function canvasTokens(dark: boolean) {
  return {
    bg: 'var(--bg)',
    surface: 'var(--surface)',
    border: 'var(--border)',
    txt: 'var(--text-primary)',
    muted: 'var(--text-muted)',
    accent: 'var(--accent)',
    dotClr: dark
      ? 'color-mix(in srgb, var(--text-muted) 28%, transparent)'
      : 'color-mix(in srgb, var(--text-muted) 50%, transparent)',
  }
}

function riskLevelStyle(level: string): { color: string; bg: string } {
  if (level === 'CRITICAL') return { color: 'var(--critical)', bg: 'var(--sev-critical-bg)' }
  if (level === 'HIGH') return { color: 'var(--high)', bg: 'var(--sev-high-bg)' }
  if (level === 'MODERATE') return { color: 'var(--medium)', bg: 'var(--sev-medium-bg)' }
  return { color: 'var(--low)', bg: 'var(--sev-low-bg)' }
}

function confidenceStyle(level: string): { color: string; bg: string; border: string } {
  if (level === 'HIGH') return { color: 'var(--low)', bg: 'var(--badge-green-bg)', border: 'var(--badge-green-border)' }
  if (level === 'LOW') return { color: 'var(--critical)', bg: 'var(--badge-red-bg)', border: 'var(--badge-red-border)' }
  return { color: 'var(--medium)', bg: 'var(--badge-yellow-bg)', border: 'var(--badge-yellow-border)' }
}

function formulaScoreColor(score: number): string {
  if (score >= 70) return 'var(--critical)'
  if (score >= 45) return 'var(--high)'
  if (score >= 25) return 'var(--medium)'
  return 'var(--low)'
}

const ENTITY_ICON: Record<string, LucideIcon> = {
  country: Globe, actor: User, organization: Building2, location: MapPin,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// ── Component ──────────────────────────────────────────────────────────────────

export default function AnalystCanvas() {
  const mapEvents    = useMapStore(s => s.events)
  const pushToast    = useMapStore(s => s.pushToast)
  const openJournal  = useMapStore(s => s.openJournal)
  const focusWorkbench = useMapStore(s => s.focusWorkbench)
  const project      = useProjectStore(s => s.getActiveProject())
  const addCanvasNode    = useProjectStore(s => s.addCanvasNode)
  const addJournalEntry  = useProjectStore(s => s.addJournalEntry)
  const updateCanvasNode = useProjectStore(s => s.updateCanvasNode)
  const layoutCanvasNodes = useProjectStore(s => s.layoutCanvasNodes)
  const removeCanvasNode = useProjectStore(s => s.removeCanvasNode)
  const addCanvasEdge    = useProjectStore(s => s.addCanvasEdge)
  const updateCanvasEdge = useProjectStore(s => s.updateCanvasEdge)
  const removeCanvasEdge = useProjectStore(s => s.removeCanvasEdge)
  const clearAnalystCanvas = useProjectStore(s => s.clearAnalystCanvas)
  const addProjectEvents = useProjectStore(s => s.addEvents)
  const updateProjectEvent = useProjectStore(s => s.updateEvent)
  const addPrediction    = useProjectStore(s => s.addPrediction)
  const updatePrediction = useProjectStore(s => s.updatePrediction)
  const addForecast      = useProjectStore(s => s.addForecast)

  const { nodes, edges } = project?.analyticalCanvas ?? { nodes: [], edges: [] }
  const briefInputsLine = useMemo(() => formatBriefInputsLine(project), [project])
  const events = project?.events ?? []
  const caseLabelsByEvent = useMemo(() => eventCaseLabels(project), [project])

  // ── Viewport state ──────────────────────────────────────────────────────────
  const [pan,  setPan]  = useState({ x: 120, y: 80 })
  const [zoom, setZoom] = useState(0.85)
  const [selected,     setSelected]     = useState<string | null>(null)
  const [connecting,   setConnecting]   = useState<string | null>(null)  // null | '__waiting__' | nodeId
  const [mouseCanvas,  setMouseCanvas]  = useState({ x: 0, y: 0 })
  const [editingNote,  setEditingNote]  = useState<string | null>(null)
  const [showEntityForm, setShowEntityForm] = useState(false)
  const [entityLabel, setEntityLabel] = useState('')
  const [entityType,  setEntityType]  = useState<CanvasEntityNode['entityType']>('country')
  // (assessment picker removed — ACH nodes created directly)
  // Brief generation
  const [briefLoading, setBriefLoading] = useState(false)
  const [brief, setBrief] = useState<import('@/types/canvasBrief').CanvasBriefResponse | null>(null)
  const [analysisEngine, setAnalysisEngine] = useState<AnalysisEngine>('ai')
  const [aiAvailable, setAiAvailable] = useState(true)
  // Paper search
  const [showPaperSearch, setShowPaperSearch] = useState(false)
  const [paperQuery,   setPaperQuery]   = useState('')
  const [paperResults, setPaperResults] = useState<PaperResult[]>([])
  const [paperLoading, setPaperLoading] = useState(false)
  const [showCanvasMore, setShowCanvasMore] = useState(false)
  const [showCanvasAdd, setShowCanvasAdd] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const addMenuAnchorRef = useRef<HTMLDivElement>(null)
  const moreMenuAnchorRef = useRef<HTMLDivElement>(null)
  const [addMenuRect, setAddMenuRect] = useState<DOMRect | null>(null)
  const [moreMenuRect, setMoreMenuRect] = useState<DOMRect | null>(null)
  const paperTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportRef  = useRef<HTMLDivElement>(null)
  const isPanning    = useRef(false)
  const panMoved     = useRef(false)
  const panStart     = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  const dragging     = useRef<{ id: string; startMX: number; startMY: number; startNX: number; startNY: number } | null>(null)
  const spaceHeld    = useRef(false)
  const [isActivePanning, setIsActivePanning] = useState(false)
  // Refs mirror state so the non-passive wheel handler (which can't re-attach on every render)
  // always reads the current pan/zoom without stale closure captures.
  const panRef  = useRef(pan)
  const zoomRef = useRef(zoom)
  useEffect(() => { panRef.current  = pan  }, [pan])
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { setPortalReady(true) }, [])

  const canvasMenuOpen = showCanvasAdd || showCanvasMore || showEntityForm || showPaperSearch

  const closeCanvasMenus = useCallback(() => {
    setShowCanvasAdd(false)
    setShowCanvasMore(false)
    setShowEntityForm(false)
    setShowPaperSearch(false)
  }, [])

  useLayoutEffect(() => {
    if (!canvasMenuOpen) {
      setAddMenuRect(null)
      setMoreMenuRect(null)
      return
    }
    const sync = () => {
      if (addMenuAnchorRef.current) setAddMenuRect(addMenuAnchorRef.current.getBoundingClientRect())
      if (moreMenuAnchorRef.current) setMoreMenuRect(moreMenuAnchorRef.current.getBoundingClientRect())
    }
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [canvasMenuOpen, showCanvasAdd, showCanvasMore, showEntityForm, showPaperSearch])

  useEffect(() => {
    setAnalysisEngine(loadAnalysisEngine(project?.aiMode))
  }, [project?.id, project?.aiMode])

  useEffect(() => {
    fetch('/api/status').then(r => r.json()).then(d => setAiAvailable(!!d.aiAvailable)).catch(() => {})
  }, [])

  const toCanvas = (vx: number, vy: number) => ({ x: (vx - pan.x) / zoom, y: (vy - pan.y) / zoom })
  const nodeW = (n: CanvasNode) => NODE_W[n.type] ?? 260
  const nodeH = (n: CanvasNode) => NODE_H[n.type] ?? 120
  const nodeCenter = (n: CanvasNode) => ({ x: n.x + nodeW(n) / 2, y: n.y + nodeH(n) / 2 })

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement
        || e.target instanceof HTMLTextAreaElement
        || e.target instanceof HTMLSelectElement
        || (e.target as HTMLElement)?.isContentEditable
      if (e.code === 'Space' && !e.repeat && !inField) { spaceHeld.current = true; e.preventDefault() }
      if (e.key === 'Escape') {
        setConnecting(null); setSelected(null); setEditingNote(null)
        closeCanvasMenus()
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        if (isInput) return
        if (!project) return
        if (nodes.find(n => n.id === selected)) {
          removeCanvasNode(project.id, selected)
        } else {
          removeCanvasEdge(project.id, selected)
        }
        setSelected(null)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [selected, nodes, project]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Esc → back to map ───────────────────────────────────────────────────────
  // The canvas covers the whole window (header included), so Esc is the keyboard
  // exit. Capture phase so it runs BEFORE the workspace-level Escape handler.
  // Only fires when nothing else (selection, link mode, menus) is open — those
  // keep Esc priority via the canvas's own handler above.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const target = e.target as HTMLElement | null
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (inInput) return
      const nothingOpen = connecting === null && selected === null && editingNote === null && !canvasMenuOpen
      if (!nothingOpen) return
      e.stopPropagation()
      focusWorkbench('map')
    }
    window.addEventListener('keydown', onEsc, true)
    return () => window.removeEventListener('keydown', onEsc, true)
  }, [connecting, selected, editingNote, canvasMenuOpen, focusWorkbench])

  // ── Non-passive wheel zoom ────────────────────────────────────────────────
  // React's synthetic onWheel is passive in modern browsers, so e.preventDefault()
  // is silently ignored — the browser fires its native page/window zoom instead.
  // Attach a native, non-passive listener directly to the DOM element.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.08 : 0.926
      const z = zoomRef.current
      const p = panRef.current
      const nz = Math.min(2.5, Math.max(0.25, z * factor))
      const np = { x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) }
      zoomRef.current = nz
      panRef.current  = np
      setZoom(nz)
      setPan(np)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, []) // empty — handler reads from refs, never stale

  const handleMouseUp = useCallback(() => {
    if (isPanning.current && !panMoved.current) {
      setSelected(null)
      setEditingNote(null)
    }
    isPanning.current = false
    panMoved.current  = false
    setIsActivePanning(false)
    dragging.current  = null
  }, [])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  // ── Viewport mouse handlers ───────────────────────────────────────────────
  // Left-click drag on empty canvas = pan (Miro-style).
  // Nodes call e.stopPropagation() on their own mousedown, so this only fires
  // when the user clicks the background — no modifier key required.
  const handleViewportMouseDown = (e: React.MouseEvent) => {
    if (canvasMenuOpen) return
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 0 && connecting !== null) {
      // In connect mode, clicking empty space resets to "waiting for source"
      if (connecting !== '__waiting__') setConnecting('__waiting__')
      return
    }
    isPanning.current = true
    panMoved.current  = false
    panStart.current  = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const vp = viewportRef.current?.getBoundingClientRect()
    if (!vp) return
    const vx = e.clientX - vp.left
    const vy = e.clientY - vp.top

    if (isPanning.current) {
      const dx = e.clientX - panStart.current.mx
      const dy = e.clientY - panStart.current.my
      if (!panMoved.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        panMoved.current = true
        setIsActivePanning(true)
      }
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy })
    } else if (dragging.current && project) {
      const dx = (e.clientX - dragging.current.startMX) / zoom
      const dy = (e.clientY - dragging.current.startMY) / zoom
      updateCanvasNode(project.id, dragging.current.id, {
        x: dragging.current.startNX + dx,
        y: dragging.current.startNY + dy,
      } as Partial<CanvasNode>)
    }

    if (connecting !== null && connecting !== '__waiting__') {
      setMouseCanvas(toCanvas(vx, vy))
    }
  }

  // handleMouseUp defined above (also wired to window so pan/drag never sticks)

  // ── Node drag start ───────────────────────────────────────────────────────
  const handleNodeMouseDown = (e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation() // always stop — in connect mode this prevents viewport from resetting connecting state
    if (connecting !== null) return
    dragging.current = { id: node.id, startMX: e.clientX, startMY: e.clientY, startNX: node.x, startNY: node.y }
  }

  // ── Node click (select / connect) ─────────────────────────────────────────
  const handleNodeClick = (e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation()
    if (connecting === '__waiting__') {
      setConnecting(node.id)
      return
    }
    if (connecting !== null) {
      if (connecting === node.id) { setConnecting(null); return }
      if (project) {
        addCanvasEdge(project.id, { id: `ce_${Date.now()}`, source: connecting, target: node.id, kind: 'linked' })
      }
      setConnecting(null)
      return
    }
    setSelected(s => s === node.id ? null : node.id)
  }

  // ── Add nodes ─────────────────────────────────────────────────────────────
  const viewCenter = () => {
    const vp = viewportRef.current
    const vw = vp?.clientWidth ?? 900
    const vh = vp?.clientHeight ?? 600
    return toCanvas(vw / 2, vh / 2)
  }

  const addNote = () => {
    if (!project) return
    const { x, y } = viewCenter()
    const id = `cn_${Date.now()}`
    addCanvasNode(project.id, { id, type: 'note', x: x - 120, y: y - 60, content: '' })
    setEditingNote(id)
    setSelected(id)
  }

  const addEntity = (label: string, type: CanvasEntityNode['entityType']) => {
    if (!project || !label.trim()) return
    const { x, y } = viewCenter()
    // Jitter so quick-adding several tracked actors doesn't stack them exactly.
    const j = () => (Math.random() - 0.5) * 70
    addCanvasNode(project.id, {
      id: `cn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: 'entity',
      x: x - 110 + j(), y: y - 49 + j(),
      label: label.trim(),
      entityType: type,
    })
  }

  const submitEntity = () => {
    if (!entityLabel.trim()) return
    addEntity(entityLabel, entityType)
    setEntityLabel('')
    setShowEntityForm(false)
  }

  // Tracked actors already on the canvas — so the quick-pick can mark them added.
  const canvasEntityLabels = new Set(
    nodes.filter(n => n.type === 'entity').map(n => (n as CanvasEntityNode).label.toLowerCase()),
  )

  const searchPapers = (q: string) => {
    setPaperQuery(q)
    if (paperTimer.current) clearTimeout(paperTimer.current)
    if (!q.trim()) { setPaperResults([]); return }
    paperTimer.current = setTimeout(async () => {
      setPaperLoading(true)
      const data = await searchPapersFromApi({ q })
      setPaperResults(data.papers)
      setPaperLoading(false)
    }, 420)
  }

  const addPaperNode = (paper: PaperResult) => {
    if (!project) return
    const { x, y } = viewCenter()
    addCanvasNode(project.id, {
      id: `cn_${Date.now()}`,
      type: 'source',
      x: x - 140, y: y - 85,
      title:    paper.title,
      authors:  paper.authors ?? [],
      year:     paper.year ?? undefined,
      abstract: paper.abstract ?? undefined,
      doi:      paper.doi ?? undefined,
      url:      paper.url ?? undefined,
      venue:    paper.venue ?? undefined,
    })
    addJournalEntry(project.id, journalEntryFromPaper(paper, { significance: 'supporting' }))
    pushToast({
      title: 'Paper added',
      body: 'On canvas and saved to research journal',
      severity: 'info',
      type: 'system',
    })
    setShowPaperSearch(false)
    setPaperQuery('')
    setPaperResults([])
  }

  const addACHNode = () => {
    if (!project) return
    const { x, y } = viewCenter()
    addCanvasNode(project.id, createStarterACHNode(x - 190, y - 140, {
      goalTemplateId: project.goalTemplateId,
      researchQuestion: project.researchQuestion ?? project.name,
    }))
  }

  // ── Pattern helpers (brief generation uses project.patterns) ───────────────

  const addIndicatorNode = () => {
    if (!project) return
    const { x, y } = viewCenter()
    addCanvasNode(project.id, createStarterIndicatorNode(x - 175, y - 130, {
      goalTemplateId: project.goalTemplateId,
      researchQuestion: project.researchQuestion ?? project.name,
    }))
  }

  const generateBrief = async () => {
    if (!project || briefLoading) return
    setBriefLoading(true)
    setBrief(null)

    // Collect event data from canvas nodes
    const canvasEvents = nodes
      .filter(n => n.type === 'event')
      .map(n => {
        const evId = (n as CanvasEventNode).eventId
        const ev = events.find(e => e.id === evId)
          ?? (mapEvents as unknown as UniversalEvent[]).find(e => e.id === evId)
        if (!ev) return null
        const intel = ev as unknown as IntelEvent & { body?: string }
        return {
          title: ev.title,
          summary: ev.summary,
          body: intel.body,
          category: ev.category,
          country: ev.country,
          severity: severityToNumber(ev.severity as string | number),
          timestamp: ev.timestamp,
          actors: ev.actors?.map(a => (typeof a === 'string' ? a : a.name)),
          source: intel.source,
          analystComments: intel.analystComments,
          url: intel.url,
        }
      })
      .filter(Boolean) as import('@/types/canvasBrief').CanvasBriefRequest['events']

    // Collect ACH findings
    const achFindings = nodes
      .filter(n => n.type === 'ach')
      .map(n => {
        const an = n as CanvasACHNode
        if (an.hypotheses.length === 0 || an.scores.length === 0) return null
        const ranked = [...an.hypotheses].map(h => {
          const s = an.scores.filter(sc => sc.hypothesisId === h.id)
          const supports = s.filter(sc => sc.rating === 'supports').length
          const contradicts = s.filter(sc => sc.rating === 'contradicts').length
          return { text: h.text, supports, contradicts, net: supports - contradicts }
        }).sort((a, b) => a.contradicts !== b.contradicts ? a.contradicts - b.contradicts : b.net - a.net)
        const lead = ranked[0]
        return {
          leadHypothesis: lead.text,
          leadSupports: lead.supports,
          leadContradicts: lead.contradicts,
          allHypotheses: ranked,
          confidence: an.confidence,
          narrative: an.narrative ?? undefined,
        }
      })
      .filter(Boolean) as import('@/types/canvasBrief').CanvasBriefRequest['achFindings']

    if (achFindings.length === 0) {
      pushToast({
        title: 'No ACH matrix on canvas',
        body: 'Brief confidence stays capped without hypothesis testing — add an ACH node when you can.',
        severity: 'info',
        type: 'system',
      })
    }

    // Collect analyst notes — plus any checked patterns, formatted so the brief
    // model recognizes them as analyst-vetted observations with citation hooks.
    const noteEntries = nodes
      .filter(n => n.type === 'note')
      .map(n => (n as CanvasNoteNode).content)
      .filter(c => c.trim())

    const patternsOn = useSettingsStore.getState().patternsEnabled
    const checkedPatterns = patternsOn
      ? (project.patterns ?? []).filter(p => p.includeInBrief)
      : []
    const patternNotes = checkedPatterns.map((p, i) => {
      const total = p.hits + p.misses
      const rateLine = total > 0
        ? `Holds in ${p.hits}/${total} cases (~${Math.round(p.hitRate * 100)}%)`
        : `Hypothesis — not yet quantified against current data`
      const cited = p.evidence.eventIds.length ? ` Cited events: ${p.evidence.eventIds.join(', ')}.` : ''
      return `[PATTERN P${i + 1} · ${p.source.toUpperCase()}] "${p.name}"\nIF ${p.if}\nTHEN ${p.then}\n${rateLine}.${cited}`
    })

    const analystNotes = [...noteEntries, ...patternNotes]

    const { alerts, situations, flaggedAlerts } = useMapStore.getState()
    const canvasPapers = collectCanvasPapers(nodes)
    const journalPapers = journalPapersForBrief(project)
    const papers = [...canvasPapers, ...journalPapers].filter((p, i, arr) =>
      arr.findIndex(x => x.title === p.title) === i,
    ).slice(0, 8)

    const workspaceContext = project
      ? buildWorkspaceContextBlock(
          project,
          { events: mapEvents, alerts, situations, flaggedAlerts },
          usePlotsStore.getState().plots,
          { omitJournal: papers.length > 0 },
        )
      : undefined

    try {
      const res = await fetch('/api/canvas-brief', {
        method: 'POST',
        headers: buildAiFetchHeaders('brief', analysisEngine, project),
        body: JSON.stringify({
          projectName: project.name,
          researchQuestion: project.researchQuestion ?? project.goalTemplateId ?? 'General intelligence analysis',
          regionName: project.regionName,
          workspaceContext,
          events: canvasEvents,
          achFindings,
          analystNotes,
          papers,
          watchEntities: project.targeting?.watchEntities,
          countryCodes: project.countryCodes,
          apiKey: project.aiMode === 'byok' ? project.byokApiKey : undefined,
        }),
      })
      if (!res.ok) {
        let msg = 'Could not generate canvas brief'
        try {
          const err = await res.json() as { hint?: string; error?: string; code?: string }
          msg = err.hint ?? err.error ?? msg
          // Never dump raw provider JSON into the toast
          if (/^\d{3}\s*\{/.test(msg) || msg.includes('"authentication_error"')) {
            msg = 'AI API key rejected — update keys in Settings or .env.local, then retry.'
          }
        } catch { /* ignore */ }
        pushToast({
          title: analysisEngine === 'ai' ? 'AI brief unavailable' : 'Brief unavailable',
          body: msg,
          severity: 'medium',
          type: 'system',
        })
        return
      }
      const data = await res.json() as {
        offline?: boolean
        warning?: string
        headline?: string
        [key: string]: unknown
      }
      setBrief(data)
      if (data.offline || data.warning) {
        const rulesOnPurpose = analysisEngine === 'rules'
        pushToast({
          title: rulesOnPurpose ? 'Rules-based brief' : 'Fell back to rules brief',
          body: rulesOnPurpose
            ? 'Analysis engine is set to Rules. Switch to AI in the canvas menu for a generative draft.'
            : (data.warning ?? 'AI unavailable - rules brief generated instead.'),
          severity: 'low',
          type: 'system',
        })
      }
      void saveBriefToHistory({
        type: 'canvas',
        title: `${project.name} canvas brief`,
        projectId: project.id,
        brief: data as Record<string, unknown>,
      })
    } catch (err) {
      console.error('[canvas-brief]', err)
      pushToast({
        title: 'Brief unavailable',
        body: 'Could not generate canvas brief',
        severity: 'medium',
        type: 'system',
      })
    } finally {
      setBriefLoading(false)
    }
  }

  const importEvents = () => {
    if (!project) return
    const existingIds = new Set(
      nodes.filter(n => n.type === 'event').map(n => (n as CanvasEventNode).eventId)
    )
    // Read from the live map store (not project.events which starts empty each session)
    const toAdd = [...mapEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 20)
      .filter(e => !existingIds.has(e.id))
    if (!toAdd.length) return

    persistIntelEventsIfMissing(project, toAdd as IntelEvent[], addProjectEvents, updateProjectEvent, { keepDuration: 'forever' })

    const cols = 4
    const colW = 300
    const rowH = 190
    const totalW = cols * colW
    const totalH = Math.ceil(toAdd.length / cols) * rowH

    // Place grid starting at canvas origin (0,0) — we'll pan to it below
    const positions = toAdd.map((_, i) => ({
      x: (i % cols) * colW,
      y: Math.floor(i / cols) * rowH,
    }))

    toAdd.forEach((ev, i) => {
      addCanvasNode(project.id, {
        id: `cn_${Date.now()}_${i}`,
        type: 'event',
        eventId: ev.id,
        x: positions[i].x,
        y: positions[i].y,
      })
    })

    // Immediately pan+zoom to fit all new nodes into view
    const vp = viewportRef.current
    if (!vp) return
    const vw = vp.clientWidth, vh = vp.clientHeight
    const pad = 48
    const minX = -pad, minY = -pad
    const maxX = totalW + pad, maxY = totalH + pad
    const nz = Math.min(vw / (maxX - minX), vh / (maxY - minY), 1.0)
    const np = {
      x: -minX * nz + (vw - (maxX - minX) * nz) / 2,
      y: -minY * nz + (vh - (maxY - minY) * nz) / 2,
    }
    zoomRef.current = nz
    panRef.current  = np
    setZoom(nz)
    setPan(np)
  }

  // ── Fit to view ───────────────────────────────────────────────────────────
  const fitToView = () => {
    if (!nodes.length) return
    const vp = viewportRef.current
    if (!vp) return
    const vw = vp.clientWidth, vh = vp.clientHeight
    const pad = 60
    const minX = Math.min(...nodes.map(n => n.x)) - pad
    const minY = Math.min(...nodes.map(n => n.y)) - pad
    const maxX = Math.max(...nodes.map(n => n.x + nodeW(n))) + pad
    const maxY = Math.max(...nodes.map(n => n.y + nodeH(n))) + pad
    const nz = Math.min(vw / (maxX - minX), vh / (maxY - minY), 1.4)
    const np = {
      x: -minX * nz + (vw - (maxX - minX) * nz) / 2,
      y: -minY * nz + (vh - (maxY - minY) * nz) / 2,
    }
    zoomRef.current = nz
    panRef.current = np
    setZoom(nz)
    setPan(np)
  }

  const tidyLayout = () => {
    if (!project || nodes.length === 0) return
    layoutCanvasNodes(project.id, computeTidyCanvasPositions(nodes))
    requestAnimationFrame(() => fitToView())
  }

  const timelineLayout = () => {
    if (!project || nodes.length === 0) return
    const meta = new Map<string, { timestamp?: string; country?: string }>()
    for (const e of events) meta.set(e.id, { timestamp: (e as { timestamp?: string }).timestamp, country: e.country })
    for (const e of mapEvents) meta.set(e.id, { timestamp: e.timestamp, country: e.country })
    layoutCanvasNodes(project.id, computeTimelinePositions(nodes, meta))
    requestAnimationFrame(() => fitToView())
  }

  // ── Edge path ─────────────────────────────────────────────────────────────
  const edgePath = (sx: number, sy: number, tx: number, ty: number) => {
    const dx = Math.abs(tx - sx)
    const dy = Math.abs(ty - sy)
    const bend = Math.max(dx * 0.45, Math.min(dy * 0.25, 100))
    return `M ${sx} ${sy} C ${sx + bend} ${sy} ${tx - bend} ${ty} ${tx} ${ty}`
  }

  // ── Minimap math ─────────────────────────────────────────────────────────
  const MM_W = 152, MM_H = 102
  const mmNodes = nodes.length > 0 ? nodes : []
  const mmMinX = mmNodes.length ? Math.min(...mmNodes.map(n => n.x)) : 0
  const mmMinY = mmNodes.length ? Math.min(...mmNodes.map(n => n.y)) : 0
  const mmMaxX = mmNodes.length ? Math.max(...mmNodes.map(n => n.x + nodeW(n))) : 1000
  const mmMaxY = mmNodes.length ? Math.max(...mmNodes.map(n => n.y + nodeH(n))) : 700
  const mmScaleX = MM_W / Math.max(mmMaxX - mmMinX, 1)
  const mmScaleY = MM_H / Math.max(mmMaxY - mmMinY, 1)
  const mmScale  = Math.min(mmScaleX, mmScaleY) * 0.82
  const mmOX = (MM_W - (mmMaxX - mmMinX) * mmScale) / 2
  const mmOY = (MM_H - (mmMaxY - mmMinY) * mmScale) / 2
  const toMM = (cx: number, cy: number) => ({
    x: (cx - mmMinX) * mmScale + mmOX,
    y: (cy - mmMinY) * mmScale + mmOY,
  })

  // ── In-progress edge source ───────────────────────────────────────────────
  const connectSrcNode = (connecting && connecting !== '__waiting__')
    ? nodes.find(n => n.id === connecting) : null
  const connectSrc = connectSrcNode ? nodeCenter(connectSrcNode) : null

  // ── Visual tokens ─────────────────────────────────────────────────────────
  const dark = false
  const { surface, border, txt, muted, dotClr } = canvasTokens(dark)
  const gridSpacing = 30 * zoom

  const gridStyle = {
    backgroundImage: `radial-gradient(circle, ${dotClr} 1.5px, transparent 1.5px)`,
    backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
    backgroundPosition: `${pan.x % gridSpacing}px ${pan.y % gridSpacing}px`,
  }

  return (
    <div className="ui-fullscreen-workspace ui-canvas-root ui-canvas-root--fullscreen">

      <header className="ui-canvas-toolbar" onMouseDown={e => e.stopPropagation()}>
        <button
          type="button"
          className="ui-canvas-back-btn"
          onClick={() => focusWorkbench('map')}
          title="Back to map (Esc)"
        >
          <ChevronLeft size={14} strokeWidth={2.25} />
          Map
        </button>

        {nodes.length > 0 && (
          <span className="ui-canvas-toolbar__meta tabular-nums">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''}
            {edges.length > 0 ? ` · ${edges.length} edge${edges.length !== 1 ? 's' : ''}` : ''}
          </span>
        )}

        <div className="ui-canvas-toolbar__strip">
        <div className="ui-canvas-toolbar__primary">
          <TBtn onClick={importEvents} title="Import 20 most recent events from this project">
            <Activity size={12} /> Import
          </TBtn>
          <TBtn onClick={addNote}>
            <FileText size={12} /> Note
          </TBtn>

          <div className="ui-canvas-toolbar__menu-anchor" ref={addMenuAnchorRef}>
            <button
              type="button"
              className={`ui-canvas-add-btn${showCanvasAdd || showEntityForm || showPaperSearch ? ' ui-canvas-add-btn--open' : ''}`}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => {
                setConnecting(null)
                setShowCanvasMore(false)
                setShowEntityForm(false)
                setShowPaperSearch(false)
                setShowCanvasAdd(v => !v)
              }}
              aria-expanded={showCanvasAdd || showEntityForm || showPaperSearch}
              aria-haspopup="menu"
            >
              <span className="ui-canvas-add-btn__label">
                <Plus size={13} strokeWidth={2.25} />
                Add
              </span>
              <span className="ui-canvas-add-btn__caret" aria-hidden>
                <ChevronDown size={12} strokeWidth={2.25} />
              </span>
            </button>
          </div>

          <button
            type="button"
            className="ui-btn ui-btn--primary ui-canvas-brief-btn"
            onClick={() => {
              const evCount = nodes.filter(n => n.type === 'event').length
              if (evCount === 0 && !window.confirm('No events on the canvas yet.\n\nImport some first, or generate anyway?')) return
              generateBrief()
            }}
            disabled={briefLoading}
            title={[
              briefInputsLine,
              `Draft brief from canvas — ${nodes.filter(n => n.type === 'event').length} events`,
            ].filter(Boolean).join(' · ')}
          >
            {briefLoading ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Newspaper size={12} />}
            {briefLoading ? 'Writing…' : 'Brief'}
          </button>
        </div>

        <div className="ui-canvas-toolbar__spacer" />

        <div className="ui-canvas-toolbar__tools">
          <TBtn
            onClick={() => setConnecting(v => v !== null ? null : '__waiting__')}
            active={connecting !== null}
          >
            <Link2 size={12} />
            {connecting === null ? 'Link' : connecting === '__waiting__' ? 'Source…' : 'Target…'}
          </TBtn>

          {selected && edges.find(e => e.id === selected) && (() => {
            const selEdge = edges.find(e => e.id === selected)!
            return (
              <div className="ui-canvas-edge-kinds">
                {(Object.keys(EDGE_COLORS) as CanvasEdgeKind[]).map(kind => (
                  <button
                    key={kind}
                    type="button"
                    title={kind.replace('_', ' ')}
                    onClick={() => project && updateCanvasEdge(project.id, selected, { kind })}
                    className={`ui-canvas-edge-kind${selEdge.kind === kind ? ' ui-canvas-edge-kind--active' : ''}`}
                    style={{
                      ['--edge-color' as string]: EDGE_COLORS[kind],
                      borderColor: selEdge.kind === kind ? EDGE_COLORS[kind] : 'transparent',
                      background: selEdge.kind === kind ? `color-mix(in srgb, ${EDGE_COLORS[kind]} 14%, transparent)` : 'transparent',
                      color: selEdge.kind === kind ? EDGE_COLORS[kind] : 'var(--text-muted)',
                    }}
                  >
                    {kind.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )
          })()}

          {selected && (
            <TBtn onClick={() => {
              if (!project || !selected) return
              if (nodes.find(n => n.id === selected)) removeCanvasNode(project.id, selected)
              else removeCanvasEdge(project.id, selected)
              setSelected(null)
            }} danger>
              <Trash2 size={12} />
            </TBtn>
          )}

          <div className="ui-canvas-toolbar__divider" />

          <TBtn
            onClick={() => {
              useMapStore.getState().focusWorkbench('map')
              useMapStore.getState().togglePanel('ledger')
            }}
            title="Open prediction ledger"
          >
            <BookOpen size={12} />
            Ledger
            {(project?.predictionLedger ?? []).filter(e => !e.validatedOutcome).length > 0 && (
              <span className="ui-chip ui-chip--xs" style={{ marginLeft: 2, minWidth: 16, justify: 'center' }}>
                {(project?.predictionLedger ?? []).filter(e => !e.validatedOutcome).length}
              </span>
            )}
          </TBtn>

          <div className="ui-canvas-toolbar__divider" />

          <IBtn onClick={() => setZoom(z => Math.min(3, z * 1.2))} title="Zoom in"><ZoomIn size={13} /></IBtn>
          <span className="ui-canvas-zoom-label tabular-nums">{Math.round(zoom * 100)}%</span>
          <IBtn onClick={() => setZoom(z => Math.max(0.18, z / 1.2))} title="Zoom out"><ZoomOut size={13} /></IBtn>
          <IBtn onClick={fitToView} title="Fit all nodes to view"><Maximize2 size={13} /></IBtn>

          <div className="ui-canvas-toolbar__menu-anchor" ref={moreMenuAnchorRef}>
            <IBtn
              onMouseDown={e => e.stopPropagation()}
              onClick={() => {
                setConnecting(null)
                setShowCanvasAdd(false)
                setShowEntityForm(false)
                setShowPaperSearch(false)
                setShowCanvasMore(v => !v)
              }}
              title="More tools"
            >
              <MoreHorizontal size={14} />
            </IBtn>
          </div>
        </div>
        </div>
      </header>

      {/* ── Canvas viewport ──────────────────────────────────────────────────── */}
      <div
        ref={viewportRef}
        className="ui-canvas-viewport"
        style={{
          ...gridStyle,
          cursor: connecting !== null ? 'crosshair' : isActivePanning ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleViewportMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {nodes.length === 0 && (
          <div className="ui-canvas-empty">
            <div className="ui-canvas-empty__glyph">◉ ─── ◉<br />│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br />◉ ─── ◉</div>
            <div className="ui-panel-empty__title">Analyst Canvas</div>
            <p className="ui-feed-hint" style={{ maxWidth: 380, margin: '0 auto 20px', lineHeight: 1.75 }}>
              Import events, link them on the board, then write a brief.
            </p>
            <div className="ui-canvas-empty__actions">
              <button type="button" onClick={importEvents} className="ui-btn ui-btn--primary">
                <Activity size={12} /> Import events
              </button>
              <button type="button" onClick={addNote} className="ui-btn ui-btn--ghost">
                <FileText size={12} /> Add note
              </button>
              <button type="button" onClick={() => { addACHNode(); setShowCanvasMore(false) }} className="ui-btn ui-btn--ghost">
                <BarChart2 size={12} /> ACH matrix
              </button>
            </div>
            <p className="ui-feed-hint" style={{ marginTop: 16, opacity: 0.7 }}>
              Scroll to zoom · Drag to pan · Del to delete
            </p>
          </div>
        )}

        {/* ── Canvas transform layer ────────────────────────────────────────── */}
        <div style={{
          position: 'absolute',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}>

          {/* SVG — edges live here (canvas-space coords, scales with zoom) */}
          <svg
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', width: 1, height: 1 }}
            aria-hidden="true"
          >
            <defs>
              {(Object.entries(EDGE_COLORS) as [CanvasEdgeKind, string][]).map(([kind, color]) => (
                <marker key={kind} id={`ac-ah-${kind}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill={color} />
                </marker>
              ))}
              <marker id="ac-ah-preview" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--text-muted)" />
              </marker>
            </defs>

            {/* Committed edges */}
            {edges.map(edge => {
              const src = nodes.find(n => n.id === edge.source)
              const tgt = nodes.find(n => n.id === edge.target)
              if (!src || !tgt) return null
              const sc = nodeCenter(src)
              const tc = nodeCenter(tgt)
              const color = EDGE_COLORS[edge.kind]
              const isSel = selected === edge.id
              return (
                <g key={edge.id} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); setSelected(s => s === edge.id ? null : edge.id) }}>
                  <path d={edgePath(sc.x, sc.y, tc.x, tc.y)} stroke="transparent" strokeWidth={14} fill="none" />
                  <path
                    d={edgePath(sc.x, sc.y, tc.x, tc.y)}
                    stroke={isSel ? 'var(--text-primary)' : color}
                    strokeWidth={isSel ? 2.5 : 1.5}
                    fill="none"
                    markerEnd={`url(#ac-ah-${edge.kind})`}
                    opacity={0.85}
                  />
                </g>
              )
            })}

            {/* In-progress connection */}
            {connectSrc && (
              <path
                d={edgePath(connectSrc.x, connectSrc.y, mouseCanvas.x, mouseCanvas.y)}
                stroke="var(--text-muted)"
                strokeWidth={1.5}
                fill="none"
                strokeDasharray="6 3"
                markerEnd="url(#ac-ah-preview)"
                opacity={0.7}
              />
            )}
          </svg>

          {/* Nodes */}
          {nodes.map(node => (
            <NodeCard
              key={node.id}
              node={node}
              events={events}
              mapEvents={mapEvents as NodeCardProps['mapEvents']}
              allNodes={nodes}
              allEdges={edges}
              dark={dark}
              selected={selected === node.id}
              isConnectSource={connecting === node.id}
              inConnectMode={connecting !== null}
              editingNote={editingNote === node.id}
              projectId={project?.id ?? ''}
              researchQuestion={project?.researchQuestion ?? project?.name ?? ''}
              analysisEngine={analysisEngine}
              projectAiMode={project?.aiMode}
              byokApiKey={project?.byokApiKey}
              caseLabelsByEvent={caseLabelsByEvent}
              onMouseDown={e => handleNodeMouseDown(e, node)}
              onClick={e => handleNodeClick(e, node)}
              onUpdateNode={patch => project && updateCanvasNode(project.id, node.id, patch as Partial<CanvasNode>)}
              onUpdateNote={content => project && updateCanvasNode(project.id, node.id, { content } as Partial<CanvasNode>)}
              onStartEditNote={() => { setEditingNote(node.id); setSelected(node.id) }}
              onAddPrediction={entry => addPrediction(project?.id ?? '', entry)}
              onUpdatePrediction={(entryId, patch) => updatePrediction(project?.id ?? '', entryId, patch)}
              onTrackForecast={f => project && addForecast(project.id, f)}
            />
          ))}
        </div>

        {/* ── Connect mode banner ───────────────────────────────────────────── */}
        {connecting !== null && (
          <div className={`ui-canvas-banner ${connecting === '__waiting__' ? 'ui-canvas-banner--wait' : 'ui-canvas-banner--target'}`}>
            {connecting === '__waiting__'
              ? '① Click the source node'
              : '② Click the target node — Esc to cancel'}
          </div>
        )}

        {/* ── Stats strip ───────────────────────────────────────────────────── */}
        {nodes.length > 0 && (
          <div style={{
            position: 'absolute', bottom: nodes.length > 0 ? 126 : 16, right: 16,
            fontSize: 10, fontFamily: 'monospace', color: muted, textAlign: 'right',
          }}>
            {nodes.length} nodes · {edges.length} edges
          </div>
        )}

        {/* ── Minimap ───────────────────────────────────────────────────────── */}
        {nodes.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 16, right: 16,
            width: MM_W, height: MM_H,
            background: dark ? 'rgba(13,17,23,0.88)' : 'rgba(240,244,248,0.92)',
            border: `1px solid ${border}`, borderRadius: 'var(--radius-md)', overflow: 'hidden',
            backdropFilter: 'blur(4px)', pointerEvents: 'none',
          }}>
            <svg width={MM_W} height={MM_H}>
              {nodes.map(n => {
                const p = toMM(n.x, n.y)
                const w = Math.max(nodeW(n) * mmScale, 4)
                const h = Math.max(nodeH(n) * mmScale, 3)
                const evRaw = n.type === 'event' ? (events.find(e => e.id === (n as CanvasEventNode).eventId) ?? (mapEvents as unknown as UniversalEvent[]).find(e => e.id === (n as CanvasEventNode).eventId)) : null
                const ev = evRaw
                const fill = n.type === 'event'
                  ? SEV_COLOR(typeof ev?.severity === 'number' ? ev.severity : ev?.severity === 'critical' ? 9 : ev?.severity === 'high' ? 7 : 5)
                  : n.type === 'note'       ? 'var(--medium)'
                  : n.type === 'source'     ? 'var(--info)'
                  : n.type === 'assessment' ? 'var(--accent)'
                  : n.type === 'ach'        ? 'var(--accent)'
                  : 'var(--medium)'
                return <rect key={n.id} x={p.x} y={p.y} width={w} height={h} rx={1} fill={fill} opacity={0.45} />
              })}
              {/* Viewport rect */}
              {(() => {
                const vp = viewportRef.current
                if (!vp) return null
                const vw = vp.clientWidth, vh = vp.clientHeight
                const tl = toMM(-pan.x / zoom, -pan.y / zoom)
                const br = toMM((-pan.x + vw) / zoom, (-pan.y + vh) / zoom)
                return (
                  <rect x={tl.x} y={tl.y} width={Math.max(br.x - tl.x, 6)} height={Math.max(br.y - tl.y, 4)}
                    rx={2} fill="none" stroke={dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)'} strokeWidth={1} />
                )
              })()}
            </svg>
          </div>
        )}
      </div>

      {/* ── Brief modal ───────────────────────────────────────────────────── */}
      {brief && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(3px)',
          }}
          onClick={() => setBrief(null)}
        >
          <div
            style={{
              width: '90%', maxWidth: 680, maxHeight: '88vh',
              background: surface, border: `1px solid ${border}`, borderRadius: 'var(--radius-xl)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              padding: '14px 18px', borderBottom: `1px solid ${border}`,
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <Newspaper size={14} color="var(--accent)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: txt }}>Assessment brief</div>
                <div style={{ fontSize: 10, color: muted }}>{project?.name} · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</div>
              </div>
              <div style={{
                fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                background: brief.offline ? 'var(--surface-elevated)' : 'color-mix(in srgb, var(--accent) 12%, transparent)',
                color: brief.offline ? muted : 'var(--accent)',
                border: `1px solid ${brief.offline ? 'var(--border)' : 'color-mix(in srgb, var(--accent) 35%, var(--border))'}`,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                {brief.offline ? 'Rules' : 'AI ✦'}
              </div>
              {(() => {
                const risk = riskLevelStyle(brief.riskLevel)
                return (
              <div style={{
                fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 'var(--radius-sm)',
                background: risk.bg,
                color: risk.color,
                border: `1px solid color-mix(in srgb, ${risk.color} 35%, var(--border))`,
                letterSpacing: '0.08em',
              }}>
                {brief.riskLevel}
              </div>
                )
              })()}
              <button
                onClick={() => {
                  const text = [
                    `ASSESSMENT BRIEF — ${project?.name?.toUpperCase()}`,
                    `DATE: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}`,
                    `RISK LEVEL: ${brief.riskLevel}`,
                    '',
                    `HEADLINE: ${brief.headline}`,
                    '',
                    `SITUATION\n${brief.situation}`,
                    '',
                    `KEY FINDINGS\n${brief.keyFindings.map(f => `• ${f}`).join('\n')}`,
                    '',
                    `RISK ASSESSMENT\n${brief.riskRationale}`,
                    '',
                    `ACH ANALYSIS\n${brief.assessmentInsight}`,
                    '',
                    `ANALYST JUDGMENT\n${brief.analystJudgment}`,
                    '',
                    `WATCH ITEMS\n${brief.watchItems.map(w => `• ${w}`).join('\n')}`,
                    '',
                    `CONFIDENCE: ${brief.confidence} — ${brief.confidenceRationale}`,
                  ].join('\n')
                  navigator.clipboard.writeText(text)
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${border}`, background: 'transparent', color: muted, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
              >
                <Copy size={10} /> Copy
              </button>
              <button onClick={() => setBrief(null)} style={{ display: 'flex', alignItems: 'center', padding: 4, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: muted, cursor: 'pointer' }}>
                <XIcon size={14} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Honest framing — copy matches AI vs rules output */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 11px', borderRadius: 'var(--radius-md)',
                background: brief.offline ? 'var(--surface-elevated)' : 'var(--badge-yellow-bg)',
                border: `1px solid ${brief.offline ? 'var(--border)' : 'var(--badge-yellow-border)'}`,
                fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.5,
              }}>
                <AlertTriangle size={13} style={{ color: brief.offline ? muted : 'var(--high)', flexShrink: 0, marginTop: 1 }} />
                <span>
                  {brief.offline ? (
                    <><strong style={{ color: 'var(--text-primary)' }}>Rules-based brief — not AI.</strong> Built from categories, severity, ACH, and source grading because generative AI was unavailable or turned off. Verify sources; the judgment is still yours.</>
                  ) : (
                    <><strong style={{ color: 'var(--text-primary)' }}>AI draft — verify before citing.</strong> A summary of the evidence on your board, not a finished assessment. Check the source links and grades; the judgment is yours.</>
                  )}
                  {brief.warning ? <> <em style={{ color: 'var(--text-primary)' }}>({brief.warning})</em></> : null}
                </span>
              </div>
              {/* Headline */}
              <div style={{ fontSize: 16, fontWeight: 700, color: txt, lineHeight: 1.4, borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>
                {brief.headline}
              </div>

              <Section label="SITUATION" dark={dark}>
                <p style={{ margin: 0, fontSize: 12, color: txt, lineHeight: 1.75 }}>{brief.situation}</p>
              </Section>

              <Section label="KEY FINDINGS" dark={dark}>
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {brief.keyFindings.map((f, i) => (
                    <li key={i} style={{ fontSize: 12, color: txt, lineHeight: 1.6 }}>{f}</li>
                  ))}
                </ul>
              </Section>

              <Section label="RISK RATIONALE" dark={dark}>
                <p style={{ margin: 0, fontSize: 12, color: txt, lineHeight: 1.7 }}>{brief.riskRationale}</p>
              </Section>

              <Section label="ACH ANALYSIS" dark={dark}>
                <p style={{ margin: 0, fontSize: 12, color: txt, lineHeight: 1.7 }}>{brief.assessmentInsight}</p>
              </Section>

              <Section label="ANALYST JUDGMENT" dark={dark}>
                <p style={{ margin: 0, fontSize: 12, color: txt, lineHeight: 1.75, fontStyle: 'italic' }}>{brief.analystJudgment}</p>
              </Section>

              <Section label="WATCH ITEMS — NEXT 30 DAYS" dark={dark}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {brief.watchItems.map((w, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: txt, lineHeight: 1.6 }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ minWidth: 0 }}>{w}</span>
                    </div>
                  ))}
                </div>
              </Section>

              {(() => {
                const conf = confidenceStyle(brief.confidence)
                return (
              <div style={{
                padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 10,
                background: conf.bg,
                border: `1px solid ${conf.border}`,
                color: 'var(--text-muted)',
              }}>
                <span style={{ fontWeight: 700, color: conf.color }}>
                  CONFIDENCE: {brief.confidence}
                </span>
                {' — '}{brief.confidenceRationale}
              </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {portalReady && canvasMenuOpen && createPortal(
        <>
          <div
            className="ui-canvas-menu-backdrop"
            onMouseDown={e => { e.preventDefault(); closeCanvasMenus() }}
            aria-hidden
          />
          {showCanvasAdd && addMenuRect && (
            <div
              className="ui-dropdown-menu ui-canvas-add-menu ui-canvas-menu-portal"
              role="menu"
              style={{ top: addMenuRect.bottom + 8, left: addMenuRect.left }}
              onMouseDown={e => e.stopPropagation()}
            >
              <button type="button" role="menuitem" className="ui-canvas-add-menu__item" onClick={() => { setShowEntityForm(true); setShowPaperSearch(false); setShowCanvasAdd(false) }}>
                <span className="ui-canvas-add-menu__icon ui-canvas-add-menu__icon--entity"><Globe size={14} /></span>
                <span className="ui-canvas-add-menu__copy">
                  <span className="ui-canvas-add-menu__title">Entity</span>
                  <span className="ui-canvas-add-menu__hint">Country, actor, org…</span>
                </span>
              </button>
              <button type="button" role="menuitem" className="ui-canvas-add-menu__item" onClick={() => { setShowPaperSearch(true); setShowEntityForm(false); setShowCanvasAdd(false) }}>
                <span className="ui-canvas-add-menu__icon ui-canvas-add-menu__icon--paper"><BookOpen size={14} /></span>
                <span className="ui-canvas-add-menu__copy">
                  <span className="ui-canvas-add-menu__title">Paper</span>
                  <span className="ui-canvas-add-menu__hint">Search academic sources</span>
                </span>
              </button>
            </div>
          )}
          {showEntityForm && addMenuRect && (
            <div
              className="ui-canvas-popover ui-canvas-menu-portal"
              style={{ top: addMenuRect.bottom + 8, left: addMenuRect.left }}
              onMouseDown={e => e.stopPropagation()}
            >
              {(project?.trackedActors?.length ?? 0) > 0 && (
                <>
                  <div className="ui-section-label" style={{ marginBottom: 6 }}>Your tracked actors</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                    {project!.trackedActors!.map(a => {
                      const on = canvasEntityLabels.has(a.name.toLowerCase())
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => { if (!on) addEntity(a.name, 'actor') }}
                          disabled={on}
                          className="ui-chip ui-chip--xs"
                          style={{ cursor: on ? 'default' : 'pointer', opacity: on ? 0.5 : 1, gap: 4 }}
                          title={on ? 'Already on canvas' : `Add ${a.name} to canvas`}
                        >
                          {on ? <Check size={9} /> : <Plus size={9} />}{a.name}
                        </button>
                      )
                    })}
                  </div>
                  <div className="ui-section-label" style={{ marginBottom: 6 }}>Or add another</div>
                </>
              )}
              <input
                autoFocus
                value={entityLabel}
                onChange={e => setEntityLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitEntity(); if (e.key === 'Escape') closeCanvasMenus() }}
                placeholder="Name (e.g. Iran, Ladakh)"
                className="ui-input ui-input--compact"
                style={{ width: '100%', marginBottom: 8 }}
              />
              <select
                value={entityType}
                onChange={e => setEntityType(e.target.value as CanvasEntityNode['entityType'])}
                className="ui-input ui-input--compact"
                style={{ width: '100%', marginBottom: 10, cursor: 'pointer' }}
              >
                <option value="country">Country</option>
                <option value="actor">Actor</option>
                <option value="organization">Organization</option>
                <option value="location">Location</option>
              </select>
              <button
                type="button"
                onClick={submitEntity}
                disabled={!entityLabel.trim()}
                className="ui-btn ui-btn--primary ui-btn--block"
                style={{ justifyContent: 'center' }}
              >
                Add to canvas
              </button>
            </div>
          )}
          {showPaperSearch && addMenuRect && (
            <div
              className="ui-canvas-popover ui-canvas-popover--wide ui-canvas-menu-portal"
              style={{ top: addMenuRect.bottom + 8, left: addMenuRect.left }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="ui-canvas-popover__head">
                <div className="ui-journal-detail-fullscreen__section-label" style={{ marginBottom: 6 }}>Academic papers</div>
                <div className="ui-input-wrap">
                  <Search size={12} className="ui-input-wrap__icon" />
                  <input
                    autoFocus
                    value={paperQuery}
                    onChange={e => searchPapers(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') closeCanvasMenus() }}
                    placeholder="Search Semantic Scholar…"
                    className="ui-input ui-input--compact"
                    style={{ width: '100%', paddingLeft: 28, paddingRight: paperLoading ? 28 : undefined }}
                  />
                  {paperLoading && (
                    <Loader size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', animation: 'spin 0.8s linear infinite', pointerEvents: 'none', color: 'var(--text-muted)' }} />
                  )}
                </div>
              </div>
              <div className="ui-canvas-popover__body">
                {paperResults.length === 0 && !paperLoading && paperQuery.trim() && (
                  <div className="ui-panel-empty" style={{ padding: '20px 12px' }}>
                    <div className="ui-panel-empty__title">No results</div>
                  </div>
                )}
                {paperResults.length === 0 && !paperQuery.trim() && (
                  <div className="ui-panel-empty" style={{ padding: '20px 12px' }}>
                    <p className="ui-feed-hint" style={{ lineHeight: 1.55 }}>
                      Type to search academic papers — saved to canvas + research journal
                    </p>
                  </div>
                )}
                {paperResults.map(paper => (
                  <div key={paper.id} onClick={() => addPaperNode(paper)} className="ui-canvas-popover__row">
                    <div className="ui-journal-paper-hit__title" style={{ marginBottom: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {paper.title}
                    </div>
                    <div className="ui-journal-paper-hit__meta" style={{ marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(paper.authors ?? []).slice(0, 3).join(', ')}{paper.year ? ` · ${paper.year}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {showCanvasMore && moreMenuRect && (
            <div
              className="ui-dropdown-menu ui-canvas-menu-portal"
              style={{ top: moreMenuRect.bottom + 8, right: window.innerWidth - moreMenuRect.right, minWidth: 200 }}
              onMouseDown={e => e.stopPropagation()}
            >
              <button type="button" className="ui-dropdown-item" onClick={() => { addACHNode(); closeCanvasMenus() }}>
                <BarChart2 size={12} /> ACH matrix
              </button>
              <button type="button" className="ui-dropdown-item" onClick={() => { addIndicatorNode(); closeCanvasMenus() }}>
                <Activity size={12} /> Indicators &amp; warnings
              </button>
              <button type="button" className="ui-dropdown-item" onClick={() => {
                closeCanvasMenus()
                openJournal('patterns')
                pushToast({ title: 'Patterns in Research', body: 'Use the Patterns tab to scan and manage if/then sequences.', severity: 'info', type: 'system' })
              }}>
                <Sparkles size={12} /> Patterns
                {project?.patterns?.length ? ` (${project.patterns.length})` : ''}
              </button>
              <div style={{ height: 1, margin: '4px 0', background: 'var(--border-subtle)' }} />
              {nodes.length > 0 && (
                <button type="button" className="ui-dropdown-item" onClick={() => { tidyLayout(); closeCanvasMenus() }}>
                  <LayoutGrid size={12} /> Tidy layout
                </button>
              )}
              {nodes.some(n => n.type === 'event') && (
                <button type="button" className="ui-dropdown-item" onClick={() => { timelineLayout(); closeCanvasMenus() }}>
                  <Clock size={12} /> Timeline layout
                </button>
              )}
              {nodes.length > 0 && (
                <button type="button" className="ui-dropdown-item ui-dropdown-item--danger" onClick={() => { if (project && confirm('Clear the canvas?')) clearAnalystCanvas(project.id); closeCanvasMenus() }}>
                  <Trash2 size={12} /> Clear canvas
                </button>
              )}
              <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)' }}>
                <AnalysisEngineToggle
                  compact
                  value={analysisEngine}
                  aiAvailable={aiAvailable}
                  onChange={v => { setAnalysisEngine(v); saveAnalysisEngine(v) }}
                />
              </div>
            </div>
          )}
        </>,
        document.body,
      )}
    </div>
  )
}

// ── Section helper ────────────────────────────────────────────────────────────

function Section({ label, children, dark }: { label: string; children: React.ReactNode; dark: boolean }) {
  const border = 'var(--border)'
  const muted  = 'var(--text-muted)'
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 'var(--radius-md)' }}>
      <div style={{ padding: '5px 12px', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${border}`, borderRadius: '8px 8px 0 0' }}>
        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', color: muted, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ padding: '10px 12px' }}>{children}</div>
    </div>
  )
}

// Map any canvas event representation to the minimal shape TrustChip/sourceWeight need.
function trustInputOf(ev: { rawSource?: string; source?: string; sourceReliability?: string; sourceCredibility?: number; corroborationCount?: number; timestamp?: string }) {
  return {
    source: (ev.rawSource ?? ev.source ?? '') as IntelEvent['source'],
    sourceReliability: ev.sourceReliability,
    sourceCredibility: ev.sourceCredibility,
    corroborationCount: ev.corroborationCount,
    timestamp: ev.timestamp,
  }
}

// ── NodeCard ──────────────────────────────────────────────────────────────────

interface NodeCardProps {
  node: CanvasNode
  events: UniversalEvent[]
  mapEvents: Array<{ id: string; title?: string; summary?: string; category?: string; country?: string; timestamp: string; severity?: string; source?: string; actors?: Array<{ name: string }> }>
  allNodes: CanvasNode[]
  allEdges: CanvasEdge[]
  dark: boolean
  selected: boolean
  isConnectSource: boolean
  inConnectMode: boolean
  editingNote: boolean
  projectId: string
  researchQuestion: string
  analysisEngine: AnalysisEngine
  projectAiMode?: import('@/types/project').Project['aiMode']
  byokApiKey?: string
  caseLabelsByEvent: Map<string, string[]>
  onMouseDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
  onUpdateNode: (patch: Partial<CanvasNode>) => void
  onUpdateNote: (content: string) => void
  onStartEditNote: () => void
  onAddPrediction: (entry: import('@/types/project').PredictionEntry) => void
  onUpdatePrediction: (entryId: string, patch: Partial<import('@/types/project').PredictionEntry>) => void
  onTrackForecast: (f: Omit<Forecast, 'id' | 'createdAt'>) => void
}

function NodeCard({ node, events, mapEvents, allNodes, allEdges, dark, selected, isConnectSource, inConnectMode, editingNote, projectId, researchQuestion, analysisEngine, projectAiMode, byokApiKey, caseLabelsByEvent, onMouseDown, onClick, onUpdateNode, onUpdateNote, onStartEditNote, onAddPrediction, onUpdatePrediction, onTrackForecast }: NodeCardProps) {
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const { surface, border, txt, muted } = canvasTokens(dark)

  const w = NODE_W[node.type] ?? 260
  const ringColor = isConnectSource ? 'var(--medium)' : selected ? 'var(--accent)' : 'transparent'

  const base: React.CSSProperties = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    width: w,
    background: surface,
    border: `1px solid ${border}`,
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    cursor: inConnectMode ? 'pointer' : 'move',
    userSelect: 'none',
    boxShadow: (selected || isConnectSource)
      ? `0 0 0 2px ${ringColor}, 0 8px 28px rgba(0,0,0,0.22)`
      : '0 3px 16px rgba(0,0,0,0.12)',
    transition: 'box-shadow 100ms',
  }

  // ── Event node ─────────────────────────────────────────────────────────
  if (node.type === 'event') {
    const evId = (node as CanvasEventNode).eventId
    const rawEv = events.find(e => e.id === evId) as (UniversalEvent & { source?: string }) | undefined
    const mapEv = rawEv ? null : (mapEvents as unknown as Array<{ id: string; title?: string; summary?: string; category?: string; country?: string; timestamp: string; severity?: string; source?: string; actors?: Array<{ name: string }> }>).find(e => e.id === evId)
    const ev = rawEv ?? (mapEv ? { ...mapEv, severity: mapEv.severity === 'critical' ? 9 : mapEv.severity === 'high' ? 7 : mapEv.severity === 'medium' ? 5 : 2, rawSource: mapEv.source ?? 'gdelt' } as unknown as UniversalEvent : null)
    if (!ev) {
      return (
        <div style={{ ...base, padding: 12, fontSize: 11, color: muted }} onMouseDown={onMouseDown} onClick={onClick}>
          Event not found
        </div>
      )
    }
    const sev = typeof ev.severity === 'number' ? ev.severity : 5
    const sevColor = SEV_COLOR(sev)
    const catColor = CAT_COLOR[ev.category] ?? 'var(--text-muted)'
    const hoursAgo = (Date.now() - new Date(ev.timestamp).getTime()) / 3_600_000
    const timeLabel = hoursAgo < 1 ? '<1h' : hoursAgo < 24 ? `${Math.round(hoursAgo)}h` : `${Math.round(hoursAgo / 24)}d`
    const caseLabels = caseLabelsByEvent.get(evId) ?? []

    return (
      <div style={base} onMouseDown={onMouseDown} onClick={onClick}>
        {/* Severity stripe */}
        <div style={{ height: 3, background: sevColor }} />

        {/* Header row */}
        <div style={{ padding: '7px 10px 6px', display: 'flex', alignItems: 'center', gap: 5, borderBottom: `1px solid ${border}` }}>
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: '0.07em', color: catColor,
            background: `${catColor}18`, border: `1px solid ${catColor}30`,
            borderRadius: 'var(--radius-sm)', padding: '1px 5px', flexShrink: 0, textTransform: 'uppercase',
          }}>{ev.category}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: muted, fontFamily: 'monospace', flexShrink: 0 }}>
            {(ev.rawSource ?? '').toUpperCase()}
          </span>
          <TrustChip event={trustInputOf(ev as Parameters<typeof trustInputOf>[0])} size="xs" />
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sevColor, flexShrink: 0 }} />
        </div>

        {/* Title */}
        <div style={{
          padding: '8px 10px 4px', fontSize: 12, fontWeight: 700, color: txt, lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {ev.title}
        </div>

        {/* Country + time */}
        <div style={{ padding: '0 10px 6px', fontSize: 10, color: muted, display: 'flex', justifyContent: 'space-between' }}>
          <span>{displayCountry(ev.country)}</span>
          <span>{timeLabel} ago</span>
        </div>

        {/* Summary */}
        {ev.summary && (
          <div style={{
            margin: '0 10px 8px', padding: '6px 8px',
            background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            borderRadius: 'var(--radius-sm)', fontSize: 10, color: muted, lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {ev.summary}
          </div>
        )}

        {caseLabels.length > 0 && (
          <div style={{ padding: '0 10px 8px', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {caseLabels.slice(0, 2).map(name => (
              <span key={name} title={`Case: ${name}`} style={{
                fontSize: 8, fontWeight: 700, color: 'var(--accent)',
                background: 'var(--accent-tint)', border: '1px solid var(--badge-blue-border)',
                borderRadius: 'var(--radius-sm)', padding: '1px 5px', maxWidth: 120,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Actor chips */}
        {ev.actors && ev.actors.length > 0 && (
          <div style={{ padding: '0 10px 4px', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {ev.actors.slice(0, 3).map((a, i) => (
              <span key={i} style={{
                fontSize: 9, color: muted, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                borderRadius: 'var(--radius-sm)', padding: '1px 5px',
              }}>
                {a.name}
              </span>
            ))}
          </div>
        )}

        {/* Open Details footer */}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setSelectedEvent(ev as unknown as import('@/types').IntelEvent) }}
          style={{
            display: 'block', width: '100%', padding: '6px 10px',
            textAlign: 'right', fontSize: 10, fontWeight: 600,
            color: 'var(--accent)',
            background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            borderTop: `1px solid ${border}`,
            border: 'none', borderTopStyle: 'solid', borderTopColor: border, borderTopWidth: 1,
            cursor: 'pointer',
          }}
        >
          Open Details →
        </button>
      </div>
    )
  }

  // ── Note node ─────────────────────────────────────────────────────────
  if (node.type === 'note') {
    const n = node as CanvasNoteNode
    return (
      <div style={{ ...base, minHeight: NODE_H.note }} onMouseDown={onMouseDown} onClick={onClick}>
        <div style={{ height: 3, background: 'var(--medium)' }} />
        <div style={{ padding: '7px 10px 5px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${border}` }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', color: 'var(--medium)', textTransform: 'uppercase' }}>
            Analyst Note
          </span>
        </div>
        <div style={{ padding: '8px 10px 10px' }}>
          {editingNote ? (
            <textarea
              autoFocus
              value={n.content}
              onChange={e => onUpdateNote(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              placeholder="Write your analysis…"
              style={{
                width: '100%', boxSizing: 'border-box', minHeight: 76, resize: 'vertical',
                background: 'transparent', border: 'none', outline: 'none',
                fontSize: 12, color: txt, fontFamily: 'inherit', lineHeight: 1.65, padding: 0,
              }}
            />
          ) : (
            <div
              style={{ fontSize: 12, color: n.content ? txt : muted, lineHeight: 1.65, minHeight: 60, whiteSpace: 'pre-wrap', cursor: 'text' }}
              onDoubleClick={e => { e.stopPropagation(); onStartEditNote() }}
            >
              {n.content || 'Double-click to write…'}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Entity node ──────────────────────────────────────────────────────
  if (node.type === 'entity') {
    const en = node as CanvasEntityNode
    const color = 'var(--medium)'
    const EntIcon = ENTITY_ICON[en.entityType] ?? Globe
    return (
      <div style={{ ...base, height: NODE_H.entity }} onMouseDown={onMouseDown} onClick={onClick}>
        <div style={{ height: 3, background: color }} />
        <div style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 10, height: 'calc(100% - 3px)', boxSizing: 'border-box' }}>
          <div style={{ flexShrink: 0, color, display: 'flex' }}><EntIcon size={20} strokeWidth={2} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color, textTransform: 'uppercase', marginBottom: 3 }}>
              {en.entityType}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
              {en.label}
            </div>
            {en.description && (
              <div style={{ fontSize: 10, color: muted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {en.description}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Source node (academic paper) ──────────────────────────────────────
  if (node.type === 'source') {
    const sn = node as CanvasSourceNode
    const color = 'var(--info)'
    return (
      <div style={{ ...base, height: NODE_H.source }} onMouseDown={onMouseDown} onClick={onClick}>
        <div style={{ height: 3, background: color }} />
        <div style={{ padding: '6px 10px 5px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${border}` }}>
          <BookOpen size={9} color={color} strokeWidth={2.5} />
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', color, textTransform: 'uppercase' }}>Academic Source</span>
          {sn.year && (
            <span style={{ fontSize: 9, color: muted, marginLeft: 'auto', fontFamily: 'monospace' }}>{sn.year}</span>
          )}
        </div>
        <div style={{ padding: '7px 10px 4px' }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: txt, lineHeight: 1.3, marginBottom: 4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {sn.title}
          </div>
          {sn.authors.length > 0 && (
            <div style={{ fontSize: 9, color: muted, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sn.authors.slice(0, 3).join(', ')}{sn.authors.length > 3 ? ` +${sn.authors.length - 3}` : ''}
            </div>
          )}
          {sn.venue && (
            <div style={{ fontSize: 9, color, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
              {sn.venue}
            </div>
          )}
          {sn.abstract && (
            <div style={{
              fontSize: 10, color: muted, lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {sn.abstract}
            </div>
          )}
        </div>
        {sn.url && (
          <div style={{ padding: '3px 10px 7px' }}>
            <a
              href={sn.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 9, color, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink size={8} /> Open paper
            </a>
          </div>
        )}
      </div>
    )
  }

  // ── Assessment node ───────────────────────────────────────────────────
  if (node.type === 'assessment') {
    return (
      <AssessmentCard
        node={node as CanvasAssessmentNode}
        events={events}
        mapEvents={mapEvents}
        allNodes={allNodes}
        allEdges={allEdges}
        dark={dark}
        selected={selected}
        isConnectSource={isConnectSource}
        inConnectMode={inConnectMode}
        projectId={projectId}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onUpdateNode={onUpdateNode as (patch: Partial<CanvasAssessmentNode>) => void}
        onAddPrediction={onAddPrediction}
        onUpdatePrediction={onUpdatePrediction}
      />
    )
  }

  // ── ACH node ──────────────────────────────────────────────────────────
  if (node.type === 'ach') {
    return (
      <ACHCard
        node={node as CanvasACHNode}
        events={events}
        mapEvents={mapEvents}
        allNodes={allNodes}
        allEdges={allEdges}
        dark={dark}
        selected={selected}
        isConnectSource={isConnectSource}
        inConnectMode={inConnectMode}
        projectId={projectId}
        researchQuestion={researchQuestion}
        analysisEngine={analysisEngine}
        projectAiMode={projectAiMode}
        byokApiKey={byokApiKey}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onUpdateNode={onUpdateNode as (patch: Partial<CanvasACHNode>) => void}
        onAddPrediction={onAddPrediction}
        onTrackForecast={onTrackForecast}
      />
    )
  }

  // ── Indicators & Warning node ─────────────────────────────────────────
  if (node.type === 'indicator') {
    return (
      <IndicatorCard
        node={node as CanvasIndicatorNode}
        events={events}
        mapEvents={mapEvents}
        dark={dark}
        selected={selected}
        isConnectSource={isConnectSource}
        inConnectMode={inConnectMode}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onUpdateNode={onUpdateNode as (patch: Partial<CanvasIndicatorNode>) => void}
      />
    )
  }

  return null
}

// ── ACH card ──────────────────────────────────────────────────────────────────

function ACHCard({ node, events, mapEvents, allNodes, allEdges, dark, selected, isConnectSource, inConnectMode, projectId, researchQuestion, analysisEngine, projectAiMode, byokApiKey, onMouseDown, onClick, onUpdateNode, onAddPrediction, onTrackForecast }: {
  node: CanvasACHNode
  events: UniversalEvent[]
  mapEvents: NodeCardProps['mapEvents']
  allNodes: CanvasNode[]
  allEdges: CanvasEdge[]
  dark: boolean
  selected: boolean
  isConnectSource: boolean
  inConnectMode: boolean
  projectId: string
  researchQuestion: string
  analysisEngine: AnalysisEngine
  projectAiMode?: import('@/types/project').Project['aiMode']
  byokApiKey?: string
  onMouseDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
  onUpdateNode: (patch: Partial<CanvasACHNode>) => void
  onAddPrediction: (entry: import('@/types/project').PredictionEntry) => void
  onTrackForecast: (f: Omit<Forecast, 'id' | 'createdAt'>) => void
}) {
  const { surface, border, txt, muted, accent } = canvasTokens(dark)
  const pushToast = useMapStore(s => s.pushToast)
  const project = useProjectStore(s => s.getActiveProject())

  const [localScoring, setLocalScoring] = useState(false)
  const [hypothesesDirty, setHypothesesDirty] = useState(false)
  const [showJournalPicker, setShowJournalPicker] = useState(false)
  const lastScoredKeyRef = useRef<string>('')
  // Close-the-loop forecast control — probability % + horizon date, seeded from confidence.
  const [fcProb, setFcProb] = useState(() => node.confidence === 'high' ? 75 : node.confidence === 'low' ? 35 : 55)
  const [fcDue, setFcDue] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10))

  const ringColor = isConnectSource ? 'var(--medium)' : selected ? 'var(--accent)' : 'transparent'
  const base: React.CSSProperties = {
    position: 'absolute', left: node.x, top: node.y, width: 380,
    background: surface, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)',
    overflow: 'hidden', cursor: inConnectMode ? 'pointer' : 'move', userSelect: 'none',
    boxShadow: (selected || isConnectSource)
      ? `0 0 0 2px ${ringColor}, 0 8px 28px rgba(0,0,0,0.22)`
      : '0 3px 16px rgba(0,0,0,0.12)',
    transition: 'box-shadow 100ms',
  }

  // Resolve connected event nodes
  const connectedEdges      = allEdges.filter(e => e.source === node.id || e.target === node.id)
  const connectedNodeIds    = connectedEdges.map(e => e.source === node.id ? e.target : e.source)
  const connectedEventNodes = allNodes.filter(n => connectedNodeIds.includes(n.id) && n.type === 'event') as import('@/types/project').CanvasEventNode[]
  const connectedEvents     = connectedEventNodes.map(cn => {
    const evId = cn.eventId
    const full = events.find(e => e.id === evId)
    if (full) return { ev: full, nodeId: cn.id }
    const live = (mapEvents as unknown as Array<{ id: string; title?: string; summary?: string; category?: string; country?: string; severity?: string; actors?: Array<{ name: string }> }>).find(e => e.id === evId)
    return live ? { ev: { ...live, severity: live.severity === 'critical' ? 9 : live.severity === 'high' ? 7 : live.severity === 'medium' ? 5 : 2 } as UniversalEvent, nodeId: cn.id } : null
  }).filter(Boolean) as Array<{ ev: UniversalEvent; nodeId: string }>

  const journalEvidenceIds = node.journalEvidenceIds ?? []
  const journalEvidence = (project?.journal ?? [])
    .filter(e => journalEvidenceIds.includes(e.id))
    .map(journalEntryToAchEvidence)

  const availableJournal = (project?.journal ?? []).filter(e => !journalEvidenceIds.includes(e.id))

  type MatrixCol = {
    nodeId: string
    title: string
    label: string
    source: 'canvas' | 'journal'
  }

  let eventIdx = 0
  let journalIdx = 0
  const matrixCols: MatrixCol[] = [
    ...connectedEvents.map(ce => {
      eventIdx += 1
      return { nodeId: ce.nodeId, title: ce.ev.title, label: `E${eventIdx}`, source: 'canvas' as const }
    }),
    ...journalEvidence.map(je => {
      journalIdx += 1
      return { nodeId: je.nodeId, title: je.title, label: `J${journalIdx}`, source: 'journal' as const }
    }),
  ]

  const attachJournalEntry = (entryId: string) => {
    if (journalEvidenceIds.includes(entryId)) return
    onUpdateNode({ journalEvidenceIds: [...journalEvidenceIds, entryId] })
    setShowJournalPicker(false)
  }

  const detachJournalEntry = (entryId: string) => {
    onUpdateNode({
      journalEvidenceIds: journalEvidenceIds.filter(id => id !== entryId),
      scores: node.scores.filter(s => s.nodeId !== `journal:${entryId}`),
    })
  }

  const totalEvidenceCount = connectedEvents.length + journalEvidence.length

  // Evidence quality of the connected events — a conclusion built on weak/unverified
  // sources should visibly read low-confidence (same NATO grading as the feed/detail).
  const evidenceConf = connectedEvents.length
    ? connectedEvents.reduce((s, ce) => s + eventConfidence(trustInputOf(ce.ev as Parameters<typeof trustInputOf>[0])), 0) / connectedEvents.length
    : 0
  const evidenceColor = evidenceConf >= 0.75 ? 'var(--low)' : evidenceConf >= 0.5 ? 'var(--medium)' : 'var(--text-muted)'

  const hasHypotheses   = node.hypotheses.length >= 2 && node.hypotheses.every(h => h.text.trim())
  const currentEventKey = connectedEvents.map(ce => ce.nodeId).sort().join(',')
  const currentJournalKey = journalEvidenceIds.slice().sort().join(',')
  const currentHypoKey  = node.hypotheses.map(h => h.id + h.text).join('|')
  const currentKey      = currentEventKey + '::' + currentJournalKey + '::' + currentHypoKey

  const scoreNow = async () => {
    if (localScoring || totalEvidenceCount === 0 || !hasHypotheses) return
    setLocalScoring(true)
    try {
      const eventPayload = [
        ...connectedEvents.map(ce => {
          const intel = ce.ev as unknown as { body?: string; analystComments?: string[] }
          return {
            nodeId: ce.nodeId,
            title: ce.ev.title,
            summary: ce.ev.summary,
            body: intel.body,
            analystComments: intel.analystComments,
            category: ce.ev.category,
            country: ce.ev.country,
            severity: severityToNumber(ce.ev.severity as string | number),
          }
        }),
        ...journalEvidence.map(je => ({
          nodeId: je.nodeId,
          title: je.title,
          summary: je.summary,
          body: je.body,
          analystComments: je.analystComments,
          category: je.category,
          country: je.country,
          severity: je.severity,
        })),
      ]
      const res = await fetch('/api/ach-score', {
        method: 'POST',
        headers: buildAiFetchHeaders('brief', analysisEngine, { aiMode: projectAiMode ?? 'none', byokApiKey }),
        body: JSON.stringify({
          researchQuestion,
          hypotheses: node.hypotheses,
          events: eventPayload,
          apiKey: projectAiMode === 'byok' ? byokApiKey : undefined,
        }),
      })
      if (!res.ok) {
        let msg = 'Scoring failed'
        try {
          const err = await res.json()
          msg = err.hint ?? err.error ?? msg
        } catch { /* ignore */ }
        pushToast({
          title: analysisEngine === 'ai' ? 'AI scoring unavailable' : 'Scoring unavailable',
          body: msg,
          severity: 'medium',
          type: 'system',
        })
        return
      }
      const data = await res.json()
      onUpdateNode({ scores: data.scores, scoredAt: new Date().toISOString() })
      lastScoredKeyRef.current = currentKey
      setHypothesesDirty(false)
    } catch (err) {
      console.error('[ach-score]', err)
      pushToast({
        title: 'ACH scoring failed',
        body: 'Could not score hypotheses against events',
        severity: 'medium',
        type: 'system',
      })
    } finally {
      setLocalScoring(false)
    }
  }

  // Auto-score when canvas or journal evidence changes (not on hypothesis text changes)
  useEffect(() => {
    if (totalEvidenceCount === 0 || !hasHypotheses) return
    const prev = lastScoredKeyRef.current.split('::')
    const prevEvents = prev[0] ?? ''
    const prevJournal = prev[1] ?? ''
    if (currentEventKey === prevEvents && currentJournalKey === prevJournal) return
    scoreNow()
  }, [connectedEvents.length, currentEventKey, currentJournalKey, journalEvidence.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hypothesis ranking (Heuer: fewest contradictions wins; tiebreak by net score)
  const ranked = [...node.hypotheses].map(h => {
    const s = node.scores.filter(sc => sc.hypothesisId === h.id)
    const supports    = s.filter(sc => sc.rating === 'supports').length
    const contradicts = s.filter(sc => sc.rating === 'contradicts').length
    return { ...h, supports, contradicts, net: supports - contradicts }
  }).sort((a, b) => a.contradicts !== b.contradicts ? a.contradicts - b.contradicts : b.net - a.net)

  const lead      = ranked[0]
  const hasScores = node.scores.length > 0

  const getCell = (nodeId: string, hypoId: string) =>
    node.scores.find(s => s.nodeId === nodeId && s.hypothesisId === hypoId)

  const RATING_STYLE = {
    supports:    { icon: '✓', color: 'var(--low)', bg: 'var(--badge-green-bg)' },
    neutral:     { icon: '—', color: muted,     bg: 'transparent' },
    contradicts: { icon: '✗', color: 'var(--critical)', bg: 'var(--badge-red-bg)' },
  }

  const addHypothesis = () => {
    if (node.hypotheses.length >= 4) return
    onUpdateNode({ hypotheses: [...node.hypotheses, { id: `h_${Date.now()}`, text: '' }] })
  }
  const removeHypothesis = (id: string) => {
    if (node.hypotheses.length <= 2) return
    onUpdateNode({
      hypotheses: node.hypotheses.filter(h => h.id !== id),
      scores: node.scores.filter(s => s.hypothesisId !== id),
    })
  }
  const updateHypothesisText = (id: string, text: string) => {
    onUpdateNode({ hypotheses: node.hypotheses.map(h => h.id === id ? { ...h, text } : h) })
    setHypothesesDirty(true)
  }

  // Max evidence columns in matrix (scroll for overflow)
  const matrixDisplay = matrixCols.slice(0, 10)

  return (
    <div style={base} onMouseDown={onMouseDown} onClick={onClick}>
      {/* Accent stripe */}
      <div style={{ height: 3, background: accent }} />

      {/* Header */}
      <div style={{ padding: '7px 10px 6px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${border}` }}>
        <BarChart2 size={10} color={accent} strokeWidth={2.5} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', color: accent, textTransform: 'uppercase', flex: 1 }}>
          ACH — Competing Hypotheses
        </span>
        <span style={{ fontSize: 8, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {analysisEngine === 'ai' ? 'AI ✦' : 'Rules'}
        </span>
        {localScoring && <Loader size={10} color={accent} style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
        {!localScoring && hasScores && hypothesesDirty && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); scoreNow() }}
            style={{ padding: '2px 7px', fontSize: 8, fontWeight: 700, borderRadius: 'var(--radius-sm)', border: `1px solid ${accent}`, background: accent, color: '#fff', cursor: 'pointer', flexShrink: 0 }}
          >
            Re-score
          </button>
        )}
      </div>

      {/* Hypothesis inputs */}
      <div style={{ padding: '8px 10px 6px', borderBottom: `1px solid ${border}` }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ fontSize: 8, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
          Hypotheses {node.hypotheses.length < 4 && <span style={{ color: accent, cursor: 'pointer', fontWeight: 800, marginLeft: 4 }} onClick={addHypothesis}>+ Add</span>}
        </div>
        {node.hypotheses.map((h, i) => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: muted, width: 14, flexShrink: 0 }}>H{i + 1}</span>
            <input
              value={h.text}
              onChange={e => { e.stopPropagation(); updateHypothesisText(h.id, e.target.value) }}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
              placeholder={`Hypothesis ${i + 1}…`}
              style={{
                flex: 1, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${border}`, borderRadius: 'var(--radius-sm)',
                padding: '3px 6px', fontSize: 9, color: txt, outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            {node.hypotheses.length > 2 && (
              <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeHypothesis(h.id) }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', padding: '0 2px', fontSize: 12, lineHeight: 1 }}>×</button>
            )}
          </div>
        ))}
        {!hasHypotheses && (
          <div style={{ fontSize: 8, color: muted, marginTop: 3 }}>Fill in all hypotheses to begin scoring</div>
        )}
        {hasHypotheses && totalEvidenceCount === 0 && (
          <div style={{ fontSize: 8, color: muted, marginTop: 3 }}>
            Hypotheses ready — link event cards or attach journal entries, then scoring runs automatically
          </div>
        )}
        {journalEvidence.length > 0 && (
          <div style={{ fontSize: 8, color: accent, marginTop: 4 }}>
            {journalEvidence.length} journal entr{journalEvidence.length === 1 ? 'y' : 'ies'} attached as evidence columns
          </div>
        )}
      </div>

      {/* Journal evidence attachment */}
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${border}`, fontSize: 9 }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 8, flex: 1 }}>
            Journal evidence
          </span>
          {availableJournal.length > 0 && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setShowJournalPicker(v => !v) }}
              style={{ padding: '2px 6px', fontSize: 8, fontWeight: 700, borderRadius: 'var(--radius-sm)', border: `1px solid ${border}`, background: 'transparent', color: accent, cursor: 'pointer' }}
            >
              + Attach
            </button>
          )}
        </div>
        {journalEvidence.length === 0 ? (
          <span style={{ color: muted }}>Attach saved events, papers, or notes from the research journal</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {journalEvidence.map(je => (
              <span key={je.journalEntryId} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 'var(--radius-sm)', background: dark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.08)', fontSize: 8, maxWidth: '100%' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={je.title}>{je.title}</span>
                <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); detachJournalEntry(je.journalEntryId) }} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
        {showJournalPicker && availableJournal.length > 0 && (
          <div style={{ marginTop: 6, maxHeight: 90, overflowY: 'auto', border: `1px solid ${border}`, borderRadius: 'var(--radius-sm)' }}>
            {availableJournal.slice(0, 12).map(entry => (
              <button
                key={entry.id}
                type="button"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); attachJournalEntry(entry.id) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 6px', fontSize: 8, border: 'none', borderBottom: `1px solid ${border}`, background: 'transparent', color: txt, cursor: 'pointer' }}
              >
                <span style={{ color: accent, fontWeight: 700, marginRight: 4 }}>{entry.kind}</span>
                {entry.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Event connection status */}
      {(() => {
        const canvasEventCount = allNodes.filter(n => n.type === 'event').length
        const unlinked = canvasEventCount - connectedEvents.length
        return (
          <div style={{ padding: '5px 10px', borderBottom: hasScores ? `1px solid ${border}` : 'none', fontSize: 9, color: totalEvidenceCount > 0 ? accent : muted, background: totalEvidenceCount > 0 ? (dark ? 'rgba(124,58,237,0.08)' : 'rgba(124,58,237,0.05)') : 'transparent' }} onMouseDown={e => e.stopPropagation()}>
            {localScoring
              ? `⚡ Scoring ${totalEvidenceCount} evidence item${totalEvidenceCount !== 1 ? 's' : ''} against ${node.hypotheses.length} hypotheses…`
              : totalEvidenceCount > 0
              ? <>
                  {hasScores
                    ? `⚡ ${totalEvidenceCount} evidence item${totalEvidenceCount !== 1 ? 's' : ''} scored${node.scoredAt ? ' · ' + new Date(node.scoredAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}`
                    : `${totalEvidenceCount} evidence item${totalEvidenceCount !== 1 ? 's' : ''} ready — ${hasHypotheses ? 'scoring…' : 'fill hypotheses first'}`
                  }
                  {journalEvidence.length > 0 && <span style={{ color: muted, marginLeft: 6 }}>· {journalEvidence.length} from journal</span>}
                  {unlinked > 0 && connectedEvents.length > 0 && <span style={{ color: muted, marginLeft: 6 }}>· {unlinked} more on canvas not linked</span>}
                </>
              : canvasEventCount > 0 || (project?.journal?.length ?? 0) > 0
              ? <span>
                  Link event cards or attach journal entries to score hypotheses
                </span>
              : <span>No event cards on canvas yet — use <strong>Import Events</strong> to add events, then link them here</span>
            }
          </div>
        )
      })()}

      {/* ACH matrix */}
      {hasScores && matrixDisplay.length > 0 && (
        <div style={{ overflowX: 'auto', borderBottom: `1px solid ${border}` }} onMouseDown={e => e.stopPropagation()}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 160 }} />
              {matrixDisplay.map(col => <col key={col.nodeId} style={{ width: 22 }} />)}
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', textAlign: 'left', color: muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 7 }}>Hypothesis</th>
                {matrixDisplay.map(col => (
                  <th key={col.nodeId} style={{ padding: '4px 2px', textAlign: 'center', color: col.source === 'journal' ? accent : muted, fontWeight: 700 }} title={col.title}>
                    {col.label}
                  </th>
                ))}
                <th style={{ padding: '4px 6px', textAlign: 'center', color: muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 7 }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((h, ri) => {
                const isLead = ri === 0
                const scoreColor = h.net > 0 ? 'var(--low)' : h.net < 0 ? 'var(--critical)' : muted
                return (
                  <tr key={h.id} style={{ background: isLead ? (dark ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.06)') : 'transparent' }}>
                    <td style={{ padding: '4px 8px', color: isLead ? accent : txt, fontWeight: isLead ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isLead && <span style={{ marginRight: 3 }}>★</span>}{h.text || `H${ri + 1}`}
                    </td>
                    {matrixDisplay.map(col => {
                      const cell = getCell(col.nodeId, h.id)
                      const rs   = cell ? RATING_STYLE[cell.rating] : null
                      return (
                        <td key={col.nodeId} title={cell?.rationale} style={{ textAlign: 'center', padding: '3px 2px', background: rs?.bg, color: rs?.color, fontWeight: 700, fontSize: 9 }}>
                          {rs?.icon ?? '·'}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 800, color: scoreColor, fontFamily: 'monospace', fontSize: 10 }}>
                      {h.net > 0 ? `+${h.net}` : h.net}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {matrixCols.length > 10 && (
            <div style={{ padding: '3px 8px', fontSize: 8, color: muted }}>+{matrixCols.length - 10} more evidence columns not shown in matrix</div>
          )}
        </div>
      )}

      {/* Lead hypothesis + confidence */}
      {hasScores && lead && (
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${border}` }} onMouseDown={e => e.stopPropagation()}>
          <div style={{ fontSize: 8, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Lead assessment</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: accent, marginBottom: 4, lineHeight: 1.3 }}>
            {lead.text || 'Unnamed hypothesis'} <span style={{ fontWeight: 400, color: muted }}>({lead.supports} for, {lead.contradicts} against)</span>
          </div>
          {totalEvidenceCount > 0 && (
            <div style={{ fontSize: 8, fontWeight: 600, color: evidenceColor, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}
              title="Mean NATO source grade of the connected evidence — weak/unverified sources lower this">
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: evidenceColor, display: 'inline-block' }} />
              Evidence: {connectedEvents.length > 0 ? confidenceLabel(evidenceConf) : 'journal'} · {totalEvidenceCount} source{totalEvidenceCount !== 1 ? 's' : ''}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['high', 'moderate', 'low'] as const).map(c => (
              <button
                key={c}
                onClick={e => { e.stopPropagation(); onUpdateNode({ confidence: c }) }}
                style={{
                  padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 8, fontWeight: 700, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  border: `1px solid ${node.confidence === c ? confidenceStyle(c === 'high' ? 'HIGH' : c === 'moderate' ? 'MODERATE' : 'LOW').border : border}`,
                  background: node.confidence === c ? confidenceStyle(c === 'high' ? 'HIGH' : c === 'moderate' ? 'MODERATE' : 'LOW').bg : 'transparent',
                  color: node.confidence === c ? confidenceStyle(c === 'high' ? 'HIGH' : c === 'moderate' ? 'MODERATE' : 'LOW').color : muted,
                }}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Close the loop — promote the lead hypothesis to a calibrated, Brier-scored forecast */}
          {node.forecastTracked ? (
            <div style={{ marginTop: 8, fontSize: 9, color: 'var(--low)', fontWeight: 600 }}>
              ✓ Tracked as forecast — resolve it in the Forecasts panel to score calibration
            </div>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Forecast</span>
              <input
                type="number" min={1} max={99} value={fcProb}
                onChange={e => { e.stopPropagation(); setFcProb(Math.max(1, Math.min(99, Number(e.target.value) || 0))) }}
                onMouseDown={e => e.stopPropagation()}
                style={{ width: 38, fontSize: 9, padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: `1px solid ${border}`, background: surface, color: txt, textAlign: 'center' }}
              />
              <span style={{ fontSize: 9, color: muted }}>%</span>
              <input
                type="date" value={fcDue}
                onChange={e => { e.stopPropagation(); setFcDue(e.target.value) }}
                onMouseDown={e => e.stopPropagation()}
                style={{ fontSize: 9, padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: `1px solid ${border}`, background: surface, color: txt }}
              />
              <button
                onClick={e => {
                  e.stopPropagation()
                  if (!lead.text.trim() || !fcDue) return
                  onTrackForecast({
                    statement: lead.text.trim(),
                    probability: fcProb / 100,
                    dueDate: fcDue,
                    basis: node.narrative?.trim() || `ACH lead hypothesis (${lead.supports} for, ${lead.contradicts} against)`,
                    projectId,
                  })
                  onUpdateNode({ forecastTracked: true })
                  pushToast({ title: 'Forecast tracked', body: 'Resolve it in the Forecasts panel to score calibration (Brier).', severity: 'info', type: 'system' })
                }}
                style={{ padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 8, fontWeight: 700, border: 'none', background: accent, color: '#fff', cursor: 'pointer' }}
              >
                Track →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Analyst narrative */}
      <div style={{ padding: '6px 10px 4px', borderTop: `1px solid ${border}` }} onMouseDown={e => e.stopPropagation()}>
        <textarea
          value={node.narrative ?? ''}
          onChange={e => { e.stopPropagation(); onUpdateNode({ narrative: e.target.value }) }}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          placeholder="Analyst judgment or caveats…"
          rows={2}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'none', background: 'transparent', border: 'none', outline: 'none', fontSize: 9, color: muted, fontFamily: 'inherit', lineHeight: 1.55, padding: 0 }}
        />
      </div>

      {/* Record to ledger */}
      <div style={{ padding: '0 10px 8px' }} onMouseDown={e => e.stopPropagation()}>
        {node.ledgerEntryId ? (
          <button
            type="button"
            className="ui-link"
            style={{ fontSize: 9, fontWeight: 600, color: 'var(--low)' }}
            onClick={e => {
              e.stopPropagation()
              useMapStore.getState().focusWorkbench('map')
              useMapStore.getState().togglePanel('ledger')
            }}
          >
            ✓ Judgment recorded — open ledger
          </button>
        ) : hasScores && lead ? (
          <button
            onClick={e => {
              e.stopPropagation()
              const achHypotheses = ranked.map(h => ({ text: h.text, supports: h.supports, contradicts: h.contradicts, net: h.net }))
              const confScore = node.confidence === 'high' ? 90 : node.confidence === 'moderate' ? 60 : 30
              const entry: import('@/types/project').PredictionEntry = {
                id: `pl_${Date.now()}`,
                projectId,
                formulaId: 'ach',
                formulaName: 'ACH Analysis',
                timestamp: new Date().toISOString(),
                inputs: Object.fromEntries(ranked.map(h => [h.text.slice(0, 30), h.net])),
                weights: {},
                output: confScore,
                outputLabel: 'Confidence',
                narrative: node.narrative ?? '',
                entryType: 'ach',
                leadHypothesis: lead.text,
                achConfidence: node.confidence,
                achHypotheses,
              }
              onAddPrediction(entry)
              onUpdateNode({ ledgerEntryId: entry.id })
              useMapStore.getState().pushToast({
                title: 'Recorded to ledger',
                body: 'Open Ledger to validate this judgment later.',
                severity: 'info',
                type: 'system',
              })
            }}
            style={{ width: '100%', padding: '5px 0', borderRadius: 'var(--radius-sm)', border: 'none', background: accent, color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          >
            Record Judgment to Ledger
          </button>
        ) : (
          <div style={{ fontSize: 9, color: muted }}>Score events against hypotheses to record a judgment</div>
        )}
      </div>
    </div>
  )
}

// ── Indicators & Warning card ─────────────────────────────────────────────────

function IndicatorCard({ node, events, mapEvents, dark, selected, isConnectSource, inConnectMode, onMouseDown, onClick, onUpdateNode }: {
  node: CanvasIndicatorNode
  events: UniversalEvent[]
  mapEvents: NodeCardProps['mapEvents']
  dark: boolean
  selected: boolean
  isConnectSource: boolean
  inConnectMode: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
  onUpdateNode: (patch: Partial<CanvasIndicatorNode>) => void
}) {
  const { surface, border, txt, muted, accent } = canvasTokens(dark)

  const ringColor = isConnectSource ? 'var(--medium)' : selected ? 'var(--accent)' : 'transparent'
  const base: React.CSSProperties = {
    position: 'absolute', left: node.x, top: node.y, width: 350,
    background: surface, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)',
    overflow: 'hidden', cursor: inConnectMode ? 'pointer' : 'move', userSelect: 'none',
    boxShadow: (selected || isConnectSource)
      ? `0 0 0 2px ${ringColor}, 0 8px 28px rgba(0,0,0,0.22)`
      : '0 3px 16px rgba(0,0,0,0.12)',
    transition: 'box-shadow 100ms',
  }

  // Live corpus for matching: project events + live map events.
  const corpus = useMemo(() => {
    const a = events.map(e => ({ title: e.title, summary: (e as { summary?: string }).summary }))
    const b = (mapEvents ?? []).map(e => ({ title: e.title, summary: e.summary }))
    return [...a, ...b]
  }, [events, mapEvents])

  const evaluated = node.indicators.map(ind => ({ ind, match: evaluateIndicator(ind.keywords, corpus) }))
  const trippedConfirm = evaluated.filter(e => e.match.tripped && e.ind.direction === 'confirms').length
  const trippedRefute  = evaluated.filter(e => e.match.tripped && e.ind.direction === 'refutes').length
  const trippedTotal   = trippedConfirm + trippedRefute

  const updateIndicator = (id: string, patch: Partial<CanvasIndicator>) =>
    onUpdateNode({ indicators: node.indicators.map(i => i.id === id ? { ...i, ...patch } : i) })
  const addIndicator = () =>
    onUpdateNode({ indicators: [...node.indicators, { id: `ind_${Date.now()}`, text: '', keywords: '', direction: 'confirms' }] })
  const removeIndicator = (id: string) =>
    onUpdateNode({ indicators: node.indicators.filter(i => i.id !== id) })

  return (
    <div style={base} onMouseDown={onMouseDown} onClick={onClick}>
      <div style={{ height: 3, background: 'var(--high)' }} />

      {/* Header */}
      <div style={{ padding: '7px 10px 6px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${border}` }}>
        <Activity size={10} color="var(--high)" strokeWidth={2.5} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', color: 'var(--high)', textTransform: 'uppercase', flex: 1 }}>
          Indicators &amp; Warning
        </span>
      </div>

      {/* Title */}
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${border}` }} onMouseDown={e => e.stopPropagation()}>
        <input
          value={node.title}
          onChange={e => { e.stopPropagation(); onUpdateNode({ title: e.target.value }) }}
          onMouseDown={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          placeholder="What are you warning for?"
          style={{ width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none', outline: 'none', fontSize: 11, fontWeight: 700, color: txt, fontFamily: 'inherit' }}
        />
      </div>

      {/* Status strip */}
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 9, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: trippedTotal ? txt : muted }}>
          {trippedTotal} / {node.indicators.length} tripped
        </span>
        {trippedConfirm > 0 && <span style={{ color: 'var(--critical)', fontWeight: 700 }}>▲ {trippedConfirm} confirming</span>}
        {trippedRefute > 0 && <span style={{ color: 'var(--low)', fontWeight: 700 }}>▼ {trippedRefute} refuting</span>}
        {trippedTotal === 0 && <span style={{ color: muted }}>no live matches yet</span>}
      </div>

      {/* Indicators */}
      <div style={{ padding: '4px 8px 8px' }} onMouseDown={e => e.stopPropagation()}>
        {evaluated.map(({ ind, match }) => {
          const dirColor = ind.direction === 'confirms' ? 'var(--critical)' : 'var(--low)'
          return (
            <div key={ind.id} style={{ padding: '5px 4px', borderBottom: `1px solid ${border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={e => { e.stopPropagation(); updateIndicator(ind.id, { direction: ind.direction === 'confirms' ? 'refutes' : 'confirms' }) }}
                  title={ind.direction === 'confirms' ? 'Tripping CONFIRMS the hypothesis — click to flip' : 'Tripping REFUTES the hypothesis — click to flip'}
                  style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 'var(--radius-sm)', border: `1px solid ${dirColor}`, background: match.tripped ? dirColor : 'transparent', color: match.tripped ? '#fff' : dirColor, cursor: 'pointer', fontSize: 9, fontWeight: 800, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {ind.direction === 'confirms' ? '▲' : '▼'}
                </button>
                <input
                  value={ind.text}
                  onChange={e => { e.stopPropagation(); updateIndicator(ind.id, { text: e.target.value }) }}
                  onMouseDown={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                  placeholder="Indicator…"
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 10, fontWeight: match.tripped ? 700 : 500, color: match.tripped ? txt : muted, fontFamily: 'inherit' }}
                />
                {match.tripped && (
                  <span title={match.sampleTitles.join('\n')} style={{ flexShrink: 0, fontSize: 8, fontWeight: 800, color: dirColor, background: `${dirColor}1a`, border: `1px solid ${dirColor}40`, borderRadius: 'var(--radius-sm)', padding: '1px 5px' }}>
                    {match.matchCount}
                  </span>
                )}
                <button onClick={e => { e.stopPropagation(); removeIndicator(ind.id) }} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 0, display: 'flex' }} title="Remove indicator">
                  <XIcon size={11} />
                </button>
              </div>
              <input
                value={ind.keywords}
                onChange={e => { e.stopPropagation(); updateIndicator(ind.id, { keywords: e.target.value }) }}
                onMouseDown={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
                placeholder="match terms, comma-separated"
                style={{ width: '100%', boxSizing: 'border-box', marginTop: 3, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${border}`, borderRadius: 'var(--radius-sm)', padding: '2px 6px', outline: 'none', fontSize: 8, color: muted, fontFamily: 'monospace' }}
              />
            </div>
          )
        })}
        <button
          onClick={e => { e.stopPropagation(); addIndicator() }}
          style={{ marginTop: 6, width: '100%', padding: '4px 0', borderRadius: 'var(--radius-sm)', border: `1px dashed ${border}`, background: 'transparent', color: accent, fontSize: 9, fontWeight: 700, cursor: 'pointer' }}
        >
          + Add indicator
        </button>
      </div>
    </div>
  )
}

// ── Assessment card (needs hooks → own component) ─────────────────────────────

function AssessmentCard({ node, events, mapEvents, allNodes, allEdges, dark, selected, isConnectSource, inConnectMode, projectId, onMouseDown, onClick, onUpdateNode, onAddPrediction, onUpdatePrediction }: {
  node: CanvasAssessmentNode
  events: UniversalEvent[]
  mapEvents: NodeCardProps['mapEvents']
  allNodes: CanvasNode[]
  allEdges: CanvasEdge[]
  dark: boolean
  selected: boolean
  isConnectSource: boolean
  inConnectMode: boolean
  projectId: string
  onMouseDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
  onUpdateNode: (patch: Partial<CanvasAssessmentNode>) => void
  onAddPrediction: (entry: import('@/types/project').PredictionEntry) => void
  onUpdatePrediction: (entryId: string, patch: Partial<import('@/types/project').PredictionEntry>) => void
}) {
  const { surface, border, txt, muted } = canvasTokens(dark)
  const ledger = useProjectStore(s => s.projects.find(p => p.id === projectId)?.predictionLedger ?? [])

  const ringColor = isConnectSource ? 'var(--medium)' : selected ? 'var(--accent)' : 'transparent'
  const base: React.CSSProperties = {
    position: 'absolute', left: node.x, top: node.y,
    width: NODE_W.assessment, minHeight: NODE_H.assessment,
    background: surface, border: `1px solid ${border}`, borderRadius: 'var(--radius-lg)',
    overflow: 'hidden', cursor: inConnectMode ? 'pointer' : 'move', userSelect: 'none',
    boxShadow: (selected || isConnectSource)
      ? `0 0 0 2px ${ringColor}, 0 8px 28px rgba(0,0,0,0.22)`
      : '0 3px 16px rgba(0,0,0,0.12)',
    transition: 'box-shadow 100ms',
  }

  const formula = FORMULA_LIBRARY.find(f => f.id === node.formulaId)

  const connectedEdges     = allEdges.filter(e => e.source === node.id || e.target === node.id)
  const connectedNodeIds   = connectedEdges.map(e => e.source === node.id ? e.target : e.source)
  const connectedEventNodes = allNodes.filter(n => connectedNodeIds.includes(n.id) && n.type === 'event')
  const connectedEvents    = connectedEventNodes
    .map(n => {
      const evId = (n as CanvasEventNode).eventId
      const full = events.find(e => e.id === evId)
      if (full) return full
      const live = (mapEvents as unknown as Array<{ id: string; category?: string; severity?: string; actors?: Array<{ name: string }>; sourceCount?: number }>).find(e => e.id === evId)
      return live ? { ...live, severity: live.severity === 'critical' ? 9 : live.severity === 'high' ? 7 : live.severity === 'medium' ? 5 : 2 } : null
    })
    .filter(Boolean) as UniversalEvent[]

  // Auto-score + auto-record whenever the connected event set changes
  const processedKeyRef = useRef<string>('')
  useEffect(() => {
    if (!formula || connectedEvents.length === 0) return
    const key = connectedEvents.map(e => e.id).sort().join(',')
    if (key === processedKeyRef.current) return
    processedKeyRef.current = key

    const computed = autoScoreFromEvents(formula.id, connectedEvents)
    if (Object.keys(computed).length === 0) return
    const newValues = { ...node.values, ...computed }
    const score = Math.round(executeFormula(formula, newValues))
    const validated = ledger.filter(e => e.formulaId === formula.id && e.validatedOutcome)
    const accuracy = validated.length > 0
      ? validated.filter(e => e.validatedOutcome === 'correct').length / validated.length
      : undefined
    const conf = computeConfidence(formula, newValues, connectedEvents.length, accuracy)
    const narrative = `${node.narrative ?? formula.description} Confidence: ${Math.round(conf.composite * 100)}%.`

    if (!node.ledgerEntryId) {
      const entry: import('@/types/project').PredictionEntry = {
        id: `pl_${Date.now()}`,
        projectId,
        formulaId: formula.id,
        formulaName: formula.name,
        timestamp: new Date().toISOString(),
        inputs: newValues,
        weights: Object.fromEntries(formula.variables.map(v => [v.key, v.weight])),
        output: score,
        outputLabel: formula.outputLabel,
        narrative,
      }
      onAddPrediction(entry)
      onUpdateNode({ values: newValues, ledgerEntryId: entry.id })
    } else {
      onUpdatePrediction(node.ledgerEntryId, {
        inputs: newValues,
        weights: Object.fromEntries(formula.variables.map(v => [v.key, v.weight])),
        output: score,
        outputLabel: formula.outputLabel,
        narrative,
        timestamp: new Date().toISOString(),
      })
      onUpdateNode({ values: newValues })
    }
  }, [connectedEvents.length, connectedEvents.map(e => e.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!formula) {
    return <div style={{ ...base, padding: 12, fontSize: 11, color: muted }} onMouseDown={onMouseDown} onClick={onClick}>Formula not found</div>
  }

  const score      = executeFormula(formula, node.values)
  const scoreColor = formulaScoreColor(score)
  const accent     = 'var(--accent)'

  return (
    <div style={base} onMouseDown={onMouseDown} onClick={onClick}>
      {/* Accent stripe */}
      <div style={{ height: 3, background: accent }} />

      {/* Header */}
      <div style={{ padding: '7px 10px 6px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${border}` }}>
        <BarChart2 size={10} color={accent} strokeWidth={2.5} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.09em', color: accent, textTransform: 'uppercase', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {formula.name}
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor, background: `${scoreColor}15`, border: `1px solid ${scoreColor}30`, borderRadius: 'var(--radius-sm)', padding: '1px 7px', fontFamily: 'monospace', flexShrink: 0 }}>
          {Math.round(score)}
        </span>
        <span style={{ fontSize: 8, color: muted, flexShrink: 0 }}>/100</span>
      </div>

      {/* Event status */}
      <div style={{ margin: '6px 10px 0', padding: '5px 8px', borderRadius: 'var(--radius-md)', fontSize: 9, lineHeight: 1.4, background: connectedEvents.length > 0 ? (dark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.07)') : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'), border: `1px solid ${connectedEvents.length > 0 ? 'rgba(124,58,237,0.25)' : border}`, color: connectedEvents.length > 0 ? accent : muted }} onMouseDown={e => e.stopPropagation()}>
        {connectedEvents.length > 0
          ? <>⚡ <strong>{connectedEvents.length} event{connectedEvents.length !== 1 ? 's' : ''}</strong> auto-scored{node.ledgerEntryId ? ' · logged' : ''}</>
          : 'Connect event nodes — score will compute automatically'
        }
      </div>

      {/* Variable sliders (manual overrides) */}
      <div style={{ padding: '8px 10px 4px' }} onMouseDown={e => e.stopPropagation()}>
        {formula.variables.map(v => (
          <div key={v.key} style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: txt, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '78%' }} title={v.description}>
                {v.label}
              </span>
              <span style={{ fontSize: 9, color: accent, fontFamily: 'monospace', flexShrink: 0 }}>
                {Math.round((node.values[v.key] ?? 0.5) * 100)}
              </span>
            </div>
            <input
              type="range" min={0} max={1} step={0.01}
              value={node.values[v.key] ?? 0.5}
              onChange={e => { e.stopPropagation(); onUpdateNode({ values: { ...node.values, [v.key]: parseFloat(e.target.value) } }) }}
              style={{ width: '100%', accentColor: accent, height: 3, cursor: 'pointer' }}
            />
          </div>
        ))}
      </div>

      {/* Assumptions */}
      {formula.assumptions.length > 0 && (
        <div style={{ padding: '4px 10px 4px', borderTop: `1px solid ${border}` }} onMouseDown={e => e.stopPropagation()}>
          <div style={{ fontSize: 8, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Confirm assumptions</div>
          {formula.assumptions.map(a => {
            const checked = node.assumptionsAccepted.includes(a.id)
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 3, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onUpdateNode({ assumptionsAccepted: checked ? node.assumptionsAccepted.filter(x => x !== a.id) : [...node.assumptionsAccepted, a.id] }) }}>
                {checked ? <CheckSquare size={10} color={accent} style={{ flexShrink: 0, marginTop: 1 }} /> : <Square size={10} color={muted} style={{ flexShrink: 0, marginTop: 1 }} />}
                <span style={{ fontSize: 9, color: checked ? txt : muted, lineHeight: 1.4 }}>{a.text}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Narrative */}
      <div style={{ padding: '4px 10px 6px', borderTop: `1px solid ${border}` }} onMouseDown={e => e.stopPropagation()}>
        <textarea
          value={node.narrative ?? ''}
          onChange={e => { e.stopPropagation(); onUpdateNode({ narrative: e.target.value }) }}
          placeholder="Analyst reasoning (optional)…"
          rows={2}
          style={{ width: '100%', boxSizing: 'border-box', resize: 'none', background: 'transparent', border: 'none', outline: 'none', fontSize: 9, color: muted, fontFamily: 'inherit', lineHeight: 1.55, padding: 0 }}
        />
      </div>

      {/* Ledger status */}
      <div style={{ padding: '0 10px 8px', fontSize: 9 }} onMouseDown={e => e.stopPropagation()}>
        {node.ledgerEntryId
          ? (
            <button
              type="button"
              className="ui-link"
              style={{ fontSize: 9, fontWeight: 600, color: 'var(--low)' }}
              onClick={e => {
                e.stopPropagation()
                useMapStore.getState().focusWorkbench('map')
                useMapStore.getState().togglePanel('ledger')
              }}
            >
              ✓ Recorded — open ledger
            </button>
          )
          : <span style={{ color: muted }}>Connect events to auto-score and record</span>
        }
      </div>
    </div>
  )
}

// ── Tiny UI components ────────────────────────────────────────────────────────

function TBtn({ onClick, children, active, danger, title }: {
  onClick: () => void; children: React.ReactNode; active?: boolean; danger?: boolean; title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`ui-canvas-tbtn${active ? ' ui-canvas-tbtn--active' : ''}${danger ? ' ui-canvas-tbtn--danger' : ''}`}
    >{children}</button>
  )
}

function IBtn({ onClick, onMouseDown, children, title }: {
  onClick: () => void; onMouseDown?: (e: React.MouseEvent) => void; children: React.ReactNode; title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      title={title}
      className="ui-canvas-ibtn"
    >{children}</button>
  )
}
