import { NormalizedEvent } from '@/lib/normalize'
import { geocodeBestEffort, extractLocationQuery } from '@/lib/geocode'
import { mapWithConcurrency } from '@/lib/concurrency'
import { codeToName } from '@/lib/countryNames'

export interface GeocodeEventsOptions {
  /** Max number of network geocode lookups per batch (cost/rate-limit guard). */
  max?: number
  /** How many lookups to run in parallel. */
  concurrency?: number
}

/**
 * Upgrade events the local gazetteer couldn't place precisely.
 *
 * The synchronous `extractLocation` only resolves ~10-15% of real headlines (it
 * matches a ~245-entry gazetteer); the rest end up either "Unknown" or pinned to a
 * country centroid. This pulls the most specific place name out of the headline and
 * geocodes it for real (Google → Mapbox, both cached). It only touches events that
 * are unresolved or coordinate-less, is bounded by `max`, runs with limited
 * concurrency, and silently keeps the original event on any failure — so a missing
 * key or a flaky provider degrades to today's behaviour rather than breaking ingest.
 */
export async function geocodeEvents(
  events: NormalizedEvent[],
  opts: GeocodeEventsOptions = {},
): Promise<NormalizedEvent[]> {
  const { max = 50, concurrency = 5 } = opts
  let budget = max

  return mapWithConcurrency(events, concurrency, async (ev) => {
    const hasCoords = typeof ev.location.lat === 'number' && typeof ev.location.lng === 'number'
    const namedPlace = !!ev.location.name && ev.location.name !== 'Unknown'
    // Already placed by the gazetteer at a specific point — leave it.
    if (hasCoords && namedPlace) return ev
    if (budget <= 0) return ev

    const countryHint = ev.location.country
      ? (codeToName(ev.location.country) ?? undefined)
      : undefined
    const query = extractLocationQuery(ev.title, countryHint)
    if (!query) return ev

    budget--
    const geo = await geocodeBestEffort(query).catch(() => null)
    if (!geo) return ev

    return {
      ...ev,
      location: {
        name: query,
        lat: geo.lat,
        lng: geo.lon,
        country: geo.countryCode || ev.location.country,
        region: ev.location.region,
      },
    }
  })
}
