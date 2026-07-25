import { NextRequest, NextResponse } from 'next/server'
import { vaultGet } from '@/lib/vault'
import { findCustomBoundary, findNeighborNote } from '@/lib/customBoundaries'

export interface GeoResult {
  id: string
  place_name: string
  center: [number, number]                  // [lng, lat]
  bbox?: [number, number, number, number]   // [minLng, minLat, maxLng, maxLat]
  geometry?: GeoJSON.Geometry               // actual shape polygon when available (from Nominatim)
  note?: string                             // displayed when a custom/official boundary is used
}

// ── Nominatim (OpenStreetMap) ─────────────────────────────────────────────────
// Free, no key, returns actual polygon shapes for countries/regions/cities.
// Rate limit: 1 req/sec — fine since this is user-triggered, not automated.
async function searchNominatim(q: string): Promise<GeoResult[]> {
  const params = new URLSearchParams({
    q,
    format: 'geojson',
    polygon_geojson: '1',
    polygon_threshold: '0.003', // simplify large shapes — 0.003° ≈ 300m accuracy, keeps file small
    limit: '6',
    addressdetails: '0',
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'ARGUS-Intel/1.0 geopolitical-intelligence-workbench' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.features ?? []).map((f: {
    properties: { place_id: number; display_name: string }
    bbox?: [number, number, number, number]
    geometry: GeoJSON.Geometry
  }) => {
    const bbox = f.bbox as [number, number, number, number] | undefined
    const center: [number, number] = bbox
      ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
      : (f.geometry.type === 'Point' ? (f.geometry as GeoJSON.Point).coordinates as [number, number] : [0, 0])
    return {
      id: String(f.properties.place_id),
      place_name: f.properties.display_name,
      center,
      bbox,
      // Only pass polygon geometry — POI points are handled by center/bbox fallback
      geometry: (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
        ? f.geometry
        : undefined,
    }
  })
}

// ── Google Geocoding ──────────────────────────────────────────────────────────
// Higher-quality results for addresses; returns viewport bbox but no polygon shape.
async function searchGoogle(q: string, key: string): Promise<GeoResult[]> {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`,
    { signal: AbortSignal.timeout(5000) }
  )
  if (!res.ok) return []
  const data = await res.json()
  if (data.status !== 'OK') return []
  return (data.results ?? []).slice(0, 6).map((r: {
    place_id: string
    formatted_address: string
    geometry: {
      location: { lat: number; lng: number }
      viewport: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } }
    }
  }) => {
    const { location, viewport } = r.geometry
    return {
      id: r.place_id,
      place_name: r.formatted_address,
      center: [location.lng, location.lat] as [number, number],
      bbox: [viewport.southwest.lng, viewport.southwest.lat, viewport.northeast.lng, viewport.northeast.lat] as [number, number, number, number],
      // Google doesn't return polygon shapes
    }
  })
}

// ── Mapbox Geocoding ──────────────────────────────────────────────────────────
// Used as last resort; returns bbox but no polygon shape.
async function searchMapbox(q: string, token: string): Promise<GeoResult[]> {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&limit=6&types=country,region,place,locality,neighborhood,poi`,
    { signal: AbortSignal.timeout(5000) }
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.features ?? []).map((f: { id: string; place_name: string; center: [number, number]; bbox?: [number, number, number, number] }) => ({
    id: f.id,
    place_name: f.place_name,
    center: f.center,
    bbox: f.bbox,
  }))
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  // Check custom boundaries first — these override Nominatim for countries where
  // OSM shows de facto control rather than official government claims.
  const custom = findCustomBoundary(q)
  if (custom) {
    const result: GeoResult = {
      id: custom.id,
      place_name: custom.place_name,
      center: custom.center,
      bbox: custom.bbox,
      geometry: custom.geometry,
      note: custom.note,
    }
    return NextResponse.json([result])
  }

  const googleKey   = vaultGet('GOOGLE_MAPS_KEY') ?? process.env.GOOGLE_MAPS_KEY
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Priority: Nominatim (shapes) → Google (if key) → Mapbox (last resort)
  // Run Nominatim and Google in parallel when both are available
  const [nominatimResults, googleResults] = await Promise.all([
    searchNominatim(q).catch(() => [] as GeoResult[]),
    googleKey ? searchGoogle(q, googleKey).catch(() => [] as GeoResult[]) : Promise.resolve([] as GeoResult[]),
  ])

  // Check if this query has a neighbor note (e.g. China, Nepal) — applied to all results
  const neighborNote = findNeighborNote(q)

  const attachNote = (results: GeoResult[]): GeoResult[] => {
    if (!neighborNote || results.length === 0) return results
    return results.map((r, i) => i === 0 ? { ...r, note: neighborNote.note } : r)
  }

  // Prefer Google results for display order (better address matching),
  // but enrich them with Nominatim shapes by matching first result's name
  if (googleResults.length > 0) {
    const shape = nominatimResults.find(r => r.geometry)
    if (shape?.geometry && googleResults[0]) {
      googleResults[0].geometry = shape.geometry
      if (shape.bbox) googleResults[0].bbox = googleResults[0].bbox ?? shape.bbox
    }
    return NextResponse.json(attachNote(googleResults))
  }

  // Nominatim-only (no Google key) — returns shapes directly
  if (nominatimResults.length > 0) return NextResponse.json(attachNote(nominatimResults))

  // Last resort: Mapbox (no shapes)
  if (mapboxToken) {
    const results = await searchMapbox(q, mapboxToken).catch(() => [] as GeoResult[])
    return NextResponse.json(attachNote(results))
  }

  return NextResponse.json([])
}
