import { briefMethodologyLines, type ProjectBriefData } from '@/types/brief'
import { getFeatureProvider, loadEffortLevel } from '@/lib/aiConfig'
import { buildProjectBriefPayload } from '@/lib/briefPayload'
import type { CorrelationAlert, IntelEvent, Situation } from '@/types'
import type { Plot, Project } from '@/types/project'
import { buildAnalysisHeaders, loadAnalysisEngine, type AnalysisEngine } from '@/lib/aiMode'

export type ProjectBriefResult =
  | { ok: true; brief: ProjectBriefData; mode?: string; warning?: string; offline?: boolean }
  | { ok: false; error: string; status: number; code?: string; hint?: string }

export async function fetchProjectBrief(
  project: Project,
  map: {
    events: IntelEvent[]
    alerts: CorrelationAlert[]
    situations: Situation[]
    flaggedAlerts: Record<string, { note: string; flaggedAt: string }>
  },
  plots: Plot[],
  engine: AnalysisEngine = loadAnalysisEngine(project.aiMode),
): Promise<ProjectBriefResult> {
  const payload = {
    ...buildProjectBriefPayload(project, map, plots),
    apiKey: project.aiMode === 'byok' ? project.byokApiKey : undefined,
  }
  const res = await fetch('/api/brief/project', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-provider': getFeatureProvider('brief'),
      'x-effort': loadEffortLevel(),
      ...buildAnalysisHeaders(engine, project),
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({})) as {
    error?: string
    hint?: string
    code?: string
    brief?: ProjectBriefData
    mode?: string
    warning?: string
    offline?: boolean
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: body.error || (res.status === 401 ? 'Sign in required' : `Brief failed (${res.status})`),
      code: body.code,
      hint: body.hint,
    }
  }
  if (!body.brief) {
    return { ok: false, status: res.status, error: 'Brief response was empty' }
  }
  return {
    ok: true,
    brief: body.brief,
    mode: body.mode,
    warning: body.warning,
    offline: body.offline,
  }
}

/** @deprecated Prefer fetchProjectBrief — kept for callers that only need brief|null */
export async function fetchProjectBriefOrNull(
  ...args: Parameters<typeof fetchProjectBrief>
): Promise<{ brief: ProjectBriefData; mode?: string; warning?: string; offline?: boolean } | null> {
  const r = await fetchProjectBrief(...args)
  if (!r.ok) return null
  const { ok: _ok, ...rest } = r
  return rest
}

export function projectBriefToHtml(brief: ProjectBriefData, esc: (s: string) => string): string {
  const findings = brief.keyFindings.map(f =>
    `<li><strong>${esc(f.finding)}</strong> — ${esc(f.significance)} <em>(${f.confidence})</em></li>`,
  ).join('')

  const hypotheses = brief.competingHypotheses?.length
    ? `<h3>Analysis of competing hypotheses</h3><ul>${brief.competingHypotheses.map((h, i) =>
        `<li><strong>H${i + 1} — ${esc(h.likelihood)}:</strong> ${esc(h.hypothesis)}${h.assessment ? ` — ${esc(h.assessment)}` : ''}</li>`,
      ).join('')}</ul>`
    : ''

  const assumptions = brief.assumptions?.length
    ? `<h3>Assumptions</h3><ul>${brief.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`
    : ''

  const gaps = brief.intelligenceGaps?.length
    ? `<h3>Intelligence gaps</h3><ul>${brief.intelligenceGaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>`
    : ''

  const methodology = brief.methodology
    ? `<p class="meta"><strong>Methodology:</strong> <em>${esc(brief.methodology)}</em></p>`
    : ''

  const generation = brief.generation
    ? `<h3>How this brief was made</h3><ul>${briefMethodologyLines(brief.generation).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`
    : ''

  const sources = brief.sources?.length
    ? `<h3>Sources</h3><ol>${brief.sources.map(s =>
        `<li>[${esc(s.tag)}] ${s.url ? `<a href="${esc(s.url)}">${esc(s.title)}</a>` : esc(s.title)}${s.source ? ` — ${esc(s.source)}` : ''}</li>`,
      ).join('')}</ol>`
    : ''

  return `
  <h2>AI Intelligence Assessment</h2>
  <p class="bluf">${esc(brief.bluf)}</p>
  <h3>Situation</h3>
  <p>${esc(brief.situation)}</p>
  <h3>Key findings</h3>
  <ul>${findings}</ul>
  ${hypotheses}
  ${assumptions}
  <h3>Patterns</h3>
  <p>${esc(brief.patterns)}</p>
  <h3>Outlook</h3>
  <p>${esc(brief.outlook)}</p>
  ${gaps}
  <p class="meta"><em>${esc(brief.analystNote)}</em></p>
  ${methodology}
  ${generation}
  ${sources}`
}
