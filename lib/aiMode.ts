import type { NextRequest } from 'next/server'
import type { Project } from '@/types/project'

export type ProjectAiMode = 'none' | 'cloud' | 'byok' | 'local'
export type AnalysisEngine = 'rules' | 'ai'

const LS_ENGINE_KEY = 'argus-analysis-engine-v2'

export function defaultEngineFromProject(aiMode?: ProjectAiMode | null): AnalysisEngine {
  return aiMode === 'none' ? 'rules' : 'ai'
}

export function loadAnalysisEngine(projectAiMode?: ProjectAiMode | null): AnalysisEngine {
  if (typeof window === 'undefined') return 'ai'
  const stored = localStorage.getItem(LS_ENGINE_KEY)
  if (stored === 'rules' || stored === 'ai') return stored
  return defaultEngineFromProject(projectAiMode)
}

export function saveAnalysisEngine(engine: AnalysisEngine): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_ENGINE_KEY, engine)
}

/** Map toolbar choice + project defaults to the header the API reads. */
export function effectiveAiModeForRequest(
  engine: AnalysisEngine,
  project?: Pick<Project, 'aiMode' | 'byokApiKey'> | null,
): ProjectAiMode {
  if (engine === 'rules') return 'none'
  if (project?.aiMode && project.aiMode !== 'none') return project.aiMode
  return 'cloud'
}

export function buildAnalysisHeaders(
  engine: AnalysisEngine,
  project?: Pick<Project, 'aiMode' | 'byokApiKey'> | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    'x-argus-ai-mode': effectiveAiModeForRequest(engine, project),
  }
  if (project?.aiMode === 'byok' && project.byokApiKey?.trim()) {
    headers['x-argus-client-key'] = project.byokApiKey.trim()
  }
  return headers
}

export function parseAiModeFromRequest(req: NextRequest): ProjectAiMode | undefined {
  const h = req.headers.get('x-argus-ai-mode')
  if (h === 'none' || h === 'cloud' || h === 'byok' || h === 'local') return h
  return undefined
}

export function wantsOfflineAnalysis(aiMode: ProjectAiMode | undefined): boolean {
  return aiMode === 'none'
}

export interface AiExecutionPlan {
  useOffline: boolean
  missingKeys: boolean
  aiMode: ProjectAiMode
  key: string | null
  isAnthropic: boolean
}

export function planAiExecution(opts: {
  aiMode: ProjectAiMode | undefined
  anthropicKey?: string | null
  openaiKey?: string | null
  clientKey?: string | null
}): AiExecutionPlan {
  const { aiMode: rawMode, anthropicKey, openaiKey, clientKey } = opts
  const explicitAi = rawMode !== undefined && rawMode !== 'none'

  if (rawMode === 'none') {
    return { useOffline: true, missingKeys: false, aiMode: 'none', key: null, isAnthropic: false }
  }

  const mode: ProjectAiMode = rawMode ?? 'cloud'
  let key: string | null = null

  if (mode === 'byok') {
    key = clientKey?.trim() || openaiKey || anthropicKey || null
  } else {
    key = anthropicKey || openaiKey || clientKey?.trim() || null
  }

  if (!key) {
    if (explicitAi || rawMode === 'cloud' || rawMode === 'byok' || rawMode === 'local') {
      return { useOffline: false, missingKeys: true, aiMode: mode, key: null, isAnthropic: false }
    }
    return { useOffline: true, missingKeys: false, aiMode: 'none', key: null, isAnthropic: false }
  }

  return {
    useOffline: false,
    missingKeys: false,
    aiMode: mode,
    key,
    isAnthropic: key.startsWith('sk-ant-'),
  }
}

/** Body apiKey wins; otherwise read BYOK from x-argus-client-key (buildAnalysisHeaders). */
export function resolveClientKey(
  req: NextRequest,
  clientKey?: string | null,
): string | null {
  const fromBody = clientKey?.trim()
  if (fromBody) return fromBody
  const fromHeader = req.headers.get('x-argus-client-key')?.trim()
  return fromHeader || null
}

