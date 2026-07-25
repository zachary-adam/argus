import { NextRequest, NextResponse } from 'next/server'
import { vaultDelete, vaultHas } from '@/lib/vault'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  if (!checkRateLimit(`vault-write:${getClientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  if (!vaultHas(name)) {
    return NextResponse.json({ error: 'Key not found' }, { status: 404 })
  }
  vaultDelete(name)
  return NextResponse.json({ ok: true })
}
