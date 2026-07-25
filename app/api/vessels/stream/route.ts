import { NextRequest } from 'next/server'
import { VesselPosition } from '@/types'
import { vaultGet } from '@/lib/vault'
import { FOCUSED_VESSEL_BOXES, REST_VESSEL_HOTSPOTS } from '@/lib/chokepointBoxes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// AISStream key — vault first (Settings → API Keys), then env fallback.
const aisKey = (): string | undefined => vaultGet('AISSTREAM_API_KEY') ?? process.env['AISSTREAM_API_KEY']

// ──────────────────────────────────────────────
// Store singleton on globalThis so Next.js hot
// reloads don't create a new WebSocket each time
// ──────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __aisstream: {
    vesselStore: Map<string, VesselPosition>
    staticData: Map<string, { name: string; type: number; destination: string; flag: string }>
    sseClients: Set<ReadableStreamDefaultController>
    wsInstance: WebSocket | null
    wsReconnectTimer: ReturnType<typeof setTimeout> | null
    reconnectDelay: number
    restPollTimer: ReturnType<typeof setTimeout> | null
    coverage: 'focused' | 'global'
  } | undefined
}

const WORLD_BOX = [[[-90, -180], [90, 180]]]

if (!globalThis.__aisstream) {
  globalThis.__aisstream = {
    vesselStore: new Map(),
    staticData: new Map(),
    sseClients: new Set(),
    wsInstance: null,
    wsReconnectTimer: null,
    reconnectDelay: 5000,
    restPollTimer: null,
    coverage: 'focused',
  }
}

const g = globalThis.__aisstream

const MMSI_FLAG: Record<string, string> = {
  '211': 'DE', '219': 'DK', '232': 'GB', '265': 'SE', '273': 'RU',
  '316': 'CA', '338': 'US', '351': 'PA', '352': 'PA', '370': 'PA',
  '412': 'CN', '416': 'TW', '419': 'IN', '422': 'IR', '431': 'JP',
  '440': 'KR', '477': 'HK', '503': 'AU', '525': 'ID', '533': 'MY',
  '563': 'SG', '574': 'VN', '636': 'LR', '667': 'GN', '710': 'BR',
}

const SANCTIONED_FLAGS = new Set(['IR', 'KP', 'SY', 'CU', 'VE'])
const SANCTIONED_MMSI_PREFIXES = ['422', '445']

const SHIP_TYPE_MAP: Record<number, string> = {
  1: 'Military', 35: 'Military',
  30: 'Fishing', 31: 'Tug', 32: 'Tug',
  36: 'Sailing', 37: 'Pleasure',
  40: 'HSC', 41: 'HSC', 42: 'HSC',
  50: 'Pilot', 51: 'SAR', 52: 'Tug',
  60: 'Passenger', 61: 'Passenger',
  70: 'Cargo', 71: 'Cargo', 72: 'Cargo', 73: 'Cargo',
  80: 'Tanker', 81: 'Tanker', 82: 'Tanker', 83: 'Tanker', 84: 'Tanker', 89: 'Tanker',
  90: 'Other',
}

function getFlagFromMMSI(mmsi: string): string {
  return MMSI_FLAG[mmsi.slice(0, 3)] ?? 'XX'
}

function isSanctioned(mmsi: string, flag: string): boolean {
  if (SANCTIONED_FLAGS.has(flag)) return true
  if (SANCTIONED_MMSI_PREFIXES.some(p => mmsi.startsWith(p))) return true
  return false
}

