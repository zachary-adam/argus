/**
 * Shared single-turn completion for API routes — one place for the
 * Anthropic-vs-OpenAI branch, model selection (lib/aiConfig.ts), and token
 * accounting, instead of each route pasting its own copy with hardcoded
 * model IDs.
 */
import { resolveClaudeModel, resolveOpenAIModel, type EffortLevel } from '@/lib/aiConfig'
import type { AiExecutionPlan } from '@/lib/aiMode'

export interface CompletionResult {
  raw: string
  provider: 'claude' | 'openai'
  model: string
  inputTokens: number
  outputTokens: number
}

export interface StreamCompletionResult {
  provider: 'claude' | 'openai'
  model: string
  inputTokens: number
  outputTokens: number
}

type TurnMessage = { role: 'user' | 'assistant'; content: string }

export async function runCompletion(
  plan: Pick<AiExecutionPlan, 'isAnthropic' | 'key'>,
  opts: {
    system: string
    /** Single user turn — ignored when `messages` is set. */
    prompt?: string
    /** Multi-turn history (excluding system). Final user turn can be in `prompt` or last message. */
    messages?: TurnMessage[]
    maxTokens: number
    effort?: EffortLevel
    temperature?: number
    timeoutMs?: number
    /** Ask OpenAI for a JSON object response (no-op for Claude — prompt for it). */
    jsonResponse?: boolean
  },
): Promise<CompletionResult> {
  if (!plan.key) throw new Error('No API key in execution plan')
  const effort = opts.effort ?? 'low'
  const userMessages: TurnMessage[] = opts.messages?.length
    ? opts.messages
    : [{ role: 'user', content: opts.prompt ?? '' }]

  if (plan.isAnthropic) {
    const model = resolveClaudeModel(effort)
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: plan.key })
    const resp = await client.messages.create({
      model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.2, // don't inherit Claude's default 1.0
      system: opts.system,
      messages: userMessages.map(m => ({ role: m.role, content: m.content })),
    })
    return {
      raw: resp.content[0]?.type === 'text' ? resp.content[0].text : '',
      provider: 'claude',
      model,
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
    }
  }

  const model = resolveOpenAIModel(effort)
  const openaiMessages = [
    { role: 'system', content: opts.system },
    ...userMessages.map(m => ({ role: m.role, content: m.content })),
  ]
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${plan.key}` },
    body: JSON.stringify({
      model,
      messages: openaiMessages,
      ...(opts.jsonResponse ? { response_format: { type: 'json_object' } } : {}),
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}`)
  const data = await res.json()
  return {
    raw: data.choices?.[0]?.message?.content ?? '',
    provider: 'openai',
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  }
}

/** Stream text chunks to `onChunk`; returns token accounting for logAiUsage. */
export async function runStreamCompletion(
  plan: Pick<AiExecutionPlan, 'isAnthropic' | 'key'>,
  opts: {
    system?: string
    prompt: string
    maxTokens: number
    effort?: EffortLevel
    temperature?: number
    jsonResponse?: boolean
  },
  onChunk: (text: string) => void,
): Promise<StreamCompletionResult> {
  if (!plan.key) throw new Error('No API key in execution plan')
  const effort = opts.effort ?? 'medium'

  if (plan.isAnthropic) {
    const model = resolveClaudeModel(effort)
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: plan.key })
    const stream = client.messages.stream({
      model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.2,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: opts.prompt }],
    })
    let inputTokens = 0
    let outputTokens = 0
    for await (const chunk of stream) {
      if (chunk.type === 'message_start') inputTokens = chunk.message.usage.input_tokens
      if (chunk.type === 'message_delta' && 'usage' in chunk) {
        outputTokens = (chunk as { usage: { output_tokens: number } }).usage.output_tokens
      }
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        onChunk(chunk.delta.text)
      }
    }
    return { provider: 'claude', model, inputTokens, outputTokens }
  }

  const model = resolveOpenAIModel(effort)
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${plan.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
        { role: 'user', content: opts.prompt },
      ],
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.2,
      stream: true,
      stream_options: { include_usage: true },
      ...(opts.jsonResponse ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.body) throw new Error('No stream body from OpenAI')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let inputTokens = 0
  let outputTokens = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    for (const line of dec.decode(value).split('\n')) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const chunk = JSON.parse(line.slice(6)) as {
          usage?: { prompt_tokens?: number; completion_tokens?: number }
          choices?: Array<{ delta?: { content?: string } }>
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }
        const text = chunk.choices?.[0]?.delta?.content
        if (text) onChunk(text)
      } catch { /* partial SSE line */ }
    }
  }
  return { provider: 'openai', model, inputTokens, outputTokens }
}
