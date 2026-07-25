import { NextRequest, NextResponse } from 'next/server'
import type { IntelEvent } from '@/types'
import type { Targeting } from '@/types/project'
import { decideRelevance } from '@/lib/semanticRelevance'

/**
 * Semantic relevance gate for the LIVE FEED.
 *
 * The live stream is a global, project-agnostic firehose; the only per-project
 * scoping used to be client-side substring matching (`text.includes(keyword)`),
 * which can't tell "about the mission" from "merely mentions a token". This scores
 * candidate events by *meaning* against the project mission (OpenAI embeddings,
 * key server-side) and returns a keep/drop decision per event. Falls back to the
 * keyword gate's verdict when no key / mission signal is available so the feed
 * never breaks — it just stays as smart as today's filter.
 */

interface RelevanceRequest {
  events: Array<Pick<IntelEvent, 'id' | 'title' | 'summary' | 'body' | 'country' | 'countryCode'> & { category?: string }>
  targeting?: Targeting
  countryCodes?: string[]
  researchQuestion?: string
  goalContext?: string
  threshold?: number
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RelevanceRequest
    const events = (body.events ?? []) as unknown as IntelEvent[]
    if (events.length === 0) {
      return NextResponse.json({ applied: false, results: [] })
    }

    const decision = await decideRelevance(events, {
      targeting: body.targeting,
      countryCodes: body.countryCodes,
      researchQuestion: body.researchQuestion,
      goalContext: body.goalContext,
      threshold: body.threshold,
    })

    return NextResponse.json(decision)
  } catch (err) {
    console.error('[relevance]', err)
    // On any failure, signal "not applied" so the client keeps its own events.
    return NextResponse.json({ applied: false, results: [] })
  }
}
