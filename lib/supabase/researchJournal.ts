import { createClient } from '@/lib/supabase/client'
import { isMissingTableError, logSupabaseFailure } from '@/lib/supabase/errors'
import type { EventPaperLink, HypothesisRevision, JournalEntry, Project } from '@/types/project'

/** Same cap as project event bodies — full text stays in localStorage when over limit. */
export const RESEARCH_BODY_SYNC_CAP = 4000

export function capResearchText(value: string | undefined): string | undefined {
  if (!value) return value
  return value.length > RESEARCH_BODY_SYNC_CAP ? value.slice(0, RESEARCH_BODY_SYNC_CAP) : value
}

export function capJournalEntry(entry: JournalEntry): JournalEntry {
  return {
    ...entry,
    body: capResearchText(entry.body),
    abstract: capResearchText(entry.abstract),
    note: entry.note && entry.note.length > RESEARCH_BODY_SYNC_CAP
      ? entry.note.slice(0, RESEARCH_BODY_SYNC_CAP)
      : entry.note,
  }
}

/** Strip research blobs from project JSON — tables are source of truth in cloud sync. */
export function stripResearchFromProjectData(
  project: Omit<Project, 'byokApiKey'>,
): Omit<Project, 'byokApiKey'> {
  return {
    ...project,
    journal: [],
    hypothesisLog: [],
    eventPaperLinks: [],
  }
}

export function projectNeedsResearchMigration(project: Project, tableCounts: ResearchTableCounts): boolean {
  const jsonJournal = project.journal?.length ?? 0
  const jsonHypos = project.hypothesisLog?.length ?? 0
  const jsonLinks = project.eventPaperLinks?.length ?? 0
  if (jsonJournal === 0 && jsonHypos === 0 && jsonLinks === 0) return false
  return (
    (jsonJournal > 0 && tableCounts.journal === 0)
    || (jsonHypos > 0 && tableCounts.hypotheses === 0)
    || (jsonLinks > 0 && tableCounts.links === 0)
  )
}

export interface ResearchTableCounts {
  journal: number
  hypotheses: number
  links: number
}

export interface ProjectResearchBundle {
  journal: JournalEntry[]
  hypothesisLog: HypothesisRevision[]
  eventPaperLinks: EventPaperLink[]
}

interface JournalRow {
  id: string
  project_id: string
  kind: JournalEntry['kind']
  significance: JournalEntry['significance'] | null
  event_id: string | null
  saved_at: string
  updated_at: string
  data: JournalEntry
}

interface HypothesisRow {
  id: string
  project_id: string
  recorded_at: string
  data: HypothesisRevision
}

interface LinkRow {
  id: string
  project_id: string
  event_id: string
  paper_entry_id: string
  data: EventPaperLink
}

function rowToJournalEntry(row: JournalRow): JournalEntry {
  return capJournalEntry({ ...row.data, id: row.id })
}

function rowToHypothesis(row: HypothesisRow): HypothesisRevision {
  return { ...row.data, id: row.id }
}

function rowToLink(row: LinkRow): EventPaperLink {
  return { ...row.data, id: row.id }
}

function groupByProjectId<T extends { project_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.project_id) ?? []
    list.push(row)
    map.set(row.project_id, list)
  }
  return map
}

export async function loadResearchForUser(userId: string): Promise<{
  bundles: Map<string, ProjectResearchBundle>
  tablesAvailable: boolean
}> {
  const supabase = createClient()
  if (!supabase) return { bundles: new Map(), tablesAvailable: false }

  const [journalRes, hypoRes, linkRes] = await Promise.all([
    supabase.from('journal_entries').select('*').eq('user_id', userId),
    supabase.from('hypothesis_revisions').select('*').eq('user_id', userId),
    supabase.from('event_paper_links').select('*').eq('user_id', userId),
  ])

  // Any failed query — missing table (pre-migration) or transient error — means
  // we do NOT have an authoritative view of the tables. Treating a failed query
  // as "empty" would wipe that data from the merged projects, and the next
  // save's delete-sync would then destroy the real rows.
  const failures = [
    ['journal', journalRes.error] as const,
    ['hypotheses', hypoRes.error] as const,
    ['links', linkRes.error] as const,
  ].filter(([, err]) => err)

  if (failures.length > 0) {
    for (const [label, err] of failures) {
      if (!isMissingTableError(err)) {
        logSupabaseFailure(`loadResearch ${label}`, err)
      }
    }
    return { bundles: new Map(), tablesAvailable: false }
  }

  const journalByProject = groupByProjectId((journalRes.data ?? []) as JournalRow[])
  const hypoByProject = groupByProjectId((hypoRes.data ?? []) as HypothesisRow[])
  const linkByProject = groupByProjectId((linkRes.data ?? []) as LinkRow[])

  const projectIds = new Set([
    ...journalByProject.keys(),
    ...hypoByProject.keys(),
    ...linkByProject.keys(),
  ])

  const bundles = new Map<string, ProjectResearchBundle>()
  for (const projectId of projectIds) {
    const journal = (journalByProject.get(projectId) ?? [])
      .map(rowToJournalEntry)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    const hypothesisLog = (hypoByProject.get(projectId) ?? [])
      .map(rowToHypothesis)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    const eventPaperLinks = (linkByProject.get(projectId) ?? []).map(rowToLink)
    bundles.set(projectId, { journal, hypothesisLog, eventPaperLinks })
  }
  return { bundles, tablesAvailable: true }
}

