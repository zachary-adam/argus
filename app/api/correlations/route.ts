import { NextRequest, NextResponse } from 'next/server'
import { IntelEvent, AircraftPosition, CorrelationSettings } from '@/types'
import { runCorrelationEngine } from '@/lib/correlationEngine'
import { getCache, setCache } from '@/lib/cache'

export async function POST(req: NextRequest) {
  try {
  const { events, settings }: { events: IntelEvent[]; settings?: CorrelationSettings } = await req.json()

  // Only use cache when running with default settings
  if (!settings) {
    const cached = getCache('correlations')
    if (cached) return NextResponse.json(cached)
  }

  // Pull vessels from AISStream singleton (same process, no network call)
  const vessels = typeof globalThis.__aisstream !== 'undefined'
    ? Array.from(globalThis.__aisstream.vesselStore.values())
    : []

  // Pull aircraft from cache (populated by /api/aviation)
  const aircraft: AircraftPosition[] = getCache<AircraftPosition[]>('aviation') ?? []

  const alerts = runCorrelationEngine(events, vessels, aircraft, settings)
  // Only cache if we have real data — don't poison cache with empty-vessel results
  if (alerts.length > 0 || (vessels.length > 10 && aircraft.length > 10)) {
    setCache('correlations', alerts, 90)
  }
  return NextResponse.json(alerts)
  } catch { return NextResponse.json([]) }
}

export async function GET() {
  const cached = getCache('correlations')
  if (cached) return NextResponse.json(cached)
  return NextResponse.json([])
}
