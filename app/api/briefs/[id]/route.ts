import { NextRequest, NextResponse } from 'next/server'
import { deleteBrief } from '@/lib/intelHistoryStore'
import { getRequestUserId } from '@/lib/auth/getRequestUser'

const IS_CLOUD = process.env.NEXT_PUBLIC_MODE === 'cloud'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getRequestUserId()
  if (IS_CLOUD && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ok = await deleteBrief(id, userId ?? 'local')
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
