import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import type { IntelEvent } from '@/types'
import { refineAimedCoords } from '@/lib/aimedGeo'

/** Batch spread anchor-pinned events to headline-derived locations (gazetteer + geocode). */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(`refine-coords:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
  }

  try {
    const body = await req.json() as {
      events?: IntelEvent[]
      anchor?: { lat: number; lon: number }
    }
    const events = body.events ?? []
    const anchor = body.anchor
    if (!events.length || !anchor || typeof anchor.lat !== 'number' || typeof anchor.lon !== 'number') {
      return NextResponse.json({ error: 'events and anchor { lat, lon } required' }, { status: 400 })
    }

    const refined = await refineAimedCoords(events.slice(0, 40), anchor, { max: 20, concurrency: 4 })
    return NextResponse.json(refined)
  } catch {
    return NextResponse.json({ error: 'Refine failed' }, { status: 500 })
  }
}
