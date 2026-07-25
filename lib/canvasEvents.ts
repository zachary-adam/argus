import type { IntelEvent } from '@/types'
import type { CanvasEventNode, CanvasNode, JournalEntry, Project, SituationCase, UniversalEvent } from '@/types/project'
import { persistIntelEventsIfMissing } from '@/lib/eventPersist'

export function canvasEventIds(project: Project | null | undefined): Set<string> {
  if (!project?.analyticalCanvas?.nodes) return new Set()
  return new Set(
    project.analyticalCanvas.nodes
      .filter((n): n is CanvasEventNode => n.type === 'event')
      .map(n => n.eventId),
  )
}

export function isEventOnCanvas(project: Project | null | undefined, eventId: string): boolean {
  return canvasEventIds(project).has(eventId)
}

/** Journal entry ids already placed on the analyst canvas. */
export function canvasJournalEntryIds(project: Project | null | undefined): Set<string> {
  const ids = new Set<string>()
  for (const n of project?.analyticalCanvas?.nodes ?? []) {
    if ('journalEntryId' in n && typeof n.journalEntryId === 'string') {
      ids.add(n.journalEntryId)
    }
  }
  return ids
}

/** Whether a research journal entry is already represented on the canvas. */
export function isJournalEntryOnCanvas(
  project: Project | null | undefined,
  entry: Pick<JournalEntry, 'id' | 'kind' | 'eventId' | 'title' | 'doi'>,
): boolean {
  if (!project?.analyticalCanvas?.nodes?.length) return false
  if (entry.kind === 'event' && entry.eventId) {
    return isEventOnCanvas(project, entry.eventId)
  }
  if (canvasJournalEntryIds(project).has(entry.id)) return true
  return project.analyticalCanvas.nodes.some(n => {
    if (n.type === 'source' && entry.kind === 'paper') {
      if (entry.doi && n.doi === entry.doi) return true
      return n.title === entry.title
    }
    return false
  })
}

/** eventId → case names (an event may belong to multiple cases) */
export function eventCaseLabels(project: Project | null | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const c of project?.cases ?? []) {
    for (const eventId of c.eventIds) {
      const prev = map.get(eventId) ?? []
      if (!prev.includes(c.name)) map.set(eventId, [...prev, c.name])
    }
  }
  return map
}

export function casesForEvent(project: Project | null | undefined, eventId: string): SituationCase[] {
  return (project?.cases ?? []).filter(c => c.eventIds.includes(eventId))
}

export function randomCanvasPosition(): { x: number; y: number } {
  return { x: 60 + Math.random() * 240, y: 60 + Math.random() * 240 }
}

export function gridCanvasPositions(
  count: number,
  opts?: { cols?: number; colW?: number; rowH?: number; startX?: number; startY?: number },
): Array<{ x: number; y: number }> {
  const cols = opts?.cols ?? Math.min(4, Math.max(1, count))
  const colW = opts?.colW ?? 300
  const rowH = opts?.rowH ?? 190
  const startX = opts?.startX ?? 0
  const startY = opts?.startY ?? 0
  return Array.from({ length: count }, (_, i) => ({
    x: startX + (i % cols) * colW,
    y: startY + Math.floor(i / cols) * rowH,
  }))
}

export function createCanvasEventNode(
  eventId: string,
  pos?: { x: number; y: number },
  id?: string,
): CanvasEventNode {
  const p = pos ?? randomCanvasPosition()
  return {
    id: id ?? `cn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'event',
    eventId,
    x: p.x,
    y: p.y,
  }
}

export type AddEventToCanvasResult = 'added' | 'already' | 'no-project'

export function addIntelEventToCanvas(
  project: Project | null | undefined,
  event: IntelEvent,
  addCanvasNode: (projectId: string, node: CanvasEventNode) => void,
  options?: {
    openCanvas?: boolean
    onOpenCanvas?: () => void
    onAlready?: () => void
    onAdded?: () => void
    addEvents?: (projectId: string, events: UniversalEvent[]) => void
    updateEvent?: (projectId: string, eventId: string, updates: Partial<UniversalEvent>) => void
  },
): AddEventToCanvasResult {
  if (!project) return 'no-project'
  if (isEventOnCanvas(project, event.id)) {
    options?.onAlready?.()
    if (options?.openCanvas) options.onOpenCanvas?.()
    return 'already'
  }
  if (options?.addEvents) {
    persistIntelEventsIfMissing(project, [event], options.addEvents, options.updateEvent, { keepDuration: 'forever' })
  }
  addCanvasNode(project.id, createCanvasEventNode(event.id))
  options?.onAdded?.()
  if (options?.openCanvas) options.onOpenCanvas?.()
  return 'added'
}

export interface AddCaseToCanvasResult {
  status: 'added' | 'already' | 'no-project' | 'no-events'
  added: number
  skipped: number
  total: number
}

export function addCaseEventsToCanvas(
  project: Project | null | undefined,
  situationCase: SituationCase,
  addCanvasNode: (projectId: string, node: CanvasNode) => void,
  options?: {
    openCanvas?: boolean
    onOpenCanvas?: () => void
    onResult?: (result: AddCaseToCanvasResult) => void
    liveEvents?: IntelEvent[]
    addEvents?: (projectId: string, events: UniversalEvent[]) => void
    updateEvent?: (projectId: string, eventId: string, updates: Partial<UniversalEvent>) => void
  },
): AddCaseToCanvasResult {
  const empty: AddCaseToCanvasResult = { status: 'no-events', added: 0, skipped: 0, total: 0 }
  if (!project) {
    const r = { ...empty, status: 'no-project' as const }
    options?.onResult?.(r)
    return r
  }
  const eventIds = situationCase.eventIds
  if (eventIds.length === 0) {
    options?.onResult?.(empty)
    return empty
  }

  const onCanvas = canvasEventIds(project)
  const toAdd = eventIds.filter(id => !onCanvas.has(id))
  const skipped = eventIds.length - toAdd.length
  const total = eventIds.length

  if (toAdd.length === 0) {
    const r: AddCaseToCanvasResult = { status: 'already', added: 0, skipped, total }
    options?.onResult?.(r)
    if (options?.openCanvas) options.onOpenCanvas?.()
    return r
  }

  if (options?.addEvents && options.liveEvents?.length) {
    const byId = new Map(options.liveEvents.map(e => [e.id, e]))
    const toPersist = toAdd.map(id => byId.get(id)).filter(Boolean) as IntelEvent[]
    persistIntelEventsIfMissing(project, toPersist, options.addEvents, options.updateEvent, { keepDuration: 'forever' })
  }

  const stamp = Date.now()
  const noteLines = [`Case: ${situationCase.name}`]
  if (situationCase.researchQuestion) noteLines.push(situationCase.researchQuestion)
  if (situationCase.notes?.trim()) noteLines.push(situationCase.notes.trim().slice(0, 200))

  addCanvasNode(project.id, {
    id: `cn_case_${stamp}`,
    type: 'note',
    x: 0,
    y: 0,
    content: noteLines.join('\n'),
    color: 'var(--accent)',
  })

  const positions = gridCanvasPositions(toAdd.length, { startY: 140 })
  toAdd.forEach((eventId, i) => {
    addCanvasNode(project.id, createCanvasEventNode(eventId, positions[i], `cn_${stamp}_${i}`))
  })

  const r: AddCaseToCanvasResult = { status: 'added', added: toAdd.length, skipped, total }
  options?.onResult?.(r)
  if (options?.openCanvas) options.onOpenCanvas?.()
  return r
}