export function mergeResearchIntoProject(
  project: Project,
  bundle: ProjectResearchBundle | undefined,
  tablesAvailable: boolean,
): Project {
  if (!tablesAvailable) return project
  const empty: ProjectResearchBundle = { journal: [], hypothesisLog: [], eventPaperLinks: [] }
  const data = bundle ?? empty
  return {
    ...project,
    journal: data.journal,
    hypothesisLog: data.hypothesisLog,
    eventPaperLinks: data.eventPaperLinks,
  }
}

export function researchTableCounts(bundle: ProjectResearchBundle | undefined): ResearchTableCounts {
  return {
    journal: bundle?.journal.length ?? 0,
    hypotheses: bundle?.hypothesisLog.length ?? 0,
    links: bundle?.eventPaperLinks.length ?? 0,
  }
}

async function deleteMissingIds(
  table: 'journal_entries' | 'hypothesis_revisions' | 'event_paper_links',
  projectId: string,
  userId: string,
  keepIds: Set<string>,
): Promise<void> {
  const supabase = createClient()
  if (!supabase) return

  const { data: existing, error } = await supabase
    .from(table)
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) {
    if (!isMissingTableError(error)) {
      logSupabaseFailure(`deleteMissing ${table}`, error)
    }
    return
  }

  const toDelete = (existing ?? []).map((r: { id: string }) => r.id).filter((id: string) => !keepIds.has(id))
  if (toDelete.length === 0) return

  const { error: delErr } = await supabase.from(table).delete().in('id', toDelete)
  if (delErr && !isMissingTableError(delErr)) {
    logSupabaseFailure(`delete ${table}`, delErr)
  }
}

/** Upsert research tables for one project. Tables missing (pre-migration) fail silently. */
export async function syncResearchForProject(project: Project, userId: string): Promise<boolean> {
  const supabase = createClient()
  if (!supabase) return false

  const journal = project.journal ?? []
  const hypothesisLog = project.hypothesisLog ?? []
  const eventPaperLinks = project.eventPaperLinks ?? []

  // Per-table: delete rows the project no longer holds, then upsert the rest.
  // The three tables are independent, so they sync in parallel.
  const syncTable = async (
    table: 'journal_entries' | 'hypothesis_revisions' | 'event_paper_links',
    ids: Set<string>,
    rows: Record<string, unknown>[],
  ): Promise<boolean> => {
    await deleteMissingIds(table, project.id, userId, ids)
    if (rows.length === 0) return true
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
    if (isMissingTableError(error)) return false
    if (error) {
      logSupabaseFailure(`sync ${table}`, error)
      return false
    }
    return true
  }

  const results = await Promise.all([
    syncTable(
      'journal_entries',
      new Set(journal.map(e => e.id)),
      journal.map(entry => {
        const capped = capJournalEntry(entry)
        return {
          id: entry.id,
          project_id: project.id,
          user_id: userId,
          kind: entry.kind,
          significance: entry.significance ?? null,
          event_id: entry.eventId ?? null,
          saved_at: entry.savedAt,
          updated_at: entry.updatedAt,
          data: capped,
        }
      }),
    ),
    syncTable(
      'hypothesis_revisions',
      new Set(hypothesisLog.map(h => h.id)),
      hypothesisLog.map(rev => ({
        id: rev.id,
        project_id: project.id,
        user_id: userId,
        recorded_at: rev.recordedAt,
        data: rev,
      })),
    ),
    syncTable(
      'event_paper_links',
      new Set(eventPaperLinks.map(l => l.id)),
      eventPaperLinks.map(link => ({
        id: link.id,
        project_id: project.id,
        user_id: userId,
        event_id: link.eventId,
        paper_entry_id: link.paperEntryId,
        data: link,
      })),
    ),
  ])

  return results.every(Boolean)
}
