import { NextResponse } from 'next/server'
import { getCache, setCache } from '@/lib/cache'
import { runAnomalyEngine } from '@/lib/anomalyEngine'
import { getEvents } from '@/lib/getEvents'
import { displayCountry } from '@/lib/countryNames'
import { AnomalyAlert } from '@/types'

const CACHE_KEY = 'anomalies'
const CACHE_TTL = 3 * 60  // seconds

export async function GET() {
  const cached = getCache<AnomalyAlert[]>(CACHE_KEY)
  if (cached) return NextResponse.json(cached)

  try {
    const events = await getEvents()
    // Expand 2-letter country codes to full names so anomalies read "Haiti" not "HT".
    const named = events.map(e => e.country && /^[A-Za-z]{2}$/.test(e.country) ? { ...e, country: displayCountry(e.country) } : e)
    const anomalies = runAnomalyEngine(named)
    setCache(CACHE_KEY, anomalies, CACHE_TTL)
    return NextResponse.json(anomalies)
  } catch (err) {
    console.error('[anomalies]', err)
    return NextResponse.json([])
  }
}
