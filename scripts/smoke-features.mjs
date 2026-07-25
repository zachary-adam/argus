#!/usr/bin/env node
/**
 * Live smoke test against a running ARGUS dev server (localhost:3000).
 * Exercises API routes + page loads. Does NOT drive the browser UI.
 *
 * Usage: node scripts/smoke-features.mjs [--live-ai]
 *   --live-ai  Run one real LLM call (enrich, costs ~$0.001). Default: Rules/offline only.
 */
const BASE = process.env.ARGUS_SMOKE_URL ?? 'http://localhost:3000'
const LIVE_AI = process.argv.includes('--live-ai')

const RULES = { 'x-argus-ai-mode': 'none' }
const CLOUD = { 'x-argus-ai-mode': 'cloud', 'x-effort': 'low' }

const sampleEvent = {
  id: 'smoke-ev-1',
  title: 'India China border patrol incident near Ladakh',
  summary: 'Small arms exchange reported along the LAC. Both sides issued statements.',
  category: 'conflict',
  country: 'India',
  countryCode: 'IN',
  severity: 'high',
  timestamp: new Date().toISOString(),
  lat: 34.2,
  lon: 78.0,
  source: 'SmokeTest',
  url: 'https://example.com/smoke',
}

const results = []

async function req(label, path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const headers = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) }
  const init = { method: opts.method ?? 'GET', headers }
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body)
  const t0 = Date.now()
  try {
    const res = await fetch(url, init)
    const ms = Date.now() - t0
    const ct = res.headers.get('content-type') ?? ''
    let data = null
    if (ct.includes('json')) {
      try { data = await res.json() } catch { data = null }
    } else if (opts.text || !ct.includes('json')) {
      data = await res.text()
    }
    const ok = opts.expect ? opts.expect(res, data) : res.ok
    results.push({ label, ok, status: res.status, ms, detail: opts.detail?.(res, data) })
    return { res, data, ok }
  } catch (e) {
    results.push({ label, ok: false, status: 0, ms: Date.now() - t0, detail: String(e.message ?? e) })
    return { ok: false, error: e }
  }
}

console.log(`ARGUS smoke test → ${BASE}${LIVE_AI ? ' (with live AI)' : ' (offline/rules only)'}\n`)

// ── Infrastructure ──────────────────────────────────────────────────────────
await req('Status API', '/api/status', {
  detail: (_, d) => `ai=${d?.aiAvailable} vault=${d?.vault?.configured}`,
  expect: (r, d) => r.ok && d?.aiAvailable === true,
})

await req('Vault API', '/api/vault', {
  detail: (_, d) => `keys=${(d?.keys ?? []).join(',') || 'none'}`,
  expect: (r) => r.ok,
})

await req('Web search keys', '/api/connectors/websearch', {
  detail: (_, d) => `serper=${d?.serper} brave=${d?.brave}`,
  expect: (r, d) => r.ok && (d?.serper || d?.brave),
})

// ── Pages (HTML load) ─────────────────────────────────────────────────────
for (const [label, path] of [
  ['Home page', '/'],
  ['New project page', '/projects/new'],
  ['Login page', '/auth/login'],
]) {
  await req(label, path, {
    expect: r => r.status === 200 || r.status === 307 || r.status === 308,
    detail: r => `HTTP ${r.status}`,
  })
}

// ── Deterministic APIs (no LLM) ───────────────────────────────────────────
await req('Evidence gaps', '/api/evidence-gaps', {
  method: 'POST',
  body: {
    events: [sampleEvent],
    countryCodes: ['IN', 'CN'],
    researchQuestion: 'India-China border tensions',
    targeting: { scope: 'regional', keywords: ['border', 'LAC'], watchEntities: ['PLA', 'Indian Army'] },
  },
  expect: (r, d) => r.ok && typeof d?.score === 'number',
  detail: (_, d) => `score=${d?.score}`,
})

await req('Relevance gate', '/api/relevance', {
  method: 'POST',
  body: {
    events: [sampleEvent],
    countryCodes: ['IN'],
    researchQuestion: 'India-China border military tensions',
    targeting: { scope: 'regional', keywords: ['border'], watchEntities: [] },
  },
  expect: r => r.ok,
  detail: (_, d) => `applied=${d?.applied}`,
})

await req('Situations cluster', '/api/situations', {
  method: 'POST',
  body: { events: [sampleEvent, { ...sampleEvent, id: 'smoke-ev-2', title: 'Diplomatic talks in Delhi' }] },
  expect: r => r.ok,
})

