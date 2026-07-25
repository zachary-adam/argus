'use client'
import type { IntelEvent } from '@/types'
import type { Targeting } from '@/types/project'
import { isSituationRelevant } from '@/lib/relevance'

/**
 * Client-side bridge to the semantic relevance gate (`/api/relevance`).
 *
 * Replaces the live feed's primitive `text.includes(keyword)` gate with meaning-
 * based scoring. Decisions are cached per event id (scoped to the active mission)
 * so each event is scored once, not on every poll/reconnect. Any network or key
 * failure transparently falls back to the keyword gate, so the feed degrades to
 * today's behaviour rather than breaking.
 */

export interface MissionCtx {
  targeting?: Targeting
  countryCodes?: string[]
  researchQuestion?: string
}

let cacheSig = ''
const keepById = new Map<string, boolean>()
const scoreById = new Map<string, number>()

function missionSig(ctx: MissionCtx): string {
  return JSON.stringify([
    ctx.targeting?.placeName ?? '',
    ctx.targeting?.keywords ?? [],
    ctx.targeting?.watchEntities ?? [],
    ctx.countryCodes ?? [],
    ctx.researchQuestion ?? '',
  ])
}

/** The semantic relevance score (0-100) for an event id, if it has been scored. */
export function getRelevanceScore(id: string): number | undefined {
  return scoreById.get(id)
}

/** Drop cached relevance verdicts (e.g. after clearing app cache). */
export function clearRelevanceCache(): void {
  cacheSig = ''
  keepById.clear()
  scoreById.clear()
}

/**
 * Return the subset of `events` that are on-mission. New events are scored via the
 * endpoint in one batched call; already-decided events are served from cache.
 */
export async function gateBySemanticRelevance(
  events: IntelEvent[],
  ctx: MissionCtx,
): Promise<IntelEvent[]> {
  if (events.length === 0) return events

  // Mission changed (analyst edited targeting) → drop stale verdicts.
  const sig = missionSig(ctx)
  if (sig !== cacheSig) {
    cacheSig = sig
    keepById.clear()
    scoreById.clear()
  }

  const uncached = events.filter(e => !keepById.has(e.id))
  if (uncached.length > 0) {
    try {
      const res = await fetch('/api/relevance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: uncached.map(e => ({
            id: e.id, title: e.title, summary: e.summary, body: e.body,
            country: e.country, countryCode: e.countryCode, category: e.category,
          })),
          targeting: ctx.targeting,
          countryCodes: ctx.countryCodes,
          researchQuestion: ctx.researchQuestion,
        }),
      })
      if (!res.ok) throw new Error(`relevance ${res.status}`)
      const data = (await res.json()) as { applied: boolean; results: { id: string; score: number; keep: boolean }[] }
      if (data.results?.length) {
        for (const r of data.results) {
          keepById.set(r.id, r.keep)
          scoreById.set(r.id, r.score)
        }
      } else {
        throw new Error('empty relevance result')
      }
    } catch {
      // Endpoint/key/network failure → keyword gate for this batch.
      for (const e of uncached) {
        keepById.set(e.id, isSituationRelevant(e, ctx.targeting, ctx.countryCodes))
      }
    }
  }

  return events.filter(e => keepById.get(e.id) !== false)
}
