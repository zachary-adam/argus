import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { fetchACLEDConnector, AcledNoCredsError, AcledAccessDeniedError } from '@/lib/connectors/acled'

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`acled:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  try {
    const { countryCodes } = (await req.json().catch(() => ({}))) as { countryCodes?: string[] }
    const events = await fetchACLEDConnector(countryCodes ?? [])
    return NextResponse.json({ events })
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err)
    const status = err instanceof AcledNoCredsError ? 401
      : err instanceof AcledAccessDeniedError ? 403
      : /ACLED API error/.test(msg) ? 502 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
