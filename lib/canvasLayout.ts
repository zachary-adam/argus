import type { CanvasNode } from '@/types/project'

export const CANVAS_NODE_W: Record<string, number> = {
  event: 280, note: 240, entity: 220, source: 280, assessment: 300, ach: 380, indicator: 350,
}
export const CANVAS_NODE_H: Record<string, number> = {
  event: 172, note: 120, entity: 98, source: 170, assessment: 260, ach: 200, indicator: 240,
}

const GAP = 48
const PAD = 40

function nodeW(n: CanvasNode) { return CANVAS_NODE_W[n.type] ?? 260 }
function nodeH(n: CanvasNode) { return CANVAS_NODE_H[n.type] ?? 120 }

/** Arrange canvas nodes into readable rows by type (notes → ACH → events grid → rest). */
export function computeTidyCanvasPositions(nodes: CanvasNode[]): Record<string, { x: number; y: number }> {
  if (nodes.length === 0) return {}

  const notes = nodes.filter(n => n.type === 'note')
  const ach = nodes.filter(n => n.type === 'ach')
  const events = nodes.filter(n => n.type === 'event')
  const assessments = nodes.filter(n => n.type === 'assessment')
  const others = nodes.filter(n => !['note', 'ach', 'event', 'assessment'].includes(n.type))

  const positions: Record<string, { x: number; y: number }> = {}
  let y = PAD

  let x = PAD
  for (const n of notes) {
    positions[n.id] = { x, y }
    x += nodeW(n) + GAP
  }
  if (notes.length) y += Math.max(...notes.map(nodeH)) + GAP

  x = PAD
  for (const n of ach) {
    positions[n.id] = { x, y }
    x += nodeW(n) + GAP
  }
  if (ach.length) y += Math.max(...ach.map(nodeH)) + GAP

  const cols = Math.min(4, Math.max(1, events.length))
  const colW = CANVAS_NODE_W.event + GAP
  const rowH = CANVAS_NODE_H.event + GAP
  events.forEach((n, i) => {
    positions[n.id] = {
      x: PAD + (i % cols) * colW,
      y: y + Math.floor(i / cols) * rowH,
    }
  })
  if (events.length) y += Math.ceil(events.length / cols) * rowH + GAP

  x = PAD
  for (const n of assessments) {
    positions[n.id] = { x, y }
    x += nodeW(n) + GAP
  }
  if (assessments.length) y += Math.max(...assessments.map(nodeH)) + GAP

  x = PAD
  const maxRowW = cols * colW
  for (const n of others) {
    positions[n.id] = { x, y }
    x += nodeW(n) + GAP
    if (x > PAD + maxRowW) {
      x = PAD
      y += nodeH(n) + GAP
    }
  }

  return positions
}

/**
 * Temporal layout: place event nodes on a proportional time axis (X = timestamp,
 * left = oldest) within horizontal lanes by country (Y). Causal edges then read
 * left-to-right as a sequence — escalation/causation reasoning a freeform board
 * can't express. Non-event nodes are parked in a header row above the timeline.
 * Falls back to the tidy layout when no events carry a usable timestamp.
 */
export function computeTimelinePositions(
  nodes: CanvasNode[],
  meta: Map<string, { timestamp?: string; country?: string }>,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}

  const resolved = nodes
    .filter((n): n is CanvasNode & { eventId: string } => n.type === 'event')
    .map(n => {
      const m = meta.get(n.eventId)
      const t = m?.timestamp ? new Date(m.timestamp).getTime() : NaN
      return { n, t, country: (m?.country || 'Unknown').trim() || 'Unknown' }
    })
    .filter(r => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t)

  if (resolved.length === 0) return computeTidyCanvasPositions(nodes)

  // Park non-event nodes in a header row; the timeline starts below it.
  const others = nodes.filter(n => n.type !== 'event')
  let ox = PAD
  let headerH = 0
  for (const n of others) {
    positions[n.id] = { x: ox, y: PAD }
    ox += nodeW(n) + GAP
    headerH = Math.max(headerH, nodeH(n))
  }
  const topY = PAD + (others.length ? headerH + GAP * 2 : 0)

  const minT = resolved[0].t
  const maxT = resolved[resolved.length - 1].t
  const span = maxT - minT || 1
  const axisW = Math.max(resolved.length * (CANVAS_NODE_W.event + GAP), 800)
  const laneH = CANVAS_NODE_H.event + 40

  const lanes: string[] = []
  for (const r of resolved) if (!lanes.includes(r.country)) lanes.push(r.country)

  for (const r of resolved) {
    positions[r.n.id] = {
      x: PAD + ((r.t - minT) / span) * axisW,
      y: topY + lanes.indexOf(r.country) * laneH,
    }
  }

  return positions
}
