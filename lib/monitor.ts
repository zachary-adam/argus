/**
 * Situation monitor — detects meaningful CHANGES in the derived analytical state
 * so ARGUS can page the analyst instead of waiting to be checked.
 *
 * Everything here is deterministic and diff-based: given the prior snapshot and
 * the current derived state (threads, actor dossiers, per-thread contradictions),
 * it emits signals for what actually moved — a storyline escalating, a tracked
 * actor spiking, a new figure contradiction, a new high-severity thread forming.
 * No LLM. Every signal traces to specific threads/actors/events.
 *
 * First run establishes a baseline and emits NOTHING — opening a project should
 * not fire a dozen "new thread" alerts for storylines that already existed.
 */
import type { NarrativeThread } from '@/lib/threads'
import type { ActorDossier } from '@/lib/actors'
import type { Forecast } from '@/lib/forecasting'
import { findContradictions } from '@/lib/contradictions'
import { dueForecasts } from '@/lib/forecasting'

export type MonitorSignalKind = 'new-thread' | 'thread-escalation' | 'actor-spike' | 'contradiction' | 'forecast-due'
export type MonitorSeverity = 'critical' | 'high' | 'medium' | 'low'

/** Short human label for the signal type — shown above the storyline name in Monitor. */
export const MONITOR_KIND_LABEL: Record<MonitorSignalKind, string> = {
  'new-thread': 'New storyline',
  'thread-escalation': 'Storyline escalating',
  'actor-spike': 'Tracked actor spike',
  'contradiction': 'Conflicting figures',
  'forecast-due': 'Forecast due',
}

export interface MonitorSignal {
  /** Stable dedup key — the same change never fires twice. */
  id: string
  kind: MonitorSignalKind
  severity: MonitorSeverity
  /** Signal type — use MONITOR_KIND_LABEL[kind] for display. */
  title: string
  detail: string
  at: string
  /** Derived thread label when this signal is about a storyline (full text, not truncated). */
  threadLabel?: string
  threadId?: string
  actorId?: string
  actorName?: string
  forecastId?: string
  eventIds?: string[]
}

/** Diff baseline — the metrics a later check compares against. */
export interface MonitorState {
  threadSize: Record<string, number>
  threadActive: Record<string, boolean>
  actorRecent7: Record<string, number>
  contradictionKeys: string[]
  knownThreadIds: string[]
}

export interface MonitorInput {
  threads: NarrativeThread[]
  dossiers: ActorDossier[]
  /** Project forecasts — a past-due unresolved one pages the analyst to resolve it. */
  forecasts?: Forecast[]
  now?: number
}

const ESCALATION_MIN_GROWTH = 2   // thread must gain ≥2 events to flag escalation
const NEW_THREAD_MIN_EVENTS = 3   // a fresh storyline needs mass before it pages you
const ACTOR_SPIKE_MIN = 3         // absolute floor so tiny corpora don't spam

function contradictionKey(threadId: string, term: string, values: number[]): string {
  return `${threadId}:${term}:${values.join('-')}`
}

/** Build the diff baseline from current derived state (no signals). Pure. */
export function snapshotState(input: MonitorInput): MonitorState {
  const threadSize: Record<string, number> = {}
  const threadActive: Record<string, boolean> = {}
  const contradictionKeys: string[] = []
  for (const t of input.threads) {
    threadSize[t.id] = t.events.length
    threadActive[t.id] = t.active
    for (const c of findContradictions(t.events)) {
      contradictionKeys.push(contradictionKey(t.id, c.term, c.reports.map(r => r.value)))
    }
  }
  const actorRecent7: Record<string, number> = {}
  for (const d of input.dossiers) actorRecent7[d.actor.id] = d.recent7
  return {
    threadSize,
    threadActive,
    actorRecent7,
    contradictionKeys,
    knownThreadIds: input.threads.map(t => t.id),
  }
}

/**
 * Detect what changed since `prev`. Returns the signals plus the next baseline.
 * `prev === null` ⇒ first run: baseline only, no signals.
 */
