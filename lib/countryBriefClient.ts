import type { CountryBriefData } from '@/types/brief'
import type { Project } from '@/types/project'
import { getFeatureProvider, loadEffortLevel } from '@/lib/aiConfig'
import { buildAnalysisHeaders, loadAnalysisEngine, type AnalysisEngine } from '@/lib/aiMode'

export interface BriefStreamResult {
  brief: CountryBriefData
  country: string
  countryCode: string
  mode?: string
  warning?: string
  offline?: boolean
}

/** Consume the SSE stream from /api/brief and return parsed brief JSON. */
export async function fetchCountryBriefStream(
  payload: Record<string, unknown>,
  onProgress?: (partial: string) => void,
  opts?: {
    engine?: AnalysisEngine
    project?: Pick<Project, 'aiMode' | 'byokApiKey'> | null
  },
): Promise<BriefStreamResult> {
  const engine = opts?.engine ?? loadAnalysisEngine(opts?.project?.aiMode)
  const res = await fetch('/api/brief', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-provider': getFeatureProvider('brief'),
      'x-effort': loadEffortLevel(),
      ...buildAnalysisHeaders(engine, opts?.project),
    },
    body: JSON.stringify({
      ...payload,
      apiKey: opts?.project?.aiMode === 'byok' ? opts.project.byokApiKey : undefined,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || 'Brief generation failed')
  }
  if (!res.body) throw new Error('No response stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamText = ''
  let meta: { country: string; countryCode: string } = { country: '', countryCode: '' }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const evt = JSON.parse(line.slice(6)) as Record<string, unknown>
        if (evt.type === 'meta') {
          meta = { country: String(evt.country), countryCode: String(evt.countryCode) }
        } else if (evt.type === 'chunk' && typeof evt.text === 'string') {
          streamText += evt.text
          onProgress?.(streamText)
        } else if (evt.type === 'complete' && evt.data) {
          const data = evt.data as CountryBriefData & { mode?: string; warning?: string; offline?: boolean }
          return {
            brief: data,
            country: meta.country,
            countryCode: meta.countryCode,
            mode: data.mode,
            warning: data.warning,
            offline: data.offline,
          }
        } else if (evt.type === 'error') {
          throw new Error(String(evt.message ?? 'Brief failed'))
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }
  throw new Error('Brief stream ended without result')
}

export function countryBriefToMarkdown(brief: CountryBriefData, country: string): string {
  const lines: string[] = [
    `# Country Intelligence Brief — ${country}`,
    '',
    '## Executive summary (BLUF)',
    brief.executiveSummary,
    '',
  ]

  if (brief.keyJudgments?.length) {
    lines.push('## Key judgments')
    brief.keyJudgments.forEach((j, i) => {
      const cites = j.citations?.length ? ` ${j.citations.map(c => `[${c}]`).join('')}` : ''
      lines.push(`${i + 1}. **(${j.confidence})** ${j.judgment}${cites}`)
      if (j.reasoning) lines.push(`   - _Reasoning:_ ${j.reasoning}`)
    })
    lines.push('')
  }

  lines.push('## Situation assessment', brief.situationAssessment, '')

  lines.push('## Key actors')
  lines.push(...brief.keyActors.map(a => `- **${a.name}** (${a.role}): ${a.assessment}`))
  lines.push('')

  lines.push('## Risk factors')
  lines.push(...brief.riskFactors.map(r => `- [${r.severity.toUpperCase()}] ${r.factor}: ${r.detail}`))
  lines.push('')

  if (brief.competingHypotheses?.length) {
    lines.push('## Analysis of competing hypotheses')
    brief.competingHypotheses.forEach((h, i) => {
      const cites = h.citations?.length ? ` ${h.citations.map(c => `[${c}]`).join('')}` : ''
      lines.push(`- **H${i + 1} — ${h.likelihood}:** ${h.hypothesis}${cites}`)
      if (h.assessment) lines.push(`  - ${h.assessment}`)
    })
    lines.push('')
  }

  if (brief.assumptions?.length) {
    lines.push('## Assumptions', ...brief.assumptions.map(a => `- ${a}`), '')
  }

  lines.push('## Economic exposure', brief.economicExposure, '')
  lines.push('## Maritime & aviation', brief.maritimeAviationPicture ?? '_Not assessed_', '')
  lines.push('## 30-day outlook', brief.outlook30, '')
  lines.push('## 90-day outlook', brief.outlook90, '')
  lines.push('## Watch items', ...brief.watchItems.map(w => `- ${w}`), '')

  if (brief.intelligenceGaps?.length) {
    lines.push('## Intelligence gaps', ...brief.intelligenceGaps.map(g => `- ${g}`), '')
  }

  if (brief.analystNotes) lines.push('## Analyst workspace notes', brief.analystNotes, '')
  if (brief.methodology) lines.push('## Methodology', brief.methodology, '')

  lines.push(`**Confidence:** ${brief.confidenceLevel}`, '')

  if (brief.sources?.length) {
    lines.push('## Sources')
    brief.sources.forEach(s => {
      const meta = [s.source, s.date].filter(Boolean).join(', ')
      const link = s.url ? `[${s.title}](${s.url})` : s.title
      lines.push(`- **[${s.tag}]** ${link}${meta ? ` — ${meta}` : ''}`)
    })
    lines.push('')
  }

  lines.push('---', '*Generated by ARGUS — workspace-grounded intelligence*')
  return lines.filter(l => l !== undefined).join('\n')
}
