import { NextRequest } from 'next/server'
import { getCache } from '@/lib/cache'
import { IntelEvent } from '@/types'
import { readHistory } from '@/lib/eventHistory'
import { vaultGet } from '@/lib/vault'
import { logAiUsage } from '@/lib/logAiUsage'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { listPlots } from '@/lib/plotStore'
import { generateSitrepOffline } from '@/lib/offlineIntel'
import { planAiFromRequestWithProvider } from '@/lib/aiMode'
import { runStreamCompletion } from '@/lib/aiComplete'

function dtg(): string {
  const now = new Date()
  const d = String(now.getUTCDate()).padStart(2, '0')
  const h = String(now.getUTCHours()).padStart(2, '0')
  const m = String(now.getUTCMinutes()).padStart(2, '0')
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return `${d}${h}${m}Z ${months[now.getUTCMonth()]} ${now.getUTCFullYear()}`
}

export async function GET(req: NextRequest) {
  const effort = (req.headers.get('x-effort') ?? 'medium') as import('@/lib/aiConfig').EffortLevel
  const clientKey = req.headers.get('x-argus-client-key')
  const plan = planAiFromRequestWithProvider(req, clientKey, vaultGet, 'claude')

  const { searchParams } = new URL(req.url)
  const focus = searchParams.get('focus') ?? 'global'

  const events = getCache<IntelEvent[]>('all-events') ?? []
  const history = readHistory(7)

  const trendCtx = (() => {
    if (!history.length) return ''
    const countByDay: number[] = Array(7).fill(0)
    const critByDay: number[] = Array(7).fill(0)
    const now = Date.now()
    history.forEach(h => {
      const d = Math.floor((now - h.ts) / 86_400_000)
      if (d < 7) { countByDay[d] += h.events.length; critByDay[d] += h.events.filter(e => e.severity === 'critical').length }
    })
    return `7-DAY EVENT VOLUME (day 0=today): ${countByDay.map((c,i) => `D-${i}:${c}`).join(', ')}
7-DAY CRITICAL EVENTS: ${critByDay.map((c,i) => `D-${i}:${c}`).join(', ')}`
  })()

  // Rules mode, or AI mode with no usable key: generate the sitrep offline
  // instead of erroring.
  if (plan.useOffline || plan.missingKeys || !plan.key) {
    const markdown = generateSitrepOffline({ focus, events, trendCtx })
    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Argus-Offline': 'true',
      },
    })
  }

  const key = plan.key

  // Load analyst plots from DB — only those flagged for AI inclusion.
  // In cloud mode the user must be authenticated; otherwise the listed set is empty.
  const analystPlots = await (async () => {
    try {
      const userId = await getRequestUserId()
      const plots = await listPlots({ userId })
      return plots.filter(p => (p.properties as Record<string,unknown>)?.ai_include !== false)
    } catch { return [] }
  })()

  // Summarize events for the prompt
  const critical = events.filter(e => e.severity === 'critical').slice(0, 20)
  const high     = events.filter(e => e.severity === 'high').slice(0, 15)
  const byCountry: Record<string, number> = {}
  events.forEach(e => { byCountry[e.country] = (byCountry[e.country] || 0) + 1 })
  const topCountries = Object.entries(byCountry).sort((a,b) => b[1]-a[1]).slice(0, 15)

  const formatEvent = (e: IntelEvent) =>
    `• [${e.severity.toUpperCase()}] ${e.country} | ${e.category} | ${e.title}${e.fatalities ? ` (${e.fatalities} fatalities)` : ''}`

  const prompt = `You are ARGUS, an open-source geopolitical intelligence system. Generate a structured intelligence briefing using the live event data below. Be precise, analytical, and concise — this is for professional intelligence consumers.

DTG: ${dtg()}
FOCUS: ${focus.toUpperCase()}
TOTAL EVENTS IN SYSTEM: ${events.length}
SOURCES: GDELT, USGS, GDACS, WHO, NASA FIRMS, Reuters/BBC/Al Jazeera RSS

${trendCtx ? `TREND DATA:\n${trendCtx}\n` : ''}
CRITICAL EVENTS (${critical.length}):
${critical.map(formatEvent).join('\n')}

HIGH-PRIORITY EVENTS (${high.length}):
${high.map(formatEvent).join('\n')}

MOST ACTIVE COUNTRIES (events count):
${topCountries.map(([c,n]) => `${c}: ${n}`).join(' | ')}

FATALITY DATA:
${events.filter(e => e.fatalities).map(e => `${e.country}: ${e.fatalities} (${e.title.slice(0,60)})`).join('\n') || 'None reported in current dataset'}

${analystPlots.length > 0 ? `ANALYST WORKSPACE PLOTS — AI-included (${analystPlots.length}):
${analystPlots.map(p => {
  const props = p.properties as Record<string, unknown>
  const loc = p.type === 'point' && Array.isArray(p.coordinates) && typeof (p.coordinates as number[])[0] === 'number'
    ? `lat ${((p.coordinates as number[])[1]).toFixed(3)}, lon ${((p.coordinates as number[])[0]).toFixed(3)}`
    : `${p.type} area`
  const conf = props?.confidence ? ` | confidence: ${String(props.confidence).toUpperCase()}` : ''
  const header = `• [${String(props?.threat_level ?? 'info').toUpperCase()}] ${p.label || 'Unnamed'} (${loc})${props?.category ? ` | ${props.category}` : ''}${conf}`
  const notes = props?.notes ? `\n  ${String(props.notes).replace(/\n/g, '\n  ')}` : ''
  return header + notes
}).join('\n\n')}

