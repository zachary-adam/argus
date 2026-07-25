import { buildAnalysisHeaders, type AnalysisEngine } from './aiMode'
import type { Project } from '@/types/project'

export type AIProvider   = 'claude' | 'openai'
export type EffortLevel  = 'low' | 'medium' | 'high'

export const EFFORT_META: Record<EffortLevel, { label: string; desc: string; cost: string; claudeModel: string }> = {
  low:    { label: 'Low',    cost: '$',   claudeModel: 'claude-haiku-4-5-20251001', desc: 'Haiku · GPT-4o-mini — fastest, cheapest' },
  medium: { label: 'Medium', cost: '$$',  claudeModel: 'claude-sonnet-4-6',         desc: 'Sonnet 4.6 · GPT-4o — balanced quality' },
  high:   { label: 'High',   cost: '$$$', claudeModel: 'claude-opus-4-8',           desc: 'Opus 4.8 · GPT-4o — highest quality'     },
}

export function resolveClaudeModel(effort: EffortLevel): string {
  return EFFORT_META[effort].claudeModel
}

export function resolveOpenAIModel(effort: EffortLevel): string {
  return effort === 'low' ? 'gpt-4o-mini' : 'gpt-4o'
}

export function resolveMaxTokens(effort: EffortLevel, base: number): number {
  if (effort === 'low')  return Math.round(base * 0.6)
  if (effort === 'high') return Math.round(base * 1.5)
  return base
}

const LS_EFFORT_KEY = 'argus-effort-level'

export function loadEffortLevel(): EffortLevel {
  if (typeof window === 'undefined') return 'medium'
  const v = localStorage.getItem(LS_EFFORT_KEY)
  if (v === 'low' || v === 'medium' || v === 'high') return v
  return 'medium'
}

export function saveEffortLevel(level: EffortLevel): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_EFFORT_KEY, level)
}

export interface AIFeatureConfig {
  provider: AIProvider
}

export interface AIConfig {
  sitrep:   AIFeatureConfig
  brief:    AIFeatureConfig
  ask:      AIFeatureConfig
  enrich:   AIFeatureConfig
  suggest:  AIFeatureConfig
  analysis: AIFeatureConfig
}

export const FEATURE_META: Record<keyof AIConfig, { label: string; desc: string; route: string }> = {
  sitrep:   { label: 'Global SITREP',       desc: 'API only — batch intelligence synthesis',                   route: '/api/sitrep'   },
  brief:    { label: 'Country Brief',        desc: 'API only — per-country threat assessment',                  route: '/api/brief'    },
  ask:      { label: 'Ask / Chat',           desc: 'API only — use NLQ (⌘K) and Verify in the UI instead',      route: '/api/ask'      },
  enrich:   { label: 'Event Enrichment',     desc: 'Re-geocode, extract actors, calibrate severity on import',  route: '/api/enrich'   },
  suggest:  { label: 'Query Suggestions',    desc: 'Source discovery and OSINT query generation',               route: '/api/search'   },
  analysis: { label: 'Situation Analysis',   desc: 'Deterministic event clustering (no AI) — groups recent events by country/category', route: '/api/situations'},
}

export const RECOMMENDED: Record<keyof AIConfig, AIProvider> = {
  sitrep:   'claude',
  brief:    'claude',
  ask:      'claude',
  enrich:   'openai',
  suggest:  'openai',
  analysis: 'claude',
}

export const RECOMMEND_REASON: Record<keyof AIConfig, string> = {
  sitrep:   'Opus 4.8 excels at multi-source synthesis and long-form analytical prose',
  brief:    'Sonnet 4.6 handles complex geopolitical reasoning with nuance',
  ask:      'Claude delivers more grounded answers with less hallucination on intelligence tasks',
  enrich:   'GPT-4o-mini is fast and cost-efficient for structured JSON extraction',
  suggest:  'GPT-4o-mini is ideal for lightweight completion tasks',
  analysis: 'Rule-based clustering — no LLM required',
}

export const DEFAULT_CONFIG: AIConfig = {
  sitrep:   { provider: 'claude'  },
  brief:    { provider: 'claude'  },
  ask:      { provider: 'claude'  },
  enrich:   { provider: 'openai' },
  suggest:  { provider: 'openai' },
  analysis: { provider: 'claude'  },
}

const LS_KEY = 'argus-ai-config'

export function loadAIConfig(): AIConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)
    // Merge so new features always have a default
    const merged: AIConfig = { ...DEFAULT_CONFIG }
    for (const k of Object.keys(DEFAULT_CONFIG) as (keyof AIConfig)[]) {
      if (parsed[k]?.provider) merged[k] = { provider: parsed[k].provider }
    }
    return merged
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveAIConfig(cfg: AIConfig): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_KEY, JSON.stringify(cfg))
}

export function getFeatureProvider(feature: keyof AIConfig): AIProvider {
  const cfg = loadAIConfig()
  return cfg[feature]?.provider ?? DEFAULT_CONFIG[feature].provider
}

/** Standard headers for browser → API AI calls (provider, effort, mode, BYOK). */
export function buildAiFetchHeaders(
  feature: keyof AIConfig,
  engine: AnalysisEngine,
  project?: Project | Pick<Project, 'aiMode' | 'byokApiKey'> | null,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-ai-provider': getFeatureProvider(feature),
    'x-effort': loadEffortLevel(),
    ...buildAnalysisHeaders(engine, project),
  }
}
