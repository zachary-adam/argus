import { NextRequest } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { normalizeDoi, type PaperResult } from '@/lib/papersClient'
import { fetchOpenAlexByDoi, searchOpenAlex } from '@/lib/openAlex'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1/paper/search'
const FIELDS  = 'title,authors,year,abstract,externalIds,url,venue,citationCount,openAccessPdf'
const S2_KEY  = process.env.SEMANTIC_SCHOLAR_API_KEY

interface S2Author { name: string }
interface S2Paper {
  paperId: string
  title: string
  authors: S2Author[]
  year: number | null
  abstract: string | null
  venue: string | null
  citationCount: number | null
  url: string | null
  externalIds: { DOI?: string; ArXiv?: string } | null
  openAccessPdf: { url: string } | null
}

function mapS2Paper(p: S2Paper): PaperResult {
  return {
    id:          p.paperId,
    title:       p.title ?? 'Untitled',
    authors:     (p.authors ?? []).map(a => a.name).slice(0, 5),
    year:        p.year ?? null,
    abstract:    p.abstract ? p.abstract.slice(0, 500) : null,
    doi:         p.externalIds?.DOI ?? null,
    arxiv:       p.externalIds?.ArXiv ?? null,
    venue:       p.venue ?? null,
    citations:   p.citationCount ?? null,
    url:         p.openAccessPdf?.url ?? p.url ?? null,
  }
}

function s2Headers(): HeadersInit {
  const h: Record<string, string> = { 'User-Agent': 'ARGUS-Intel/1.0 (academic-research-tool)' }
  if (S2_KEY) h['x-api-key'] = S2_KEY
  return h
}

async function searchSemanticScholar(q: string): Promise<{ papers: PaperResult[]; ok: boolean; status?: number }> {
  const url = `${S2_BASE}?query=${encodeURIComponent(q)}&limit=20&fields=${FIELDS}`
  const res = await fetch(url, { headers: s2Headers(), next: { revalidate: 600 } })
  if (!res.ok) return { papers: [], ok: false, status: res.status }
  const data = await res.json()
  return { papers: (data.data as S2Paper[] ?? []).map(mapS2Paper), ok: true }
}

/** Loose key for de-duplication: prefer DOI, fall back to alphanumeric title. */
function paperKey(p: PaperResult): string {
  if (p.doi) return `doi:${p.doi.toLowerCase()}`
  return `t:${p.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`
}

/**
 * Merge two relevance-ordered result lists, preferring the first list's copy of
 * a duplicate (Semantic Scholar carries abstracts + citation counts more often).
 * Order is preserved from the inputs — no synthetic re-ranking, so "relevance"
 * stays honest; the client offers explicit cite/year sorts on top.
 */
function mergePapers(primary: PaperResult[], secondary: PaperResult[]): PaperResult[] {
  const seen = new Set<string>()
  const out: PaperResult[] = []
  for (const p of [...primary, ...secondary]) {
    const key = paperKey(p)
    if (!key || key === 't:' || seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

async function fetchS2ByDoi(doi: string): Promise<{ papers: PaperResult[]; ok: boolean }> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${FIELDS}`
  const res = await fetch(url, { headers: s2Headers(), next: { revalidate: 600 } })
  if (res.status === 404) return { papers: [], ok: true }
  if (!res.ok) return { papers: [], ok: false }
  const p = await res.json() as S2Paper
  if (!p?.paperId) return { papers: [], ok: true }
  return { papers: [mapS2Paper(p)], ok: true }
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`papers:ip:${ip}`, 40, 60_000)) {
    return Response.json({ papers: [], error: 'Too many searches — wait a moment and retry.' })
  }

  const { searchParams } = new URL(req.url)
  const qRaw = searchParams.get('q')?.trim() ?? ''
  const doiParam = searchParams.get('doi')?.trim() ?? ''
  const doi = normalizeDoi(doiParam || qRaw)

  if (doi) {
    try {
      const s2 = await fetchS2ByDoi(doi)
      if (s2.papers.length > 0) return Response.json({ papers: s2.papers, doi, source: 'semanticscholar' })
      const openAlex = await fetchOpenAlexByDoi(doi)
      if (openAlex.length > 0) return Response.json({ papers: openAlex, doi, source: 'openalex' })
      return Response.json({ papers: [], doi, error: 'DOI not found' })
    } catch {
      return Response.json({ papers: [], error: 'Lookup failed' })
    }
  }

  const q = qRaw
  if (!q || q.length < 2) return Response.json({ papers: [] })

  try {
    // Query both corpora in parallel and merge — Semantic Scholar leads (better
    // abstracts/citations), OpenAlex fills the long tail. Either failing alone
    // still yields results from the other.
    const [s2, openAlex] = await Promise.all([
      searchSemanticScholar(q).catch(() => ({ papers: [] as PaperResult[], ok: false, status: 0 })),
      searchOpenAlex(q, 20).catch(() => [] as PaperResult[]),
    ])

    const merged = mergePapers(s2.papers, openAlex).slice(0, 20)
    if (merged.length > 0) {
      const source = s2.papers.length && openAlex.length ? 'semanticscholar+openalex'
        : s2.papers.length ? 'semanticscholar' : 'openalex'
      return Response.json({ papers: merged, source })
    }

    if (!s2.ok && s2.status === 429) {
      return Response.json({ papers: [], error: 'Paper databases busy — try again in a few seconds.' })
    }

    return Response.json({ papers: [], error: 'No papers found — try different keywords or a DOI.' })
  } catch {
    return Response.json({ papers: [], error: 'Search failed — check connection and retry.' })
  }
}
