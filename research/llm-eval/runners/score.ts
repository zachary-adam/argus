/**
 * Score raw LLM JSON against instrument baselines.
 * Usage: npx tsx research/llm-eval/runners/score.ts
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RAW = join(ROOT, 'results', 'raw')
const TABLES = join(ROOT, 'results', 'tables')

type Rating = 'supports' | 'neutral' | 'contradicts'
type Conf = 'HIGH' | 'MODERATE' | 'LOW'

interface Baseline {
  packId: string
  risk: Array<{ country: string; score: number; level: string }>
  evidenceBalance: { score: number; confidenceCap: Conf }
  ach: { cells: Array<{ eventId: string; hypothesisId: string; rating: Rating }> }
  anomaly: { surge: boolean; severity: string; z: number }
}

function parseJsonLoose(raw: string): unknown {
  const t = raw.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1].trim() : t
  try {
    return JSON.parse(body)
  } catch {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1))
    throw new Error('unparseable JSON')
  }
}

function spearman(a: number[], b: number[]): number | null {
  if (a.length < 2 || a.length !== b.length) return null
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v)
    const r = new Array(xs.length)
    for (let i = 0; i < idx.length; i++) r[idx[i].i] = i + 1
    return r
  }
  const ra = rank(a)
  const rb = rank(b)
  const n = a.length
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const ma = mean(ra)
  const mb = mean(rb)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const xa = ra[i] - ma
    const xb = rb[i] - mb
    num += xa * xb
    da += xa * xa
    db += xb * xb
  }
  if (da === 0 || db === 0) return null
  return num / Math.sqrt(da * db)
}

function confRank(c: Conf): number {
  return c === 'HIGH' ? 3 : c === 'MODERATE' ? 2 : 1
}

function main() {
  const baselines = JSON.parse(readFileSync(join(TABLES, 'baselines.json'), 'utf8')) as Baseline[]
  const byPack = new Map(baselines.map(b => [b.packId, b]))

  const files = readdirSync(RAW).filter(f => f.includes('__') && f.endsWith('.json') && !f.endsWith('.error.json') && f !== 'dry-run-plan.json' && f !== 'run-summary.json')
  const rows: Array<Record<string, unknown>> = []

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(RAW, file), 'utf8')) as {
      packId: string
      task: string
      provider: string
      model: string
      inputTokens: number
      outputTokens: number
      raw: string
    }
    const base = byPack.get(raw.packId)
    if (!base) continue

    let parsed: any = null
    let parseOk = false
    try {
      parsed = parseJsonLoose(raw.raw)
      parseOk = true
    } catch {
      parseOk = false
    }

    const metrics: Record<string, unknown> = {
      packId: raw.packId,
      task: raw.task,
      provider: raw.provider,
      model: raw.model,
      parseOk,
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
    }

    if (!parseOk || !parsed) {
      metrics.error = 'parse_fail'
      rows.push(metrics)
      continue
    }

    if (raw.task === 'risk_ranking') {
      const countries = (parsed.countries ?? []) as Array<{ country: string; score: number; level: string }>
      const common = base.risk
        .map(b => {
          const m = countries.find(c => c.country.toLowerCase() === b.country.toLowerCase())
          return m ? { bScore: b.score, mScore: Number(m.score), bLevel: b.level, mLevel: String(m.level).toUpperCase() } : null
        })
        .filter(Boolean) as Array<{ bScore: number; mScore: number; bLevel: string; mLevel: string }>
      // normalize MEDIUM↔ELEVATED etc.
      const norm = (l: string) => {
        if (l === 'ELEVATED' || l === 'GUARDED') return 'MEDIUM'
        return l
      }
      metrics.countryOverlap = common.length
      metrics.bandAgreement =
        common.length === 0 ? null : common.filter(c => norm(c.mLevel) === norm(c.bLevel)).length / common.length
      metrics.spearman = spearman(
        common.map(c => c.bScore),
        common.map(c => c.mScore),
      )
      metrics.modelConfidence = parsed.confidence ?? null
    }

    if (raw.task === 'anomaly_call') {
      const surge = Boolean(parsed.surge)
      metrics.surgeAgree = surge === base.anomaly.surge
      metrics.severityAgree = String(parsed.severity) === base.anomaly.severity
      metrics.modelZ = parsed.zEstimate ?? null
      metrics.instrumentZ = base.anomaly.z
      metrics.modelConfidence = parsed.confidence ?? null
    }

    if (raw.task === 'ach_matrix') {
      const cells = (parsed.cells ?? []) as Array<{ eventId: string; hypothesisId: string; rating: string }>
      const key = (e: string, h: string) => `${e}::${h}`
      const map = new Map(cells.map(c => [key(c.eventId, c.hypothesisId), c.rating as Rating]))
      let agree = 0
      let n = 0
      for (const c of base.ach.cells) {
        const m = map.get(key(c.eventId, c.hypothesisId))
        if (!m) continue
        n++
        if (m === c.rating) agree++
      }
      metrics.cellOverlap = n
      metrics.cellAgreement = n === 0 ? null : agree / n
      metrics.modelConfidence = parsed.confidence ?? null
    }

    if (raw.task === 'brief_confidence') {
      const modelConf = String(parsed.confidence ?? 'LOW').toUpperCase() as Conf
      const cap = base.evidenceBalance.confidenceCap
      metrics.confidenceCap = cap
      metrics.modelConfidence = modelConf
      metrics.exactCapMatch = modelConf === cap
      metrics.overconfident = confRank(modelConf) > confRank(cap)
      metrics.underconfident = confRank(modelConf) < confRank(cap)
      metrics.scoreDelta =
        typeof parsed.scoreEstimate === 'number' ? parsed.scoreEstimate - base.evidenceBalance.score : null
    }

    rows.push(metrics)
  }

  mkdirSync(TABLES, { recursive: true })
  writeFileSync(join(TABLES, 'scored.json'), JSON.stringify(rows, null, 2))

  // Aggregate summary for paper
  const summary: Record<string, unknown> = { n: rows.length, byTask: {} as Record<string, unknown> }
  for (const task of ['risk_ranking', 'anomaly_call', 'ach_matrix', 'brief_confidence']) {
    const subset = rows.filter(r => r.task === task && r.parseOk)
    const byProv: Record<string, unknown> = {}
    for (const p of ['claude', 'openai']) {
      const s = subset.filter(r => r.provider === p)
      if (task === 'risk_ranking') {
        byProv[p] = {
          n: s.length,
          meanBandAgreement: mean(s.map(r => r.bandAgreement as number | null)),
          meanSpearman: mean(s.map(r => r.spearman as number | null)),
        }
      } else if (task === 'anomaly_call') {
        byProv[p] = {
          n: s.length,
          surgeAccuracy: mean(s.map(r => (r.surgeAgree ? 1 : 0))),
          severityAccuracy: mean(s.map(r => (r.severityAgree ? 1 : 0))),
        }
      } else if (task === 'ach_matrix') {
        byProv[p] = {
          n: s.length,
          meanCellAgreement: mean(s.map(r => r.cellAgreement as number | null)),
        }
      } else {
        byProv[p] = {
          n: s.length,
          exactCapMatch: mean(s.map(r => (r.exactCapMatch ? 1 : 0))),
          overconfidentRate: mean(s.map(r => (r.overconfident ? 1 : 0))),
        }
      }
    }
    ;(summary.byTask as Record<string, unknown>)[task] = byProv
  }

  writeFileSync(join(TABLES, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(`Scored ${rows.length} rows → scored.json + summary.json`)
  console.log(JSON.stringify(summary, null, 2))
}

function mean(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter((x): x is number => typeof x === 'number' && !Number.isNaN(x))
  if (!v.length) return null
  return Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(3))
}

main()
