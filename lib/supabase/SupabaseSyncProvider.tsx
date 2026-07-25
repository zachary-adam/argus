'use client'
import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { useProjectStore } from '@/stores/projectStore'
import { loadProjects, saveProject, deleteProject, saveAllProjects } from '@/lib/supabase/projects'
import { IS_CLOUD_MODE, isProjectCloudSyncEnabled } from '@/lib/supabase/config'
import type { Project } from '@/types/project'

const CLOUD_SAVE_DEBOUNCE_MS = 2500

// Mounts when cloud sync is enabled. On sign-in it loads projects from Supabase,
// migrates local browser projects on first login, and syncs changes back.
export function SupabaseSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const loadedForRef = useRef<string | null>(null)
  const isLoadingRef = useRef(false)
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingSavesRef = useRef<Map<string, Project>>(new Map())

  useEffect(() => {
    if (!isProjectCloudSyncEnabled()) return

    if (!user) {
      // Marketing / Playwright film seeds local projects while signed out.
      // Do not wipe those — cloud wipe is for real anonymous cloud sessions only.
      let allowLocalSeed = false
      try { allowLocalSeed = localStorage.getItem('argus-allow-local-seed') === '1' } catch { /* ignore */ }
      if (IS_CLOUD_MODE && !allowLocalSeed) {
        useProjectStore.setState(s => (s.projects.length === 0 ? s : { ...s, projects: [], activeProjectId: null }))
      }
      loadedForRef.current = null
      return
    }

    if (loadedForRef.current === user.id) return

    const localSnapshot = [...useProjectStore.getState().projects]

    if (IS_CLOUD_MODE) {
      useProjectStore.setState({ projects: [], activeProjectId: null })
      try { localStorage.removeItem('argus-projects') } catch {}
    }

    loadedForRef.current = user.id
    isLoadingRef.current = true

    loadProjects(user.id).then(async remote => {
      if (IS_CLOUD_MODE) {
        if (remote.length > 0) {
          useProjectStore.setState({ projects: remote })
        } else if (localSnapshot.length > 0) {
          // Keep local even if upload fails (offline / paused project).
          try { await saveAllProjects(localSnapshot, user.id) } catch { /* offline */ }
          useProjectStore.setState({ projects: localSnapshot })
        }
        return
      }

      // Hybrid backup mode — keep local, merge remote, upload anything new locally.
      const remoteIds = new Set(remote.map(p => p.id))
      const localOnly = localSnapshot.filter(p => !remoteIds.has(p.id))
      const merged = [...remote, ...localOnly]
      useProjectStore.setState({ projects: merged })
      if (localOnly.length > 0) {
        try { await saveAllProjects(localOnly, user.id) } catch { /* offline */ }
      }
    }).catch(() => {
      // Never leave cloud mode empty after a wipe if we still have a local snapshot.
      if (localSnapshot.length > 0) {
        useProjectStore.setState({ projects: localSnapshot })
      }
    }).finally(() => { isLoadingRef.current = false })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isProjectCloudSyncEnabled() || !user) return

    let prevProjects = useProjectStore.getState().projects

    const flushSave = (projectId: string) => {
      const pending = pendingSavesRef.current.get(projectId)
      pendingSavesRef.current.delete(projectId)
      saveTimersRef.current.delete(projectId)
      if (pending) void saveProject(pending, user.id)
    }

    const scheduleSave = (project: Project) => {
      pendingSavesRef.current.set(project.id, project)
      const prev = saveTimersRef.current.get(project.id)
      if (prev) clearTimeout(prev)
      saveTimersRef.current.set(
        project.id,
        setTimeout(() => flushSave(project.id), CLOUD_SAVE_DEBOUNCE_MS),
      )
    }

    const unsub = useProjectStore.subscribe((state) => {
      const projects = state.projects
      const prev = prevProjects
      prevProjects = projects

      if (isLoadingRef.current) return

      const prevMap = new Map(prev.map((p: Project) => [p.id, p]))
      const currIds = new Set(projects.map((p: Project) => p.id))

      for (const p of projects) {
        const old = prevMap.get(p.id)
        if (!old || old !== p) {
          scheduleSave(p)
        }
      }

      if (IS_CLOUD_MODE) {
        for (const old of prev) {
          if (!currIds.has(old.id)) {
            const t = saveTimersRef.current.get(old.id)
            if (t) clearTimeout(t)
            saveTimersRef.current.delete(old.id)
            pendingSavesRef.current.delete(old.id)
            deleteProject(old.id, user.id)
          }
        }
      }
    })

    return () => {
      unsub()
      for (const id of [...saveTimersRef.current.keys()]) flushSave(id)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>
}
