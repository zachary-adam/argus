/**
 * LLM runner for llm-eval — Claude + GPT only, hard caps on tokens & call count.
 *
 * Usage:
 *   npx tsx research/llm-eval/runners/run-llm.ts --dry-run
 *   npx tsx research/llm-eval/runners/run-llm.ts --limit 2
 *   npx tsx research/llm-eval/runners/run-llm.ts --pack pack-thin --provider claude
 *
 * Env: ANTHROPIC_API_KEY and/or OPENAI_API_KEY (same as the app).
 *
 * Cost control defaults:
 *   maxEvents=12, maxTokens=800, maxCalls=40, temperature=0
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IntelEvent } from '../../../types'
import { runCompletion } from '../../../lib/aiComplete'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATASETS = join(ROOT, 'datasets')
const PROMPTS = join(ROOT, 'prompts')
const RAW = join(ROOT, 'results', 'raw')

const MAX_EVENTS = 12
const MAX_TOKENS_DEFAULT = 800
const MAX_TOKENS_ACH = 2000
const MAX_CALLS_DEFAULT = 40

type Task = 'risk_ranking' | 'anomaly_call' | 'ach_matrix' | 'brief_confidence'
type Provider = 'claude' | 'openai'

function maxTokensFor(task: Task): number {
  return task === 'ach_matrix' ? MAX_TOKENS_ACH : MAX_TOKENS_DEFAULT
}

interface EvalPack {
  id: string
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
  }
}

const ALL_TASKS: Task[] = ['risk_ranking', 'anomaly_call', 'ach_matrix', 'brief_confidence']

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function selectedTasks(): Task[] {
  const t = arg('--task') as Task | undefined
  if (!t) return ALL_TASKS
  if (!ALL_TASKS.includes(t)) {
    console.error(`Unknown task ${t}`)
    process.exit(1)
  }
  return [t]
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function loadPacks(filter?: string): EvalPack[] {
  return readdirSync(DATASETS)
    .filter(f => f.endsWith('.json') && (!filter || f.includes(filter)))
    .map(f => JSON.parse(readFileSync(join(DATASETS, f), 'utf8')) as EvalPack)
}

function slimEvents(events: IntelEvent[]) {
  return events.slice(0, MAX_EVENTS).map(e => ({
    id: e.id,
    title: e.title,
    summary: e.summary,
    country: e.country,
    countryCode: e.countryCode,
    severity: e.severity,
    source: e.source,
    fatalities: e.fatalities ?? 0,
    timestamp: e.timestamp,
    infoOps: e.infoOps ?? false,
  }))
}

function fill(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, v), template)
}

function buildPrompt(task: Task, pack: EvalPack): string {
  const eventsJson = JSON.stringify(slimEvents(pack.events), null, 0)
  switch (task) {
    case 'risk_ranking':
      return fill(readFileSync(join(PROMPTS, 'risk-ranking.txt'), 'utf8'), {
        mission: pack.mission,
        events: eventsJson,
      })
    case 'anomaly_call':
      return fill(readFileSync(join(PROMPTS, 'anomaly-call.txt'), 'utf8'), {
        country: pack.anomalySeries.country,
        category: pack.anomalySeries.category,
        baselineDailyMean: String(pack.anomalySeries.baselineDailyMean),
        observedWindowCount: String(pack.anomalySeries.observedWindowCount),
      })
    case 'ach_matrix':
      return fill(readFileSync(join(PROMPTS, 'ach-matrix.txt'), 'utf8'), {
        hypotheses: JSON.stringify(pack.hypotheses),
        events: eventsJson,
      })
    case 'brief_confidence':
      return fill(readFileSync(join(PROMPTS, 'brief-confidence.txt'), 'utf8'), {
        mission: pack.mission,
        watchEntities: JSON.stringify(pack.watchEntities),
        countryCodes: JSON.stringify(pack.countryCodes),
        events: eventsJson,
      })
  }
}

function providers(): Provider[] {
  const only = arg('--provider') as Provider | undefined
  const list: Provider[] = []
  if ((!only || only === 'claude') && process.env.ANTHROPIC_API_KEY) list.push('claude')
  if ((!only || only === 'openai') && process.env.OPENAI_API_KEY) list.push('openai')
  return list
}

async function main() {
  const dryRun = hasFlag('--dry-run')
  const packFilter = arg('--pack')
  const tasks = selectedTasks()
  const limit = Number(arg('--limit') ?? MAX_CALLS_DEFAULT)
  const packs = loadPacks(packFilter)
  const system = readFileSync(join(PROMPTS, 'system.txt'), 'utf8')
  const provs = dryRun ? (['claude', 'openai'] as Provider[]) : providers()

  if (!dryRun && !provs.length) {
    console.error('No API keys. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY, or use --dry-run.')
    process.exit(1)
  }

  mkdirSync(RAW, { recursive: true })
  const jobs: Array<{ packId: string; task: Task; provider: Provider; promptChars: number }> = []
  for (const pack of packs) {
    for (const task of tasks) {
      for (const provider of provs) {
        jobs.push({
          packId: pack.id,
          task,
          provider,
          promptChars: buildPrompt(task, pack).length + system.length,
        })
      }
    }
  }

  const planned = jobs.slice(0, limit)
  console.log(
    `${dryRun ? 'DRY-RUN' : 'LIVE'}: ${planned.length}/${jobs.length} calls ` +
      `(packs=${packs.length} tasks=${tasks.length} providers=${provs.join(',') || 'none'})`,
  )
  console.log(`Caps: maxEvents=${MAX_EVENTS} maxTokens=${MAX_TOKENS_DEFAULT}/${MAX_TOKENS_ACH}(ach) temperature=0`)

  if (dryRun) {
    const estTokens = planned.reduce((n, j) => n + Math.ceil(j.promptChars / 4) + maxTokensFor(j.task), 0)
    console.log(`Rough token upper bound (chars/4 + max out): ~${estTokens}`)
    console.log('Estimated spend: typically a few dollars for a full 24–40 call run — not hundreds.')
    writeFileSync(join(RAW, 'dry-run-plan.json'), JSON.stringify(planned, null, 2))
    console.log(`Wrote plan → ${join(RAW, 'dry-run-plan.json')}`)
    return
  }

  let calls = 0
  let inTok = 0
  let outTok = 0
  const rows: unknown[] = []

  for (const job of planned) {
    const pack = packs.find(p => p.id === job.packId)!
    const prompt = buildPrompt(job.task, pack)
    const key =
      job.provider === 'claude' ? process.env.ANTHROPIC_API_KEY! : process.env.OPENAI_API_KEY!
    try {
      const result = await runCompletion(
        { isAnthropic: job.provider === 'claude', key },
        {
          system,
          prompt,
          maxTokens: maxTokensFor(job.task),
          temperature: 0,
          effort: 'low',
          jsonResponse: true,
        },
      )
      calls++
      inTok += result.inputTokens
      outTok += result.outputTokens
      const row = {
        packId: job.packId,
        task: job.task,
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        raw: result.raw,
        ts: new Date().toISOString(),
      }
      rows.push(row)
      const file = join(RAW, `${job.packId}__${job.task}__${job.provider}.json`)
      writeFileSync(file, JSON.stringify(row, null, 2))
      console.log(`  [${calls}] ${job.packId} ${job.task} ${job.provider} in=${result.inputTokens} out=${result.outputTokens}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const row = {
        packId: job.packId,
        task: job.task,
        provider: job.provider,
        error: msg.slice(0, 400),
        ts: new Date().toISOString(),
      }
      rows.push(row)
      writeFileSync(join(RAW, `${job.packId}__${job.task}__${job.provider}.error.json`), JSON.stringify(row, null, 2))
      console.warn(`  [fail] ${job.packId} ${job.task} ${job.provider}: ${msg.slice(0, 120)}`)
    }
  }

  writeFileSync(join(RAW, 'run-summary.json'), JSON.stringify({ calls, inTok, outTok, rows: rows.length }, null, 2))
  console.log(`Done. calls=${calls} tokens in=${inTok} out=${outTok}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
