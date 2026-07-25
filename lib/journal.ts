import { endOfWeek, format, getISOWeek, getISOWeekYear, startOfWeek } from 'date-fns'
import type { IntelEvent } from '@/types'
import type { CanvasSourceNode, JournalEntry, JournalEntryKind, JournalSignificance, Project, HypothesisRevision } from '@/types/project'
import { NO_AI_FOOTER } from '@/lib/journalView'

function genId(): string {
  return `jr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function isEventInJournal(project: Project | null | undefined, eventId: string): boolean {
  return (project?.journal ?? []).some(e => e.kind === 'event' && e.eventId === eventId)
}

export function journalEntryFromEvent(
  event: IntelEvent,
  opts: { note?: string; significance?: JournalSignificance; tags?: string[] } = {},
): JournalEntry {
  const now = new Date().toISOString()
  const sevNum = event.severity === 'critical' ? 9
    : event.severity === 'high' ? 7
      : event.severity === 'medium' ? 5 : 2
  return {
    id: genId(),
    kind: 'event',
    savedAt: now,
    updatedAt: now,
    title: event.title,
    summary: event.summary,
    note: opts.note?.trim() || undefined,
    tags: opts.tags,
    significance: opts.significance ?? 'supporting',
    eventId: event.id,
    lat: event.lat,
    lon: event.lon,
    country: event.country,
    countryCode: event.countryCode,
    category: event.category,
    severity: sevNum,
    eventTimestamp: event.timestamp,
    url: event.url,
    source: event.source,
    body: event.body?.slice(0, 4000),
  }
}

export interface PaperInput {
  id?: string
  title: string
  authors?: string[]
  year?: number | null
  abstract?: string | null
  doi?: string | null
  url?: string | null
  venue?: string | null
  citations?: number | null
}

export function journalEntryFromPaper(
  paper: PaperInput,
  opts: { note?: string; significance?: JournalSignificance } = {},
): JournalEntry {
  const now = new Date().toISOString()
  return {
    id: genId(),
    kind: 'paper',
    savedAt: now,
    updatedAt: now,
    title: paper.title,
    summary: paper.abstract?.slice(0, 500) ?? undefined,
    note: opts.note?.trim() || undefined,
    significance: opts.significance ?? 'supporting',
    authors: paper.authors ?? [],
    year: paper.year ?? undefined,
    abstract: paper.abstract ?? undefined,
    doi: paper.doi ?? undefined,
    venue: paper.venue ?? undefined,
    url: paper.url ?? undefined,
    citations: paper.citations ?? undefined,
  }
}

export function journalEntryFromNote(title: string, content: string): JournalEntry {
  const now = new Date().toISOString()
  return {
    id: genId(),
    kind: 'note',
    savedAt: now,
    updatedAt: now,
    title: title.trim() || 'Field note',
    summary: content.trim(),
    significance: 'supporting',
  }
}

export function collectCanvasPapers(nodes: ReadonlyArray<{ type: string }>): PaperInput[] {
  return nodes
    .filter((n): n is CanvasSourceNode => n.type === 'source')
    .map(n => ({
      title: n.title ?? 'Untitled paper',
      authors: n.authors,
      year: n.year,
      abstract: n.abstract,
      doi: n.doi,
      url: n.url,
      venue: n.venue,
    }))
}

export function journalPapersForBrief(project: Project | null | undefined): PaperInput[] {
  return (project?.journal ?? [])
    .filter(e => e.kind === 'paper')
    .map(e => ({
      title: e.title,
      authors: e.authors,
      year: e.year,
      abstract: e.abstract ?? e.summary,
      doi: e.doi,
      url: e.url,
      venue: e.venue,
      citations: e.citations,
    }))
}

/** Build a Semantic Scholar query from mission context. */
export function buildPaperSearchQuery(project: Project | null | undefined): string {
  if (!project) return ''
  const parts: string[] = []
  if (project.researchQuestion?.trim()) parts.push(project.researchQuestion.trim())
  else if (project.name?.trim()) parts.push(project.name.trim())
  if (project.regionName?.trim()) parts.push(project.regionName.trim())
  const keywords = project.targeting?.keywords?.slice(0, 4) ?? []
  if (keywords.length) parts.push(keywords.join(' '))
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 140)
}

function entrySortDate(entry: JournalEntry): string {
  return entry.eventTimestamp ?? entry.savedAt
}

function weekKeyForDate(iso: string): string {
  const d = new Date(iso)
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`
}

