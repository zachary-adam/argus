import { NextRequest, NextResponse } from 'next/server'
import { IntelEvent } from '@/types'
import { Targeting } from '@/types/project'
import { buildNewsQuery, googleNewsUrl, parseGoogleNews } from '@/lib/connectors/googleNews'
import { deriveCollectionLenses, localesForLens } from '@/lib/collectionLenses'
import { geocodePlace } from '@/lib/geocode'
import { getCache, setCache } from '@/lib/cache'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { vaultGet } from '@/lib/vault'
import { webResultToEvent } from '@/lib/topicIngest'
import { prepareAimedEvents, collapseAimedStories } from '@/lib/aimedIngest'
import { refineAimedCoords } from '@/lib/aimedGeo'
import { semanticRerank } from '@/lib/semanticRelevance'
import { enrichEventsWithFullText } from '@/lib/enrichFullText'
import { fetchGDELTConnector } from '@/lib/connectors/gdelt'
import { fetchACLEDConnector } from '@/lib/connectors/acled'
import { fetchReliefWebConnector } from '@/lib/connectors/reliefweb'
import { toIntelEvent } from '@/lib/normalize'
import { codeToName } from '@/lib/countryNames'
import { aimedWebSearch, queriesFromResearchQuestion } from '@/lib/aimedWebSearch'

/** Build a GDELT query scoped to the project's countries + situation terms.
 *  e.g. ("India" OR "China") ("border" OR "LAC" OR "troops") — structured, geo-coded
 *  coverage of the situation, not the noisy global firehose or capped web search. */
function buildGdeltAorQuery(targeting: Targeting, countryCodes: string[]): string | null {
  const countries = [...new Set(countryCodes.map(c => codeToName(c.toUpperCase())).filter(Boolean) as string[])]
  if (countries.length === 0) return null
  const geo = countries.length === 1 ? `"${countries[0]}"` : `(${countries.map(c => `"${c}"`).join(' OR ')})`
  const terms = [...(targeting.watchEntities ?? []), ...(targeting.keywords ?? [])]
    .map(s => s.trim()).filter(Boolean).slice(0, 14)
  const topic = terms.length ? ` (${terms.map(t => `"${t}"`).join(' OR ')})` : ''
  return `${geo}${topic}`
}

/** News lookback — niche beats (campus elections, local politics) need >7d. */
const NEWS_WINDOW_DAYS = 14

