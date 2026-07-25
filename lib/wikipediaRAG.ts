import { getCache, setCache } from './cache'
import { PRIORITY_COUNTRIES } from './constants'

const SECTIONS_OF_INTEREST = ['Politics', 'Economy', 'Military', 'Foreign relations', 'History', 'Demographics', 'Geography', 'Government']

export async function fetchWikipediaContext(countryName: string): Promise<string> {
  const key = `wiki-${countryName}`
  const cached = getCache<string>(key)
  if (cached) return cached

  try {
    const encoded = encodeURIComponent(countryName.replace(/ /g, '_'))
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/mobile-sections/${encoded}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'ARGUS/1.0 (geopolitical-intelligence-platform)' },
    })

    if (!res.ok) return ''

    const data = await res.json()
    const sections = [data.lead, ...(data.remaining?.sections || [])]

    const relevant = sections
      .filter((s: Record<string, string>) => !s.anchor || SECTIONS_OF_INTEREST.some(k => s.anchor?.toLowerCase().includes(k.toLowerCase())))
      .map((s: Record<string, string>) => {
        const text = stripHTML(s.text || '')
        return text.slice(0, 600)
      })
      .join('\n\n')
      .slice(0, 3000)

    setCache(key, relevant, 86400)
    return relevant
  } catch {
    return ''
  }
}

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export async function preCachePriorityCountries(): Promise<void> {
  for (const country of PRIORITY_COUNTRIES) {
    fetchWikipediaContext(country).catch(() => {})
    await new Promise(r => setTimeout(r, 500))
  }
}
