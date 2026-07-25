/** Normalize a DOI string or doi.org URL to bare DOI form. */
export function normalizeDoi(raw: string): string | null {
  const s = raw.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:/i, '')
  if (!s) return null
  if (/^10\.\d{4,9}\/[^\s]+$/i.test(s)) return s.toLowerCase()
  return null
}

export function looksLikeDoi(raw: string): boolean {
  return normalizeDoi(raw) !== null
}

export interface PaperResult {
  id?: string
  title: string
  authors?: string[]
  year?: number | null
  abstract?: string | null
  doi?: string | null
  arxiv?: string | null
  url?: string | null
  venue?: string | null
  citations?: number | null
}