await req('Patterns (rules)', '/api/patterns', {
  method: 'POST',
  headers: RULES,
  body: {
    events: [sampleEvent, { ...sampleEvent, id: 'smoke-ev-2' }, { ...sampleEvent, id: 'smoke-ev-3', title: 'Second border report' }],
    windowHours: 48,
  },
  expect: r => r.status === 400, // patterns require AI mode — no offline path
  detail: () => 'expected 400 in rules mode (AI-only route)',
})

// ── AI routes — offline / rules (no API spend) ────────────────────────────
await req('NLQ offline', '/api/nlq', {
  method: 'POST',
  headers: RULES,
  body: { query: 'india border conflict', events: [sampleEvent] },
  expect: (r, d) => r.ok && d?.offline === true,
  detail: (_, d) => d?.summary?.slice(0, 60),
})

await req('Verify heuristic', '/api/verify', {
  method: 'POST',
  headers: RULES,
  body: { claim: sampleEvent, corpus: [sampleEvent] },
  expect: (r, d) => r.ok && d?.result?.verdict,
  detail: (_, d) => `verdict=${d?.result?.verdict} mode=${d?.mode}`,
})

await req('Translate passthrough', '/api/translate', {
  method: 'POST',
  headers: RULES,
  body: { texts: ['Border incident reported'] },
  expect: (r, d) => r.ok && d?.translations?.[0],
})

await req('SITREP offline', '/api/sitrep?focus=global', {
  headers: { ...RULES, Accept: 'text/plain' },
  expect: (r, d) => r.ok && typeof d === 'string' && d.length > 100,
  detail: (_, d) => `${d?.length ?? 0} chars`,
})

await req('Mission suggest offline', '/api/connectors/suggest-targeting', {
  method: 'POST',
  headers: RULES,
  body: { goal: 'Armed conflict monitoring', regionName: 'South Asia', countryCodes: ['IN', 'CN'] },
  expect: (r, d) => r.ok && d?.researchQuestion,
  detail: (_, d) => d?.offline ? 'offline' : 'ai',
})

await req('Canvas brief offline', '/api/canvas-brief', {
  method: 'POST',
  headers: RULES,
  body: {
    projectName: 'Smoke Test',
    researchQuestion: 'Border tensions',
    regionName: 'South Asia',
    events: [{ title: sampleEvent.title, category: 'conflict', country: 'India', severity: 8, timestamp: sampleEvent.timestamp }],
    achFindings: [],
    analystNotes: [],
  },
  expect: (r, d) => r.ok && d?.headline,
  detail: (_, d) => d?.offline ? 'offline' : 'ai',
})

await req('ACH score offline', '/api/ach-score', {
  method: 'POST',
  headers: RULES,
  body: {
    researchQuestion: 'Who initiated the clash?',
    hypotheses: [{ id: 'h1', text: 'PLA provocation' }, { id: 'h2', text: 'Indian patrol crossed LAC' }],
    events: [{ nodeId: 'n1', title: sampleEvent.title, category: 'conflict', country: 'India', severity: 8 }],
  },
  expect: (r, d) => r.ok && Array.isArray(d?.scores),
  detail: (_, d) => d?.offline ? 'offline' : 'ai',
})

// ── Optional live AI (one cheap call) ─────────────────────────────────────
if (LIVE_AI) {
  await req('Enrich live (OpenAI)', '/api/enrich', {
    method: 'POST',
    headers: { ...CLOUD, 'x-ai-provider': 'openai' },
    body: {
      events: [{ id: 'e1', title: 'Test artillery strike in test region', description: 'Smoke test event' }],
    },
    expect: (r, d) => r.ok && Array.isArray(d?.results),
    detail: (_, d) => d?.results?.[0]?.category ?? d?.error,
  })
} else {
  results.push({ label: 'Enrich live (skipped)', ok: true, status: 0, ms: 0, detail: 'pass --live-ai to test' })
}

// ── Report ────────────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length
const failed = results.filter(r => !r.ok)

console.log('Feature smoke results:\n')
for (const r of results) {
  const icon = r.ok ? '✓' : '✗'
  console.log(`  ${icon} ${r.label.padEnd(28)} ${r.status ? `HTTP ${r.status}` : '—'.padEnd(8)} ${r.ms}ms  ${r.detail ?? ''}`)
}

console.log(`\n${passed}/${results.length} passed`)
if (failed.length) {
  console.log('\nFailed:')
  for (const f of failed) console.log(`  - ${f.label}: ${f.detail}`)
  process.exit(1)
}

console.log('\nNote: UI panels (map, canvas, feed cards) require manual browser testing.')
process.exit(0)
