import type { GraphNodeType } from '@/types'
import type { CanvasEntityNode } from '@/types/project'
import { gridCanvasPositions } from '@/lib/canvasEvents'

export function iocTypeToEntityType(type: GraphNodeType): CanvasEntityNode['entityType'] {
  if (type === 'country') return 'country'
  if (type === 'person') return 'actor'
  if (type === 'organization') return 'organization'
  return 'location'
}

export function detectedEntitiesToCanvasNodes(
  items: Array<{ type: GraphNodeType; raw: string; label: string }>,
  startOffset = { x: 40, y: 400 },
): CanvasEntityNode[] {
  const positions = gridCanvasPositions(items.length, {
    cols: 4,
    colW: 240,
    rowH: 110,
    startX: startOffset.x,
    startY: startOffset.y,
  })
  const stamp = Date.now()
  return items.map((e, i) => ({
    id: `cn_ioc_${stamp}_${i}`,
    type: 'entity',
    x: positions[i].x,
    y: positions[i].y,
    label: e.label || e.raw,
    entityType: iocTypeToEntityType(e.type),
    description: e.type,
  }))
}
