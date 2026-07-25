import { NextRequest, NextResponse } from 'next/server'
import { AircraftPosition } from '@/types'
import { getCache, setCache } from '@/lib/cache'
import { MILITARY_CALLSIGN_PREFIXES } from '@/lib/constants'
import { vaultGet } from '@/lib/vault'

const PROCEDURAL_AIRCRAFT: AircraftPosition[] = [
  { icao24: 'ae1234', callsign: 'RCH456',  origin_country: 'United States',  longitude: 35.0,  latitude: 33.0,  baro_altitude: 11000, velocity: 850, track: 120, on_ground: false, type: 'military' },
  { icao24: 'ae2345', callsign: 'USAF789', origin_country: 'United States',  longitude: 44.0,  latitude: 26.0,  baro_altitude: 9000,  velocity: 820, track: 200, on_ground: false, type: 'military' },
  { icao24: 'ae3456', callsign: 'REACH12', origin_country: 'United States',  longitude: 50.5,  latitude: 24.5,  baro_altitude: 10500, velocity: 840, track: 270, on_ground: false, type: 'military' },
  { icao24: 'ae4000', callsign: 'JAKE11',  origin_country: 'United States',  longitude: 38.5,  latitude: 36.0,  baro_altitude: 8500,  velocity: 780, track: 45,  on_ground: false, type: 'military' },
  { icao24: 'ae5001', callsign: 'DRAGN1',  origin_country: 'United States',  longitude: 43.0,  latitude: 15.5,  baro_altitude: 9200,  velocity: 800, track: 315, on_ground: false, type: 'military' },
  { icao24: 'ae3500', callsign: 'RAF101',  origin_country: 'United Kingdom', longitude: 43.5,  latitude: 12.0,  baro_altitude: 10000, velocity: 800, track: 30,  on_ground: false, type: 'military' },
  { icao24: 'ae3600', callsign: 'NATO22',  origin_country: 'Belgium',        longitude: 17.0,  latitude: 48.5,  baro_altitude: 9800,  velocity: 790, track: 90,  on_ground: false, type: 'military' },
  { icao24: 'ae4567', callsign: 'SENTRY1', origin_country: 'United States',  longitude: 119.5, latitude: 24.5,  baro_altitude: 9500,  velocity: 780, track: 180, on_ground: false, type: 'military' },
  { icao24: 'ae4600', callsign: 'ARIES21', origin_country: 'United States',  longitude: 57.0,  latitude: 25.0,  baro_altitude: 11000, velocity: 760, track: 260, on_ground: false, type: 'military' },
  { icao24: 'ae4700', callsign: 'RIVET12', origin_country: 'United States',  longitude: 30.0,  latitude: 50.0,  baro_altitude: 10000, velocity: 770, track: 75,  on_ground: false, type: 'military' },
  { icao24: 'ra1234', callsign: 'RFF001',  origin_country: 'Russia',         longitude: 37.6,  latitude: 55.7,  baro_altitude: 8000,  velocity: 740, track: 190, on_ground: false, type: 'military' },
  { icao24: 'ra2345', callsign: 'RFF002',  origin_country: 'Russia',         longitude: 60.0,  latitude: 56.0,  baro_altitude: 9000,  velocity: 720, track: 100, on_ground: false, type: 'military' },
  { icao24: 'cn1234', callsign: 'PLA001',  origin_country: 'China',          longitude: 121.5, latitude: 25.0,  baro_altitude: 8500,  velocity: 800, track: 350, on_ground: false, type: 'military' },
  { icao24: 'cn2345', callsign: 'PLAAF1',  origin_country: 'China',          longitude: 114.0, latitude: 22.3,  baro_altitude: 7500,  velocity: 780, track: 220, on_ground: false, type: 'military' },
  { icao24: 'fr1234', callsign: 'AFR123',  origin_country: 'France',         longitude: 2.3,   latitude: 48.9,  baro_altitude: 11500, velocity: 870, track: 280, on_ground: false, type: 'civil'    },
  { icao24: 'de1234', callsign: 'DLH456',  origin_country: 'Germany',        longitude: 8.7,   latitude: 50.0,  baro_altitude: 11000, velocity: 860, track: 60,  on_ground: false, type: 'civil'    },
  { icao24: 'gb1234', callsign: 'BAW789',  origin_country: 'United Kingdom', longitude: -0.5,  latitude: 51.5,  baro_altitude: 10500, velocity: 850, track: 310, on_ground: false, type: 'civil'    },
  { icao24: 'sg1234', callsign: 'SIA321',  origin_country: 'Singapore',      longitude: 103.8, latitude: 1.3,   baro_altitude: 12000, velocity: 880, track: 140, on_ground: false, type: 'civil'    },
  { icao24: 'ae9001', callsign: 'UAE504',  origin_country: 'UAE',            longitude: 55.4,  latitude: 25.2,  baro_altitude: 11500, velocity: 870, track: 330, on_ground: false, type: 'civil'    },
  { icao24: 'tr1234', callsign: 'THY201',  origin_country: 'Turkey',         longitude: 29.0,  latitude: 41.0,  baro_altitude: 10000, velocity: 840, track: 250, on_ground: false, type: 'civil'    },
  { icao24: 'a00001', callsign: 'UPS456',  origin_country: 'United States',  longitude: -100.0, latitude: 35.0, baro_altitude: 10500, velocity: 860, track: 85,  on_ground: false, type: 'cargo'    },
  { icao24: 'a00002', callsign: 'FDX123',  origin_country: 'United States',  longitude: -87.6,  latitude: 41.9, baro_altitude: 9500,  velocity: 840, track: 230, on_ground: false, type: 'cargo'    },
  { icao24: 'a00003', callsign: 'GTI901',  origin_country: 'United States',  longitude: 121.5,  latitude: 31.2, baro_altitude: 11000, velocity: 870, track: 160, on_ground: false, type: 'cargo'    },
  { icao24: 'ae6001', callsign: 'POSDN1',  origin_country: 'United States',  longitude: 57.5,   latitude: 20.0, baro_altitude: 3000,  velocity: 550, track: 40,  on_ground: false, type: 'military' },
  { icao24: 'ae6002', callsign: 'EP3E01',  origin_country: 'United States',  longitude: 125.0,  latitude: 20.0, baro_altitude: 4500,  velocity: 520, track: 290, on_ground: false, type: 'military' },
]

