import type { Project } from '@/types/project'

export interface ProjectBackupFile {
  version: 1
  exportedAt: string
  projects: Project[]
}

export function buildProjectBackup(projects: Project[]): ProjectBackupFile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: structuredClone(projects),
  }
}

export function downloadProjectBackup(projects: Project[], filename?: string): void {
  const backup = buildProjectBackup(projects)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename ?? `argus-backup-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export function parseProjectBackup(raw: string): Project[] {
  const data = JSON.parse(raw) as Partial<ProjectBackupFile> | Project[]
  if (Array.isArray(data)) return data as Project[]
  if (data?.version === 1 && Array.isArray(data.projects)) return data.projects
  throw new Error('Invalid backup file — expected ARGUS project export JSON')
}

/** Merge imported projects; remote ids win, new ids are appended. */
export function mergeProjectImports(existing: Project[], imported: Project[]): Project[] {
  const byId = new Map(existing.map(p => [p.id, p]))
  for (const p of imported) {
    if (!byId.has(p.id)) byId.set(p.id, p)
  }
  return [...byId.values()]
}
