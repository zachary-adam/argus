import { looksLikeDoi, type PaperResult } from '@/lib/papersClient'

export interface PapersSearchResponse {
  papers: PaperResult[]
  error?: string
  source?: string
  doi?: string
}

/** Client-side fetch for /api/papers with safe JSON handling. */
export async function searchPapersFromApi(input: { q?: string; doi?: string }): Promise<PapersSearchResponse> {
  const trimmed = (input.doi ?? input.q ?? '').trim()
  if (!trimmed) return { papers: [] }
  if (!input.doi && trimmed.length < 2) return { papers: [] }

  const param = input.doi || looksLikeDoi(trimmed)
    ? `doi=${encodeURIComponent(input.doi ?? trimmed)}`
    : `q=${encodeURIComponent(trimmed)}`

  try {
    const res = await fetch(`/api/papers?${param}`)
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('application/json')) {
      return { papers: [], error: 'Search unavailable — refresh the page or sign in again.' }
    }
    const data = await res.json() as PapersSearchResponse
    const papers = data.papers ?? []
    if (papers.length === 0 && !data.error) {
      return {
        papers: [],
        error: looksLikeDoi(trimmed) ? 'DOI not found' : 'No papers found — try different keywords',
      }
    }
    return { papers, error: data.error, source: data.source, doi: data.doi }
  } catch {
    return { papers: [], error: 'Search failed — check connection and retry.' }
  }
}
