import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { GitHubStorage, GitHubConfig, ConnectionResult, AnalysisEntry } from '@/lib/github'
import type { Project } from '@/types/project'

export type SyncStatus = 'idle' | 'connecting' | 'syncing' | 'success' | 'error'

export interface SyncLogEntry {
  at: string
  action: 'push' | 'push-all' | 'pull' | 'create-repo'
  label: string
  ok: boolean
}

interface SyncStore {
  config: GitHubConfig | null
  login: string | null
  status: SyncStatus
  error: string | null
  lastSyncedAt: string | null
  autoSync: boolean
  syncLog: SyncLogEntry[]

  // OAuth pending state — set after sign-in, cleared when repo is selected
  pendingToken: string | null
  pendingLogin: string | null

  connect: (token: string, repo: string, branch: string) => Promise<ConnectionResult>
  setPendingAuth: (token: string, login: string) => void
  completeOAuth: (repo: string, branch: string) => void
  disconnect: () => void
  setAutoSync: (v: boolean) => void
  setStatus: (s: SyncStatus, err?: string) => void
  getStorage: () => GitHubStorage | null

  push: (project: Project) => Promise<boolean>
  pushAll: (projects: Project[]) => Promise<{ pushed: number; failed: number }>
  remove: (id: string, githubRepo?: string) => Promise<boolean>
  pull: () => Promise<Project[]>
  createProjectRepo: (project: Project, repoName: string, isPrivate: boolean) => Promise<{ ok: boolean; fullName?: string; error?: string }>

  pushAnalysis: (projectId: string, type: 'brief' | 'sitrep' | 'ask', content: string) => Promise<boolean>
  listAnalysis: (projectId: string) => Promise<AnalysisEntry[]>
  fetchAnalysis: (downloadUrl: string) => Promise<string | null>
}

const MAX_LOG = 30

