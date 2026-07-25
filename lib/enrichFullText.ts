/**
 * Pillar 2 — DEPTH. Turn headlines into documents.
 *
 * Connector events arrive title-only (GDELT sets `body: title`; Google-News RSS is
 * a headline). A brief built on headlines can never exceed LOW confidence and reads
 * thin. This deep-reads the *top-ranked* events — fetching and extracting the full
 * article text into `body` — so the brief reasons from real source documents and
 * can reach MODERATE/HIGH.
 *
 * It runs AFTER the semantic relevance brain, on events already sorted most-relevant
 * first, so the (bounded, rate-limited) scrape budget is spent only on the events
 * that matter. Best-effort and SSRF-guarded: a blocked/slow/failed fetch leaves the
 * event untouched and never sinks the pull.
 */
import type { IntelEvent } from '@/types'
import { fetchWithJinaFallback } from '@/lib/scrapeUtils'
import { validatePublicUrl } from '@/lib/validateUrl'
import { mapWithConcurrency } from '@/lib/concurrency'
import { isGoogleNewsUrl, resolveGoogleNewsUrl } from '@/lib/connectors/googleNewsResolve'

// Below this, `body` is effectively a headline — worth deep-reading. The brief
// routes use the same 300-char bar to decide "full text" vs "metadata only".
export const MIN_BODY_CHARS = 300

export interface EnrichFullTextOptions {
  max?: number          // how many top events to deep-read (default 6)
  concurrency?: number  // parallel fetches (default 4)
}

/** An event worth deep-reading: has a real http(s) URL and only a headline body. */
export function needsFullText(e: Pick<IntelEvent, 'url' | 'body'>): boolean {
  return /^https?:\/\//i.test(e.url ?? '') && ((e.body?.length ?? 0) < MIN_BODY_CHARS)
}

/**
 * Populate `body` with full article text for the top events that lack it.
 * Returns a new array; events that couldn't be read are returned unchanged.
 */
export async function enrichEventsWithFullText(
  events: IntelEvent[],
  opts: EnrichFullTextOptions = {},
): Promise<IntelEvent[]> {
  const max = opts.max ?? 6
  const concurrency = opts.concurrency ?? 4

  // Input is assumed ranked (semantic brain sorts most-relevant first), so the
  // first `max` that need text are the highest-value reads.
  const candidates = events.filter(needsFullText).slice(0, max)
  if (candidates.length === 0) return events

  // Per event we may learn both the full body AND the real publisher URL
  // (Google News links are redirects — resolving them improves both scrape
  // success and the citation target the brief points an analyst at).
  const enrichedById = new Map<string, { body: string; url?: string }>()
  await mapWithConcurrency(candidates, concurrency, async (e) => {
    try {
      // Resolve Google News redirect → publisher URL before fetching/citing.
      const fetchUrl = isGoogleNewsUrl(e.url) ? await resolveGoogleNewsUrl(e.url) : e.url
      await validatePublicUrl(fetchUrl)
      const { body } = await fetchWithJinaFallback(fetchUrl)
      const resolvedUrl = fetchUrl !== e.url ? fetchUrl : undefined
      if (body && body.length >= MIN_BODY_CHARS) {
        enrichedById.set(e.id, { body, url: resolvedUrl })
      } else if (resolvedUrl) {
        // Couldn't read the body, but a real publisher URL still beats the redirect.
        enrichedById.set(e.id, { body: '', url: resolvedUrl })
      }
    } catch {
      // blocked, redirect-only, timeout, or SSRF-rejected — keep the headline
    }
  })

  if (enrichedById.size === 0) return events
  return events.map(e => {
    const hit = enrichedById.get(e.id)
    if (!hit) return e
    return {
      ...e,
      ...(hit.body ? { body: hit.body } : {}),
      ...(hit.url ? { url: hit.url } : {}),
    }
  })
}
