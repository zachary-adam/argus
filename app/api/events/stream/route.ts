import { NextRequest } from 'next/server'
import { IntelEvent } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function fetchCurrentEvents(origin: string, cookieHeader: string): Promise<IntelEvent[]> {
  try {
    const res = await fetch(`${origin}/api/events`, {
      cache: 'no-store',
      headers: { cookie: cookieHeader },
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const cookieHeader = req.headers.get('cookie') ?? ''
  const encoder = new TextEncoder()

  // Per-connection state — no shared globals
  const knownIds = new Set<string>()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* client disconnected */ }
      }

      // Send initial full snapshot immediately
      const initial = await fetchCurrentEvents(origin, cookieHeader)
      initial.forEach(e => knownIds.add(e.id))
      send({ type: 'snapshot', events: initial })

      let alive = true
      req.signal.addEventListener('abort', () => { alive = false })

      let tick = 0
      while (alive) {
        await new Promise(r => setTimeout(r, 15000))
        if (!alive) break

        tick++

        // Heartbeat every tick so proxies don't timeout
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')) } catch { break }

        // Full poll every 2 ticks (30s)
        if (tick % 2 === 0) {
          const events = await fetchCurrentEvents(origin, cookieHeader)
          const newEvents = events.filter(e => !knownIds.has(e.id))
          if (newEvents.length > 0) {
            newEvents.forEach(e => knownIds.add(e.id))
            send({ type: 'new', events: newEvents })
          }
        }
      }

      try { controller.close() } catch { /* already closed */ }
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
