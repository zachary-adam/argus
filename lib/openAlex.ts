import type { PaperResult } from '@/lib/papersClient'

const BASE = 'https://api.openalex.org'
const MAILTO = 'research@argus.local'

interface OpenAlexWork {
  id: string
  display_name: string
  publication_year: number | null
  doi: string | null
  cited_by_count: number | null
  abstract_inverted_index?: Record<string, number[]> | null
  authorships?: { author?: { display_name?: string } }[]
  primary_location?: {
    landing_page_url?: string | null
    source?: { display_name?: string | null } | null
  } | null
}

function abstractFromInverted(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null
  const words: [number, string][] = []
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words.push([pos, word])
  }
  words.sort((a, b) => a[0] - b[0])
  const text = words.map(w => w[1]).join(' ')
  return text ? text.slice(0, 500) : null
}

function mapWork(w: OpenAlexWork): PaperResult {
  const doi = w.doi?.replace(/^https:\/\/doi\.org\//i, '') ?? null
  return {
    id: w.id,
    title: w.display_name ?? 'Untitled',
    authors: (w.authorships ?? [])
      .map(a => a.author?.display_name)
      .filter((n): n is string => !!n)
      .slice(0, 5),
    year: w.publication_year ?? null,
    abstract: abstractFromInverted(w.abstract_inverted_index),
    doi,
    url: w.primary_location?.landing_page_url ?? w.doi ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    citations: w.cited_by_count ?? null,
  }
}

export async function searchOpenAlex(q: string, limit = 10): Promise<PaperResult[]> {
  const url = `${BASE}/works?search=${encodeURIComponent(q)}&per_page=${limit}&mailto=${encodeURIComponent(MAILTO)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ARGUS-Intel/1.0' },
    next: { revalidate: 600 },
  })
  if (!res.ok) return []
  const data = await res.json() as { results?: OpenAlexWork[] }
  return (data.results ?? []).map(mapWork)
}

export async function fetchOpenAlexByDoi(doi: string): Promise<PaperResult[]> {
  const url = `${BASE}/works/https://doi.org/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(MAILTO)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ARGUS-Intel/1.0' },
    next: { revalidate: 600 },
  })
  if (res.status === 404) return []
  if (!res.ok) return []
  const w = await res.json() as OpenAlexWork
  if (!w?.id) return []
  return [mapWork(w)]
}
