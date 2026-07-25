/**
 * Source reliability weighting — NATO Admiralty (Admiralty System) grading.
 *
 * Every event carries a `source`, but the reliability/credibility fields were never
 * populated, so the engines treated a NASA satellite reading and an unverified RSS
 * item as equal. This assigns a baseline grade per source type and turns it into a
 * 0–1 confidence used to weight scoring and shown to the analyst.
 *
 *   Reliability A–F : how trustworthy the SOURCE is.
 *   Credibility 1–6 : how plausible the INFORMATION is.
 */
import { IntelEvent } from '@/types'

export type Reliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type Credibility = 1 | 2 | 3 | 4 | 5 | 6

// Baseline grade per source. Official sensors/agencies rate high; machine media
// aggregators and general feeds rate mid; an analyst's own mark is reliable but single-source.
const SOURCE_GRADE: Record<string, { reliability: Reliability; credibility: Credibility }> = {
  usgs:      { reliability: 'A', credibility: 1 }, // seismic sensors
  gdacs:     { reliability: 'A', credibility: 1 }, // disaster alert system
  firms:     { reliability: 'A', credibility: 1 }, // NASA satellite
  who:       { reliability: 'A', credibility: 2 },
  ocha:      { reliability: 'A', credibility: 2 },
  unhcr:     { reliability: 'A', credibility: 2 },
  ucdp:      { reliability: 'A', credibility: 2 }, // academic conflict dataset
  acled:     { reliability: 'A', credibility: 2 }, // curated conflict data
  reliefweb: { reliability: 'B', credibility: 2 },
  fewsnet:   { reliability: 'B', credibility: 2 },
  analyst:   { reliability: 'B', credibility: 2 }, // first-hand, single-source
  gdelt:     { reliability: 'C', credibility: 3 }, // machine-aggregated media
  rss:       { reliability: 'C', credibility: 3 }, // general news feeds
}
const DEFAULT_GRADE = { reliability: 'D' as Reliability, credibility: 4 as Credibility }

const REL_W: Record<Reliability, number> = { A: 1.0, B: 0.8, C: 0.6, D: 0.4, E: 0.2, F: 0.1 }
const CRED_W: Record<Credibility, number> = { 1: 1.0, 2: 0.85, 3: 0.65, 4: 0.45, 5: 0.25, 6: 0.1 }

export function sourceGrade(source: string): { reliability: Reliability; credibility: Credibility } {
  return SOURCE_GRADE[source] ?? DEFAULT_GRADE
}

/** 0–1 confidence: source × information, boosted by independent corroboration. */
export function eventConfidence(e: Pick<IntelEvent, 'source' | 'sourceReliability' | 'sourceCredibility' | 'corroborationCount'>): number {
  const rel = (e.sourceReliability as Reliability) ?? sourceGrade(e.source).reliability
  const cred = (e.sourceCredibility as Credibility) ?? sourceGrade(e.source).credibility
  const base = (REL_W[rel] ?? 0.4) * (CRED_W[cred] ?? 0.45)
  const corr = e.corroborationCount ?? 1
  // Independent corroboration moves confidence toward 1 (diminishing returns).
  const boost = corr > 1 ? (1 - base) * Math.min(1, (corr - 1) / 4) * 0.5 : 0
  return Math.min(1, base + boost)
}

export function confidenceLabel(c: number): 'High' | 'Moderate' | 'Low' | 'Unverified' {
  if (c >= 0.75) return 'High'
  if (c >= 0.5) return 'Moderate'
  if (c >= 0.3) return 'Low'
  return 'Unverified'
}

const FRESH_MS = 72 * 3_600_000        // no decay inside 72h
const STALE_MS = 30 * 86_400_000       // floor reached at 30 days

/**
 * Confidence decay: a claim confirmed once three weeks ago should not read like
 * one confirmed yesterday. 1.0 while fresh, then linear decay to a floor that
 * corroboration raises — well-confirmed facts rot slower than single-source
 * claims. Display-level by design: risk formulas keep raw eventConfidence so
 * decay is always visible and auditable, never silently baked into scores.
 */
export function stalenessFactor(timestamp?: string, corroborationCount = 1, now = Date.now()): number {
  if (!timestamp) return 1
  const age = now - new Date(timestamp).getTime()
  if (!Number.isFinite(age) || age <= FRESH_MS) return 1
  const floor = corroborationCount >= 3 ? 0.85 : corroborationCount === 2 ? 0.75 : 0.6
  const t = Math.min(1, (age - FRESH_MS) / (STALE_MS - FRESH_MS))
  return Math.round((1 - (1 - floor) * t) * 100) / 100
}

/** What the UI shows: trust NOW (eventConfidence x staleness), not trust at ingest. */
export function agedConfidence(
  e: Pick<IntelEvent, 'source' | 'sourceReliability' | 'sourceCredibility' | 'corroborationCount'> & { timestamp?: string },
  now = Date.now(),
): number {
  return eventConfidence(e) * stalenessFactor(e.timestamp, e.corroborationCount ?? 1, now)
}

/** Convenience for badges: the NATO code (e.g. "A1") for an event. */
export function natoCode(e: Pick<IntelEvent, 'source' | 'sourceReliability' | 'sourceCredibility'>): string {
  const rel = (e.sourceReliability as Reliability) ?? sourceGrade(e.source).reliability
  const cred = (e.sourceCredibility as Credibility) ?? sourceGrade(e.source).credibility
  return `${rel}${cred}`
}
