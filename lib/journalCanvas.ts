import type { IntelEvent } from '@/types'
import type { CanvasNode, JournalEntry, Project, UniversalEvent } from '@/types/project'
import { addIntelEventToCanvas, isJournalEntryOnCanvas, randomCanvasPosition } from '@/lib/canvasEvents'
import { intelEventFromJournalEntry } from '@/lib/journalView'

export type JournalCanvasResult = 'added' | 'already' | 'skipped'

export function journalEntryToIntelEvent(
  entry: JournalEntry,
  liveEvents?: IntelEvent[],
): IntelEvent | null {
  if (entry.kind === 'event' && entry.eventId) {
    const fromLive = liveEvents?.find(e => e.id === entry.eventId)
    if (fromLive) return fromLive
    return intelEventFromJournalEntry(entry)
  }
  return null
}

/** Place a saved journal entry on the analyst canvas. */
export function addJournalEntryToCanvas(
  project: Project | null | undefined,
  entry: JournalEntry,
  addCanvasNode: (projectId: string, node: CanvasNode) => void,
  options?: {
    liveEvents?: IntelEvent[]
    openCanvas?: boolean
    onOpenCanvas?: () => void
    addEvents?: (projectId: string, events: UniversalEvent[]) => void
    updateEvent?: (projectId: string, eventId: string, updates: Partial<UniversalEvent>) => void
  },
): JournalCanvasResult {
  if (!project) return 'skipped'

  if (isJournalEntryOnCanvas(project, entry)) {
    if (options?.openCanvas) options.onOpenCanvas?.()
    return 'already'
  }

  if (entry.kind === 'event' && entry.eventId) {
    const ev = journalEntryToIntelEvent(entry, options?.liveEvents)
    if (!ev) return 'skipped'
    const result = addIntelEventToCanvas(project, ev, addCanvasNode, {
      openCanvas: options?.openCanvas,
      onOpenCanvas: options?.onOpenCanvas,
      addEvents: options?.addEvents,
      updateEvent: options?.updateEvent,
    })
    return result === 'no-project' ? 'skipped' : result
  }

  const { x, y } = randomCanvasPosition()

  if (entry.kind === 'paper') {
    addCanvasNode(project.id, {
      id: `cn_${Date.now()}`,
      type: 'source',
      x: x - 140,
      y: y - 85,
      title: entry.title,
      authors: entry.authors ?? [],
      year: entry.year,
      abstract: entry.abstract ?? entry.summary,
      doi: entry.doi,
      url: entry.url,
      venue: entry.venue,
      journalEntryId: entry.id,
    })
    if (options?.openCanvas) options.onOpenCanvas?.()
    return 'added'
  }

  if (entry.kind === 'note') {
    addCanvasNode(project.id, {
      id: `cn_${Date.now()}`,
      type: 'note',
      x: x - 120,
      y: y - 60,
      content: [entry.title, entry.summary].filter(Boolean).join('\n\n'),
      journalEntryId: entry.id,
    })
    if (options?.openCanvas) options.onOpenCanvas?.()
    return 'added'
  }

  return 'skipped'
}
