'use client'
import { useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth/AuthContext'
import { WorkspaceData } from '@/types'

export function useWorkspace() {
  const { isAuthenticated } = useAuth()
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Shared query key → the three consumers (ArgusMap, PlotsPanel, useWorkspaceSync)
  // dedupe to a single GET instead of each fetching /api/workspace on mount.
  const { data: workspace = null } = useQuery({
    queryKey: ['workspace'],
    enabled: isAuthenticated,
    queryFn: async (): Promise<WorkspaceData | null> => {
      const r = await fetch('/api/workspace')
      return r.ok ? (r.json() as Promise<WorkspaceData>) : null
    },
  })

  const saveWorkspace = useCallback(async (settings: Record<string, unknown>) => {
    if (!workspace?.id) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: workspace.id, settings }),
      }).catch(() => null)
      // Do not setWorkspace(response) here — that re-triggers sync and floods PATCH.
    }, 2500)
  }, [workspace?.id])

  return { workspace, saveWorkspace }
}
