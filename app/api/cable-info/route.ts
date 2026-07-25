import { NextRequest, NextResponse } from 'next/server'
import { getCache, setCache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const cacheKey = `cable-info-${id}`
  const cached = getCache<object>(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: { 'Cache-Control': 'max-age=86400, stale-while-revalidate=604800' } })

  try {
    const res = await fetch(
      `https://www.submarinecablemap.com/api/v3/cable/${encodeURIComponent(id)}.json`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const data = await res.json()
    // Cache 24h — cable metadata rarely changes
    setCache(cacheKey, data, 86400)
    return NextResponse.json(data, { headers: { 'Cache-Control': 'max-age=86400, stale-while-revalidate=604800' } })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 502 })
  }
}
