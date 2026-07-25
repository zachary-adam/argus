import { NextRequest, NextResponse } from 'next/server'
import { getCache, setCache } from '@/lib/cache'
import { vaultGet } from '@/lib/vault'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// Server-side proxy for Google Static Maps.
//   • Hides the API key — it never reaches the browser (the URL the client hits
//     carries only lat/lon/zoom).
//   • Caches the rendered image so repeat captures of the same spot don't
//     re-bill the paid Static Maps API.
// The Maps JavaScript library still needs a public key (NEXT_PUBLIC_…) for the
// live drone view; that one is unavoidably client-side — restrict it by HTTP
// referrer in the Google Cloud Console.

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`staticmap:${getClientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  const sp = req.nextUrl.searchParams
  const lat = Number(sp.get('lat'))
  const lon = Number(sp.get('lon'))
  const zoom = Math.min(Math.max(Math.round(Number(sp.get('zoom')) || 12), 1), 20)

  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
    return NextResponse.json({ error: 'Invalid lat/lon' }, { status: 400 })
  }

  const key = vaultGet('GOOGLE_MAPS_KEY') ?? process.env.GOOGLE_MAPS_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!key) return NextResponse.json({ error: 'Maps key not configured' }, { status: 503 })

  // Round to ~11m so tiny coordinate jitter still hits the cache.
  const cacheKey = `staticmap:${lat.toFixed(4)}:${lon.toFixed(4)}:${zoom}`
  const cached = getCache<{ b64: string; type: string }>(cacheKey)
  const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }

  if (cached) {
    return new NextResponse(Buffer.from(cached.b64, 'base64'), { headers: { ...headers, 'Content-Type': cached.type } })
  }

  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat.toFixed(6)},${lon.toFixed(6)}` +
    `&zoom=${zoom}&size=800x600&scale=2&maptype=satellite&key=${key}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return NextResponse.json({ error: `Static Maps returned ${res.status}` }, { status: 502 })
    const type = res.headers.get('content-type') ?? 'image/png'
    const buf = Buffer.from(await res.arrayBuffer())
    // Cache 24h — satellite imagery is effectively static.
    setCache(cacheKey, { b64: buf.toString('base64'), type }, 86400)
    return new NextResponse(buf, { headers: { ...headers, 'Content-Type': type } })
  } catch {
    return NextResponse.json({ error: 'Static Maps fetch failed' }, { status: 502 })
  }
}
