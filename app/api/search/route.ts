import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || ''
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  if (!query || !token) return NextResponse.json({ features: [] })

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&types=country,place,region&limit=5`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ features: [] })
  }
}
