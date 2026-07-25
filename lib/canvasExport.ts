import { format } from 'date-fns'
import type { IntelEvent } from '@/types'
import type {
  CanvasACHNode, CanvasEdge, CanvasEventNode, CanvasNode, Project,
} from '@/types/project'

type EventLike = { id: string; title: string; severity?: string | number; country?: string; timestamp: string }

function toEventLike(e: { id: string; title: string; severity?: string | number; country?: string; timestamp: string }): EventLike {
  return {
    id: e.id,
    title: e.title,
    severity: typeof e.severity === 'number'
      ? (e.severity >= 8 ? 'critical' : e.severity >= 6 ? 'high' : e.severity >= 4 ? 'medium' : 'low')
      : e.severity,
    country: e.country,
    timestamp: e.timestamp,
  }
}

function nodeLabel(node: CanvasNode, eventMap: Map<string, EventLike>): string {
  switch (node.type) {
    case 'event': {
      const ev = eventMap.get((node as CanvasEventNode).eventId)
      return ev?.title ?? `Event ${(node as CanvasEventNode).eventId.slice(0, 8)}`
    }
    case 'note':
      return (node.content.split('\n')[0] || 'Note').slice(0, 80)
    case 'entity':
      return node.label
    case 'source':
      return node.title
    case 'assessment':
      return node.formulaId.replace(/-/g, ' ')
    case 'ach':
      return 'ACH matrix'
    default:
      return 'node'
  }
}

function achLeadHypothesis(ach: CanvasACHNode): string | null {
  if (!ach.hypotheses.length || !ach.scores.length) return null
  const ranked = [...ach.hypotheses].map(h => {
    const s = ach.scores.filter(sc => sc.hypothesisId === h.id)
    const supports = s.filter(sc => sc.rating === 'supports').length
    const contradicts = s.filter(sc => sc.rating === 'contradicts').length
    return { text: h.text, supports, contradicts, net: supports - contradicts }
  }).sort((a, b) => a.contradicts !== b.contradicts ? a.contradicts - b.contradicts : b.net - a.net)
  return ranked[0]?.text ?? null
}

export function canvasHasExportableContent(project: Project | null | undefined): boolean {
  const nodes = project?.analyticalCanvas?.nodes ?? []
  return nodes.length > 0
}

export function formatCanvasMarkdown(
  project: Project,
  liveEvents: IntelEvent[],
): string[] {
  const canvas = project.analyticalCanvas
  if (!canvas || canvas.nodes.length === 0) return []

  const eventMap = new Map<string, EventLike>(
    [...liveEvents, ...(project.events ?? [])].map(e => [e.id, toEventLike(e)]),
  )
  const nodes = canvas.nodes
  const edges = canvas.edges
  const byType = (t: string) => nodes.filter(n => n.type === t).length

  const lines: string[] = [
    '## Analyst Canvas',
    '',
    `- **${nodes.length}** nodes · **${edges.length}** relationships`,
    `- ${byType('event')} events · ${byType('ach')} ACH · ${byType('note')} notes · ${byType('entity')} entities`,
    '',
  ]

  const eventNodes = nodes.filter((n): n is CanvasEventNode => n.type === 'event')
  if (eventNodes.length > 0) {
    lines.push('### Evidence on canvas', '')
    for (const n of eventNodes) {
      const ev = eventMap.get(n.eventId)
      if (!ev) {
        lines.push(`- *(missing event ${n.eventId})*`)
        continue
      }
      const d = format(new Date(ev.timestamp), 'dd MMM yyyy')
      lines.push(`- **[${String(ev.severity ?? 'medium').toUpperCase()}]** ${ev.title} *(${ev.country ?? '—'}, ${d})*`)
    }
    lines.push('')
  }

  if (edges.length > 0) {
    lines.push('### Relationships', '')
    for (const e of edges) {
      const src = nodes.find(n => n.id === e.source)
      const tgt = nodes.find(n => n.id === e.target)
      if (!src || !tgt) continue
      lines.push(`- ${nodeLabel(src, eventMap)} → **${e.kind.replace(/_/g, ' ')}** → ${nodeLabel(tgt, eventMap)}`)
    }
    lines.push('')
  }

  const achNodes = nodes.filter((n): n is CanvasACHNode => n.type === 'ach')
  for (const ach of achNodes) {
    lines.push('### ACH — competing hypotheses', '')
    for (const h of ach.hypotheses) lines.push(`- ${h.text}`)
    if (ach.narrative?.trim()) lines.push('', `> ${ach.narrative.trim()}`)
    lines.push('', `**Confidence:** ${ach.confidence}`, '')
    if (ach.scores.length > 0) {
      lines.push('**Scoring summary:**', '')
      for (const h of ach.hypotheses) {
        const s = ach.scores.filter(sc => sc.hypothesisId === h.id)
        const supports = s.filter(sc => sc.rating === 'supports').length
        const contradicts = s.filter(sc => sc.rating === 'contradicts').length
        lines.push(`- ${h.text} *(+${supports} / −${contradicts})*`)
      }
      const lead = achLeadHypothesis(ach)
      if (lead) lines.push('', `**Lead hypothesis:** ${lead}`)
      lines.push('')
    }
  }

  return lines
}

