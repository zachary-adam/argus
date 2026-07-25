import { createClient } from '@/lib/supabase/client'
import type { Project, UniversalEvent } from '@/types/project'
import { isCuratedEvent, isEphemeralRssTag } from '@/lib/eventRetention'
import { logSupabaseFailure } from '@/lib/supabase/errors'
import {
  capJournalEntry,
  loadResearchForUser,
  mergeResearchIntoProject,
  projectNeedsResearchMigration,
  researchTableCounts,
  stripResearchFromProjectData,
  syncResearchForProject,
} from '@/lib/supabase/researchJournal'

// Strip fields that must not reach the database:
// - byokApiKey: user's private API key
// - event.body / summary: cap text for cloud sync (full text stays in localStorage)
// - journal / hypothesisLog / eventPaperLinks: stored in dedicated tables (see researchJournal.ts)
const BODY_SYNC_CAP = 4000
const SUMMARY_SYNC_CAP = 1500
/** Max non-curated events per cloud row — prevents jsonb upsert statement timeouts. */
export const CLOUD_EVENT_SYNC_MAX = 250

function capText(value: string | undefined, max = BODY_SYNC_CAP): string | undefined {
  if (!value) return value
  return value.length > max ? value.slice(0, max) : value
}

function capEventForCloud(e: UniversalEvent): UniversalEvent {
  const body = (e as UniversalEvent & { body?: string }).body
  return {
    ...e,
    summary: capText(e.summary, SUMMARY_SYNC_CAP) ?? e.summary,
    ...(body ? { body: capText(body)! } : {}),
    analystComments: (e.analystComments ?? []).slice(0, 15),
  }
}

/** Keep curated + recent events; drop ephemeral RSS firehose from cloud backup. */
export function trimEventsForCloudSync(events: UniversalEvent[]): UniversalEvent[] {
  const keep = new Map<string, UniversalEvent>()
  for (const e of events) {
    if (isCuratedEvent(e)) keep.set(e.id, capEventForCloud(e))
  }
  const pool = events
    .filter(e => !keep.has(e.id))
    .filter(e => !isEphemeralRssTag(e.tags))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const room = Math.max(0, CLOUD_EVENT_SYNC_MAX - keep.size)
  for (const e of pool.slice(0, room)) keep.set(e.id, capEventForCloud(e))
  return [...keep.values()]
}

function sanitizeProjectCore(p: Project): Omit<Project, 'byokApiKey'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { byokApiKey: _, ...safe } = p as Project & { byokApiKey?: string }
  const withCappedEvents = {
    ...safe,
    events: trimEventsForCloudSync(safe.events),
    journal: (safe.journal ?? []).map(capJournalEntry),
  } as Omit<Project, 'byokApiKey'>
  return stripResearchFromProjectData(withCappedEvents)
}

export async function loadProjects(userId: string): Promise<Project[]> {
  const supabase = createClient()
  if (!supabase) return []

  try {
    const [projectsRes, researchLoad] = await Promise.all([
      supabase
        .from('projects')
        .select('data')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false }),
      loadResearchForUser(userId),
    ])

    if (projectsRes.error) {
      logSupabaseFailure('loadProjects', projectsRes.error)
      return []
    }

    const { bundles: researchByProject, tablesAvailable } = researchLoad

    const rawProjects = (projectsRes.data ?? []).map((r: { data: Project }) => r.data as Project)

    const projects = rawProjects.map((raw: Project) =>
      mergeResearchIntoProject(raw, researchByProject.get(raw.id), tablesAvailable),
    )

    if (tablesAvailable) {
      const toMigrate = rawProjects.filter((p: Project) =>
        projectNeedsResearchMigration(p, researchTableCounts(researchByProject.get(p.id))),
      )
      if (toMigrate.length > 0) {
        await Promise.all(toMigrate.map((p: Project) => syncResearchForProject(p, userId)))
      }
    }

    return projects
  } catch (err) {
    logSupabaseFailure('loadProjects', err)
    return []
  }
}

export async function saveProject(project: Project, userId: string): Promise<boolean> {
  const supabase = createClient()
  if (!supabase) return false

  const payload = sanitizeProjectCore(project)
  // Project row first — research tables are secondary; don't block on their latency.
  const { error } = await supabase
    .from('projects')
    .upsert(
      { id: project.id, user_id: userId, data: payload },
      { onConflict: 'id' },
    )

  void syncResearchForProject(project, userId)

  if (error) {
    if (!error.message.includes('row-level security')) {
      logSupabaseFailure('saveProject', error)
    }
    return false
  }

  return true
}

export async function deleteProject(id: string, userId: string): Promise<boolean> {
  const supabase = createClient()
  if (!supabase) return false
  // journal_entries / hypothesis_revisions / event_paper_links cascade via project_id FK
  const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', userId)
  if (error) { logSupabaseFailure('deleteProject', error); return false }
  return true
}

/** Upload many projects — used for first-time migration from local browser storage. */
export async function saveAllProjects(projects: Project[], userId: string): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  for (const p of projects) {
    if (await saveProject(p, userId)) ok++
    else failed++
  }
  return { ok, failed }
}
