import { NextRequest, NextResponse } from 'next/server'
import { insertSnapshot } from '@/lib/snapshotStore'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { IS_CLOUD_MODE as IS_CLOUD } from '@/lib/supabase/config'

export async function POST(req: NextRequest) {
  const userId = await getRequestUserId()
  if (IS_CLOUD && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title, description, state } = await req.json()
  if (!state) return NextResponse.json({ error: 'state required' }, { status: 400 })

  try {
    const snap = await insertSnapshot({
      title: (title || 'ARGUS Intelligence Snapshot').slice(0, 120),
      description: (description || '').slice(0, 500),
      state,
      userId,
    })
    return NextResponse.json({ id: snap.id, created_at: snap.created_at })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
