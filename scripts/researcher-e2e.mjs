#!/usr/bin/env node
/**
 * Researcher end-to-end walkthrough — simulates a conflict analyst opening a
 * fresh India–China border project and running the full ARGUS pipeline via the
 * same API routes the UI calls.
 *
 * Usage: node scripts/researcher-e2e.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:3000'

// ── Step 1: Define project (mirrors app/projects/new/page.tsx handleCreate) ──
const PROJECT = {
  id: `proj_e2e_${Date.now()}`,
  name: 'India–China LAC Escalation Watch',
  regionName: 'India, China',
  regionCenter: [78.0, 34.15], // Ladakh
  regionZoom: 5,
  countryCodes: ['IN', 'CN'],
  goalTemplateId: 'armed-conflict',
  researchQuestion: 'Will the India–China border standoff along the LAC escalate in the next 90 days?',
  targeting: {
    scope: 'regional',
    placeName: 'Ladakh, India',
    keywords: ['border', 'standoff', 'LAC', 'military', 'disengagement', 'troops'],
    watchEntities: ['PLA', 'Indian Army', 'People\'s Liberation Army'],
  },
}

const NOISE_PATTERNS = /\b(iran|hormuz|bahrain|gaza|ukraine|ceasefire.*gulf|bollywood|knee surgery)\b/i
const ON_TOPIC = /\b(india|china|ladakh|lac|border|pl[a]?|army|disengagement|himalaya|corps commander)\b/i

async function post(path, body, timeoutMs = 120_000) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text.slice(0, 300) } }
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 200)}`)
  return json
}

async function get(path, timeoutMs = 60_000) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json()
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function regionRadius(zoom) {
  if (zoom >= 8) return 150
  if (zoom >= 6) return 400
  if (zoom >= 5) return 700
  if (zoom >= 4) return 1400
  return 2500
}

function section(title) {
  console.log('\n' + '═'.repeat(64))
  console.log(`  ${title}`)
  console.log('═'.repeat(64))
}

function pass(msg) { console.log(`  ✓ ${msg}`) }
function fail(msg) { console.log(`  ✗ ${msg}`) }
function info(msg) { console.log(`    ${msg}`) }

const checks = { pass: 0, fail: 0 }
function assert(ok, okMsg, badMsg) {
  if (ok) { pass(okMsg); checks.pass++ } else { fail(badMsg); checks.fail++ }
}

async function main() {
  console.log('\nARGUS Researcher E2E — India–China LAC Escalation Watch')
  console.log(`Server: ${BASE}\n`)

  // ── Step 1: Project setup ──
  section('STEP 1 — Create project (researcher defines mission)')
  info(`Name: ${PROJECT.name}`)
  info(`Region: ${PROJECT.regionName} @ [${PROJECT.regionCenter.join(', ')}]`)
  info(`Research Q: ${PROJECT.researchQuestion}`)
  info(`Targeting: ${PROJECT.targeting.placeName} | entities: ${PROJECT.targeting.watchEntities.join(', ')}`)
  pass('Project config ready (UI would persist to localStorage via createProject)')

  // ── Step 2: Topic pull (aimed ingestion) ──
  section('STEP 2 — Topic pull (/api/targeted) — researcher hits refresh')
  const t0 = Date.now()
  let aimedEvents
  try {
    aimedEvents = await post('/api/targeted', {
      targeting: PROJECT.targeting,
      anchor: PROJECT.regionCenter,
      countryCodes: PROJECT.countryCodes,
      researchQuestion: PROJECT.researchQuestion,
    }, 150_000)
  } catch (e) {
    fail(`Topic pull failed: ${e.message}`)
    process.exit(1)
  }
  const pullMs = Date.now() - t0
  const fullText = aimedEvents.filter(e => (e.body?.length ?? 0) > 300)
  const scored = aimedEvents.filter(e => e.relevanceScore != null)
  const pdfGarbage = aimedEvents.filter(e => (e.body ?? '').includes('%PDF-'))

  info(`Returned in ${(pullMs / 1000).toFixed(1)}s`)
  info(`Events: ${aimedEvents.length} | semantic-scored: ${scored.length} | full-text: ${fullText.length}`)
  assert(aimedEvents.length > 0, 'Topic pull returned events', 'Topic pull returned ZERO events — pipeline broken')
  assert(scored.length > 0, 'Semantic relevance brain applied scores', 'No relevanceScore — semantic brain did not run')
  assert(fullText.length >= 3, `Full-text enrichment: ${fullText.length} documents`, `Only ${fullText.length} full-text docs — brief will stay thin`)
  assert(pdfGarbage.length === 0, 'No PDF binary garbage in event bodies', `${pdfGarbage.length} events contain raw PDF bytes`)

  // ── Step 2b: Source health + evidence balance ──
  section('STEP 2b — Source health & evidence balance')
  try {
    await get('/api/events', 120_000) // warm source-status cache
    const status = await get('/api/status', 15_000)
    const rw = status.sources?.find(s => s.id === 'reliefweb')
    assert(rw?.ok === true, `ReliefWeb live (${rw?.count ?? 0} events in cache)`, `ReliefWeb failed — count=${rw?.count ?? 0}`)
    const failed = (status.sources ?? []).filter(s => !s.ok && !(s.keyRequired && !s.hasKey))
    assert(failed.length === 0, 'No hard-failed global sources', `Failed: ${failed.map(s => s.id).join(', ')}`)
  } catch (e) {
    fail(`Status check failed: ${e.message}`)
  }

  try {
    const balance = await post('/api/evidence-gaps', {
      events: aimedEvents.slice(0, 30),
      targeting: PROJECT.targeting,
      countryCodes: PROJECT.countryCodes,
      researchQuestion: PROJECT.researchQuestion,
    }, 30_000)
    info(`Evidence score: ${balance.score}/100 | confidence cap: ${balance.confidenceCap} | gaps: ${balance.gaps?.length ?? 0}`)
    assert(balance.collectionLenses?.length >= 2, `Multi-lens collection: ${balance.collectionLenses?.length ?? 0} lenses`, 'Missing collection lenses')
    assert(Array.isArray(balance.gaps), 'Evidence balance returns structured gaps', 'evidence-gaps response malformed')
    if (balance.gaps?.some(g => g.type === 'entity')) {
      pass('Entity gaps detected (expected for one-sided pull — system is honest)')
    }
  } catch (e) {
    fail(`Evidence balance check failed: ${e.message}`)
  }

  console.log('\n  Top 8 aimed events (by relevance):')
  for (const e of [...aimedEvents].sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)).slice(0, 8)) {
    const dom = (e.url ?? '').match(/\/\/([^/]+)/)?.[1]?.slice(0, 22) ?? '—'
    info(`${String(e.relevanceScore ?? '?').padStart(3)} | body ${String((e.body?.length ?? 0)).padStart(4)} | ${dom.padEnd(22)} | ${(e.title ?? '').slice(0, 52)}`)
  }

  const aimedNoise = aimedEvents.filter(e => NOISE_PATTERNS.test(`${e.title} ${e.summary ?? ''}`))
  assert(aimedNoise.length === 0, 'No obvious Middle-East/off-topic noise in aimed pull', `${aimedNoise.length} off-topic events in aimed pull: ${aimedNoise.map(e => e.title?.slice(0, 40)).join('; ')}`)

  // ── Step 3: Live feed + semantic gate ──
  section('STEP 3 — Live feed filter (/api/events → /api/relevance)')
  let globalEvents
  try {
    globalEvents = await get('/api/events', 120_000)
  } catch (e) {
    fail(`Global events fetch failed: ${e.message}`)
    globalEvents = []
  }

  const [centerLon, centerLat] = PROJECT.regionCenter
  const radius = regionRadius(PROJECT.regionZoom)
  const inRegion = (globalEvents ?? []).filter(e =>
    haversine(centerLat, centerLon, e.lat, e.lon) <= radius
  )
  info(`Global cache: ${globalEvents?.length ?? 0} events | in region (${radius}km): ${inRegion.length}`)

  let relevanceDecision = { applied: false, results: [] }
  if (inRegion.length > 0) {
    try {
      relevanceDecision = await post('/api/relevance', {
        events: inRegion.slice(0, 80).map(e => ({
          id: e.id, title: e.title, summary: e.summary, body: e.body,
          country: e.country, countryCode: e.countryCode, category: e.category,
        })),
        targeting: PROJECT.targeting,
        countryCodes: PROJECT.countryCodes,
        researchQuestion: PROJECT.researchQuestion,
      }, 90_000)
    } catch (e) {
      fail(`Relevance gate failed: ${e.message}`)
    }
  }

  const keptIds = new Set(relevanceDecision.results.filter(r => r.keep).map(r => r.id))
  const liveKept = inRegion.filter(e => keptIds.has(e.id))
  const liveDropped = inRegion.filter(e => !keptIds.has(e.id) && relevanceDecision.results.some(r => r.id === e.id))

  info(`Semantic gate applied: ${relevanceDecision.applied}`)
  info(`Live feed: kept ${liveKept.length} / dropped ${liveDropped.length} (of ${inRegion.length} in region)`)

  assert(relevanceDecision.applied, 'Semantic relevance gate ran on live feed', 'Semantic gate did not apply — fell back to keyword or failed')

  if (liveDropped.length > 0) {
    console.log('\n  Sample DROPPED by semantic gate (good — noise filtered):')
    for (const r of relevanceDecision.results.filter(x => !x.keep).sort((a, b) => a.score - b.score).slice(0, 4)) {
      const ev = inRegion.find(e => e.id === r.id)
      info(`score ${String(r.score).padStart(3)} | ${(ev?.title ?? r.id).slice(0, 58)}`)
    }
  }
  if (liveKept.length > 0) {
    console.log('\n  Sample KEPT by semantic gate:')
    for (const r of relevanceDecision.results.filter(x => x.keep).sort((a, b) => b.score - a.score).slice(0, 4)) {
      const ev = inRegion.find(e => e.id === r.id)
      info(`score ${String(r.score).padStart(3)} | ${(ev?.title ?? r.id).slice(0, 58)}`)
    }
  }

  const liveNoiseKept = liveKept.filter(e => NOISE_PATTERNS.test(`${e.title} ${e.summary ?? ''}`))
  assert(liveNoiseKept.length === 0, 'Live feed: no Middle-East noise survived semantic gate', `${liveNoiseKept.length} noise events kept in live feed`)

  // Merge aimed (exempt) + live kept for brief input — like the UI feed
  const briefEvents = [...aimedEvents]
  for (const e of liveKept.slice(0, 5)) {
    if (!briefEvents.some(x => x.id === e.id)) briefEvents.push(e)
  }

  // ── Step 4: Generate intelligence brief ──
  section('STEP 4 — Generate project brief (/api/brief/project)')
  const t1 = Date.now()
  let briefResp
  try {
    briefResp = await post('/api/brief/project', {
      projectName: PROJECT.name,
      regionName: PROJECT.regionName,
      goalTemplateId: PROJECT.goalTemplateId,
      researchQuestion: PROJECT.researchQuestion,
      events: briefEvents,
      alerts: [],
      targeting: PROJECT.targeting,
    }, 150_000)
  } catch (e) {
    fail(`Brief generation failed: ${e.message}`)
    process.exit(1)
  }
  const briefMs = Date.now() - t1
  const brief = briefResp.brief ?? {}
  const mode = briefResp.mode ?? '?'

  info(`Generated in ${(briefMs / 1000).toFixed(1)}s | mode: ${mode}`)
  assert(mode === 'ai', 'Brief generated via AI (not template fallback)', `Brief mode=${mode} — AI unavailable or failed`)

  console.log('\n  BLUF:')
  info(brief.bluf ?? '(empty)')

  console.log('\n  Key findings:')
  for (const f of (brief.keyFindings ?? []).slice(0, 3)) {
    info(`[${f.confidence}] ${(f.finding ?? '').slice(0, 90)}`)
  }

  console.log('\n  Competing hypotheses:')
  for (const h of (brief.competingHypotheses ?? []).slice(0, 3)) {
    info(`(${h.likelihood}) ${(h.hypothesis ?? '').slice(0, 70)}`)
  }

  const srcs = brief.sources ?? []
  const citedInProse = new Set(JSON.stringify(brief).match(/\bE\d+\b/g) ?? [])
  const realPublisherUrls = srcs.filter(s => s.url && !/news\.google\.com/.test(s.url))

  info(`Sources: ${srcs.length} | citations in prose: ${citedInProse.size} | real publisher URLs: ${realPublisherUrls.length}`)
  assert((brief.keyFindings?.length ?? 0) >= 2, 'Brief has multiple key findings', 'Brief has fewer than 2 key findings')
  assert((brief.competingHypotheses?.length ?? 0) >= 2, 'Brief has competing hypotheses (ACH)', 'Missing ACH section')
  assert((brief.intelligenceGaps?.length ?? 0) >= 2, 'Brief lists intelligence gaps', 'Missing intelligence gaps')
  assert(citedInProse.size >= 3, `Brief cites sources inline (${citedInProse.size} tags)`, 'Brief lacks inline [E#] citations')
  assert(!/%PDF-/.test(JSON.stringify(brief)), 'Brief contains no PDF garbage', 'Brief text includes raw PDF bytes')

  // ── Step 5: Researcher verdict ──
  section('STEP 5 — Researcher verdict')
  const total = checks.pass + checks.fail
  console.log(`\n  Checks: ${checks.pass}/${total} passed`)
  if (checks.fail === 0) {
    console.log('\n  VERDICT: Pipeline is usable for a real India–China border study.')
    console.log('  A researcher can: define mission → pull on-topic events →')
    console.log('  get full-text sources → generate a cited, falsifiable brief.')
  } else {
    console.log(`\n  VERDICT: ${checks.fail} issue(s) need attention before trusting output.`)
    process.exitCode = 1
  }

  console.log('\n  To use in the UI:')
  console.log(`    1. Open ${BASE}/projects/new`)
  console.log(`    2. Name: "${PROJECT.name}"`)
  console.log(`    3. Region: India + China | Focus: Ladakh`)
  console.log(`    4. Research Q: "${PROJECT.researchQuestion}"`)
  console.log(`    5. Open project → wait for topic pull → Generate Brief\n`)
}

main().catch(err => {
  console.error('\nFatal:', err.message)
  process.exit(1)
})