function weekLabelForDate(iso: string): string {
  const d = new Date(iso)
  const start = startOfWeek(d, { weekStartsOn: 1 })
  const end = endOfWeek(d, { weekStartsOn: 1 })
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
}

export interface JournalWeekGroup {
  weekKey: string
  weekLabel: string
  entries: JournalEntry[]
}

/** Group journal entries by ISO week (event date when present, else saved date). */
export function groupJournalByWeek(entries: JournalEntry[]): JournalWeekGroup[] {
  const sorted = [...entries].sort((a, b) => entrySortDate(b).localeCompare(entrySortDate(a)))
  const groups = new Map<string, JournalEntry[]>()
  const labels = new Map<string, string>()

  for (const entry of sorted) {
    const iso = entrySortDate(entry)
    const key = weekKeyForDate(iso)
    if (!groups.has(key)) {
      groups.set(key, [])
      labels.set(key, weekLabelForDate(iso))
    }
    groups.get(key)!.push(entry)
  }

  return [...groups.entries()].map(([weekKey, weekEntries]) => ({
    weekKey,
    weekLabel: labels.get(weekKey) ?? weekKey,
    entries: weekEntries,
  }))
}

export interface AchEvidenceItem {
  nodeId: string
  title: string
  summary?: string
  body?: string
  analystComments?: string[]
  category: string
  country: string
  severity: number
  journalEntryId: string
  kind: JournalEntry['kind']
}

/** Map a journal entry to ACH evidence (nodeId prefix `journal:`). */
export function journalEntryToAchEvidence(entry: JournalEntry): AchEvidenceItem {
  const sev = entry.severity
    ?? (entry.significance === 'key' ? 7 : entry.significance === 'background' ? 3 : 5)
  const body = [entry.body, entry.abstract, entry.summary].filter(Boolean).join('\n\n').slice(0, 4000)

  return {
    nodeId: `journal:${entry.id}`,
    title: entry.title,
    summary: entry.summary ?? entry.abstract?.slice(0, 300),
    body: body || undefined,
    analystComments: entry.note ? [entry.note] : undefined,
    category: entry.category ?? (entry.kind === 'paper' ? 'research' : entry.kind === 'note' ? 'note' : 'conflict'),
    country: entry.country ?? '—',
    severity: sev,
    journalEntryId: entry.id,
    kind: entry.kind,
  }
}

export function formatJournalBlock(entries: JournalEntry[], max = 10): string {
  const { text } = formatTaggedJournalCorpus(entries, { max, tagged: false })
  return text
}

const SIG_ORDER: Record<string, number> = { key: 0, supporting: 1, background: 2 }

function sortJournalForBrief(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => {
    const sa = SIG_ORDER[a.significance ?? 'supporting'] ?? 1
    const sb = SIG_ORDER[b.significance ?? 'supporting'] ?? 1
    if (sa !== sb) return sa - sb
    return (b.eventTimestamp ?? b.savedAt).localeCompare(a.eventTimestamp ?? a.savedAt)
  })
}

