import { NextRequest, NextResponse } from 'next/server'
import { listPlots, insertPlot, updatePlot, deletePlot } from '@/lib/plotStore'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { IS_CLOUD_MODE as IS_CLOUD } from '@/lib/supabase/config'
const requireLocalAuth = () => !IS_CLOUD && !!process.env.ARGUS_SESSION_SECRET

async function gate(): Promise<{ userId: string | null; unauth?: NextResponse }> {
  const userId = await getRequestUserId()
  if (IS_CLOUD && !userId) {
    return { userId: null, unauth: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!userId && requireLocalAuth()) {
    return { userId: null, unauth: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { userId }
}

export async function GET() {
  const { userId, unauth } = await gate()
  if (unauth) return unauth
  const plots = await listPlots({ userId })
  return NextResponse.json(plots)
}

export async function POST(req: NextRequest) {
  const { userId, unauth } = await gate()
  if (unauth) return unauth
  const { type, coordinates, label, properties, workspaceId } = await req.json()
  if (!type || !coordinates) return NextResponse.json({ error: 'type and coordinates required' }, { status: 400 })
  try {
    const plot = await insertPlot({ userId, workspaceId, type, coordinates, label, properties })
    return NextResponse.json(plot)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { userId, unauth } = await gate()
  if (unauth) return unauth
  const { id, label, properties } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const plot = await updatePlot({ id, userId, label: label ?? '', properties: properties ?? {} })
  if (!plot) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(plot)
}

export async function DELETE(req: NextRequest) {
  const { userId, unauth } = await gate()
  if (unauth) return unauth
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await deletePlot(id, userId)
  return NextResponse.json({ ok: true })
}
