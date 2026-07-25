import { NextRequest, NextResponse } from 'next/server'
import { IntelEvent, Situation } from '@/types'

function groupEvents(events: IntelEvent[]): Situation[] {
  const sevenDaysAgo = Date.now() - 7 * 86400000
  const recentEvents = events.filter(e => new Date(e.timestamp).getTime() > sevenDaysAgo)

  const groups: Record<string, IntelEvent[]> = {}
  for (const event of recentEvents) {
    const key = `${event.country}::${event.category}`
    if (!groups[key]) groups[key] = []
    groups[key].push(event)
  }

  const situations: Situation[] = []

  for (const [key, evts] of Object.entries(groups)) {
    if (evts.length < 3) continue
    const [country, category] = key.split('::')

    const criticalCount = evts.filter(e => e.severity === 'critical').length
    const highCount = evts.filter(e => e.severity === 'high').length
    const mediumCount = evts.filter(e => e.severity === 'medium').length

    const sorted = [...evts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    const midpoint = sorted.length / 2
    const recent = sorted.slice(Math.ceil(midpoint))
    const prior = sorted.slice(0, Math.floor(midpoint))
    const trendPercent = ((recent.length - prior.length) / Math.max(prior.length, 1)) * 100

    const trend: Situation['trend'] = trendPercent > 20 ? 'escalating' : trendPercent < -20 ? 'de-escalating' : 'stable'

    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1)
    const crisisNames: Record<string, string> = {
      conflict: 'Armed Conflict', political: 'Political Crisis', humanitarian: 'Humanitarian Crisis',
      economic: 'Economic Crisis', disaster: 'Disaster Response', earthquake: 'Seismic Crisis',
      health: 'Health Emergency', environmental: 'Environmental Crisis', wildfire: 'Wildfire Crisis',
    }
    const crisisType = crisisNames[category] || `${categoryLabel} Crisis`

    const topEvents = evts
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 }
        return order[a.severity] - order[b.severity]
      })
      .slice(0, 5)

    const sample = evts.find(e => e.lat && e.lon) || evts[0]

    situations.push({
      id: `sit-${country}-${category}`,
      name: `${country} — ${crisisType}`,
      countries: [country],
      eventCount: evts.length,
      criticalCount,
      highCount,
      mediumCount,
      trend,
      trendPercent: Math.round(trendPercent),
      sources: Array.from(new Set(evts.map(e => e.source))),
      topEvents,
      lat: sample?.lat || 0,
      lon: sample?.lon || 0,
      activeSince: evts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]?.timestamp || new Date().toISOString(),
    })
  }

  return situations.sort((a, b) => b.criticalCount - a.criticalCount || b.highCount - a.highCount).slice(0, 20)
}

export async function POST(req: NextRequest) {
  try {
    const { events }: { events: IntelEvent[] } = await req.json()
    const situations = groupEvents(events)
    return NextResponse.json(situations)
  } catch { return NextResponse.json([]) }
}

export async function GET() {
  return NextResponse.json([])
}
