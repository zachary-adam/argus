'use client'

import { useQuery } from '@tanstack/react-query'
import type { StatusResponse } from '@/app/api/status/route'

/**
 * Shared `/api/status` query. Every caller uses the same query key, so React
 * Query dedupes them to a single network request (and collapses StrictMode's
 * dev-mode double-invoke). Previously five components each fetched `/api/status`
 * independently on mount — that's what produced the ×6 status calls on load.
 *
 * Pass `poll` for the one consumer (DataStatusBar) that wants periodic refresh;
 * because the query key is shared, that refresh updates every consumer at once.
 */
export function useStatus(opts?: { poll?: boolean }) {
  const { data } = useQuery({
    queryKey: ['app-status'],
    queryFn: async (): Promise<StatusResponse | null> => {
      const res = await fetch('/api/status')
      if (!res.ok) return null
      return res.json()
    },
    refetchInterval: opts?.poll ? 60_000 : false,
  })
  return data ?? null
}

/** Convenience: just the `aiAvailable` flag, shared through the same query. */
export function useAiAvailable(): boolean {
  return !!useStatus()?.aiAvailable
}
