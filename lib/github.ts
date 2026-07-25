import type { Project } from '@/types/project'

const API = 'https://api.github.com'
export const ARGUS_FOLDER = 'argus-projects'
const ANALYSIS_FOLDER = `${ARGUS_FOLDER}/analysis`
const MANIFEST_PATH = `${ARGUS_FOLDER}/_repos.json`

export interface AnalysisEntry {
  type: string
  projectId: string
  path: string        // full github path
  filename: string    // e.g. brief_2026-06-13T14-22.md
  timestamp: string   // ISO from filename
  downloadUrl: string
}

export interface GitHubConfig {
  token: string
  repo: string    // "owner/repo"
  branch: string  // "main"
}

export interface CreateRepoResult {
  ok: boolean
  fullName?: string  // "owner/repo-name"
  error?: string
}

export function slugifyProjectName(name: string): string {
  return 'argus-' + name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

export interface ConnectionResult {
  ok: boolean
  login?: string
  repoFullName?: string
  error?: string
}

// Strip sensitive fields before writing to GitHub
function sanitizeProject(project: Project): Omit<Project, 'byokApiKey'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { byokApiKey: _stripped, ...safe } = project as Project & { byokApiKey?: string }
  return safe as Omit<Project, 'byokApiKey'>
}

type ManifestEntry = { repo: string; branch: string }

export class GitHubStorage {
  constructor(private cfg: GitHubConfig) {}

