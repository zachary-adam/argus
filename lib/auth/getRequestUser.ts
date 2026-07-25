// Server-only. Returns the authenticated user's ID for the current request.
// Works in both cloud (Supabase) and local (password-JWT) auth modes.
// Never throws — callers treat null as "unauthenticated / unknown user".

import { IS_CLOUD_MODE as IS_CLOUD } from '@/lib/supabase/config'

export async function getRequestUserId(): Promise<string | null> {
  try {
    if (IS_CLOUD) {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id ?? null
    } else {
      const { getSession } = await import('@/lib/auth/session')
      const session = await getSession()
      return session?.id ?? null
    }
  } catch {
    return null
  }
}