function jitter(val: number, range = 2): number {
  return val + (Math.random() - 0.5) * range
}

// Drone patterns checked before the general military prefixes — MQ/RQ are UAVs, not jets
const DRONE_CALLSIGN_PREFIXES = /^(MQ|RQ|UAV|UAS|UAX|TB2|AKINCI|WLNG|CAIG|CH4|CH5|WINGLOONG)/

function classifyAircraft(callsign: string): AircraftPosition['type'] {
  const cs = callsign.trim().toUpperCase()
  if (DRONE_CALLSIGN_PREFIXES.test(cs)) return 'drone'
  if (MILITARY_CALLSIGN_PREFIXES.some(p => cs.startsWith(p))) return 'military'
  if (/^(UPS|FDX|ULD|GTI|ABX|CAL|GIA|CAO)/.test(cs)) return 'cargo'
  return 'civil'
}

// Only used for the procedural last-resort set, so mark every track simulated.
function applyJitter(aircraft: AircraftPosition[]): AircraftPosition[] {
  return aircraft.map(a => ({ ...a, latitude: jitter(a.latitude), longitude: jitter(a.longitude), simulated: true }))
}

function parseAdsbFi(ac: Record<string, unknown>[]): AircraftPosition[] {
  return ac
    .filter(a => !a.gnd && a.lon != null && a.lat != null)
    .map(a => ({
      icao24: String(a.hex || ''),
      callsign: String(a.flight || a.r || '').trim(),
      origin_country: String(a.ownOp || a.desc || a.r || 'Unknown'),
      longitude: Number(a.lon),
      latitude: Number(a.lat),
      baro_altitude: Number(a.alt_baro || a.alt_geom || 0) * 0.3048, // adsb.fi reports feet → meters
      velocity: Number(a.gs || 0) * 1.852, // adsb.fi ground speed is knots → km/h (UI labels km/h)
      track: Number(a.track || 0),
      on_ground: Boolean(a.gnd),
      type: classifyAircraft(String(a.flight || '')),
    }))
}

