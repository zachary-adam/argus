import { NextRequest, NextResponse } from 'next/server'
import type { IntelEvent } from '@/types'
import type { Targeting } from '@/types/project'
import { assessEvidenceBalance } from '@/lib/evidenceBalance'
import { deriveCollectionLenses } from '@/lib/collectionLenses'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

/** Mission evidence completeness — generic for any project/query. */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(`evidence-gaps:${getClientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({})) as {
    events?: IntelEvent[]
    targeting?: Targeting
    countryCodes?: string[]
    researchQuestion?: string
  }

  const events = body.events ?? []
  const targeting: Targeting | undefined = body.targeting
  const countryCodes = body.countryCodes ?? []

  const balance = assessEvidenceBalance(events, {
    watchEntities: targeting?.watchEntities,
    countryCodes,
  })

  const lensTargeting: Targeting = targeting ?? { scope: 'global', keywords: [], watchEntities: [] }
  const collectionLenses = deriveCollectionLenses(lensTargeting, countryCodes)
    .map(({ id, label, reason, query }) => ({ id, label, reason, query }))

  return NextResponse.json({ ...balance, collectionLenses, researchQuestion: body.researchQuestion })
}
