import { NextRequest, NextResponse } from 'next/server'
import { insertBrief, listBriefs } from '@/lib/intelHistoryStore'
import { getRequestUserId } from '@/lib/auth/getRequestUser'

const IS_CLOUD = process.env.NEXT_PUBLIC_MODE === 'cloud'

export async function GET(req: NextRequest) {
  const userId = await getRequestUserId()
  if (IS_CLOUD && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const projectId = searchParams.get('projectId') ?? undefined
  const limit = Math.min(50, Number(searchParams.get('limit') ?? 30) || 30)

  try {
    const rows = await listBriefs({
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
  const {
    type = 'country',
    title,
    country,
    countryCode,
    projectId,
    brief,
    summary,
  } = body as {
    type?: 'country' | 'project' | 'canvas'
    title?: string
    country?: string
    countryCode?: string
    projectId?: string
    brief?: Record<string, unknown>
    summary?: string
  }

  if (!brief || typeof brief !== 'object') {
    return NextResponse.json({ error: 'brief required' }, { status: 400 })
  }

  const autoTitle = title
    || (type === 'country' ? `${country ?? 'Country'} brief` : 'Intelligence brief')
  const autoSummary = summary
    || String(brief.executiveSummary ?? brief.bluf ?? brief.headline ?? brief.situation ?? '').slice(0, 300)

  try {
    const row = await insertBrief({
      type,
      title: autoTitle,
      country,
      countryCode,
      projectId,
      userId: userId ?? 'local',
      data: brief,
      summary: autoSummary,
    })
    return NextResponse.json({ id: row.id, created_at: row.created_at })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 })
  }
}