When relevant, reference these analyst-marked locations by name in your regional assessments.

` : ''}Generate the following briefing. Use markdown. Be analytical, not just descriptive. Note patterns, not just events.

# ARGUS GLOBAL INTELLIGENCE BRIEF
**DTG:** ${dtg()} | **Classification:** UNCLASSIFIED // OPEN SOURCE

## EXECUTIVE SUMMARY
[3-4 sentences. Lead with the single most significant development. Note any trend shifts from baseline.]

## CRITICAL DEVELOPMENTS
[List top 5-7 critical events with location, what happened, and WHY it matters strategically. One paragraph each.]

## REGIONAL ASSESSMENTS

### MIDDLE EAST & NORTH AFRICA
**Risk: [CRITICAL/HIGH/MEDIUM/LOW]**
[2-3 sentences assessment + key actors]

### EASTERN EUROPE & RUSSIA
**Risk: [CRITICAL/HIGH/MEDIUM/LOW]**
[2-3 sentences]

### SUB-SAHARAN AFRICA
**Risk: [CRITICAL/HIGH/MEDIUM/LOW]**
[2-3 sentences]

### SOUTH & EAST ASIA
**Risk: [CRITICAL/HIGH/MEDIUM/LOW]**
[2-3 sentences]

### OTHER REGIONS
[Brief notes on any other notable situations]

## INDICATORS TO WATCH
[3-5 specific things analysts should monitor in the next 24-72h. Be specific — name actors, locations, thresholds.]

## INTELLIGENCE SUMMARY
- Events processed: ${events.length}
- Critical: ${events.filter(e=>e.severity==='critical').length} | High: ${events.filter(e=>e.severity==='high').length} | Medium: ${events.filter(e=>e.severity==='medium').length}
- Confirmed fatalities: ${events.reduce((s,e)=>s+(e.fatalities||0),0)}
- Active conflict zones: [list from data]`

  const encoder = new TextEncoder()
  const userIdPromise = getRequestUserId()

  const stream = new ReadableStream({
    async start(controller) {
      const t0 = Date.now()
      let outputChars = 0
      try {
        const result = await runStreamCompletion(
          plan,
          { prompt, maxTokens: 2000, effort },
          (text) => {
            controller.enqueue(encoder.encode(text))
            outputChars += text.length
          },
        )
        const userId = await userIdPromise.catch(() => null)
        logAiUsage({
          feature: 'sitrep', provider: result.provider, model: result.model, effort,
          input_tokens: result.inputTokens || Math.ceil(prompt.length / 4),
          output_tokens: result.outputTokens || Math.ceil(outputChars / 4),
          duration_ms: Date.now() - t0,
          user_id: userId ?? undefined,
        }).catch(() => {})
        controller.close()
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[Error generating briefing: ${err}]`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
