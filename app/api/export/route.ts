import { NextRequest, NextResponse } from 'next/server'
import { IntelEvent } from '@/types'
import { getCache } from '@/lib/cache'

// GET /api/export?format=csv|json&severity=critical,high&category=conflict&limit=500
export async function GET(req: NextRequest) {
  try {
  const { searchParams } = req.nextUrl
  const format = searchParams.get('format') ?? 'csv'
  const severityFilter = searchParams.get('severity')?.split(',').filter(Boolean) ?? []
  const categoryFilter = searchParams.get('category')?.split(',').filter(Boolean) ?? []
  const limit = Math.min(5000, parseInt(searchParams.get('limit') ?? '1000', 10))

  const all = getCache<IntelEvent[]>('all-events') ?? []

  let events = all
  if (severityFilter.length) events = events.filter(e => severityFilter.includes(e.severity))
  if (categoryFilter.length) events = events.filter(e => categoryFilter.includes(e.category))
  events = events.slice(0, limit)

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', '_')

  if (format === 'json') {
    return new NextResponse(JSON.stringify(events, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="ARGUS-events-${timestamp}.json"`,
      },
    })
  }

  // CSV — includes source URL as citation
  const headers = ['id', 'title', 'summary', 'country', 'countryCode', 'category', 'severity', 'source', 'source_detail', 'timestamp', 'lat', 'lon', 'fatalities', 'url', 'tags']
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [
    headers.join(','),
    ...events.map(e => headers.map(h => {
      const val = (e as any)[h]
      if (h === 'tags') return escape(Array.isArray(val) ? val.join(';') : '')
      return escape(val)
    }).join(',')),
  ]

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="ARGUS-events-${timestamp}.csv"`,
    },
  })
  } catch (err) {
    console.error('[export]', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
