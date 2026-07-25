'use client'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@/types/project'

/** Stable selector — only re-renders when the active project object changes. */
export function selectActiveProject(state: { projects: Project[]; activeProjectId: string | null }): Project | null {
  if (!state.activeProjectId) return null
  return state.projects.find(p => p.id === state.activeProjectId) ?? null
}

export function useActiveProject(): Project | null {
  return useProjectStore(selectActiveProject)
}
