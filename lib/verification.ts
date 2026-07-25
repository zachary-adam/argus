import { IntelEvent } from '@/types'
import { sourceGrade, eventConfidence } from './sourceWeight'

export type Verdict = 'corroborated' | 'single-source' | 'disputed' | 'unverified'

export interface VerificationResult {
  verdict: Verdict
  confidence: number // 0-1
  rationale: string  // one-line, analyst-facing
}

const LABEL: Record<Verdict, string> = {
  corroborated: 'Corroborated',
  'single-source': 'Single source',
  disputed: 'Disputed',
  unverified: 'Unverified',
}
export function verdictLabel(v: Verdict): string { return LABEL[v] }

/**
 * Turn the shallow "is this flagged?" signal into an actual verification verdict.
 *
 * Unlike a monitoring tool that just shows you a headline, ARGUS already knows
 * (a) how many INDEPENDENT sources reported the event (corroborationCount, set by
 * the cross-source dedup), (b) the NATO reliability of those sources, and (c)
 * whether it was tagged as information-operations noise. This composes those into
 * a verdict an analyst can act on — the core of the "deep verification" layer.
 *
 * v1 reasons over signals ARGUS has already computed; an active cross-search
 * ("find me corroborating/contradicting coverage") builds on top of this verdict.
 */
export function assessVerification(
  e: Pick<IntelEvent, 'source' | 'sourceReliability' | 'sourceCredibility' | 'corroborationCount' | 'infoOps' | 'infoOpsReason'>,
): VerificationResult {
  const corr = e.corroborationCount ?? 1
  const conf = eventConfidence(e)
  const reliability = (e.sourceReliability as 'A' | 'B' | 'C' | 'D' | 'E' | 'F') ?? sourceGrade(e.source).reliability
  const reliableSource = reliability <= 'B' // 'A' or 'B'

  // Information-operations content is disputed by construction — it needs scrutiny.
  if (e.infoOps) {
    return {
      verdict: 'disputed',
      confidence: Math.min(conf, 0.4),
      rationale: `Flagged as information-operations content (${e.infoOpsReason ?? 'unverified claim'}) — treat with caution until independently confirmed.`,
    }
  }
  if (corr >= 3) {
    return { verdict: 'corroborated', confidence: Math.max(conf, 0.8), rationale: `Reported independently by ${corr} sources — well-confirmed.` }
  }
  if (corr === 2) {
    return { verdict: 'corroborated', confidence: Math.max(conf, 0.62), rationale: `Reported by 2 independent sources — moderately confirmed.` }
  }
  // Single source.
  if (reliableSource) {
    return { verdict: 'single-source', confidence: conf, rationale: `Single ${reliability}-grade source — credible, but not yet independently corroborated.` }
  }
  return { verdict: 'unverified', confidence: Math.min(conf, 0.45), rationale: `Single ${reliability}-grade source with no corroboration — unverified.` }
}
