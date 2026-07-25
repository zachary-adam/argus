import { NextRequest, NextResponse } from 'next/server'
import { workspaceGetDefault, workspaceUpdate } from '@/lib/db'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { IS_CLOUD_MODE as IS_CLOUD } from '@/lib/supabase/config'
const requireLocalAuth = () => !IS_CLOUD && !!process.env.ARGUS_SESSION_SECRET

// Cloud mode has no per-workspace concept yet; we return a virtual workspace
// keyed by the user id so callers that only need a stable id (e.g. usePlots)
// keep working. workspace.settings is not consumed by any UI today.
function virtualWorkspace(userId: string) {
  const now = new Date().toISOString()
  return { id: userId, name: 'Default Workspace', settings: {}, created_at: now, updated_at: now }
}

export async function GET() {
  const userId = await getRequestUserId()
  if (IS_CLOUD) {
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json(virtualWorkspace(userId))
  }
  if (!userId && requireLocalAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(workspaceGetDefault())
}

export async function PATCH(req: NextRequest) {
  const userId = await getRequestUserId()
  if (IS_CLOUD) {
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // No durable settings store in cloud — echo back the requested settings on
    // the virtual workspace so the UI's debounced save still resolves cleanly.
    const { settings } = await req.json().catch(() => ({ settings: {} }))
    return NextResponse.json({ ...virtualWorkspace(userId), settings: settings ?? {} })
  }
  if (!userId && requireLocalAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, settings } = await req.json()
  if (!id || typeof settings !== 'object') {
    return NextResponse.json({ error: 'id and settings required' }, { status: 400 })
  }
  const updated = workspaceUpdate(id, settings)
  if (!updated) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  return NextResponse.json(updated)
}
