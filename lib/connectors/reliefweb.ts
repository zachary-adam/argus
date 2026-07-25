import { vaultGet } from '@/lib/vault'
import { NormalizedEvent, makeEvent, stripHtml, inferCategories, inferSeverity } from '@/lib/normalize'
import { codeToName } from '@/lib/countryNames'
import { geocodeBestEffort } from '@/lib/geocode'

export class ReliefWebNoAppnameError extends Error {}

interface RWReport {
  fields?: {
    title?: string
    body?: string
    url?: string
    date?: { created?: string }
    primary_country?: { name?: string; iso3?: string }
    source?: { shortname?: string }[]
  }
}

/**
 * ReliefWeb — UN OCHA's humanitarian/crisis reporting service. Free, but as of 2025
 * the v2 API requires a registered (no-cost) `appname`. Unlike GDELT/Google-News
 * headlines, ReliefWeb returns the FULL report text — so these events arrive as
 * genuine full-text sources that lift brief confidence past LOW. Scoped to the
 * project's countries, sorted newest-first.
 *
 * Opt-in: throws ReliefWebNoAppnameError when no appname is set, which the aimed
 * pull swallows so it keeps working on the other sources.
 */
export async function fetchReliefWebConnector(opts: {
  countryCodes?: string[]
  query?: string
}): Promise<NormalizedEvent[]> {
  const appname = vaultGet('RELIEFWEB_APPNAME') ?? process.env.RELIEFWEB_APPNAME
  if (!appname) {
    throw new ReliefWebNoAppnameError(
      'ReliefWeb appname required. Register a free appname at https://apidoc.reliefweb.int and add RELIEFWEB_APPNAME in Settings → API Keys.',
    )
  }

  const countryNames = [...new Set(
    (opts.countryCodes ?? [])
      .map(c => codeToName(c.toUpperCase()))
      .filter((n): n is string => !!n),
  )]

  const reqBody: Record<string, unknown> = {
    limit: 40,
    sort: ['date.created:desc'],
    fields: { include: ['title', 'body', 'url', 'date.created', 'primary_country.name', 'primary_country.iso3', 'source.shortname'] },
  }
  if (opts.query?.trim()) reqBody.query = { value: opts.query.trim(), operator: 'OR' }
  if (countryNames.length) reqBody.filter = { field: 'primary_country.name', value: countryNames, operator: 'OR' }

  const res = await fetch(`https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(appname)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`ReliefWeb API error ${res.status}`)
  const data = await res.json() as { data?: RWReport[] }
  const reports = data.data ?? []
  if (reports.length === 0) return []

  // Reports are country-level; geocode each unique country once to a centroid so
  // they place on the map (and survive the aimed pull's lat/lon != 0 filter).
  const centroids = new Map<string, { lat: number; lon: number }>()
  const uniqueCountries = [...new Set(reports.map(r => r.fields?.primary_country?.name).filter((n): n is string => !!n))]
  await Promise.all(uniqueCountries.map(async name => {
    const g = await geocodeBestEffort(name).catch(() => null)
    if (g) centroids.set(name, { lat: g.lat, lon: g.lon })
  }))

  return reports.map(r => {
    const f = r.fields ?? {}
    const countryName = f.primary_country?.name ?? 'Unknown'
    const c = centroids.get(countryName)
    const src = f.source?.[0]?.shortname ?? 'ReliefWeb'
    const fullText = stripHtml(f.body ?? '').slice(0, 4000)
    const text = `${f.title ?? ''} ${fullText.slice(0, 500)}`
    return makeEvent({
      title: f.title ?? 'ReliefWeb report',
      description: fullText.slice(0, 300),
      timestamp: f.date?.created ? new Date(f.date.created).toISOString() : new Date().toISOString(),
      location: { name: countryName, lat: c?.lat ?? 0, lng: c?.lon ?? 0, country: countryName },
      categories: inferCategories(text),
      severity: inferSeverity(text),
      source: { name: src, type: 'official' as const, url: f.url ?? 'https://reliefweb.int', credibility: 88 },
      raw: { url: f.url, body: fullText },
    })
  })
}
