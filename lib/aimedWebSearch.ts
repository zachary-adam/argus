/**
 * Multi-query Serper + Brave for aimed pulls.
 * Both engines run when keys exist; several lens queries, not one.
 */

export type AimedWebHit = {
  title: string
  url: string
  snippet: string
  domain: string
}

function domainOf(url: string, fallback = ''): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return fallback
  }
}

async function searchSerper(query: string, apiKey: string, count: number): Promise<AimedWebHit[]> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: Math.min(count, 20) }),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error(`SERPER_UNAUTHORIZED:${res.status}`)
  }
  if (res.status === 429) {
    throw new Error('SERPER_RATE_LIMIT')
  }
  if (!res.ok) return []
  const data = await res.json() as { organic?: Array<{ title: string; link: string; snippet: string }> }
  return (data.organic ?? []).map(r => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet ?? '',
    domain: domainOf(r.link),
  }))
}

async function searchBrave(
  query: string,
  apiKey: string,
  count: number,
  searchLang = 'en',
): Promise<AimedWebHit[]> {
  const url =
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}` +
    `&count=${Math.min(count, 15)}&search_lang=${searchLang}&result_filter=web`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error(`BRAVE_UNAUTHORIZED:${res.status}`)
  }
  if (res.status === 429) {
    throw new Error('BRAVE_RATE_LIMIT')
  }
  if (!res.ok) return []
  const data = await res.json() as {
    web?: { results?: Array<{ title: string; url: string; description: string; meta_url?: { netloc?: string } }> }
  }
  return (data.web?.results ?? []).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description ?? '',
    domain: r.meta_url?.netloc ?? domainOf(r.url),
  }))
}

const RQ_STOP = new Set([
  'the', 'a', 'an', 'will', 'what', 'how', 'when', 'where', 'who', 'whom', 'which',
  'is', 'are', 'was', 'were', 'be', 'been', 'of', 'to', 'for', 'in', 'on', 'at',
  'and', 'or', 'vs', 'versus', 'about', 'check', 'predict', 'prediction', 'forecast',
  'likely', 'outcome', 'win', 'wins', 'winner',
])

/** Extra web queries from the research question (place + topic tokens). */
export function queriesFromResearchQuestion(
  researchQuestion: string | undefined,
  placeName: string | undefined,
): string[] {
  if (!researchQuestion?.trim()) return []
  const place = placeName?.split(',')[0]?.trim()
  const words = researchQuestion
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !RQ_STOP.has(w.toLowerCase()))
    .slice(0, 8)
  if (!words.length) return []
  const group = `(${words.map(w => (/\s/.test(w) ? `"${w}"` : w)).join(' OR ')})`
  return [place ? `"${place}" ${group}` : group]
}

/**
 * Run Serper and/or Brave across several queries.
 * Dedupes by URL. Local-language Brave pass for India (hi) when IN is in scope.
 * Prefer process.env over vault (same rule as AI keys).
 */
export async function aimedWebSearch(opts: {
  queries: string[]
  countryCodes?: string[]
  serperKey?: string | null
  braveKey?: string | null
  /** Max distinct queries to fire (default 6). */
  maxQueries?: number
}): Promise<{ hits: AimedWebHit[]; warning?: string }> {
  const serper = opts.serperKey?.trim() || null
  const brave = opts.braveKey?.trim() || null
  if (!serper && !brave) {
    return { hits: [], warning: 'No SERPER_API_KEY or BRAVE_API_KEY - web search skipped (Google News still runs).' }
  }

  const queries = [...new Set(opts.queries.map(q => q.trim()).filter(q => q.length >= 3))]
    .slice(0, opts.maxQueries ?? 6)
  if (!queries.length) return { hits: [] }

  const wantHi = (opts.countryCodes ?? []).some(c => c.toUpperCase() === 'IN')
  const jobs: Promise<AimedWebHit[]>[] = []
  let authWarning: string | undefined

  const wrap = (p: Promise<AimedWebHit[]>, label: 'Serper' | 'Brave') =>
    p.catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : ''
      if (/UNAUTHORIZED/.test(msg)) {
        authWarning = `${label} API key rejected - update ${label === 'Serper' ? 'SERPER_API_KEY' : 'BRAVE_API_KEY'} in .env.local or Settings.`
      } else if (/RATE_LIMIT/.test(msg)) {
        authWarning = `${label} rate limit hit - wait a minute or reduce collect frequency.`
      }
      return [] as AimedWebHit[]
    })

  for (const q of queries) {
    if (serper) jobs.push(wrap(searchSerper(q, serper, 8), 'Serper'))
    if (brave) {
      jobs.push(wrap(searchBrave(q, brave, 8, 'en'), 'Brave'))
      if (wantHi) jobs.push(wrap(searchBrave(q, brave, 6, 'hi'), 'Brave'))
    }
  }

  const batches = await Promise.all(jobs)
  const seen = new Set<string>()
  const out: AimedWebHit[] = []
  for (const hit of batches.flat()) {
    const key = hit.url.replace(/#.*$/, '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(hit)
  }
  return { hits: out, warning: authWarning }
}
