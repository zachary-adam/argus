import { IntelEvent } from '@/types'

/**
 * Detect "information-operations" noise: fact-check / debunk posts and raw
 * social-media shares that get pulled in via RSS but are NOT ground-truth events.
 *
 * Design intent (see the Bengal-election case): we do NOT delete these — a
 * government fact-check debunk is itself signal that a disinfo campaign is
 * running. We TAG them so they can be quarantined from alerts/risk and shown
 * under a separate "Disinfo" filter.
 *
 * Patterns are deliberately conservative (high precision) so real reporting like
 * "Violence erupts in West Bengal; CAPF deployed" is never flagged.
 */

// High-confidence single markers — presence of any one is enough.
const STRONG: RegExp[] = [
  /#?\bpib\s*fact\s*check\b/i,
  /\bfact[-\s]?check(ed|er|ing)?\b/i,
  /\bdebunk(ed|ing)?\b/i,
  /\b(mis|dis)information\b/i,
  /\bfalsely\s+(shared|claimed|attributed|linked|circulated)\b/i,
  /\b(do\s+not|don'?t)\s+believe\s+(such|this|the)\b/i,
  /\bverify\s+through\s+official\b/i,
]

// Weaker claim words only count as info-ops when paired with a media noun
// ("misleading video", "doctored image") — avoids flagging ordinary prose.
const WEAK_CLAIM = /\b(misleading|out\s+of\s+context|fabricated|doctored|morphed|edited|old)\b/i
const MEDIA_NOUN = /\b(video|image|photo|clip|footage|message|post|screenshot|reel)\b/i

// Raw social-share origins — these are posts, not reporting.
const SOCIAL_URL: RegExp[] = [
  /facebook\.com\/share/i,
  /\b(twitter|x)\.com\/[^/\s]+\/status\//i,
  /\bt\.me\//i,
  /instagram\.com\//i,
  /\bwa\.me\/|whatsapp/i,
  /youtube\.com\/shorts/i,
]

export interface InfoOpsResult {
  infoOps: boolean
  reason: string | null // human-readable why, e.g. 'fact-check/debunk' | 'social-media share'
}

export function classifyInfoOps(e: Pick<IntelEvent, 'title' | 'summary' | 'body' | 'url'>): InfoOpsResult {
  const text = `${e.title ?? ''}  ${e.summary ?? ''}  ${e.body ?? ''}`

  for (const re of STRONG) {
    if (re.test(text)) return { infoOps: true, reason: 'fact-check/debunk' }
  }
  if (WEAK_CLAIM.test(text) && MEDIA_NOUN.test(text)) {
    return { infoOps: true, reason: 'fact-check/debunk' }
  }
  const url = e.url ?? ''
  for (const re of SOCIAL_URL) {
    if (re.test(url)) return { infoOps: true, reason: 'social-media share' }
  }
  return { infoOps: false, reason: null }
}
