import { NextRequest, NextResponse } from 'next/server'
import { fetchGDELTConnector } from '@/lib/connectors/gdelt'
import { geocodeEvents } from '@/lib/connectors/geocodeEvents'

export async function POST(req: NextRequest) {
  try {
    const { query, timespan = '7d', maxRecords = 50, sourceCountry, sourceLang, geocode = true } = await req.json()
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 })
    let events = await fetchGDELTConnector({ query, timespan, maxRecords, sourceCountry, sourceLang })
    if (geocode) events = await geocodeEvents(events)
    return NextResponse.json({ events })
  } catch (err) {
    const msg = String(err)
    const isTimeout = msg.includes('timeout') || msg.includes('TimeoutError')
    return NextResponse.json({ error: isTimeout ? 'GDELT is temporarily unavailable.' : msg }, { status: 503 })
  }
}