export function planAiFromRequest(
  req: NextRequest,
  clientKey?: string | null,
  vaultGet?: (name: string) => string | null | undefined,
): AiExecutionPlan {
  const aiMode = parseAiModeFromRequest(req)
  // Prefer process.env over vault — .env.local is the deploy source of truth;
  // Settings vault often holds stale keys that produce opaque 401s.
  const anthropicKey = process.env.ANTHROPIC_API_KEY || vaultGet?.('ANTHROPIC_API_KEY') || null
  const openaiKey = process.env.OPENAI_API_KEY || vaultGet?.('OPENAI_API_KEY') || null
  return planAiExecution({ aiMode, anthropicKey, openaiKey, clientKey: resolveClientKey(req, clientKey) })
}

export type AIProviderPref = 'claude' | 'openai'

export function parseProviderPreference(
  req: NextRequest,
  fallback: AIProviderPref = 'claude',
): AIProviderPref {
  const h = req.headers.get('x-ai-provider')
  return h === 'openai' || h === 'claude' ? h : fallback
}

export function resolveServerAiKeys(
  vaultGet?: (name: string) => string | null | undefined,
): { anthropicKey: string | null; openaiKey: string | null } {
  return {
    anthropicKey: process.env.ANTHROPIC_API_KEY || vaultGet?.('ANTHROPIC_API_KEY') || null,
    openaiKey: process.env.OPENAI_API_KEY || vaultGet?.('OPENAI_API_KEY') || null,
  }
}

/** Honor explicit x-ai-provider from feature UIs (Settings → AI routing). */
export function applyProviderPreference(
  plan: AiExecutionPlan,
  preferred: 'claude' | 'openai' | null | undefined,
  keys: { anthropicKey?: string | null; openaiKey?: string | null },
  clientKeyProvided?: string | null,
): AiExecutionPlan {
  if (plan.useOffline) return plan

  // BYOK with a user key: use it as-is; infer provider from key prefix.
  if (plan.aiMode === 'byok' && clientKeyProvided?.trim()) {
    const k = clientKeyProvided.trim()
    return { ...plan, key: k, isAnthropic: k.startsWith('sk-ant-'), missingKeys: false, useOffline: false }
  }

  if (preferred === 'claude' && keys.anthropicKey) {
    return { ...plan, key: keys.anthropicKey, isAnthropic: true, useOffline: false, missingKeys: false }
  }
  if (preferred === 'openai' && keys.openaiKey) {
    return { ...plan, key: keys.openaiKey, isAnthropic: false, useOffline: false, missingKeys: false }
  }
  if (!plan.key) {
    if (keys.openaiKey) return { ...plan, key: keys.openaiKey, isAnthropic: false, useOffline: false, missingKeys: false }
    if (keys.anthropicKey) return { ...plan, key: keys.anthropicKey, isAnthropic: true, useOffline: false, missingKeys: false }
    return { ...plan, missingKeys: true }
  }
  return plan
}

/** planAiFromRequest + x-ai-provider + BYOK-safe provider routing. */
export function planAiFromRequestWithProvider(
  req: NextRequest,
  clientKey?: string | null,
  vaultGet?: (name: string) => string | null | undefined,
  fallbackProvider: AIProviderPref = 'claude',
): AiExecutionPlan {
  const resolvedClient = resolveClientKey(req, clientKey)
  const plan = planAiFromRequest(req, clientKey, vaultGet)
  if (plan.useOffline) return plan
  const keys = resolveServerAiKeys(vaultGet)
  const preferred = parseProviderPreference(req, fallbackProvider)
  return applyProviderPreference(plan, preferred, keys, resolvedClient)
}

export const AI_KEYS_MISSING_BODY = {
  error: 'AI mode selected but no API keys configured',
  code: 'AI_KEYS_MISSING' as const,
  hint: 'Add keys in Settings → API Keys, or switch to Rules mode.',
}