// Aimed ingestion for a project's targeting — geocodes the focus place, runs a
// Google News search built from place + keywords + entities, returns IntelEvents
// anchored at the place. This is the "specific" end of the broad↔specific dial.
export async function POST(req: NextRequest) {
  if (!checkRateLimit(`targeted:${getClientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const { targeting, anchor, countryCodes, researchQuestion, trackedActors } = (await req.json().catch(() => ({}))) as {
    targeting?: Targeting
    anchor?: [number, number]
    countryCodes?: string[]
    researchQuestion?: string
    trackedActors?: { name: string; aliases?: string[] }[]
  }
  if (!targeting) return NextResponse.json([], { status: 200 })

  const query = buildNewsQuery(targeting)
  if (!query) return NextResponse.json([]) // nothing to aim at

  const actorKey = (trackedActors ?? []).flatMap(a => [a.name, ...(a.aliases ?? [])]).join('|')
  const cacheKey = `targeted:v6:${query}:${(countryCodes ?? []).sort().join(',')}:${actorKey}:${(researchQuestion ?? '').slice(0, 80)}`
  const cached = getCache<IntelEvent[]>(cacheKey)
  if (cached) return NextResponse.json(cached)

  // Anchor coordinates: geocode the focus place (best-effort), else fall back to the
  // project region centre (passed as anchor [lon, lat]) so keyword-only targeting
  // still places its events somewhere visible rather than being dropped at 0,0.
  let geo = Array.isArray(anchor) && anchor.length === 2
    ? { lat: anchor[1], lon: anchor[0], country: 'Unknown', countryCode: 'XX' }
    : { lat: 0, lon: 0, country: 'Unknown', countryCode: 'XX' }
  if (targeting.placeName?.trim()) {
    const g = await geocodePlace(targeting.placeName.trim()).catch(() => null)
    if (g) geo = { lat: g.lat, lon: g.lon, country: g.country, countryCode: (g as { countryCode?: string }).countryCode ?? 'XX' }
  }

  try {
    // Multi-lens collection: primary query + country/entity perspectives derived from
    // the mission (not hard-coded to any conflict). Each lens runs across the relevant
    // local-language Google News editions so bilateral projects aren't English/one-side only.
    const lenses = deriveCollectionLenses(targeting, countryCodes ?? [], trackedActors ?? []).slice(0, 12)
    // Region signal for edition selection — a "West Bengal" focus (or a Kolkata
    // keyword) unlocks the Bengali edition on top of the country default.
    const placeText = [targeting.placeName, ...(targeting.keywords ?? []), ...(targeting.watchEntities ?? []), researchQuestion]
      .filter(Boolean).join(' ')
    const perLens = await Promise.all(lenses.map(async lens => {
      const locales = localesForLens(lens, countryCodes ?? [], geo.countryCode, placeText)
      const perEdition = await Promise.all(locales.map(async loc => {
        try {
          const res = await fetch(googleNewsUrl(lens.query, NEWS_WINDOW_DAYS, loc), {
            signal: AbortSignal.timeout(10000),
            headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
          })
          if (!res.ok) return [] as IntelEvent[]
          return parseGoogleNews(await res.text(), geo, 40).filter(e => e.lat !== 0 || e.lon !== 0)
        } catch { return [] as IntelEvent[] }
      }))
      return perEdition.flat()
    }))

    const seen = new Set<string>()
    const events = perLens.flat().filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)))

    // Web search: Serper AND Brave (when both keys exist), across primary + entity
    // lenses + research-question tokens — not a single English query of 15 hits.
    // Prefer .env.local over vault (stale vault keys used to silently kill search).
    let webWarning: string | undefined
    try {
      const webQueries = [
        query,
        ...lenses.slice(0, 5).map(l => l.query),
        ...queriesFromResearchQuestion(researchQuestion, targeting.placeName),
      ]
      const web = await aimedWebSearch({
        queries: webQueries,
        countryCodes: countryCodes ?? [],
        serperKey: process.env.SERPER_API_KEY || vaultGet('SERPER_API_KEY'),
        braveKey: process.env.BRAVE_API_KEY || vaultGet('BRAVE_API_KEY'),
        maxQueries: 3,
      })
      webWarning = web.warning
      for (const hit of web.hits) {
        const ev = webResultToEvent(hit, geo)
        if (!seen.has(ev.id)) { seen.add(ev.id); events.push(ev) }
      }
      if (!webWarning && web.hits.length === 0 && (process.env.SERPER_API_KEY || process.env.BRAVE_API_KEY)) {
        // Key present but zero hits — usually rate-limit or empty SERP, not a crash.
        webWarning = undefined
      }
    } catch { /* optional layer */ }

    // Structured backbone — GDELT scoped to the project's countries. Comprehensive and
    // geo-coded (hundreds of on-topic articles), unlike capped/noisy web search. Merged
    // here, then AOR-filtered with everything else by prepareAimedEvents.
    try {
      const gq = buildGdeltAorQuery(targeting, countryCodes ?? [])
      if (gq) {
        const gdeltRaw = await fetchGDELTConnector({ query: gq, timespan: '7d', maxRecords: 75 })
        for (const ne of gdeltRaw) {
          const ev = toIntelEvent(ne, 'gdelt') as IntelEvent
          if (ev && (ev.lat !== 0 || ev.lon !== 0) && !seen.has(ev.id)) {
            // Same tags as the other aimed sources so re-pull clears it and the feed buckets it correctly.
            ev.tags = [...new Set([...(ev.tags ?? []), 'targeted', 'aimed-pull', 'gdelt-aor'])]
            seen.add(ev.id)
            events.push(ev)
          }
        }
      }
    } catch { /* GDELT optional — never sink the pull */ }

    // ACLED — curated, geo-coded conflict/protest data scoped to the project's countries
    // (graded NATO A). Only runs when the analyst has added ACLED credentials; no key
    // throws AcledNoCredsError, which we swallow so the pull continues on other sources.
    try {
      const acledRaw = await fetchACLEDConnector(countryCodes ?? [])
      for (const ne of acledRaw) {
        const ev = toIntelEvent(ne, 'acled') as IntelEvent
        if (ev && (ev.lat !== 0 || ev.lon !== 0) && !seen.has(ev.id)) {
          ev.tags = [...new Set([...(ev.tags ?? []), 'targeted', 'aimed-pull', 'acled-aor'])]
          seen.add(ev.id)
          events.push(ev)
        }
      }
    } catch { /* ACLED optional — no key or API error never sinks the pull */ }

    // ReliefWeb — free (with a registered appname) UN OCHA crisis reporting, scoped
    // to the project's countries. Returns FULL report text, so these arrive as
    // full-text sources that lift brief confidence. Opt-in: no appname throws, which
    // we swallow so the pull continues on the other sources.
    try {
      const rwTerms = [...(targeting.watchEntities ?? []), ...(targeting.keywords ?? [])]
        .map(s => s.trim()).filter(Boolean).slice(0, 10).join(' ')
      const rwRaw = await fetchReliefWebConnector({ countryCodes: countryCodes ?? [], query: rwTerms || undefined })
      for (const ne of rwRaw) {
        const ev = toIntelEvent(ne, 'reliefweb') as IntelEvent
        if (ev && (ev.lat !== 0 || ev.lon !== 0) && !seen.has(ev.id)) {
          ev.tags = [...new Set([...(ev.tags ?? []), 'targeted', 'aimed-pull', 'reliefweb-aor'])]
          seen.add(ev.id)
          events.push(ev)
        }
      }
    } catch { /* ReliefWeb optional — no appname or API error never sinks the pull */ }

    // Relevance brain: dedup, then rank by *meaning* against the project mission
    // (semantic) instead of substring co-occurrence. Falls back to the old
    // substring gate when no OpenAI key is set or the embeddings call fails, so a
    // keyless deployment still works exactly as before.
    const deduped = collapseAimedStories(events)
    const semantic = await semanticRerank(deduped, {
      targeting,
      countryCodes: countryCodes ?? [],
      researchQuestion,
      maxKeep: 120,
      minKeep: 12,
      floor: 28,
      threshold: 42,
    })
    let ranked = semantic.applied
      ? semantic.events
      : prepareAimedEvents(deduped, targeting, countryCodes ?? [])

    // Spread anchor-pinned events (Google News / web search all land on the focus
    // place) to their real locations — gazetteer first, then budgeted geocoding.
    // Best-effort: an event that can't be improved keeps the anchor point.
    try {
      ranked = await refineAimedCoords(ranked, geo, { max: 60, concurrency: 6 })
    } catch { /* refinement is opportunistic — anchor placement still works */ }

    // Pillar 2 — deep-read the top-ranked events into full article text so briefs
    // work from documents, not headlines. Best-effort; never sinks the pull. The
    // result is cached, so the 2-min poll reuses it rather than re-scraping.
    let prepared = ranked
    try {
      prepared = await enrichEventsWithFullText(ranked, { max: 16, concurrency: 5 })
    } catch { /* enrichment is opportunistic — keep the ranked headlines on failure */ }

    setCache(cacheKey, prepared, 180) // 3 min — niche beats go stale fast
    const headers: Record<string, string> = {}
    if (webWarning) headers['X-Argus-Warning'] = webWarning.replace(/[^\x20-\x7E]/g, ' ').slice(0, 180)
    return NextResponse.json(prepared, Object.keys(headers).length ? { headers } : undefined)
  } catch (err) {
    console.error('[targeted]', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Aimed collect failed — check network and try Collect again' },
      { status: 502 },
    )
  }
}