/** Tagged [J#] corpus for AI briefs — key evidence first. */
export function formatTaggedJournalCorpus(
  entries: JournalEntry[],
  opts: { max?: number; tagged?: boolean } = {},
): { text: string; sourceMap: Record<string, { title: string; kind: JournalEntryKind }> } {
  const max = opts.max ?? 20
  const tagged = opts.tagged !== false
  const slice = sortJournalForBrief(entries).slice(0, max)
  if (!slice.length) return { text: '', sourceMap: {} }

  const sourceMap: Record<string, { title: string; kind: JournalEntryKind }> = {}
  const lines = slice.map((e, i) => {
    const tag = tagged ? `[J${i + 1}] ` : ''
    if (tagged) sourceMap[`J${i + 1}`] = { title: e.title, kind: e.kind }

    const sig = e.significance ? `[${e.significance.toUpperCase()}] ` : ''
    if (e.kind === 'paper') {
      const auth = e.authors?.slice(0, 2).join(', ') ?? 'Unknown'
      return `${tag}${sig}[PAPER] "${e.title}" (${auth}${e.year ? `, ${e.year}` : ''})${e.note ? `\n  Analyst note: ${e.note}` : ''}${e.abstract ? `\n  Abstract: ${e.abstract.slice(0, 400)}` : ''}`
    }
    if (e.kind === 'note') {
      return `${tag}${sig}[NOTE] ${e.title}${e.summary ? `: ${e.summary.slice(0, 300)}` : ''}${e.note ? `\n  Analyst note: ${e.note}` : ''}`
    }
    const bodyBit = e.body?.trim()
      ? `\n  Source excerpt: ${e.body.trim().slice(0, 600)}`
      : (e.summary ? `\n  Summary: ${e.summary.slice(0, 300)}` : '')
    return `${tag}${sig}[EVENT] ${e.title} (${e.country ?? '—'}, ${(e.eventTimestamp ?? e.savedAt).slice(0, 10)})${e.note ? `\n  Analyst note: ${e.note}` : ''}${bodyBit}`
  })

  const header = tagged
    ? `CURATED RESEARCH LIBRARY (${entries.length} saved — analyst-chosen; cite as [J#], prefer [J#] over [E#] when both apply):`
    : `RESEARCH JOURNAL (${entries.length} saved — analyst-curated evidence):`

  return { text: `${header}\n\n${lines.join('\n\n')}`, sourceMap }
}

/** Hypothesis revision trail for AI briefs. */
export function formatHypothesisBriefBlock(project: Project | null | undefined): string {
  const hypos = [...(project?.hypothesisLog ?? [])].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  if (!hypos.length) return ''

  const journal = project?.journal ?? []
  const entryTitle = (id: string) => journal.find(e => e.id === id)?.title ?? id

  const lines = hypos.map((h, i) => {
    const isLatest = i === hypos.length - 1
    const conf = h.confidence ? ` (${h.confidence} confidence)` : ''
    const prefix = isLatest ? 'CURRENT HYPOTHESIS' : `Revision ${i + 1}`
    let block = `${prefix}${conf} (${h.recordedAt.slice(0, 10)}): ${h.statement}`
    if (h.rationale) block += `\n  Rationale: ${h.rationale}`
    if (h.linkedJournalIds?.length) {
      block += `\n  Linked evidence: ${h.linkedJournalIds.map(id => `"${entryTitle(id).slice(0, 80)}"`).join('; ')}`
    }
    return block
  })

  return `HYPOTHESIS EVOLUTION (analyst revision log — anchor competingHypotheses to CURRENT HYPOTHESIS, do not ignore):\n${lines.join('\n\n')}`
}

export function journalToMarkdown(project: Project): string {
  const entries = [...(project.journal ?? [])].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  const lines = [
    `# Research journal — ${project.name}`,
    '',
    project.researchQuestion ? `**Research question:** ${project.researchQuestion}` : '',
    `**Exported:** ${new Date().toISOString().slice(0, 10)}`,
    '',
  ].filter(Boolean)

  for (const e of entries) {
    lines.push(`## ${e.title}`, '')
    lines.push(`*${e.kind} · saved ${e.savedAt.slice(0, 10)}${e.significance ? ` · ${e.significance}` : ''}*`, '')
    if (e.note) lines.push(`> ${e.note}`, '')
    if (e.summary) lines.push(e.summary, '')
    if (e.authors?.length) lines.push(`Authors: ${e.authors.join(', ')}${e.year ? ` (${e.year})` : ''}`, '')
    if (e.url) lines.push(`[Source](${e.url})`, '')
    lines.push('')
  }
  return lines.join('\n')
}

