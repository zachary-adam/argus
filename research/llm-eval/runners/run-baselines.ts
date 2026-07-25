/**
 * Instrument baselines for llm-eval packs — no LLM / no API cost.
 *
 * Usage:
 *   npx tsx research/llm-eval/runners/run-baselines.ts
 *   npx tsx research/llm-eval/runners/run-baselines.ts --pack pack-thin
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IntelEvent } from '../../../types'
import { projectRisk } from '../../../lib/projectRisk'
import { assessEvidenceBalance } from '../../../lib/evidenceBalance'
import { scoreACHOffline } from '../../../lib/offlineIntel'
import { rateZScore } from '../../../lib/anomalyStats'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATASETS = join(ROOT, 'datasets')
const OUT = join(ROOT, 'results', 'tables')

interface EvalPack {
  id: string
  name: string
  mission: string
  countryCodes: string[]
  watchEntities: string[]
  hypotheses: Array<{ id: string; text: string }>
  events: IntelEvent[]
  anomalySeries: {
    country: string
    category: string
    baselineDailyMean: number
    observedWindowCount: number
    note?: string
  }
}

function loadPacks(filter?: string): EvalPack[] {
  return readdirSync(DATASETS)
    .filter(f => f.endsWith('.json') && (!filter || f.includes(filter)))
    .map(f => JSON.parse(readFileSync(join(DATASETS, f), 'utf8')) as EvalPack)
}

function anomalyLabel(z: number): { surge: boolean; severity: 'none' | 'mild' | 'strong' } {
  if (z >= 3) return { surge: true, severity: 'strong' }
  if (z >= 1.5) return { surge: true, severity: 'mild' }
  return { surge: false, severity: 'none' }
}

function runPack(pack: EvalPack) {
  const risk = projectRisk(pack.events)
  const balance = assessEvidenceBalance(pack.events, {
    watchEntities: pack.watchEntities,
    countryCodes: pack.countryCodes,
  })
  const ach = scoreACHOffline(
    pack.hypotheses,
    pack.events.map(e => ({ nodeId: e.id, title: e.title, summary: e.summary })),
  )
  const z = rateZScore(pack.anomalySeries.observedWindowCount, pack.anomalySeries.baselineDailyMean)
  const anomaly = { z: Number(z.toFixed(3)), ...anomalyLabel(z), note: pack.anomalySeries.note }

  return {
    packId: pack.id,
    packName: pack.name,
    instrument: 'argus-v1',
    risk,
    evidenceBalance: {
      score: balance.score,
      confidenceCap: balance.confidenceCap,
      gapTypes: balance.gaps.map(g => g.type),
      gapCount: balance.gaps.length,
    },
    ach: {
      cellCount: ach.length,
      supports: ach.filter(c => c.rating === 'supports').length,
      contradicts: ach.filter(c => c.rating === 'contradicts').length,
      neutral: ach.filter(c => c.rating === 'neutral').length,
      cells: ach.map(c => ({
        eventId: c.nodeId,
        hypothesisId: c.hypothesisId,
        rating: c.rating,
      })),
    },
    anomaly,
  }
}

function main() {
  const packArg = process.argv.find((a, i) => process.argv[i - 1] === '--pack')
  const packs = loadPacks(packArg)
  if (!packs.length) {
    console.error('No packs found')
    process.exit(1)
  }

  mkdirSync(OUT, { recursive: true })
  const rows = packs.map(runPack)
  const outPath = join(OUT, 'baselines.json')
  writeFileSync(outPath, JSON.stringify(rows, null, 2))
  console.log(`Wrote ${rows.length} pack baselines → ${outPath}`)
  for (const r of rows) {
    console.log(
      `  ${r.packId}: risk countries=${r.risk.length} balance=${r.evidenceBalance.confidenceCap}/${r.evidenceBalance.score} ` +
        `ach S/N/C=${r.ach.supports}/${r.ach.neutral}/${r.ach.contradicts} anomaly z=${r.anomaly.z} ${r.anomaly.severity}`,
    )
  }
}

main()
