import { NextRequest, NextResponse } from 'next/server'
import { parseRSSXML } from '@/lib/connectors/rss'
import { safeFetch, validatePublicUrl } from '@/lib/validateUrl'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { geocodeBestEffort, extractLocationQuery } from '@/lib/geocode'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`rss:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { feedUrl } = await req.json()
    if (!feedUrl || typeof feedUrl !== 'string') {
      return NextResponse.json({ error: 'feedUrl required' }, { status: 400 })
    }

    try {
      await validatePublicUrl(feedUrl)
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }

    const res = await safeFetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ARGUS/1.0; +https://argus.app)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return NextResponse.json({ error: `Feed returned ${res.status}` }, { status: 502 })
    const xml = await res.text()
    const rawEvents = parseRSSXML(xml, feedUrl)

    // Geocode events that have no location (lat===0, lon===0)
    const events = await Promise.all(rawEvents.map(async ev => {
      if (ev.location.lat) return ev
      const query = extractLocationQuery(ev.title) ?? extractLocationQuery(ev.description?.slice(0, 200) ?? '')
      if (!query) return ev
      const geo = await geocodeBestEffort(query)
      if (!geo) return ev
      return { ...ev, location: { name: query, lat: geo.lat, lng: geo.lon, country: geo.country } }
    }))

    return NextResponse.json({ events })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
  }
}
