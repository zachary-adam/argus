'use client'
import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const mockClient = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: (_e: unknown, _cb: unknown) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signInWithPassword: async () => ({ error: { message: 'Supabase not configured' } }),
    signUp: async () => ({ error: { message: 'Supabase not configured' } }),
    signOut: async () => ({ error: null }),
  },
  from: (_table: string) => ({
    select: (_cols?: string) => ({
      eq: (_col: string, _val: unknown) => ({
        eq: (_c: string, _v: unknown) => ({
          single: async () => ({ data: null, error: null }),
          order: (_col: string, _opts?: unknown) => ({
            then: (cb: (v: { data: null; error: null }) => void) => cb({ data: null, error: null }),
          }),
        }),
        single: async () => ({ data: null, error: null }),
        order: (_col: string, _opts?: unknown) => ({
          then: (cb: (v: { data: null; error: null }) => void) => cb({ data: null, error: null }),
        }),
      }),
      single: async () => ({ data: null, error: null }),
    }),
    insert: (_data: unknown) => ({
      select: () => ({ single: async () => ({ data: null, error: null }) }),
    }),
    update: (_data: unknown) => ({
      eq: (_col: string, _val: unknown) => ({
        select: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
    }),
    delete: () => ({
      eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }),
    }),
  }),
} as unknown as ReturnType<typeof createBrowserClient>

// Single instance created once at module load time — never recreated.
// auth.lock is overridden with a no-op to bypass the Web Locks API entirely.
// The default implementation uses navigator.locks which causes
// "lock was released because another request stole it" when multiple
// in-flight requests race to refresh the same auth token simultaneously.
const supabase = SUPABASE_URL && SUPABASE_ANON
  ? createBrowserClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
      },
    })
  : mockClient

export function createClient() {
  return supabase
}
