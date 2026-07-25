export interface GeoResult {
  lat: number
  lon: number
  country: string
  countryCode: string
}

const _cache = new Map<string, { r: GeoResult | null; exp: number }>()

export async function geocodePlace(query: string): Promise<GeoResult | null> {
  const key = query.toLowerCase().trim()
  const hit = _cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.r

  const apiKey = process.env.GOOGLE_MAPS_KEY
  if (!apiKey) return null

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) {
      _cache.set(key, { r: null, exp: Date.now() + 3_600_000 })
      return null
    }
    const data = await res.json()
    if (data.status !== 'OK' || !data.results?.length) {
      _cache.set(key, { r: null, exp: Date.now() + 3_600_000 })
      return null
    }
    const result = data.results[0]
    const loc = result.geometry.location
    const countryComp = result.address_components?.find((c: { types: string[]; long_name: string; short_name: string }) => c.types.includes('country'))
    const r: GeoResult = {
      lat: loc.lat,
      lon: loc.lng,
      country: countryComp?.long_name ?? query,
      countryCode: countryComp?.short_name ?? 'XX',
    }
    _cache.set(key, { r, exp: Date.now() + 86_400_000 })
    return r
  } catch {
    _cache.set(key, { r: null, exp: Date.now() + 3_600_000 })
    return null
  }
}

// ── Mapbox fallback geocoder (uses existing map token, no extra cost tier) ──

const _mbCache = new Map<string, GeoResult | null>()

export async function geocodeMapbox(query: string): Promise<GeoResult | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || !query || query === 'Unknown') return null
  const key = query.toLowerCase().trim()
  if (_mbCache.has(key)) return _mbCache.get(key)!
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(key.slice(0, 200))}.json?access_token=${token}&limit=1&types=country,region,place,locality&language=en`
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) { _mbCache.set(key, null); return null }
    const data = await res.json()
    const feat = data.features?.[0]
    if (!feat) { _mbCache.set(key, null); return null }
    const [lon, lat] = feat.center
    const ctx: Array<{ id: string; text: string }> = feat.context ?? []
    const country = ctx.find(c => c.id.startsWith('country'))?.text ?? feat.place_name?.split(', ').at(-1) ?? ''
    const countryCode = ctx.find(c => c.id.startsWith('country'))?.id?.split('.')[1]?.toUpperCase() ?? 'XX'
    const r: GeoResult = { lat, lon, country, countryCode }
    _mbCache.set(key, r)
    return r
  } catch {
    _mbCache.set(key, null)
    return null
  }
}

// Resolve location using Google first, Mapbox as fallback
export async function geocodeBestEffort(query: string): Promise<GeoResult | null> {
  if (!query || query === 'Unknown') return null
  const googleResult = await geocodePlace(query)
  if (googleResult) return googleResult
  return geocodeMapbox(query)
}

// Words that appear capitalized in headlines but are NOT place names
const SKIP_WORDS = new Set([
  'IDF', 'RSF', 'SAC', 'PLA', 'IRGC', 'ISIS', 'ISIL', 'NATO', 'AMISOM', 'UNSC', 'WFP', 'UNHCR',
  'UN', 'EU', 'US', 'UK', 'Armed', 'Forces', 'Military', 'Government', 'President', 'Minister',
  'Army', 'Navy', 'Police', 'Rebel', 'Crisis', 'Report', 'Alert', 'Air', 'Red', 'Black',
  'North', 'South', 'East', 'West', 'New', 'Joint', 'Federal', 'National', 'State', 'General',
])

/**
 * Extract a geocodeable query from a news headline.
 * Returns the most specific geographic reference found, combined with
 * countryHint for precision. Falls back to countryHint alone.
 */
export function extractLocationQuery(title: string, countryHint?: string): string | null {
  // "City/Region: ..." leading pattern
  const lead = title.match(/^([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})?):/)

  // "in/near/at/outside/targeting CityName" preposition pattern
  const prep = title.match(/\b(?:in|near|at|outside|targeting|strikes?|attacks?\s+on)\s+([A-Z][a-zA-Z]{3,}(?:\s+[A-Z][a-zA-Z]{2,})?)\b/)

  // Prefer prep match (city-level) over lead (usually country-level)
  const candidate = prep?.[1] ?? lead?.[1]

  if (candidate) {
    const firstWord = candidate.split(' ')[0]
    if (!SKIP_WORDS.has(firstWord)) {
      return countryHint ? `${candidate}, ${countryHint}` : candidate
    }
  }

  return countryHint ?? null
}