function parseOpenSky(states: unknown[][]): AircraftPosition[] {
  return states
    .filter(s => s[8] === false && s[5] != null && s[6] != null)
    .map(s => ({
      icao24: String(s[0] || ''),
      callsign: String(s[1] || '').trim(),
      origin_country: String(s[2] || 'Unknown'),
      longitude: Number(s[5]),
      latitude: Number(s[6]),
      baro_altitude: Number(s[7] || 0), // OpenSky baro altitude is already metres
      velocity: Number(s[9] || 0) * 3.6, // OpenSky velocity is m/s → km/h (UI labels km/h)
      track: Number(s[10] || 0),
      on_ground: Boolean(s[8]),
      type: classifyAircraft(String(s[1] || '')),
    }))
}

function dedupe(aircraft: AircraftPosition[]): AircraftPosition[] {
  const seen = new Set<string>()
  const result: AircraftPosition[] = []
  for (const a of aircraft) {
    if (a.icao24 && !seen.has(a.icao24)) { seen.add(a.icao24); result.push(a) }
  }
  return result
}

/** Prefer military/drone/cargo, then civil — keeps map payloads small on weak machines. */
function prioritizeAircraft(aircraft: AircraftPosition[], cap: number): AircraftPosition[] {
  if (aircraft.length <= cap) return aircraft
  const rank = (t: AircraftPosition['type']) =>
    t === 'military' || t === 'drone' ? 0 : t === 'cargo' ? 1 : 2
  return [...aircraft]
    .sort((a, b) => rank(a.type) - rank(b.type))
    .slice(0, cap)
}

// Strategic coverage points for adsb.fi area queries (lat, lon). 250nm radius each.
const ADSB_POINTS: [number, number][] = [
  [26.5, 56.5],  // Hormuz
  [25.0, 51.5],  // Gulf
  [33.0, 35.5],  // Levant
  [50.4, 30.5],  // Ukraine
  [24.0, 120.0], // Taiwan strait
  [37.5, 127.0], // Korea
  [13.0, 44.0],  // Bab-el-Mandeb / Yemen
  [31.5, 34.5],  // Israel/Gaza
  [48.0, 11.0],  // Central Europe
  [38.9, -77.0], // US east
  [34.5, 76.0],  // Ladakh / western Himalaya
  [28.6, 77.2],  // Delhi NCR
  [22.5, 88.3],  // Bay of Bengal / Kolkata
  [11.7, 92.7],  // Andaman Sea
  [19.0, 72.8],  // Mumbai / Arabian Sea
]

