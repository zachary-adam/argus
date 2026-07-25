import type { IntelEvent } from '@/types'
import { extractLocation } from '@/lib/normalize'
import { extractLocationQuery, geocodeBestEffort } from '@/lib/geocode'
import { mapWithConcurrency } from '@/lib/concurrency'
import { codeToName } from '@/lib/countryNames'

export interface RefineAimedCoordsOptions {
  /** Max network geocode lookups per batch (gazetteer hits are free). */
  max?: number
  concurrency?: number
}

/** Anchored aimed sources — Google News / web search pin every hit at the focus place. */
export function isAnchorPinnedEvent(
  e: IntelEvent,
  anchor?: { lat: number; lon: number },
): boolean {
  const anchored =
    e.tags?.includes('google-news') ||
    e.tags?.includes('web-search') ||
    (e.tags?.includes('aimed-pull') && e.source === 'analyst')
  if (!anchored) return false
  if (!anchor) return true
  // ~1 km — catches stacked pins without splitting legitimately close incidents
  return Math.abs(e.lat - anchor.lat) < 0.01 && Math.abs(e.lon - anchor.lon) < 0.01
}

/** Gazetteer-only spread — safe on client, no network. */
export function refineIntelEventCoordsSync(
  ev: IntelEvent,
  anchor?: { lat: number; lon: number },
): IntelEvent {
  if (anchor && !isAnchorPinnedEvent(ev, anchor)) return ev
  if (!anchor && !ev.tags?.includes('google-news') && !ev.tags?.includes('web-search')) return ev

  const gaz = extractLocation(`${ev.title} ${ev.summary ?? ''}`)
  if (gaz.name === 'Unknown' || typeof gaz.lat !== 'number' || typeof gaz.lng !== 'number') {
    return ev
  }
  return { ...ev, lat: gaz.lat, lon: gaz.lng, geoPrecision: 'city' as const }
}

export function refineIntelEventListSync(
  events: IntelEvent[],
  anchor?: { lat: number; lon: number },
): IntelEvent[] {
  if (!anchor) return events
  return events.map(e => refineIntelEventCoordsSync(e, anchor))
}

function isAnchorPinned(e: IntelEvent, anchor: { lat: number; lon: number }): boolean {
  return isAnchorPinnedEvent(e, anchor)
}

/**
 * Spread anchor-pinned aimed events to their REAL locations.
 *
 * Google News / web-search aimed pulls drop every headline at the geocoded focus
 * place, so ten Ladakh stories stack on one identical point — patrol mode then
 * "orbits" a single spot and the map hides how spread the activity actually is.
 *
 * Two passes, cheapest first:
 *  1. Gazetteer — word-boundary match against KNOWN_LOCATIONS (free, no network).
 *  2. Headline geocode — extract the most specific place from the title and
 *     resolve it via Google → Mapbox (both cached), bounded by `max`.
 *
 * Events that can't be improved keep the anchor point — never worse than today.
 */
export async function refineAimedCoords(
  events: IntelEvent[],
  anchor: { lat: number; lon: number },
  opts: RefineAimedCoordsOptions = {},
): Promise<IntelEvent[]> {
  const { max = 30, concurrency = 5 } = opts
  let budget = max

  return mapWithConcurrency(events, concurrency, async (ev) => {
    if (!isAnchorPinned(ev, anchor)) return ev

    const text = `${ev.title} ${ev.summary ?? ''}`

    // Pass 1 — gazetteer (free). City/region keys only, so a hit is always at
    // least as specific as the anchor.
    const gaz = extractLocation(text)
    if (gaz.name !== 'Unknown' && typeof gaz.lat === 'number' && typeof gaz.lng === 'number') {
      return { ...ev, lat: gaz.lat, lon: gaz.lng, geoPrecision: 'city' as const }
    }

    // Pass 2 — geocode the headline's place reference (budgeted network call).
    if (budget <= 0) return ev
    const countryHint = ev.countryCode && ev.countryCode !== 'XX'
      ? (codeToName(ev.countryCode) ?? ev.country)
      : (ev.country !== 'Unknown' ? ev.country : undefined)
    const query = extractLocationQuery(ev.title, countryHint)
    // A bare country-hint query would land on the country centroid — usually
    // LESS specific than the focus-place anchor, so skip it.
    if (!query || query === countryHint) return ev

    budget--
    const geo = await geocodeBestEffort(query).catch(() => null)
    if (!geo) return ev
    return { ...ev, lat: geo.lat, lon: geo.lon, geoPrecision: 'city' as const }
  })
}
