/**
 * Shared detection for "table doesn't exist yet" errors.
 *
 * Supabase surfaces a missing table two different ways depending on the path:
 *  - PostgREST (supabase-js):  code PGRST205, "Could not find the table ... in the schema cache"
 *  - Raw Postgres:             code 42P01,   "relation ... does not exist"
 *
 * Match on codes first; the message check is a fallback for clients that
 * don't propagate the code.
 */
export function isMissingTableError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  const msg = error.message ?? ''
  return msg.includes('does not exist') || msg.includes('in the schema cache')
}

/** Offline / paused project / bad DNS — expected in local hybrid and intermittent cloud. */
export function isNetworkFetchError(
  error: { message?: string | null } | string | null | undefined,
): boolean {
  const msg = typeof error === 'string' ? error : (error?.message ?? '')
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(msg)
}

/**
 * Log Supabase failures without tripping Next.js's console.error → runtime overlay.
 * Network blips use warn; unexpected errors still warn (recoverable sync path).
 */
export function logSupabaseFailure(scope: string, error: unknown): void {
  const msg =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? error)
        : String(error)
  if (isNetworkFetchError(msg)) {
    console.warn(`[supabase] ${scope}: offline or unreachable (${msg})`)
    return
  }
  console.warn(`[supabase] ${scope}:`, msg)
}
