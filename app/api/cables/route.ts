import { NextResponse } from 'next/server'
import { getCache, setCache } from '@/lib/cache'

// Source: tbotnz/submarine-cables-geojson (mirrors TeleGeography data)
// 638 unique cables, last updated Nov 2024
const SOURCE_URL = 'https://raw.githubusercontent.com/tbotnz/submarine-cables-geojson/main/cables.json'

// Cache for 24 hours — data only changes when TeleGeography publishes new cables
const CACHE_TTL = 86400

export async function GET() {
  const cached = getCache<object>('cables-geojson')
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' },
    })
  }

  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    const data = await res.json()
    setCache('cables-geojson', data, CACHE_TTL)
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600' },
    })
  } catch {
    // Fall back to bundled static file
    return NextResponse.redirect(new URL('/data/cables.json', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'))
  }
}
