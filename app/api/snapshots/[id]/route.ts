import { NextRequest, NextResponse } from 'next/server'
import { getSnapshot, deleteSnapshot } from '@/lib/snapshotStore'
import { getRequestUserId } from '@/lib/auth/getRequestUser'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const snap = await getSnapshot(id)
  if (!snap) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(snap, {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Snapshots back /share/[id] links — never let anonymous callers delete them.
  const userId = await getRequestUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const deleted = await deleteSnapshot(id, userId)
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
