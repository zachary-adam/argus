import type { IntelEvent } from '@/types'
import type { BriefSource } from '@/types/brief'
import { formatTaggedEventCorpus } from '@/lib/workspaceIntel'

export function buildBriefEvidenceFromEvents(
  events: IntelEvent[],
  opts: Parameters<typeof formatTaggedEventCorpus>[1] = {},
): {
  corpus: string
  sources: BriefSource[]
  sourceMap: Record<string, { title: string; url: string }>
  withBodyCount: number
  /** Exact [E#] tag order — index i ⇒ tag E{i+1}. Lets callers anchor derived blocks (actor dossiers) to the same tags. */
  ordered: IntelEvent[]
} {
  const { text, sourceMap, ordered } = formatTaggedEventCorpus(events, opts)
  // `ordered` is the exact tag order used to assign [E1], [E2], … — index i → tag E{i+1}.
  // Using it directly guarantees each bibliography entry maps to the right event.
  const sources: BriefSource[] = ordered.map((e, i) => {
    const tag = `E${i + 1}`
    return {
      tag,
      title: sourceMap[tag]?.title ?? e.title,
      url: (sourceMap[tag]?.url || e.url) || undefined,
      source: e.source,
      date: e.timestamp?.slice(0, 10),
    }
  })

  return {
    corpus: text,
    sources,
    sourceMap,
    withBodyCount: ordered.filter(e => (e.body?.length ?? 0) > 300).length,
    ordered,
  }
}

/** Keep bibliography aligned with inline [E#] / [S#] citations in model output. */
export function citedBriefSources(
  sources: BriefSource[],
  content: string,
  tagPattern: RegExp = /\bE\d+\b/g,
): BriefSource[] {
  const citedTags = new Set(content.match(tagPattern) ?? [])
  const cited = sources.filter(s => citedTags.has(s.tag))
  return cited.length > 0 ? cited : sources
}

export function normalizeBriefConfidence(c?: string): 'LOW' | 'MEDIUM' | 'HIGH' {
  const u = (c ?? '').toUpperCase()
  if (u === 'HIGH') return 'HIGH'
  if (u === 'LOW') return 'LOW'
  return 'MEDIUM'
}