export function hypothesisRevisionFromInput(
  statement: string,
  opts: {
    confidence?: HypothesisRevision['confidence']
    rationale?: string
    supersedesId?: string
    linkedJournalIds?: string[]
  } = {},
): HypothesisRevision {
  return {
    id: `hy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    recordedAt: new Date().toISOString(),
    statement: statement.trim(),
    confidence: opts.confidence,
    rationale: opts.rationale?.trim() || undefined,
    supersedesId: opts.supersedesId,
    linkedJournalIds: opts.linkedJournalIds?.length ? opts.linkedJournalIds : undefined,
  }
}

/** Analyst memo — curated evidence + hypothesis trail, no AI prose. */
export function journalMemoMarkdown(
  project: Project,
  opts: { significance?: JournalSignificance[] } = {},
): string {
  const sigs = opts.significance ?? ['key', 'supporting']
  const entries = [...(project.journal ?? [])]
    .filter(e => !e.significance || sigs.includes(e.significance))
    .sort((a, b) => (b.eventTimestamp ?? b.savedAt).localeCompare(a.eventTimestamp ?? a.savedAt))

  const lines: string[] = [
    `# Analyst memo — ${project.name}`,
    '',
    `*Compiled ${new Date().toISOString().slice(0, 10)} · human-curated evidence only · no AI synthesis*`,
    '',
  ]

  if (project.researchQuestion?.trim()) {
    lines.push('## Research question', '', project.researchQuestion.trim(), '')
  }

  const hypos = [...(project.hypothesisLog ?? [])].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  if (hypos.length) {
    lines.push('## Hypothesis evolution', '')
    for (const h of hypos) {
      const date = h.recordedAt.slice(0, 10)
      const conf = h.confidence ? ` (${h.confidence} confidence)` : ''
      lines.push(`### ${date}${conf}`, '', h.statement, '')
      if (h.rationale) lines.push(`*Rationale:* ${h.rationale}`, '')
      if (h.supersedesId) {
        const prev = hypos.find(x => x.id === h.supersedesId)
        if (prev) lines.push(`*Revises:* "${prev.statement.slice(0, 120)}${prev.statement.length > 120 ? '…' : ''}"`, '')
      }
    }
  }

  if (entries.length === 0) {
    lines.push('## Curated evidence', '', '_No journal entries at selected significance levels._', '')
    return lines.join('\n')
  }

  lines.push('## Curated evidence', '')
  const groups = groupJournalByWeek(entries)
  for (const group of groups) {
    lines.push(`### Week · ${group.weekLabel}`, '')
    for (const e of group.entries) {
      const sig = e.significance ? `[${e.significance}] ` : ''
      lines.push(`**${sig}${e.title}**`)
      if (e.country || e.eventTimestamp) {
        lines.push(`_${e.country ?? '—'} · ${(e.eventTimestamp ?? e.savedAt).slice(0, 10)}_`)
      }
      if (e.note) lines.push(`> Analyst: ${e.note}`)
      else if (e.summary) lines.push(e.summary.slice(0, 400))
      lines.push('')
    }
  }

  lines.push('---', '', NO_AI_FOOTER)
  return lines.join('\n')
}

export function toggleJournalLink(
  entry: JournalEntry,
  targetId: string,
): string[] {
  const current = entry.linkedEntryIds ?? []
  return current.includes(targetId)
    ? current.filter(id => id !== targetId)
    : [...current, targetId]
}

export function linkedJournalEntries(project: Project, entry: JournalEntry): JournalEntry[] {
  const ids = new Set(entry.linkedEntryIds ?? [])
  return (project.journal ?? []).filter(e => ids.has(e.id))
}

/** Rules-mode brief body from key journal evidence only. */
export function journalKeyBriefMarkdown(project: Project): string {
  return journalMemoMarkdown(project, { significance: ['key'] })
}