export const useSyncStore = create<SyncStore>()(
  persist(
    (set, get) => ({
      config: null,
      login: null,
      status: 'idle',
      error: null,
      lastSyncedAt: null,
      autoSync: true,
      syncLog: [],
      pendingToken: null,
      pendingLogin: null,

      setPendingAuth: (token, login) => set({ pendingToken: token, pendingLogin: login }),

      completeOAuth: (repo, branch) => {
        const { pendingToken, pendingLogin } = get()
        if (!pendingToken) return
        set({
          config: { token: pendingToken, repo, branch },
          login: pendingLogin,
          pendingToken: null,
          pendingLogin: null,
          status: 'idle',
          error: null,
        })
      },

      connect: async (token, repo, branch) => {
        set({ status: 'connecting', error: null })
        const storage = new GitHubStorage({ token, repo, branch })
        const result = await storage.testConnection()
        if (result.ok) {
          set({ config: { token, repo, branch }, login: result.login ?? null, status: 'idle', error: null })
        } else {
          set({ status: 'error', error: result.error ?? 'Connection failed' })
        }
        return result
      },

      disconnect: () => set({ config: null, login: null, status: 'idle', error: null, lastSyncedAt: null }),

      setAutoSync: (v) => set({ autoSync: v }),

      setStatus: (s, err) => set({ status: s, error: err ?? null }),

      getStorage: () => {
        const { config } = get()
        return config ? new GitHubStorage(config) : null
      },

      push: async (project) => {
        const storage = get().getStorage()
        if (!storage) return false
        set({ status: 'syncing' })
        try {
          const ok = await storage.pushProject(project)
          const entry: SyncLogEntry = { at: new Date().toISOString(), action: 'push', label: project.name, ok }
          set(s => ({
            status: ok ? 'success' : 'error',
            lastSyncedAt: ok ? new Date().toISOString() : s.lastSyncedAt,
            error: ok ? null : 'Push failed',
            syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG),
          }))
          return ok
        } catch {
          const entry: SyncLogEntry = { at: new Date().toISOString(), action: 'push', label: project.name, ok: false }
          set(s => ({ status: 'error', error: 'Push failed', syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG) }))
          return false
        }
      },

      pushAll: async (projects) => {
        const storage = get().getStorage()
        if (!storage) return { pushed: 0, failed: projects.length }
        set({ status: 'syncing', error: null })
        try {
          const result = await storage.pushAll(projects)
          const ok = result.failed === 0
          const entry: SyncLogEntry = {
            at: new Date().toISOString(), action: 'push-all',
            label: `${result.pushed}/${projects.length} projects`, ok,
          }
          set(s => ({
            status: ok ? 'success' : 'error',
            lastSyncedAt: new Date().toISOString(),
            error: ok ? null : `${result.failed} project(s) failed`,
            syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG),
          }))
          return result
        } catch {
          const entry: SyncLogEntry = { at: new Date().toISOString(), action: 'push-all', label: 'all projects', ok: false }
          set(s => ({ status: 'error', error: 'Sync failed', syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG) }))
          return { pushed: 0, failed: projects.length }
        }
      },

      remove: async (id, githubRepo) => {
        const storage = get().getStorage()
        if (!storage) return true
        try { return await storage.deleteProject(id, githubRepo) } catch { return false }
      },

      createProjectRepo: async (project, repoName, isPrivate) => {
        const storage = get().getStorage()
        if (!storage) return { ok: false, error: 'Not connected to GitHub' }
        set({ status: 'syncing' })
        try {
          const result = await storage.createRepo(
            repoName,
            `ARGUS Intelligence Project: ${project.name}`,
            isPrivate
          )
          if (result.ok && result.fullName) {
            const dedicated = storage.forRepo(result.fullName)
            // Push project and register in global manifest in parallel
            await Promise.all([
              dedicated.pushProjectToRoot(project),
              storage.registerDedicatedRepo(project.id, result.fullName),
            ])
            const entry: SyncLogEntry = { at: new Date().toISOString(), action: 'create-repo', label: result.fullName, ok: true }
            set(s => ({
              status: 'success',
              lastSyncedAt: new Date().toISOString(),
              syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG),
            }))
          } else {
            const entry: SyncLogEntry = { at: new Date().toISOString(), action: 'create-repo', label: repoName, ok: false }
            set(s => ({ status: 'error', error: result.error, syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG) }))
          }
          return result
        } catch {
          const entry: SyncLogEntry = { at: new Date().toISOString(), action: 'create-repo', label: repoName, ok: false }
          set(s => ({ status: 'error', error: 'Failed to create repository', syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG) }))
          return { ok: false, error: 'Failed to create repository' }
        }
      },

      pull: async () => {
        const storage = get().getStorage()
        if (!storage) return []
        set({ status: 'syncing', error: null })
        try {
          const projects = await storage.pullProjects()
          const entry: SyncLogEntry = { at: new Date().toISOString(), action: 'pull', label: `${projects.length} projects`, ok: true }
          set(s => ({
            status: 'success',
            lastSyncedAt: new Date().toISOString(),
            syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG),
          }))
          return projects
        } catch {
          const entry: SyncLogEntry = { at: new Date().toISOString(), action: 'pull', label: 'pull failed', ok: false }
          set(s => ({ status: 'error', error: 'Pull failed', syncLog: [entry, ...s.syncLog].slice(0, MAX_LOG) }))
          return []
        }
      },

      pushAnalysis: async (projectId, type, content) => {
        const storage = get().getStorage()
        if (!storage) return false
        try {
          const ok = await storage.pushAnalysis(projectId, type, content)
          if (!ok) set({ error: `Failed to save ${type} to GitHub — check your token and repo access` })
          return ok
        } catch {
          set({ error: `Failed to save ${type} to GitHub — check your connection` })
          return false
        }
      },

      listAnalysis: async (projectId) => {
        const storage = get().getStorage()
        if (!storage) return []
        try { return await storage.listAnalysis(projectId) } catch { return [] }
      },

      fetchAnalysis: async (downloadUrl) => {
        const storage = get().getStorage()
        if (!storage) return null
        try { return await storage.fetchAnalysis(downloadUrl) } catch { return null }
      },
    }),
    {
      name: 'argus-github-sync',
      partialize: (s) => ({
        config: s.config, login: s.login,
        lastSyncedAt: s.lastSyncedAt, autoSync: s.autoSync,
        pendingToken: s.pendingToken, pendingLogin: s.pendingLogin,
        syncLog: s.syncLog,
      }),
    }
  )
)
