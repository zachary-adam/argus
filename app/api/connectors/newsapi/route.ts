import { NextRequest, NextResponse } from 'next/server'
import { NormalizedEvent, inferSeverity, extractActors, inferCategories, extractLocation } from '@/lib/normalize'
import { geocodeEvents } from '@/lib/connectors/geocodeEvents'
import { vaultGet } from '@/lib/vault'
const uuidv4 = () => crypto.randomUUID()

interface NewsAPIArticle {
  source: { name: string }; title: string; description: string | null; url: string; publishedAt: string
}

export async function POST(req: NextRequest) {
  try {
    const { query, pageSize = 30, language = 'en', sortBy = 'publishedAt', geocode = true } = await req.json() as {
      query: string; pageSize?: number; language?: string; sortBy?: string; geocode?: boolean
    }
    if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })
    const apiKey = vaultGet('NEWSAPI_KEY') ?? process.env.NEWS_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'NO_KEY', message: 'NewsAPI key not configured. Add it in Settings → Data Vault.' }, { status: 400 })
    const params = new URLSearchParams({ q: query, apiKey, pageSize: String(Math.min(pageSize, 100)), language, sortBy })
    const res = await fetch(`https://newsapi.org/v2/everything?${params}`, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { message?: string }
      throw new Error(err.message || `NewsAPI returned ${res.status}`)
    }
    const json = await res.json() as { articles: NewsAPIArticle[] }
    const events: NormalizedEvent[] = (json.articles ?? [])
      .filter(a => a.title && a.title !== '[Removed]')
      .map(article => {
        const text = `${article.title} ${article.description ?? ''}`
        return {
          id: uuidv4(), title: article.title, description: article.description ?? '',
          timestamp: article.publishedAt, location: extractLocation(text),
          actors: extractActors(text), categories: inferCategories(text), severity: inferSeverity(text),
          source: { name: article.source?.name || 'NewsAPI', type: 'independent' as const, url: article.url, credibility: 75 },
          raw: { url: article.url, body: article.description ?? '' },
        }
      })
    const out = geocode ? await geocodeEvents(events) : events
    return NextResponse.json({ events: out })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
