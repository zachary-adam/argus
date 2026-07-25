import type { CountryBriefData } from '@/types/brief'
import type { IntelEvent } from '@/types'
import { starterACHHypothesisTexts } from '@/lib/achTemplates'

/** Rule-based country brief when AI is unavailable — clearly labeled as template output. */
export function generateCountryBriefTemplate(opts: {
  country: string
  countryCode: string
  recentEvents?: IntelEvent[]
  projectGoal?: string
  researchQuestion?: string
}): CountryBriefData {
  const { country, recentEvents = [], projectGoal, researchQuestion } = opts
  const crit = recentEvents.filter(e => e.severity === 'critical').length
  const high = recentEvents.filter(e => e.severity === 'high').length
  const level = crit >= 2 ? 'LOW' : crit >= 1 || high >= 3 ? 'MODERATE' : 'LOW'
  const top = recentEvents[0]

  const seeds = starterACHHypothesisTexts({ goalTemplateId: projectGoal, researchQuestion }).slice(0, 3)

  return {
    executiveSummary: `[TEMPLATE — add AI keys for a full assessment] ${country}: ${recentEvents.length} events in scope${top ? `; lead reporting: "${top.title.slice(0, 120)}"` : '; no on-country events loaded'}.`,
    situationAssessment: recentEvents.length > 0
      ? `Open-source feed shows ${crit} critical and ${high} high-severity items for ${country}. This template summarizes counts only — enable AI mode for narrative assessment grounded in source text.`
      : `No event corpus supplied for ${country}. Load connectors or expand the map filter, then regenerate.`,
    keyJudgments: [{
      judgment: `[TEMPLATE] Event volume suggests ${crit + high > 0 ? 'elevated' : 'baseline'} activity in the monitoring window.`,
      confidence: level,
      reasoning: 'Derived from severity counts only — not LLM analysis.',
      citations: [],
    }],
    keyActors: [],
    riskFactors: crit > 0
      ? [{ factor: 'Critical-severity reporting', severity: 'high', detail: `${crit} critical event(s) in the supplied corpus.` }]
      : [{ factor: 'Data sparsity', severity: 'medium', detail: 'Insufficient critical/high events to infer specific risk drivers.' }],
    competingHypotheses: seeds.map(h => ({
      hypothesis: h,
      likelihood: 'roughly even chance',
      assessment: 'Template placeholder — score against cited [E#] sources when AI is available.',
      citations: [],
    })),
    assumptions: ['Open-source reporting only', 'Template mode — not an AI-generated assessment'],
    intelligenceGaps: [
      'Add API keys in Settings for full structured brief',
      'Ingest full-text sources for citable [E#] references',
    ],
    economicExposure: '[TEMPLATE] Economic exposure not assessed without AI and country profile synthesis.',
    outlook30: '[TEMPLATE] Near-term outlook requires AI analysis or manual analyst drafting.',
    outlook90: '[TEMPLATE] 90-day outlook requires AI analysis or manual analyst drafting.',
    maritimeAviationPicture: null,
    watchItems: [
      'Enable AI mode and regenerate this brief',
      'Expand event corpus for the target country',
      ...(crit > 0 ? ['Monitor follow-on reporting on critical items'] : []),
    ],
    methodology: 'Rule-based template from event severity counts — not LLM synthesis.',
    confidenceLevel: level,
    analystNotes: null,
  }
}