export function detectSignals(
  prev: MonitorState | null,
  input: MonitorInput,
): { signals: MonitorSignal[]; next: MonitorState } {
  const next = snapshotState(input)
  const now = input.now ?? Date.now()
  const at = new Date(now).toISOString()

  // Forecast-due is a STANDING condition, not a diff — page even on the baseline
  // run so an already-overdue forecast is surfaced the moment the project opens.
  // (Store dedups by id, so it fires exactly once until resolved.)
  const forecastSignals: MonitorSignal[] = dueForecasts(input.forecasts ?? [], now).map(fc => ({
    id: `forecast-due:${fc.id}`,
    kind: 'forecast-due' as const,
    severity: 'medium' as const,
    title: MONITOR_KIND_LABEL['forecast-due'],
    detail: `"${fc.statement}" (you said ${Math.round(fc.probability * 100)}%, due ${fc.dueDate}). Resolve it to keep your calibration record honest.`,
    at,
    forecastId: fc.id,
  }))

  if (!prev) return { signals: forecastSignals, next }

  const signals: MonitorSignal[] = [...forecastSignals]
  const known = new Set(prev.knownThreadIds)
  const prevContra = new Set(prev.contradictionKeys)

  for (const t of input.threads) {
    const isNew = !known.has(t.id)
    const prevSize = prev.threadSize[t.id] ?? 0

    if (isNew) {
      // Only page for a genuinely significant new storyline, not every pair.
      if (t.events.length >= NEW_THREAD_MIN_EVENTS && (t.topSeverity === 'critical' || t.topSeverity === 'high')) {
        signals.push({
          id: `new-thread:${t.id}`,
          kind: 'new-thread',
          severity: t.topSeverity,
          title: MONITOR_KIND_LABEL['new-thread'],
          threadLabel: t.label,
          detail: `${t.events.length} linked events across ${t.outlets.length} outlet${t.outlets.length !== 1 ? 's' : ''}, top severity ${t.topSeverity}.`,
          at,
          threadId: t.id,
          eventIds: t.events.slice(0, 10).map(e => e.id),
        })
      }
    } else {
      const grew = t.events.length - prevSize
      const reactivated = t.active && prev.threadActive[t.id] === false
      if (grew >= ESCALATION_MIN_GROWTH || reactivated) {
        signals.push({
          id: `escalation:${t.id}:${t.events.length}`,
          kind: 'thread-escalation',
          severity: t.topSeverity === 'critical' ? 'critical' : 'high',
          title: MONITOR_KIND_LABEL['thread-escalation'],
          threadLabel: t.label,
          detail: reactivated && grew < ESCALATION_MIN_GROWTH
            ? `Went active again with fresh reporting (${t.events.length} events total).`
            : `+${grew} new event${grew !== 1 ? 's' : ''} (${t.events.length} total, ${t.outlets.length} outlet${t.outlets.length !== 1 ? 's' : ''}).`,
          at,
          threadId: t.id,
          eventIds: t.events.slice(0, 10).map(e => e.id),
        })
      }
    }

    // New figure contradictions within this thread.
    for (const c of findContradictions(t.events)) {
      const key = contradictionKey(t.id, c.term, c.reports.map(r => r.value))
      if (!prevContra.has(key)) {
        signals.push({
          id: `contradiction:${key}`,
          kind: 'contradiction',
          severity: 'high',
          title: MONITOR_KIND_LABEL.contradiction,
          threadLabel: t.label,
          detail: `${c.term}: ${c.reports.map(r => r.value).join(' vs ')} — ${c.kind === 'walkback' ? 'a later report walks the figure back' : 'same reporting window'}.`,
          at,
          threadId: t.id,
          eventIds: c.reports.map(r => r.eventId),
        })
      }
    }
  }

  // Tracked-actor activity spikes — a jump worth an analyst's attention.
  for (const d of input.dossiers) {
    const prevN = prev.actorRecent7[d.actor.id]
    if (prevN === undefined) continue // new actor: baseline it, don't page
    const jump = d.recent7 - prevN
    const spiked = d.recent7 >= ACTOR_SPIKE_MIN && (jump >= ACTOR_SPIKE_MIN || d.recent7 >= prevN * 2)
    if (jump > 0 && spiked && d.significant) {
      signals.push({
        id: `actor-spike:${d.actor.id}:${d.recent7}`,
        kind: 'actor-spike',
        severity: 'medium',
        title: MONITOR_KIND_LABEL['actor-spike'],
        detail: `${d.recent7} mentions in the last 7 days (was ${prevN}). Trend ${d.trendPct === 999 ? 'new' : `${d.trendPct > 0 ? '+' : ''}${d.trendPct}%`}.`,
        at,
        actorId: d.actor.id,
        actorName: d.actor.name,
        eventIds: d.mentions.slice(0, 10).map(m => m.event.id),
      })
    }
  }

  return { signals, next }
}