export function formatCanvasHtml(
  project: Project,
  liveEvents: IntelEvent[],
  escH: (s: string) => string,
): string {
  const canvas = project.analyticalCanvas
  if (!canvas || canvas.nodes.length === 0) return ''

  const eventMap = new Map<string, EventLike>(
    [...liveEvents, ...(project.events ?? [])].map(e => [e.id, toEventLike(e)]),
  )
  const { nodes, edges } = canvas
  const byType = (t: string) => nodes.filter(n => n.type === t).length

  const eventNodes = nodes.filter((n): n is CanvasEventNode => n.type === 'event')
  const achNodes = nodes.filter((n): n is CanvasACHNode => n.type === 'ach')

  const eventsHtml = eventNodes.length > 0
    ? `<h3>Evidence on canvas</h3>
      <ul style="margin:8px 0 12px 18px;font-size:10pt;color:#334155">
        ${eventNodes.map(n => {
          const ev = eventMap.get(n.eventId)
          if (!ev) return `<li><em>Missing event</em></li>`
          return `<li><strong>${escH(ev.title)}</strong> <span style="color:#64748b;font-size:9pt">(${String(ev.severity ?? '').toUpperCase()} · ${escH(ev.country ?? '')}, ${format(new Date(ev.timestamp), 'dd MMM yyyy')})</span></li>`
        }).join('')}
      </ul>`
    : ''

  const edgesHtml = edges.length > 0
    ? `<h3>Relationships</h3>
      <ul style="margin:8px 0 12px 18px;font-size:10pt;color:#334155">
        ${edges.map((e: CanvasEdge) => {
          const src = nodes.find(n => n.id === e.source)
          const tgt = nodes.find(n => n.id === e.target)
          if (!src || !tgt) return ''
          return `<li>${escH(nodeLabel(src, eventMap))} <strong>→ ${escH(e.kind.replace(/_/g, ' '))} →</strong> ${escH(nodeLabel(tgt, eventMap))}</li>`
        }).join('')}
      </ul>`
    : ''

  const achHtml = achNodes.map(ach => {
    const lead = ach.scores.length > 0 ? achLeadHypothesis(ach) : null
    const scoring = ach.scores.length > 0
      ? ach.hypotheses.map(h => {
          const s = ach.scores.filter(sc => sc.hypothesisId === h.id)
          const supports = s.filter(sc => sc.rating === 'supports').length
          const contradicts = s.filter(sc => sc.rating === 'contradicts').length
          return `<div class="ach-hyp">${escH(h.text)} <span style="color:#64748b;font-size:9pt">(+${supports} / −${contradicts})</span></div>`
        }).join('')
      : ach.hypotheses.map(h => `<div class="ach-hyp">${escH(h.text)}</div>`).join('')
    return `<div style="margin-bottom:14px">
      <h3>ACH — competing hypotheses</h3>
      ${scoring}
      ${ach.narrative ? `<div class="narrative">${escH(ach.narrative)}</div>` : ''}
      <div class="ach-conf">Confidence: ${ach.confidence}</div>
      ${lead ? `<div class="narrative" style="margin-top:8px"><strong>Lead hypothesis:</strong> ${escH(lead)}</div>` : ''}
    </div>`
  }).join('')

  return `
  <h2>Analyst Canvas</h2>
  <p style="font-size:10pt;color:#475569;margin-bottom:12px">
    ${nodes.length} nodes · ${edges.length} relationships ·
    ${byType('event')} events · ${byType('ach')} ACH · ${byType('note')} notes
  </p>
  ${eventsHtml}
  ${edgesHtml}
  ${achHtml}`
}