function broadcastToClients(data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`
  for (const ctrl of g.sseClients) {
    try { ctrl.enqueue(new TextEncoder().encode(payload)) } catch { g.sseClients.delete(ctrl) }
  }
}

const VESSEL_STORE_CAP = 800

function vesselPriority(v: VesselPosition): number {
  if (v.sanctioned) return 0
  const t = (v.ship_type || '').toLowerCase()
  if (t.includes('military') || t.includes('tanker')) return 1
  if (t.includes('cargo')) return 2
  return 3
}

/** Keep the in-memory AIS store bounded so SSE snapshots stay small. */
function trimVesselStore() {
  if (g.vesselStore.size <= VESSEL_STORE_CAP) return
  const ranked = Array.from(g.vesselStore.values()).sort((a, b) => vesselPriority(a) - vesselPriority(b))
  g.vesselStore.clear()
  for (const v of ranked.slice(0, VESSEL_STORE_CAP)) g.vesselStore.set(v.mmsi, v)
}

function snapshotVessels(): VesselPosition[] {
  trimVesselStore()
  return Array.from(g.vesselStore.values())
}

const SANCTIONED_WORDS = ['SHADOW', 'DARK', 'GHOST', 'PHANTOM', 'VOSTOK', 'PERSIAN']

async function pollAisHubFallback() {
  try {
    const results = await Promise.allSettled(
      REST_VESSEL_HOTSPOTS.map(async ([minLon, minLat, maxLon, maxLat]) => {
        const url = `https://data.aishub.net/ws.php?username=AH_ANONYMOUS_USER&format=1&output=json&compress=0&latmin=${minLat}&latmax=${maxLat}&lonmin=${minLon}&lonmax=${maxLon}`
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
        if (!res.ok) return [] as Record<string, unknown>[]
        const data = await res.json()
        return Array.isArray(data[1]) ? data[1] as Record<string, unknown>[] : []
      })
    )
    const raw = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    const vessels: VesselPosition[] = raw.map(v => {
      const name = String(v.NAME || '').trim().toUpperCase()
      return {
        mmsi: String(v.MMSI || ''),
        name: name || 'UNKNOWN',
        lat: Number(v.LATITUDE),
        lon: Number(v.LONGITUDE),
        speed: Number(v.SOG || 0),
        heading: Number(v.COG || 0),
        ship_type: SHIP_TYPE_MAP[Number(v.TYPE || 0)] ?? 'Cargo',
        flag: String(v.FLAG || 'XX'),
        destination: String(v.DESTINATION || '').trim() || 'UNKNOWN',
        sanctioned: SANCTIONED_WORDS.some(s => name.includes(s)),
      }
    }).filter(v => v.mmsi && !isNaN(v.lat) && !isNaN(v.lon) && !(v.lat === 0 && v.lon === 0))

    const seen = new Set<string>()
    const deduped = vessels.filter(v => { if (seen.has(v.mmsi)) return false; seen.add(v.mmsi); return true })

    for (const v of deduped) g.vesselStore.set(v.mmsi, v)
    trimVesselStore()
    if (deduped.length > 0) broadcastToClients({ type: 'snapshot', vessels: snapshotVessels() })
  } catch { /* non-fatal */ }
}

function startRestFallback() {
  if (g.wsInstance || g.restPollTimer) return
  pollAisHubFallback()
  const schedule = () => { g.restPollTimer = setTimeout(() => { pollAisHubFallback().finally(schedule) }, 90_000) }
  schedule()
}