// adsb.fi — free, no auth, no daily rate limit. Returns all aircraft within `nm`
// of a point. We sweep strategic points for broad civil coverage without burning
// OpenSky's 400/day budget.
async function fetchAdsbFiArea(lat: number, lon: number, nm = 250): Promise<AircraftPosition[]> {
  const res = await fetch(`https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`, {
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`adsb.fi ${res.status}`)
  const data = await res.json()
  return parseAdsbFi(data.ac || [])
}

export async function GET(req: NextRequest) {
  // 'global' → whole-world civil via OpenSky /states/all; 'focused' → adsb.fi region sweep.
  const scope = req.nextUrl.searchParams.get('scope') === 'global' ? 'global' : 'focused'
  // Always fetch fresh military data — adsb.fi is fast and military picture changes fast
  // Use cached civil data to avoid hammering rate-limited civil sources
  const cachedCivil = getCache<AircraftPosition[]>(`aviation-civil-${scope}`)

  // 1. airplanes.live /v2/mil — real global military, no auth, always fresh
  let military: AircraftPosition[] = []
  try {
    const res = await fetch('https://api.airplanes.live/v2/mil', { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const data = await res.json()
      military = parseAdsbFi(data.ac || [])
      console.log(`[Aviation] airplanes.live military: ${military.length}`)
    }
  } catch { /* continue */ }

  // 2. Civil aircraft — OpenSky (authenticated, ~10k+) or hotspot fallback
  // Use cached civil if available to preserve OpenSky daily credit limit (400 req/day)
  let civil: AircraftPosition[] = cachedCivil ?? []
  let openSkyOk = false

  if (!cachedCivil) {
    // 2a. adsb.fi region sweep — focused coverage only (global uses OpenSky's
    // whole-world feed instead, so we don't cap it to strategic regions).
    if (scope === 'focused') {
      try {
        const results = await Promise.allSettled(ADSB_POINTS.map(([la, lo]) => fetchAdsbFiArea(la, lo)))
        const all = dedupe(results.flatMap(r => r.status === 'fulfilled' ? r.value : []))
        const civilOnly = all.filter(a => a.type !== 'military')
        if (civilOnly.length > 0) {
          civil = civilOnly
          setCache(`aviation-civil-${scope}`, civil, 180)
          openSkyOk = true // civil covered → skip OpenSky
          console.log(`[Aviation] adsb.fi sweep: ${all.length} total, ${civilOnly.length} civil`)
        }
      } catch (e) {
        console.warn('[Aviation] adsb.fi sweep error:', e)
      }
    }

    const osUser = vaultGet('OPENSKY_USERNAME') ?? process.env.OPENSKY_USERNAME
    const osPass = vaultGet('OPENSKY_PASSWORD') ?? process.env.OPENSKY_PASSWORD
    // OpenSky /states/all is a whole-world dump (~5–10k rows). Only use it for
    // global coverage — focused mode stays on the regional adsb.fi sweep.
    if (scope === 'global' && osUser && osPass) {
      try {
        const auth = Buffer.from(`${osUser}:${osPass}`).toString('base64')
        const res = await fetch('https://opensky-network.org/api/states/all', {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(15000),
        })
        if (res.ok) {
          const data = await res.json()
          const all = parseOpenSky(data.states || [])
          civil = all.filter(a => a.type !== 'military')
          setCache(`aviation-civil-${scope}`, civil, 180)
          openSkyOk = true
          console.log(`[Aviation] OpenSky: ${all.length} total, ${civil.length} civil, ${military.length} military`)
        } else {
          console.warn('[Aviation] OpenSky returned', res.status)
        }
      } catch (e) {
        console.warn('[Aviation] OpenSky error:', e)
      }
    }

    // Anonymous OpenSky fallback — global only (same whole-world dump).
    if (scope === 'global' && !openSkyOk) {
      try {
        const res = await fetch('https://opensky-network.org/api/states/all', {
          signal: AbortSignal.timeout(20000),
        })
        if (res.ok) {
          const data = await res.json()
          const all = parseOpenSky(data.states || [])
          civil = all.filter(a => a.type !== 'military')
          setCache(`aviation-civil-${scope}`, civil, 180)
          openSkyOk = true
          console.log(`[Aviation] OpenSky anonymous: ${all.length} total, ${civil.length} civil`)
        }
      } catch (e) {
        console.warn('[Aviation] OpenSky anonymous error:', e)
      }
    }
  }

  // 3. Merge + hard-cap so the map never ingests thousands of GeoJSON features.
  const FOCUSED_CAP = 600
  const GLOBAL_CAP = 2000
  const combined = prioritizeAircraft(dedupe([...military, ...civil]), scope === 'focused' ? FOCUSED_CAP : GLOBAL_CAP)

  if (combined.length > 0) {
    setCache('aviation', combined, 120)
    return NextResponse.json(combined, { headers: { 'Cache-Control': 'max-age=60, stale-while-revalidate=120' } })
  }

  // 5. Last resort full procedural (only if all live sources failed)
  const result = applyJitter(PROCEDURAL_AIRCRAFT)
  setCache('aviation', result, 45)
  return NextResponse.json(result, { headers: { 'Cache-Control': 'max-age=45, stale-while-revalidate=90' } })
}
