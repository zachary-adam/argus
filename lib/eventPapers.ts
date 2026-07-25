import type { IntelEvent } from '@/types'
import type { EventPaperLink, JournalEntry, PaperAnalysisRole, Project } from '@/types/project'

const ROLE_LABEL: Record<PaperAnalysisRole, string> = {
  explains: 'explains',
  context: 'background',
  contradicts: 'contradicts',
  method: 'framework',
  forecast: 'forecast',
}

function genLinkId(): string {
  return `epl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createEventPaperLink(
  eventId: string,
  paperEntryId: string,
  analysisMark: string,
  role: PaperAnalysisRole = 'explains',
): EventPaperLink {
  return {
    id: genLinkId(),
    eventId,
    paperEntryId,
    analysisMark: analysisMark.trim(),
    role,
    attachedAt: new Date().toISOString(),
  }
}

export function journalPaperById(project: Project | null | undefined, paperEntryId: string): JournalEntry | undefined {
  return (project?.journal ?? []).find(e => e.id === paperEntryId && e.kind === 'paper')
}

export function eventPaperLinksForEvent(project: Project | null | undefined, eventId: string): EventPaperLink[] {
  return (project?.eventPaperLinks ?? []).filter(l => l.eventId === eventId)
}

export function resolvedEventPapers(
  project: Project,
  eventId: string,
): Array<{ link: EventPaperLink; paper: JournalEntry }> {
  return eventPaperLinksForEvent(project, eventId)
    .map(link => {
      const paper = journalPaperById(project, link.paperEntryId)
      return paper ? { link, paper } : null
    })
    .filter(Boolean) as Array<{ link: EventPaperLink; paper: JournalEntry }>
}

export function eventIdsWithPaperMarks(project: Project | null | undefined): Set<string> {
  return new Set((project?.eventPaperLinks ?? []).map(l => l.eventId))
}

/** Resolve a human-readable event title for paper-link blocks and UI. */
export function resolveEventTitle(
  eventId: string,
  project: Project | null | undefined,
  liveEvents?: IntelEvent[],
): string {
  const fromLive = liveEvents?.find(e => e.id === eventId)
  if (fromLive?.title?.trim()) return fromLive.title.trim()
  const fromProject = project?.events?.find(e => e.id === eventId)
  if (fromProject?.title?.trim()) return fromProject.title.trim()
  const j = project?.journal?.find(e => e.kind === 'event' && e.eventId === eventId)
  if (j?.title?.trim()) return j.title.trim()
  return eventId
}

/** Block for AI briefs — analyst marks on how each paper reads each event. */
export function formatEventPaperBriefBlock(
  project: Project | null | undefined,
  maxLinks = 16,
  liveEvents?: IntelEvent[],
): string {
  const links = [...(project?.eventPaperLinks ?? [])]
    .sort((a, b) => b.attachedAt.localeCompare(a.attachedAt))
    .slice(0, maxLinks)
  if (!links.length || !project) return ''

  const eventTitle = (eventId: string) => resolveEventTitle(eventId, project, liveEvents)

  const lines: string[] = [
    'EVENT–PAPER ANALYSIS MARKS (analyst-linked research — use these marks when assessing events and writing the brief):',
  ]

  const byEvent = new Map<string, EventPaperLink[]>()
  for (const link of links) {
    const list = byEvent.get(link.eventId) ?? []
    list.push(link)
    byEvent.set(link.eventId, list)
  }

  for (const [eventId, eventLinks] of byEvent) {
    lines.push(`\n── Event: "${eventTitle(eventId)}"`)
    for (const link of eventLinks) {
      const paper = journalPaperById(project, link.paperEntryId)
      if (!paper) continue
      const auth = paper.authors?.slice(0, 2).join(', ') ?? 'Unknown'
      const role = link.role ? ROLE_LABEL[link.role] : 'linked'
      lines.push(`   • Paper: "${paper.title}" (${auth}${paper.year ? `, ${paper.year}` : ''}) [${role}]`)
      lines.push(`     Analyst mark: ${link.analysisMark}`)
      if (paper.abstract) {
        lines.push(`     About: ${paper.abstract.slice(0, 220)}${paper.abstract.length > 220 ? '…' : ''}`)
      }
    }
  }

  return lines.join('\n')
}
