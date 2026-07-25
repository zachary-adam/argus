import { NormalizedEvent } from '@/lib/normalize'
import { makeEvent, extractLocation, inferCategories, inferSeverity, classifyDomain, extractActors } from '@/lib/normalize'
import { codeToName } from '@/lib/countryNames'

interface GDELTArticle {
  url: string; title: string; seendate: string; domain: string; sourcecountry: string
}

export async function fetchGDELTConnector(params: {
  query: string; timespan: string; maxRecords: number; sourceCountry?: string; sourceLang?: string
}): Promise<NormalizedEvent[]> {
  const { query, timespan, maxRecords, sourceCountry, sourceLang } = params
  const q = query + (sourceCountry ? ` sourcecountry:${sourceCountry}` : '') + (sourceLang ? ` sourcelang:${sourceLang}` : '')
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?` + new URLSearchParams({
    query: q, mode: 'artlist', maxrecords: String(Math.min(maxRecords, 250)), format: 'json', timespan,
  })
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`GDELT API error: ${res.status}`)
  const text = await res.text()
  if (!text.trim().startsWith('{') && !text.trim().startsWith('['))
    throw new Error(`GDELT rate limit: ${text.slice(0, 120)}`)
  const data = JSON.parse(text) as { articles?: GDELTArticle[] }
  return (data.articles ?? []).map(article => {
    let timestamp = new Date().toISOString()
    try {
      const d = article.seendate
      timestamp = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(9,11)}:${d.slice(11,13)}:${d.slice(13,15)}Z`).toISOString()
    } catch {}
    const sourceType = classifyDomain(article.domain)
    const loc = extractLocation(article.title + ' ' + article.sourcecountry)
    if (article.sourcecountry && loc.name === 'Unknown') {
      const code = article.sourcecountry.slice(0, 2).toUpperCase()
      loc.name    = codeToName(code) ?? article.sourcecountry
      loc.country = code
    }
    return makeEvent({
      title: article.title, description: article.title, timestamp, location: loc,
      actors: extractActors(article.title), categories: inferCategories(article.title),
      severity: inferSeverity(article.title),
      source: { name: article.domain, type: sourceType, url: article.url, credibility: sourceType === 'official' ? 60 : 80 },
      raw: { url: article.url, body: article.title },
    })
  })
}
