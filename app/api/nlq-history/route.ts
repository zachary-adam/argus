import { NextRequest, NextResponse } from 'next/server'
import { insertNlqHistory, listNlqHistory } from '@/lib/intelHistoryStore'
import { getRequestUserId } from '@/lib/auth/getRequestUser'

const IS_CLOUD = process.env.NEXT_PUBLIC_MODE === 'cloud'

export async function GET(req: NextRequest) {
  const userId = await getRequestUserId()
  if (IS_CLOUD && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const projectId = searchParams.get('projectId') ?? undefined
  const limit = Math.min(50, Number(searchParams.get('limit') ?? 20) || 20)

  try {
    const rows = await listNlqHistory({
      limit,
      projectId,
      userId: userId ?? 'local',
    })
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Load failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const userId = await getRequestUserId()
  if (IS_CLOUD && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { query, summary, appliedFilters, matchCount, projectId } = body as {
    query?: string
    summary?: string
    appliedFilters?: string
    matchCount?: number
    projectId?: string
  }

  if (!query?.trim() || !summary?.trim()) {
    return NextResponse.json({ error: 'query and summary required' }, { status: 400 })
  }

  try {
    const row = await insertNlqHistory({
      query: query.trim(),
      summary: summary.trim(),
      appliedFilters,
      matchCount,
      projectId,
      userId: userId ?? 'local',
    })
    return NextResponse.json({ id: row.id, created_at: row.created_at })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 })
  }
}
