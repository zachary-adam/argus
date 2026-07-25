import fs from 'fs'
import path from 'path'
import { IntelEvent } from '@/types'

const HISTORY_DIR  = path.join(process.cwd(), '.argus')
const HISTORY_FILE = path.join(HISTORY_DIR, 'events.jsonl')
const MAX_LINES    = 50_000 // ~50MB ceiling

export interface HistoryEntry {
  ts: number           // epoch ms when snapshot was taken
  events: IntelEvent[]
}

function ensureDir() {
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true })
}

/** Append a snapshot of current events to the history file. */
export function appendHistory(events: IntelEvent[]) {
  try {
    ensureDir()
    const entry: HistoryEntry = { ts: Date.now(), events }
    fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n', 'utf8')
    trimHistory()
  } catch { /* non-fatal */ }
}

/** Read all snapshots from the past N days. */
export function readHistory(days = 7): HistoryEntry[] {
  try {
    ensureDir()
    if (!fs.existsSync(HISTORY_FILE)) return []
    const cutoff = Date.now() - days * 86_400_000
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').trim().split('\n').filter(Boolean)
    return lines
      .map(l => { try { return JSON.parse(l) as HistoryEntry } catch { return null } })
      .filter((e): e is HistoryEntry => !!e && e.ts >= cutoff)
  } catch { return [] }
}

/** Keep file manageable: drop oldest lines when ceiling is exceeded. */
function trimHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return
    const lines = fs.readFileSync(HISTORY_FILE, 'utf8').trim().split('\n').filter(Boolean)
    if (lines.length > MAX_LINES) {
      fs.writeFileSync(HISTORY_FILE, lines.slice(-MAX_LINES).join('\n') + '\n', 'utf8')
    }
  } catch { /* non-fatal */ }
}

/** Compute daily event count per country for trend analysis. */
export function countryTrend(days = 7): Record<string, number[]> {
  const history = readHistory(days)
  if (!history.length) return {}

  const now = Date.now()
  const buckets: Record<string, number[]> = {}

  history.forEach(entry => {
    const dayIdx = Math.floor((now - entry.ts) / 86_400_000)
    if (dayIdx >= days) return
    entry.events.forEach(e => {
      const key = e.countryCode || e.country || 'XX'
      if (!buckets[key]) buckets[key] = Array(days).fill(0)
      buckets[key][dayIdx] = (buckets[key][dayIdx] || 0) + 1
    })
  })

  return buckets
}
