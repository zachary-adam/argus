import { NextRequest, NextResponse } from 'next/server'
import { makeEvent, extractLocation, inferCategories, inferSeverity, classifyDomain, extractActors } from '@/lib/normalize'
import { getCredibility, extractBody, fetchWithJinaFallback } from '@/lib/scrapeUtils'
import { validatePublicUrl } from '@/lib/validateUrl'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { geocodeBestEffort, extractLocationQuery } from '@/lib/geocode'
import { vaultGet } from '@/lib/vault'

function extractMeta(html: string, prop: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${prop}"`, 'i'),
    new RegExp(`<meta[^>]+name="${prop}"[^>]+content="([^"]*)"`, 'i'),
  ]
  for (const p of patterns) { const m = html.match(p); if (m) return decode(m[1]) }
  return ''
}
function decode(s: string) { return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ') }
function extractTitle(html: string) {
  return extractMeta(html,'og:title') || extractMeta(html,'twitter:title') ||
    decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '') || 'Untitled'
}
function extractDescription(html: string) {
  return extractMeta(html,'og:description') || extractMeta(html,'twitter:description') || extractMeta(html,'description') || ''
}
function extractPublishDate(html: string) {
  const patterns = [/article:published_time"[^>]+content="([^"]+)"/i,/"datePublished"\s*:\s*"([^"]+)"/i,/<time[^>]+datetime="([^"]+)"/i]
  for (const p of patterns) { const m = html.match(p); if (m) { try { return new Date(m[1]).toISOString() } catch {} } }
  return new Date().toISOString()
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`scrape:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { url } = await req.json()
    if (!url || typeof url !== 'string') return NextResponse.json({ error: 'url required' }, { status: 400 })

    try {
      await validatePublicUrl(url)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }

    const firecrawlKey = vaultGet('FIRECRAWL_API_KEY') ?? process.env.FIRECRAWL_API_KEY
    let html = '', body = ''
    let title = '', description = '', timestamp = ''

    if (firecrawlKey) {
      const fc = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${firecrawlKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ['markdown', 'html'] }),
        signal: AbortSignal.timeout(20000),
      })
      if (!fc.ok) throw new Error(`Firecrawl returned ${fc.status}`)
      const fcData = await fc.json() as { success: boolean; data?: { markdown?: string; html?: string; metadata?: { title?: string; description?: string; publishedTime?: string } } }
      if (!fcData.success || !fcData.data) throw new Error('Firecrawl response invalid')
      html = fcData.data.html ?? ''
      body = fcData.data.markdown ?? extractBody(html)
      title = fcData.data.metadata?.title ?? extractTitle(html) ?? 'Untitled'
      description = fcData.data.metadata?.description ?? extractDescription(html)
      timestamp = fcData.data.metadata?.publishedTime ? new Date(fcData.data.metadata.publishedTime).toISOString() : extractPublishDate(html)
    } else {
      const fetched = await fetchWithJinaFallback(url)
      html = fetched.html
      body = fetched.body
      title = extractTitle(html)
      description = extractDescription(html) || body.slice(0, 600)
      timestamp = extractPublishDate(html)
    }
    const domain = new URL(url).hostname.replace('www.', '')
    // Include leading body excerpt so location/severity/actors use article content,
    // not just the headline (which is often vague).
    const text = `${title} ${description} ${body.slice(0, 600)}`
    let location = extractLocation(text)
    // Static keyword match failed — try geocoding the title for a precise fix
    if (!location.lat) {
      const query = extractLocationQuery(title) ?? extractLocationQuery(description.slice(0, 200))
      if (query) {
        const geo = await geocodeBestEffort(query)
        if (geo) location = { name: query, lat: geo.lat, lng: geo.lon, country: geo.country }
      }
    }
    const event = makeEvent({
      title, description, timestamp, location,
      actors: extractActors(text), categories: inferCategories(text), severity: inferSeverity(text),
      source: { name: domain, type: classifyDomain(domain), url, credibility: getCredibility(domain) },
      raw: { url, body },
    })
    return NextResponse.json({ event })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch or parse URL' }, { status: 500 })
  }
}
