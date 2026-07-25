import { NextRequest, NextResponse } from 'next/server'
import { NormalizedEvent } from '@/lib/normalize'
const uuidv4 = () => crypto.randomUUID()
import { inferSeverity, extractActors, inferCategories, extractLocation } from '@/lib/normalize'
import { geocodeEvents } from '@/lib/connectors/geocodeEvents'
import { vaultGet } from '@/lib/vault'

interface GuardianArticle {
  id: string; webTitle: string; webUrl: string; webPublicationDate: string
  sectionName: string; fields?: { trailText?: string }
}

export async function POST(req: NextRequest) {
  try {
    const { query, pageSize = 30, fromDate, geocode = true } = await req.json() as { query: string; pageSize?: number; fromDate?: string; geocode?: boolean }
    if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })
    const apiKey = (vaultGet('GUARDIAN_API_KEY') ?? process.env.GUARDIAN_API_KEY) || 'test'
    const params = new URLSearchParams({
      q: query, 'api-key': apiKey, 'page-size': String(Math.min(pageSize, 50)),
      'show-fields': 'trailText', 'order-by': 'newest',
    })
    if (fromDate) params.set('from-date', fromDate)
    const res = await fetch(`https://content.guardianapis.com/search?${params}`, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) throw new Error(`Guardian API returned ${res.status}`)
    const json = await res.json() as { response: { results: GuardianArticle[] } }
    const events: NormalizedEvent[] = (json.response?.results ?? []).map(article => {
      const text = `${article.webTitle} ${article.fields?.trailText ?? ''}`
      return {
        id: uuidv4(), title: article.webTitle,
        description: article.fields?.trailText ?? '',
        timestamp: article.webPublicationDate,
        location: extractLocation(text),
        actors: extractActors(text),
        categories: inferCategories(text),
        severity: inferSeverity(text),
        source: { name: 'The Guardian', type: 'independent' as const, url: article.webUrl, credibility: 85 },
        raw: { url: article.webUrl, body: article.fields?.trailText ?? '' },
      }
    })
    const out = geocode ? await geocodeEvents(events) : events
    return NextResponse.json({ events: out })
  } catch (err) {
    const msg = String(err)
    return NextResponse.json({ error: msg.includes('timeout') ? 'Guardian API unavailable.' : msg }, { status: 503 })
  }
}
