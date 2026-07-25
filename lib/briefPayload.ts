import type { CorrelationAlert, IntelEvent, Plot, Situation } from '@/types'
import type { Project, TrackedActor, KeyDate } from '@/types/project'
import { plotsForProject } from '@/lib/plotScope'
import { buildWorkspaceContextBlock } from '@/lib/workspaceIntel'
import { formatTaggedJournalCorpus, formatHypothesisBriefBlock } from '@/lib/journal'
import { resolveBriefEvents } from '@/lib/journalBrief'
import { forecastTrackRecordBlock } from '@/lib/forecasting'

export interface ProjectBriefPayload {
  projectName: string
  regionName: string
  goalTemplateId: string
  researchQuestion?: string
  events: IntelEvent[]
  alerts: CorrelationAlert[]
  situations?: Situation[]
  flaggedAlerts?: Array<{ title: string; severity: string; note: string; flaggedAt?: string }>
  incidents?: Array<{
    title: string; summary: string; stage: string; severity: string
    country: string; category: string; notes: string[]
    linkedEventCount?: number; createdAt?: string
  }>
  cases?: Array<{
    name: string; researchQuestion?: string; status: string
    notes?: string; eventCount: number
  }>
  forecasts?: Array<{
    claim: string; probability: number; dueDate?: string; resolved?: boolean; outcome?: string
  }>
  predictionEntries?: Array<{
    formulaName: string; score: number; label: string
    inputs: Record<string, number>; weights: Record<string, number>
    narrative: string; timestamp: string
  }>
  connectors?: Array<{ name: string; enabled: boolean; eventCount: number }>
  plots?: Plot[]
  targeting?: Project['targeting']
  projectId?: string
  workspaceContext?: string
  /** Tagged [J#] curated library block for the user prompt */
  curatedEvidence?: string
  /** Analyst hypothesis revision trail */
  hypothesisTrail?: string
  /** Deterministic forecast calibration track record (Brier/skill) */
  forecastTrackRecord?: string
  /** Actors under tracking — server derives [E#]-anchored dossiers from these */
  trackedActors?: TrackedActor[]
  /** Situation calendar — analyst-declared key dates */
  keyDates?: KeyDate[]
}

/** Assemble everything the project brief API needs from workspace state. */
export function buildProjectBriefPayload(
  project: Project,
  map: {
    events: IntelEvent[]
    alerts: CorrelationAlert[]
    situations: Situation[]
    flaggedAlerts: Record<string, { note: string; flaggedAt: string }>
  },
  allPlots: Plot[],
): ProjectBriefPayload {
  const events = resolveBriefEvents(project, map.events)
  const plots = plotsForProject(allPlots, project.id).filter(p => p.properties?.ai_include !== false)

  const flaggedAlerts = map.alerts
    .filter(a => map.flaggedAlerts[a.id])
    .map(a => ({
      title: a.title,
      severity: a.severity,
      note: map.flaggedAlerts[a.id].note,
      flaggedAt: map.flaggedAlerts[a.id].flaggedAt,
    }))

  const incidents = (project.incidents ?? [])
    .filter(i => i.stage !== 'closed')
    .map(i => ({
      title: i.title,
      summary: i.summary,
      stage: i.stage,
      severity: i.severity,
      country: i.country,
      category: i.category,
      notes: i.notes.map(n => n.text),
      linkedEventCount: i.linkedEventIds.length,
      createdAt: i.createdAt,
    }))

  const cases = (project.cases ?? []).map(c => ({
    name: c.name,
    researchQuestion: c.researchQuestion,
    status: c.status,
    notes: c.notes?.trim() || undefined,
    eventCount: c.eventIds.length,
  }))

  const forecasts = (project.forecasts ?? [])
    .filter(f => !f.resolved)
    .slice(0, 8)
    .map(f => ({
      claim: f.statement,
      probability: f.probability,
      dueDate: f.dueDate,
      resolved: f.resolved,
      outcome: f.outcome != null ? (f.outcome ? 'occurred' : 'did not occur') : undefined,
    }))

  const journal = project.journal ?? []
  const { text: curatedEvidence } = formatTaggedJournalCorpus(journal)
  const hypothesisTrail = formatHypothesisBriefBlock(project)
  const forecastTrackRecord = forecastTrackRecordBlock(project.forecasts ?? [])

  return {
    projectName: project.name,
    regionName: project.regionName,
    goalTemplateId: project.goalTemplateId ?? 'political-stability',
    researchQuestion: project.researchQuestion,
    events,
    alerts: map.alerts,
    situations: map.situations,
    flaggedAlerts,
    incidents,
    cases,
    forecasts,
    predictionEntries: project.predictionLedger.slice(-5).map(e => ({
      formulaName: e.formulaName,
      score: e.output,
      label: e.outputLabel,
      inputs: e.inputs,
      weights: e.weights,
      narrative: e.narrative,
      timestamp: e.timestamp,
    })),
    connectors: project.connectors.map(c => ({
      name: c.name ?? c.id,
      enabled: c.enabled,
      eventCount: c.eventCount ?? 0,
    })),
    plots,
    targeting: project.targeting,
    projectId: project.id,
    workspaceContext: buildWorkspaceContextBlock(project, map, plots, { omitJournal: journal.length > 0 }),
    curatedEvidence: curatedEvidence || undefined,
    hypothesisTrail: hypothesisTrail || undefined,
    forecastTrackRecord: forecastTrackRecord || undefined,
    trackedActors: project.trackedActors?.length ? project.trackedActors : undefined,
    keyDates: project.keyDates?.length ? project.keyDates : undefined,
  }
}
