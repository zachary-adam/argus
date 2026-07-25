/**
 * SQLite database singleton using better-sqlite3.
 * Database file stored at .argus/argus.db
 * Tables: plots, workspaces, briefs, nlq_history
 */
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'

const DIR = join(process.cwd(), '.argus')
const DB_PATH = join(DIR, 'argus.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  mkdirSync(DIR, { recursive: true })
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL DEFAULT 'Default Workspace',
      settings    TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plots (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      type         TEXT NOT NULL,
      coordinates  TEXT NOT NULL,
      label        TEXT NOT NULL DEFAULT '',
      properties   TEXT NOT NULL DEFAULT '{}',
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS briefs (
      id           TEXT PRIMARY KEY,
      type         TEXT NOT NULL DEFAULT 'country',
      title        TEXT NOT NULL DEFAULT '',
      country      TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT '',
      project_id   TEXT,
      user_id      TEXT,
      data         TEXT,
      summary      TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT 'ARGUS Intelligence Snapshot',
      description TEXT NOT NULL DEFAULT '',
      state       TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nlq_history (
      id              TEXT PRIMARY KEY,
      user_id         TEXT,
      project_id      TEXT,
      query           TEXT NOT NULL,
      summary         TEXT NOT NULL DEFAULT '',
      applied_filters TEXT NOT NULL DEFAULT '',
      match_count     INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL
    );
  `)

  // Legacy DBs predate some briefs columns (project_id, user_id, type, title).
  // Add them BEFORE creating the indexes that reference them — otherwise index
  // creation throws "no such column" and getDb() fails on every old database.
  migrateBriefsSchema(db)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_plots_workspace ON plots(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_briefs_country  ON briefs(country);
    CREATE INDEX IF NOT EXISTS idx_briefs_project ON briefs(project_id);
    CREATE INDEX IF NOT EXISTS idx_briefs_user    ON briefs(user_id);
    CREATE INDEX IF NOT EXISTS idx_nlq_project    ON nlq_history(project_id);
    CREATE INDEX IF NOT EXISTS idx_nlq_user       ON nlq_history(user_id);
  `)
}

function migrateBriefsSchema(db: Database.Database) {
  const cols = db.prepare('PRAGMA table_info(briefs)').all() as { name: string }[]
  const names = new Set(cols.map(c => c.name))
  if (!names.has('type')) db.exec(`ALTER TABLE briefs ADD COLUMN type TEXT NOT NULL DEFAULT 'country'`)
  if (!names.has('title')) db.exec(`ALTER TABLE briefs ADD COLUMN title TEXT NOT NULL DEFAULT ''`)
  if (!names.has('project_id')) db.exec(`ALTER TABLE briefs ADD COLUMN project_id TEXT`)
  if (!names.has('user_id')) db.exec(`ALTER TABLE briefs ADD COLUMN user_id TEXT`)
}

export function rand() { return Math.random().toString(36).slice(2, 11) }

// ── Workspace ──────────────────────────────────────────────────────────────

export interface DbWorkspace {
  id: string
  name: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

function parseWorkspace(row: { id: string; name: string; settings: string; created_at: string; updated_at: string }): DbWorkspace {
  return { ...row, settings: JSON.parse(row.settings) }
}

export function workspaceGetDefault(): DbWorkspace {
  const db = getDb()
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT * FROM workspaces ORDER BY created_at LIMIT 1').get() as { id: string; name: string; settings: string; created_at: string; updated_at: string } | undefined
  if (existing) return parseWorkspace(existing)
  const id = rand()
  db.prepare('INSERT INTO workspaces (id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, 'Default Workspace', '{}', now, now)
  return { id, name: 'Default Workspace', settings: {}, created_at: now, updated_at: now }
}

export function workspaceUpdate(id: string, settings: Record<string, unknown>): DbWorkspace | null {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare('UPDATE workspaces SET settings = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(settings), now, id)
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as { id: string; name: string; settings: string; created_at: string; updated_at: string } | undefined
  return row ? parseWorkspace(row) : null
}

// ── Plots ──────────────────────────────────────────────────────────────────

export interface DbPlot {
  id: string
  workspace_id: string
  type: string
  coordinates: unknown
  label: string
  properties: Record<string, unknown>
  created_at: string
}

function parsePlot(row: { id: string; workspace_id: string; type: string; coordinates: string; label: string; properties: string; created_at: string }): DbPlot {
  return { ...row, coordinates: JSON.parse(row.coordinates), properties: JSON.parse(row.properties) }
}

export function plotsList(workspaceId: string): DbPlot[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM plots WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as { id: string; workspace_id: string; type: string; coordinates: string; label: string; properties: string; created_at: string }[]
  return rows.map(parsePlot)
}

export function plotInsert(workspaceId: string, type: string, coordinates: unknown, label: string, properties: Record<string, unknown> = {}): DbPlot {
  const db = getDb()
  const id = rand()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO plots (id, workspace_id, type, coordinates, label, properties, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, workspaceId, type, JSON.stringify(coordinates), label, JSON.stringify(properties), now)
  return { id, workspace_id: workspaceId, type, coordinates, label, properties, created_at: now }
}

export function plotUpdate(id: string, label: string, properties: Record<string, unknown>): DbPlot | null {
  const db = getDb()
  db.prepare('UPDATE plots SET label = ?, properties = ? WHERE id = ?')
    .run(label, JSON.stringify(properties), id)
  const row = db.prepare('SELECT * FROM plots WHERE id = ?').get(id) as { id: string; workspace_id: string; type: string; coordinates: string; label: string; properties: string; created_at: string } | undefined
  return row ? parsePlot(row) : null
}

export function plotDelete(id: string): void {
  getDb().prepare('DELETE FROM plots WHERE id = ?').run(id)
}

// ── Briefs ─────────────────────────────────────────────────────────────────

export interface DbBrief {
  id: string
  type: 'country' | 'project' | 'canvas'
  title: string
  country: string
  country_code: string
  project_id: string | null
  user_id: string | null
  data: Record<string, unknown> | null
  summary: string
  created_at: string
}

function parseBrief(row: {
  id: string
  type?: string
  title?: string
  country: string
  country_code: string
  project_id?: string | null
  user_id?: string | null
  data: string | null
  summary: string
  created_at: string
}): DbBrief {
  return {
    id: row.id,
    type: (row.type as DbBrief['type']) || 'country',
    title: row.title || row.country || 'Brief',
    country: row.country,
    country_code: row.country_code,
    project_id: row.project_id ?? null,
    user_id: row.user_id ?? null,
    data: row.data ? JSON.parse(row.data) : null,
    summary: row.summary,
    created_at: row.created_at,
  }
}

export function briefsList(opts?: { limit?: number; projectId?: string; userId?: string }): DbBrief[] {
  const db = getDb()
  const limit = opts?.limit ?? 30
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (opts?.userId) {
    // NULL user_id = legacy rows from before user scoping; local SQLite is
    // single-tenant, so they belong to whoever is asking.
    clauses.push('(user_id = ? OR user_id IS NULL)')
    params.push(opts.userId)
  }
  if (opts?.projectId) {
    clauses.push('project_id = ?')
    params.push(opts.projectId)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db.prepare(`SELECT * FROM briefs ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit) as Parameters<typeof parseBrief>[0][]
  return rows.map(parseBrief)
}

export function briefInsert(input: {
  type: DbBrief['type']
  title: string
  country?: string
  countryCode?: string
  projectId?: string
  userId?: string
  data: Record<string, unknown>
  summary: string
}): DbBrief {
  const db = getDb()
  const id = rand()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO briefs (id, type, title, country, country_code, project_id, user_id, data, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    input.type,
    input.title.slice(0, 160),
    (input.country ?? '').slice(0, 120),
    (input.countryCode ?? '').slice(0, 8),
    input.projectId ?? null,
    input.userId ?? null,
    JSON.stringify(input.data),
    input.summary.slice(0, 300),
    now,
  )
  return {
    id,
    type: input.type,
    title: input.title.slice(0, 160),
    country: input.country ?? '',
    country_code: input.countryCode ?? '',
    project_id: input.projectId ?? null,
    user_id: input.userId ?? null,
    data: input.data,
    summary: input.summary.slice(0, 300),
    created_at: now,
  }
}

export function briefDelete(id: string, userId: string): boolean {
  const db = getDb()
  const info = db.prepare('DELETE FROM briefs WHERE id = ? AND (user_id = ? OR user_id IS NULL)').run(id, userId)
  return info.changes > 0
}

// ── NLQ history ────────────────────────────────────────────────────────────

export interface DbNlqHistory {
  id: string
  user_id: string | null
  project_id: string | null
  query: string
  summary: string
  applied_filters: string
  match_count: number
  created_at: string
}

export function nlqHistoryList(opts?: { limit?: number; projectId?: string; userId?: string }): DbNlqHistory[] {
  const db = getDb()
  const limit = opts?.limit ?? 30
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (opts?.userId) {
    // NULL user_id = legacy rows from before user scoping (see briefsList).
    clauses.push('(user_id = ? OR user_id IS NULL)')
    params.push(opts.userId)
  }
  if (opts?.projectId) {
    clauses.push('project_id = ?')
    params.push(opts.projectId)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM nlq_history ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit) as DbNlqHistory[]
}

export function nlqHistoryInsert(input: {
  query: string
  summary: string
  appliedFilters?: string
  matchCount?: number
  projectId?: string
  userId?: string
}): DbNlqHistory {
  const db = getDb()
  const id = rand()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO nlq_history (id, user_id, project_id, query, summary, applied_filters, match_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    input.userId ?? null,
    input.projectId ?? null,
    input.query.slice(0, 500),
    input.summary.slice(0, 2000),
    (input.appliedFilters ?? '').slice(0, 200),
    input.matchCount ?? 0,
    now,
  )
  return {
    id,
    user_id: input.userId ?? null,
    project_id: input.projectId ?? null,
    query: input.query.slice(0, 500),
    summary: input.summary.slice(0, 2000),
    applied_filters: (input.appliedFilters ?? '').slice(0, 200),
    match_count: input.matchCount ?? 0,
    created_at: now,
  }
}

export function nlqHistoryDelete(id: string, userId: string): boolean {
  const db = getDb()
  const info = db.prepare('DELETE FROM nlq_history WHERE id = ? AND (user_id = ? OR user_id IS NULL)').run(id, userId)
  return info.changes > 0
}

// ── Snapshots ───────────────────────────────────────────────────────────────

export interface DbSnapshot {
  id: string
  title: string
  description: string
  state: Record<string, unknown>
  created_at: string
}

function parseSnapshot(row: { id: string; title: string; description: string; state: string; created_at: string }): DbSnapshot {
  return { ...row, state: JSON.parse(row.state) }
}

export function snapshotInsert(title: string, description: string, state: Record<string, unknown>): DbSnapshot {
  const db = getDb()
  const id = rand() + rand()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO snapshots (id, title, description, state, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, description, JSON.stringify(state), now)
  return { id, title, description, state, created_at: now }
}

export function snapshotGet(id: string): DbSnapshot | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as { id: string; title: string; description: string; state: string; created_at: string } | undefined
  return row ? parseSnapshot(row) : null
}

export function snapshotDelete(id: string): boolean {
  const db = getDb()
  const info = db.prepare('DELETE FROM snapshots WHERE id = ?').run(id)
  return info.changes > 0
}
