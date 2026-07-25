import { NextResponse } from 'next/server'
import { checkCloudSchema } from '@/lib/supabase/schemaCheck'
import { IS_CLOUD_MODE } from '@/lib/supabase/config'

export async function GET() {
  if (!IS_CLOUD_MODE) {
    return NextResponse.json({ ok: true, missing: [], mode: 'local' })
  }
  const status = await checkCloudSchema()
  return NextResponse.json({ ...status, mode: 'cloud' })
}
