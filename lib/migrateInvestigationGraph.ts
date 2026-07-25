import type { GraphEdge, GraphNode } from '@/types'
import type { CanvasEdge, CanvasEdgeKind, CanvasNode, Project } from '@/types/project'
import { iocTypeToEntityType } from '@/lib/iocToCanvas'

type LegacyProject = Project & {
  investigationGraph?: { nodes: GraphNode[]; edges: GraphEdge[] }
}

function legacyEdgeKind(label: string): CanvasEdgeKind {
  const l = label.toUpperCase()
  if (l.includes('SUPPORT')) return 'supports'
  if (l.includes('CONTRADICT')) return 'contradicts'
  if (l.includes('CAUSE')) return 'causes'
  if (l.includes('CORREL') || l.includes('CO_OCCUR')) return 'correlates'
  if (l.includes('THREAT')) return 'threatens'
  if (l.includes('DEPEND')) return 'depends_on'
  return 'linked'
}

/** One-time migration: legacy investigation graph → analytical canvas entities. */
export function migrateInvestigationGraph(project: LegacyProject): Project {
  const legacy = project.investigationGraph
  const canvas = project.analyticalCanvas ?? { nodes: [], edges: [] }

  if (!legacy?.nodes?.length) {
    const { investigationGraph: _removed, ...rest } = project
    return rest
  }

  const existingIds = new Set(canvas.nodes.map(n => n.id))
  const idMap = new Map<string, string>()
  const colW = 240
  const rowH = 110
  const cols = 4
  const newNodes: CanvasNode[] = []

  legacy.nodes.forEach((n, i) => {
    const newId = existingIds.has(n.id) ? `cn_mig_${n.id}` : n.id
    idMap.set(n.id, newId)
    newNodes.push({
      id: newId,
      type: 'entity',
      x: n.fx ?? 40 + (i % cols) * colW,
      y: n.fy ?? 40 + Math.floor(i / cols) * rowH,
      label: n.label || n.value,
      entityType: iocTypeToEntityType(n.type),
      description: n.type === 'event'
        ? `from event ${n.fromEventId ?? ''}`
        : `IOC: ${n.type}`,
      countryCode: n.type === 'country'
        ? String(n.properties?.countryCode ?? '')
        : undefined,
    })
  })

  const newEdges: CanvasEdge[] = legacy.edges.map(e => ({
    id: e.id.startsWith('ce_') ? e.id : `ce_mig_${e.id}`,
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
    kind: legacyEdgeKind(e.label),
  }))

  const mergedNodes = [
    ...canvas.nodes,
    ...newNodes.filter(nn => !canvas.nodes.some(cn => cn.id === nn.id)),
  ]
  const mergedEdges = [
    ...canvas.edges,
    ...newEdges.filter(ne => !canvas.edges.some(ce => ce.id === ne.id)),
  ]

  const { investigationGraph: _removed, ...rest } = project
  return { ...rest, analyticalCanvas: { nodes: mergedNodes, edges: mergedEdges } }
}
