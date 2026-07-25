'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { WorkspaceData } from '@/types'

export function useWorkspace() {
  const { isAuthenticated } = useAuth()
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    fetch('/api/workspace')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setWorkspace(d as WorkspaceData) })
      .catch(() => {})
  }, [isAuthenticated])

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
