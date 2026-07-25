import { NextRequest, NextResponse } from 'next/server'

export interface GeoContext {
  elevation: number | null
  timezone: string | null
  localTime: string | null
  aqi: number | null
  aqiCategory: string | null
  aqiColor: string | null
}

export async function GET(req: NextRequest): Promise<NextResponse<GeoContext | { error: string }>> {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lon = parseFloat(searchParams.get('lon') ?? '')

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat/lon required' }, { status: 400 })
  }

  const key = process.env.GOOGLE_MAPS_KEY
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 503 })

  const [elevRes, tzRes, aqRes] = await Promise.allSettled([
    fetch(
      `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lon}&key=${key}`,
      { signal: AbortSignal.timeout(4000) }
    ),
    fetch(
      `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lon}&timestamp=${Math.floor(Date.now() / 1000)}&key=${key}`,
      { signal: AbortSignal.timeout(4000) }
    ),
    fetch(
      `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: { latitude: lat, longitude: lon } }),
        signal: AbortSignal.timeout(4000),
      }
    ),
  ])

  let elevation: number | null = null
  let timezone: string | null = null
  let localTime: string | null = null
  let aqi: number | null = null
  let aqiCategory: string | null = null
  let aqiColor: string | null = null

  if (elevRes.status === 'fulfilled' && elevRes.value.ok) {
    const d = await elevRes.value.json()
    if (d.status === 'OK' && d.results?.[0]) elevation = Math.round(d.results[0].elevation)
  }

  if (tzRes.status === 'fulfilled' && tzRes.value.ok) {
    const d = await tzRes.value.json()
    if (d.status === 'OK') {
      timezone = d.timeZoneId
      const offsetMs = (d.rawOffset + d.dstOffset) * 1000
      const local = new Date(Date.now() + offsetMs)
      const hh = String(local.getUTCHours()).padStart(2, '0')
      const mm = String(local.getUTCMinutes()).padStart(2, '0')
      localTime = `${hh}:${mm} ${d.timeZoneName}`
    }
  }

  if (aqRes.status === 'fulfilled' && aqRes.value.ok) {
    const d = await aqRes.value.json()
    if (d.indexes?.length) {
      const idx = d.indexes[0]
      aqi = idx.aqi
      aqiCategory = idx.category ?? null
      const c = idx.color
      if (c) {
        const r = Math.round((c.red ?? 0) * 255)
        const g = Math.round((c.green ?? 0) * 255)
        const b = Math.round((c.blue ?? 0) * 255)
        aqiColor = `rgb(${r},${g},${b})`
      }
    }
  }

  return NextResponse.json({ elevation, timezone, localTime, aqi, aqiCategory, aqiColor })
}