function connectToAISStream() {
  if (g.wsInstance || !aisKey()) return

  console.log('[AISStream] Connecting WebSocket…')
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
  g.wsInstance = ws

  ws.onopen = () => {
    console.log(`[AISStream] Connected — coverage=${g.coverage}`)
    g.reconnectDelay = 5000
    ws.send(JSON.stringify({
      APIKey: aisKey(),
      BoundingBoxes: g.coverage === 'global' ? WORLD_BOX : FOCUSED_VESSEL_BOXES,
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    }))
  }

  ws.onmessage = (event) => {
    const toText: Promise<string> =
      typeof event.data === 'string' ? Promise.resolve(event.data) :
      event.data instanceof Blob ? event.data.text() :
      Promise.resolve(Buffer.from(event.data as ArrayBuffer).toString('utf8'))

    toText.then(raw => {
    try {
      const msg = JSON.parse(raw)
      const meta = msg.MetaData || {}
      const mmsi = String(meta.MMSI || meta.MMSI_String || '')
      if (!mmsi) return

      if (msg.MessageType === 'ShipStaticData') {
        const d = msg.Message?.ShipStaticData || {}
        g.staticData.set(mmsi, {
          name: (d.Name || meta.ShipName || '').trim().toUpperCase(),
          type: Number(d.Type || 0),
          destination: (d.Destination || '').trim().toUpperCase(),
          flag: String(d.Flag || '').toUpperCase(),
        })
      }

      if (msg.MessageType === 'PositionReport') {
        const pos = msg.Message?.PositionReport || {}
        const lat = Number(meta.latitude ?? pos.Latitude)
        const lon = Number(meta.longitude ?? pos.Longitude)
        if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return

        const stat = g.staticData.get(mmsi)
        const flag = (stat?.flag || getFlagFromMMSI(mmsi)) || 'XX'
        const name = stat?.name || (meta.ShipName || '').trim().toUpperCase() || 'UNKNOWN'
        const ship_type = SHIP_TYPE_MAP[stat?.type ?? 0] ?? 'Cargo'
        const sanctioned = isSanctioned(mmsi, flag)

        const vessel: VesselPosition = {
          mmsi,
          name,
          lat,
          lon,
          speed: Number(pos.Sog ?? 0),
          heading: Number(pos.TrueHeading ?? pos.Cog ?? 0),
          ship_type,
          flag,
          destination: stat?.destination || 'UNKNOWN',
          sanctioned,
        }

        const prev = g.vesselStore.get(mmsi)
        g.vesselStore.set(mmsi, vessel)
        if (g.vesselStore.size > VESSEL_STORE_CAP + 50) trimVesselStore()

        // Only broadcast if vessel moved >0.05° (~5km) — reduces SSE traffic ~80%
        if (!prev || Math.abs(prev.lat - lat) > 0.05 || Math.abs(prev.lon - lon) > 0.05) {
          broadcastToClients({ type: 'position', vessel })
        }
      }
    } catch { /* malformed */ }
    }).catch(() => { /* blob read error */ })
  }

  ws.onerror = () => {
    console.error('[AISStream] WebSocket error')
  }

  ws.onclose = (event) => {
    console.log(`[AISStream] Disconnected (code ${event.code}), reconnecting in ${g.reconnectDelay / 1000}s`)
    g.wsInstance = null
    g.reconnectDelay = Math.min(60000, g.reconnectDelay * 2)
    g.wsReconnectTimer = setTimeout(connectToAISStream, g.reconnectDelay)
  }
}

// Upgrade coverage if a client asks for 'global' (broadest-requested wins, sticky).
// The shared WebSocket re-subscribes in place — aisstream replaces the prior boxes.
function ensureCoverage(desired: 'focused' | 'global') {
  if (desired === 'global' && g.coverage !== 'global') {
    g.coverage = 'global'
    const ws = g.wsInstance
    if (ws && ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({
        APIKey: aisKey(),
        BoundingBoxes: WORLD_BOX,
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }))
      console.log('[AISStream] Upgraded coverage → global')
    }
  }
}

export async function GET(req: NextRequest) {
  const coverage = req.nextUrl.searchParams.get('coverage') === 'global' ? 'global' : 'focused'
  ensureCoverage(coverage)

  if (!g.wsInstance) {
    if (g.wsReconnectTimer) { clearTimeout(g.wsReconnectTimer); g.wsReconnectTimer = null }
    connectToAISStream()
  }
  if (!aisKey()) startRestFallback()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      g.sseClients.add(controller)

      const snapshot = snapshotVessels()
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'snapshot', vessels: snapshot })}\n\n`))

      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')) }
        catch { clearInterval(heartbeat); g.sseClients.delete(controller) }
      }, 20000)

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        g.sseClients.delete(controller)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