  private get h() {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const [uRes, rRes] = await Promise.all([
        fetch(`${API}/user`, { headers: this.h }),
        fetch(`${API}/repos/${this.cfg.repo}`, { headers: this.h }),
      ])
      if (!uRes.ok) return { ok: false, error: 'Invalid personal access token.' }
      if (!rRes.ok) return { ok: false, error: `Cannot access "${this.cfg.repo}". Check the repo name and token scope (needs Contents: read & write).` }
      const [user, repo] = await Promise.all([uRes.json(), rRes.json()])
      return { ok: true, login: user.login, repoFullName: repo.full_name }
    } catch {
      return { ok: false, error: 'Network error — check your connection.' }
    }
  }

  async createRepo(name: string, description: string, isPrivate: boolean): Promise<CreateRepoResult> {
    try {
      const res = await fetch(`${API}/user/repos`, {
        method: 'POST',
        headers: this.h,
        body: JSON.stringify({ name, description, private: isPrivate, auto_init: true }),
      })
      if (!res.ok) {
        const err = await res.json()
        return { ok: false, error: err.message ?? 'Failed to create repository' }
      }
      const data = await res.json()
      return { ok: true, fullName: data.full_name }
    } catch {
      return { ok: false, error: 'Network error' }
    }
  }

  // Storage scoped to a specific repo (used for per-project repos)
  forRepo(repo: string, branch = 'main'): GitHubStorage {
    return new GitHubStorage({ ...this.cfg, repo, branch })
  }

  private async getSHA(path: string): Promise<string | null> {
    const res = await fetch(
      `${API}/repos/${this.cfg.repo}/contents/${path}?ref=${this.cfg.branch}`,
      { headers: this.h }
    )
    if (!res.ok) return null
    const d = await res.json()
    return d.sha ?? null
  }

  // Manifest tracks which projects live in dedicated repos
  private async getManifest(): Promise<Record<string, ManifestEntry>> {
    try {
      const res = await fetch(
        `${API}/repos/${this.cfg.repo}/contents/${MANIFEST_PATH}?ref=${this.cfg.branch}`,
        { headers: this.h }
      )
      if (!res.ok) return {}
      const d = await res.json()
      return JSON.parse(atob(d.content.replace(/\n/g, '')))
    } catch { return {} }
  }

  private async setManifest(manifest: Record<string, ManifestEntry>): Promise<void> {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(manifest, null, 2))))
    const sha = await this.getSHA(MANIFEST_PATH)
    await fetch(`${API}/repos/${this.cfg.repo}/contents/${MANIFEST_PATH}`, {
      method: 'PUT',
      headers: this.h,
      body: JSON.stringify({
        message: 'argus: update repo index',
        content,
        branch: this.cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    })
  }

  async registerDedicatedRepo(projectId: string, repo: string, branch = 'main'): Promise<void> {
    const manifest = await this.getManifest()
    manifest[projectId] = { repo, branch }
    await this.setManifest(manifest)
  }

  async unregisterDedicatedRepo(projectId: string): Promise<void> {
    const manifest = await this.getManifest()
    if (!manifest[projectId]) return
    delete manifest[projectId]
    await this.setManifest(manifest)
  }

  async pushProject(project: Project): Promise<boolean> {
    if (project.githubRepo) {
      const branch = project.githubBranch ?? 'main'
      const dedicated = this.forRepo(project.githubRepo, branch)
      // Push to dedicated repo AND register it in the global manifest in parallel
      const [ok] = await Promise.all([
        dedicated.pushProjectToRoot(project),
        this.registerDedicatedRepo(project.id, project.githubRepo, branch),
      ])
      return ok
    }

    const path = `${ARGUS_FOLDER}/${project.id}.json`
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(sanitizeProject(project), null, 2))))
    const sha = await this.getSHA(path)
    const res = await fetch(`${API}/repos/${this.cfg.repo}/contents/${path}`, {
      method: 'PUT',
      headers: this.h,
      body: JSON.stringify({
        message: `argus: sync "${project.name}"`,
        content,
        branch: this.cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    })
    return res.ok
  }

  // Push project as project.json in the repo root (for dedicated per-project repos)
  async pushProjectToRoot(project: Project): Promise<boolean> {
    const path = 'project.json'
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(sanitizeProject(project), null, 2))))
    const sha = await this.getSHA(path)
    const res = await fetch(`${API}/repos/${this.cfg.repo}/contents/${path}`, {
      method: 'PUT',
      headers: this.h,
      body: JSON.stringify({
        message: `argus: sync "${project.name}"`,
        content,
        branch: this.cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    })
    return res.ok
  }

  async pushAll(projects: Project[]): Promise<{ pushed: number; failed: number }> {
    const results = await Promise.all(projects.map(p => this.pushProject(p)))
    return { pushed: results.filter(Boolean).length, failed: results.filter(r => !r).length }
  }

  async deleteProject(id: string, githubRepo?: string): Promise<boolean> {
    if (githubRepo) {
      // Project has a dedicated repo — just remove it from the manifest.
      // The GitHub repo itself is kept (deleting repos requires a separate scope).
      await this.unregisterDedicatedRepo(id)
      return true
    }
    const path = `${ARGUS_FOLDER}/${id}.json`
    const sha = await this.getSHA(path)
    if (!sha) return true
    const res = await fetch(`${API}/repos/${this.cfg.repo}/contents/${path}`, {
      method: 'DELETE',
      headers: this.h,
      body: JSON.stringify({ message: `argus: delete ${id}`, sha, branch: this.cfg.branch }),
    })
    return res.ok
  }

  async pullProjects(): Promise<Project[]> {
    // Pull global projects and the manifest in parallel
    const [globalProjects, manifest] = await Promise.all([
      this._pullGlobalProjects(),
      this.getManifest(),
    ])

    const pulledIds = new Set(globalProjects.map(p => p.id))

    // Pull any dedicated-repo projects not already in global results
    const dedicatedProjects = await Promise.all(
      Object.entries(manifest)
        .filter(([id]) => !pulledIds.has(id))
        .map(async ([, { repo, branch }]) => {
          try {
            const res = await fetch(
              `${API}/repos/${repo}/contents/project.json?ref=${branch}`,
              { headers: this.h }
            )
            if (!res.ok) return null
            const d = await res.json()
            return JSON.parse(atob(d.content.replace(/\n/g, ''))) as Project
          } catch { return null }
        })
    )

    return [...globalProjects, ...dedicatedProjects.filter(Boolean) as Project[]]
  }

  private async _pullGlobalProjects(): Promise<Project[]> {
    const res = await fetch(
      `${API}/repos/${this.cfg.repo}/contents/${ARGUS_FOLDER}?ref=${this.cfg.branch}`,
      { headers: this.h }
    )
    if (!res.ok) return []
    const files = await res.json()
    if (!Array.isArray(files)) return []

    const results = await Promise.all(
      files
        .filter((f: any) => f.name.endsWith('.json') && f.name !== '_repos.json' && f.type === 'file')
        .map(async (f: any) => {
          try {
            const r = await fetch(f.download_url)
            return r.ok ? (await r.json() as Project) : null
          } catch { return null }
        })
    )
    return results.filter(Boolean) as Project[]
  }

  async pushAnalysis(projectId: string, type: 'brief' | 'sitrep' | 'ask', content: string): Promise<boolean> {
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z')
    const filename = `${type}_${ts}.md`
    const path = `${ANALYSIS_FOLDER}/${projectId}/${filename}`
    const encoded = btoa(unescape(encodeURIComponent(content)))
    // No getSHA — filenames include a unique timestamp so this file never previously exists
    const res = await fetch(`${API}/repos/${this.cfg.repo}/contents/${path}`, {
      method: 'PUT',
      headers: this.h,
      body: JSON.stringify({
        message: `argus: save ${type} for ${projectId}`,
        content: encoded,
        branch: this.cfg.branch,
      }),
    })
    return res.ok
  }

  async listAnalysis(projectId: string): Promise<AnalysisEntry[]> {
    const res = await fetch(
      `${API}/repos/${this.cfg.repo}/contents/${ANALYSIS_FOLDER}/${projectId}?ref=${this.cfg.branch}`,
      { headers: this.h }
    )
    if (!res.ok) return []
    const files = await res.json()
    if (!Array.isArray(files)) return []
    return files
      .filter((f: any) => f.name.endsWith('.md') && f.type === 'file')
      .map((f: any): AnalysisEntry => {
        const parts = f.name.replace('.md', '').split('_')
        const type = parts[0]
        const timestamp = parts.slice(1).join('_').replace(/-(\d{2})-(\d{2})-(\d{2})Z$/, ':$1:$2:$3Z').replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3')
        return { type, projectId, path: f.path, filename: f.name, timestamp, downloadUrl: f.download_url }
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  async fetchAnalysis(downloadUrl: string): Promise<string | null> {
    try {
      const res = await fetch(downloadUrl)
      return res.ok ? await res.text() : null
    } catch { return null }
  }
}
