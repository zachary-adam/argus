import { NextRequest, NextResponse } from 'next/server'
import { vaultGet } from '@/lib/vault'
import { resolveMaxTokens, type EffortLevel } from '@/lib/aiConfig'
import { logAiUsage } from '@/lib/logAiUsage'
import { getRequestUserId } from '@/lib/auth/getRequestUser'
import { IntelEvent } from '@/types'
import { gatherEvidence, heuristicVerdict, type VerificationResult } from '@/lib/verify'
import { natoCode } from '@/lib/sourceWeight'
import { AI_KEYS_MISSING_BODY, planAiFromRequestWithProvider } from '@/lib/aiMode'
import { parseModelJson } from '@/lib/parseModelJson'
import { runCompletion } from '@/lib/aiComplete'

// Claim-level verification: assess ONE event/claim against the project's own graded
// corpus. Evidence is tagged [E#] and the tag→source map is returned, so every
// supporting/contradicting citation is verifiable and the model can't fabricate one.
export async function POST(req: NextRequest) {
  try {
    const { claim, corpus, apiKey } = (await req.json()) as {
      claim: IntelEvent
      corpus: IntelEvent[]
      apiKey?: string
    }
    if (!claim) return NextResponse.json({ error: 'No claim provided' }, { status: 400 })

    const evidence = gatherEvidence(claim, corpus ?? [], 12)
    const sourceMap: Record<string, { title: string; url: string }> = {}
    evidence.forEach((e, i) => { sourceMap[`E${i + 1}`] = { title: e.title, url: e.url ?? '' } })

    const effort = (req.headers.get('x-effort') ?? 'medium') as EffortLevel
    const plan = planAiFromRequestWithProvider(req, apiKey?.trim(), vaultGet, 'claude')

    // No key → conservative corroboration-only heuristic.
    if (plan.useOffline || plan.missingKeys || !plan.key) {
      return NextResponse.json({
        result: heuristicVerdict(claim, evidence),
        sourceMap,
        mode: 'heuristic',
        ...(plan.missingKeys ? { warning: AI_KEYS_MISSING_BODY.hint } : {}),
      })
    }

    const evidenceBlock = evidence.length
      ? evidence.map((e, i) =>
          `[E${i + 1}] "${e.title}" — ${e.country || 'n/a'} · ${e.source} · ${natoCode(e)} · ${new Date(e.timestamp).toLocaleDateString()}${e.summary ? `\n  ${e.summary}` : ''}`,
        ).join('\n')
      : '(no related events found in the workspace corpus)'

    const system = `You are a fact-verification analyst. Assess whether a CLAIM is supported by the EVIDENCE — a set of separately-collected, source-graded intelligence events from the analyst's own workspace. Reason ONLY from the evidence and the claim's own source quality. Do not use outside knowledge to assert facts; if the evidence is insufficient, say so.

Each evidence item is tagged [E1], [E2], etc. Cite the tags that support or contradict the claim. Only cite tags that appear below — never invent one.

NATO source grade: A-B reliable, C moderate, D-F treat with caution. More independent corroborating sources = higher confidence. A single uncorroborated source = "unverified" at best.

Return ONLY valid JSON matching this schema:
{
  "verdict": "supported" | "disputed" | "unverified" | "likely-false",
  "confidence": 0.0-1.0,
  "reasoning": "2-4 sentences, IC language, citing [E#] tags",
  "supporting": ["E1", ...],
  "contradicting": ["E3", ...],
  "sourceAssessment": "one sentence on the claim's own source reliability"
}`

    const user = `CLAIM TO VERIFY:
"${claim.title}"${claim.summary ? `\n${claim.summary}` : ''}
Claim source: ${claim.source} (${natoCode(claim)})${claim.infoOps ? ' — NOTE: already flagged as information-operations content' : ''}

EVIDENCE (workspace corpus):
${evidenceBlock}

Assess the claim now.`

    let content = ''
    const t0 = Date.now()
    const userIdPromise = getRequestUserId()

    try {
      const completion = await runCompletion(plan, {
        system,
        prompt: user,
        maxTokens: resolveMaxTokens(effort, 700),
        effort,
        temperature: 0.2,
        jsonResponse: !plan.isAnthropic,
        timeoutMs: 30_000,
      })
      content = completion.raw

      const userId = await userIdPromise.catch(() => null)
      logAiUsage({
        feature: 'verify', provider: completion.provider,
        model: completion.model,
        effort, input_tokens: completion.inputTokens, output_tokens: completion.outputTokens,
        duration_ms: Date.now() - t0, context: claim.title?.slice(0, 80),
        user_id: userId ?? undefined,
      }).catch(() => {})
    } catch {
      return NextResponse.json({ result: heuristicVerdict(claim, evidence), sourceMap, mode: 'heuristic', warning: 'AI unavailable' })
    }

    let result: VerificationResult
    try {
      result = parseModelJson<VerificationResult>(content)
    } catch {
      result = heuristicVerdict(claim, evidence)
      return NextResponse.json({ result, sourceMap, mode: 'heuristic', warning: 'AI response was not valid JSON' })
    }
    // Drop any cited tag the model invented that isn't in our evidence map.
    result.supporting = (result.supporting ?? []).filter(t => sourceMap[t])
    result.contradicting = (result.contradicting ?? []).filter(t => sourceMap[t])

    return NextResponse.json({ result, sourceMap, mode: 'ai' })
  } catch (err) {
    console.error('[verify]', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
