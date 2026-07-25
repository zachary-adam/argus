// Server-side only. Called fire-and-forget from API routes.
// Never throws — a logging failure must never break an AI response.

export interface UsageLog {
  feature:       string               // brief | ask | enrich | nlq | sitrep | brief_project
  provider:      'claude' | 'openai'
  model:         string
  effort:        string               // low | medium | high
  input_tokens:  number
  output_tokens: number
  duration_ms?:  number
  context?:      string               // country name, query string, etc.
  project_id?:   string
  user_id?:      string               // authenticated user — enforces per-user isolation
}

const COST_PER_1M: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.25,  output: 1.25  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-8':           { input: 15.00, output: 75.00 },
  'gpt-4o-mini':               { input: 0.15,  output: 0.60  },
  'gpt-4o':                    { input: 2.50,  output: 10.00 },
}

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const r = COST_PER_1M[model]
  if (!r) return 0
  return (inputTokens / 1_000_000) * r.input + (outputTokens / 1_000_000) * r.output
}

export async function logAiUsage(log: UsageLog): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return

  const total_tokens = log.input_tokens + log.output_tokens
  const cost_usd     = calcCost(log.model, log.input_tokens, log.output_tokens)

  try {
    await fetch(`${url}/rest/v1/ai_usage_logs`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        feature:       log.feature,
        provider:      log.provider,
        model:         log.model,
        effort:        log.effort,
        input_tokens:  log.input_tokens,
        output_tokens: log.output_tokens,
        total_tokens,
        cost_usd,
        duration_ms:   log.duration_ms ?? null,
        context:       log.context    ?? null,
        project_id:    log.project_id ?? null,
        user_id:       log.user_id    ?? null,
      }),
    })
  } catch {
    // intentionally swallowed
  }
}
