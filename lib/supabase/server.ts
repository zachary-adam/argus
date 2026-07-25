import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function createClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    // Env-missing fallback (local mode). Cast to the real client type so consumers
    // see the full query-builder surface instead of this stub's narrow shape — the
    // narrow inferred type was polluting the union and breaking .order/.insert/.delete.
    return {
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
    } as unknown as SupabaseClient
  }

  const { createServerClient } = await import('@supabase/ssr')
  const cookieStore = await cookies()
  return createServerClient(url, anon, {
    cookieOptions: { sameSite: 'lax' },
    auth: {
      // Server-side: never auto-refresh — that's what causes lock contention
      // across concurrent requests fighting over the same auth-token cookie.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {}
      },
    },
  })
}
