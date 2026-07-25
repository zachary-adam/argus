import { NextResponse } from 'next/server'
import { clearAllCache } from '@/lib/cache'

export async function POST() {
  const n = clearAllCache()
  return NextResponse.json({ ok: true, cleared: n })
}
