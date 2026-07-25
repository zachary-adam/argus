#!/usr/bin/env node
/**
 * Quick operator check — env vars + optional live schema probe.
 * Usage: npm run check:cloud   (dev server optional for schema probe)
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const envPath = resolve(root, '.env.local')

function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const fileEnv = loadEnvFile(envPath)
const env = { ...process.env, ...fileEnv }
const mode = env.NEXT_PUBLIC_MODE ?? 'local'
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const mapbox = env.NEXT_PUBLIC_MAPBOX_TOKEN

console.log('\nARGUS cloud / env check\n')
console.log(`  Mode:              ${mode}`)
console.log(`  Mapbox token:      ${mapbox ? 'set' : 'MISSING (map will be blank)'}`)
console.log(`  Supabase URL:      ${supabaseUrl ? 'set' : 'not set'}`)
console.log(`  Supabase anon key: ${supabaseKey ? 'set' : 'not set'}`)

if (mode === 'cloud' && (!supabaseUrl || !supabaseKey)) {
  console.log('\n  Cloud mode needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
}

console.log('\n  Migrations (run in order on Supabase):')
const migrations = [
  'supabase/schema.sql',
  'supabase/migrations/20260622_intel_history.sql',
  'supabase/migrations/20260629_plots.sql',
  'supabase/migrations/20260629_snapshots.sql',
  'supabase/migrations/20260701_research_journal.sql',
  'supabase/migrations/20260613_ai_usage_logs.sql',
  'supabase/migrations/20260613_ai_usage_logs_user_id.sql',
]
for (const m of migrations) {
  const ok = existsSync(resolve(root, m))
  console.log(`    ${ok ? '✓' : '✗'} ${m}`)
}
console.log('\n  See supabase/MIGRATIONS.md for details.\n')

if (mode === 'cloud' && supabaseUrl && supabaseKey) {
  const base = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/cloud/schema`, { signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const data = await res.json()
      if (data.ok) {
        console.log(`  Schema probe (${base}): all tables present ✓\n`)
      } else {
        console.log(`  Schema probe (${base}): missing tables → ${(data.missing ?? []).join(', ')}\n`)
      }
    } else {
      console.log(`  Schema probe: server returned ${res.status} (is dev server running?)\n`)
    }
  } catch {
    console.log(`  Schema probe: skipped (start dev server, then re-run for live check)\n`)
  }
}
