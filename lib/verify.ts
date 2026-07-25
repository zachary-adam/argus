import { IntelEvent } from '@/types'

export type Verdict = 'supported' | 'disputed' | 'unverified' | 'likely-false'

export interface VerificationResult {
  verdict: Verdict
  confidence: number       // 0-1
  reasoning: string        // IC-language explanation
  supporting: string[]     // [E#] tags of corroborating evidence
  contradicting: string[]  // [E#] tags of contradicting evidence
  sourceAssessment: string // assessment of the claim's own source quality
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'with', 'from',
  'by', 'as', 'is', 'are', 'was', 'were', 'amid', 'over', 'after', 'before', 'near',
  'this', 'that', 'his', 'her', 'their', 'has', 'have', 'been', 'will', 'into',
])

function keyTerms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter(w => w.length > 3 && !STOP.has(w)))
}

/**
 * Gather the corpus events that bear on a claim — the evidence set a verification
 * pass reasons over. Ranks by shared key terms + same country + geographic/time
 * proximity, excludes the claim itself.
 *
 * This is the heart of "verify against your OWN graded corpus": instead of trusting
 * a single post, we surface what the rest of the workspace says about the same thing.
 */
export function gatherEvidence(claim: IntelEvent, corpus: IntelEvent[], max = 12): IntelEvent[] {
  const cTerms = keyTerms(`${claim.title} ${claim.summary ?? ''}`)
  const cTime = new Date(claim.timestamp).getTime()

  return corpus
    .filter(e => e.id !== claim.id)
    .map(e => {
      const terms = keyTerms(`${e.title} ${e.summary ?? ''}`)
      let shared = 0
      for (const t of terms) if (cTerms.has(t)) shared++
      let geoBonus = 0
      if (claim.lat && claim.lon && e.lat && e.lon) {
        const d = Math.hypot(claim.lat - e.lat, claim.lon - e.lon)
        if (d < 2) geoBonus = 5
        else if (d < 6) geoBonus = 2
      }
      // Inclusion requires real topical overlap (or near-identical location) — same
      // country / same day are only RANKING bonuses, never enough on their own (else
      // every same-day event in the country would count as "evidence").
      const include = shared > 0 || geoBonus >= 5
      let score = shared * 10 + geoBonus
      if (e.countryCode && e.countryCode === claim.countryCode) score += 6
      if (include && Math.abs(new Date(e.timestamp).getTime() - cTime) < 3 * 86_400_000) score += 2
      return { e, score, include }
    })
    .filter(x => x.include)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.e)
}

/**
 * Evidence-only heuristic verdict for when no AI key is configured — so verification
 * still does something useful offline. Conservative by design: thin evidence ⇒
 * "unverified", never a confident claim. Real assessment is the AI path.
 */
export function heuristicVerdict(claim: IntelEvent, evidence: IntelEvent[]): VerificationResult {
  const distinctSources = new Set([claim.source, ...evidence.map(e => e.source)]).size
  let verdict: Verdict = 'unverified'
  let confidence = 0.3

  if (distinctSources >= 3 && evidence.length >= 2) { verdict = 'supported'; confidence = 0.7 }
  else if (evidence.length >= 1) { verdict = 'unverified'; confidence = 0.45 }
  if (claim.infoOps) { verdict = 'disputed'; confidence = Math.max(confidence, 0.5) }

  return {
    verdict,
    confidence,
    reasoning: `${evidence.length} related report${evidence.length === 1 ? '' : 's'} from ${distinctSources} distinct source${distinctSources === 1 ? '' : 's'} in the workspace.${claim.infoOps ? ' Flagged as information-operations content — treat with caution.' : ''} No AI key set — this is a corroboration-only heuristic, not a full assessment.`,
    supporting: evidence.slice(0, 6).map((_, i) => `E${i + 1}`),
    contradicting: [],
    sourceAssessment: `Claim source: ${claim.source}${claim.sourceReliability ? ` (NATO ${claim.sourceReliability}${claim.sourceCredibility ?? ''})` : ''}.`,
  }
}
