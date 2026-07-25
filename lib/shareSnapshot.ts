import type { IntelEvent, Plot, CorrelationAlert } from '@/types'
import type { Project, CanvasACHNode } from '@/types/project'

export interface ShareSnapshotCase {
  name: string
  status: string
  eventCount: number
}

export interface ShareSnapshotCanvas {
  nodeCount: number
  eventNodes: number
  achNodes: number
  leadHypothesis?: string
}

export interface ShareSnapshotBrief {
  bluf: string
  situation: string
  keyFindings: Array<{ finding: string; significance: string; confidence: string }>
  patterns: string
  outlook: string
  analystNote: string
}

export interface ShareSnapshotState {
  projectName: string
  researchQuestion?: string
  viewport: { latitude: number; longitude: number; zoom: number }
  eventCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
  topEvents: {
    id: string
    title: string
    severity: string
    country: string
    lat: number
    lon: number
    source: string
    sourceReliability?: string
    sourceCredibility?: number
    corroborationCount?: number
    time: string
  }[]
  alerts: {
    id: string
    title: string
    severity: string
    signalCount: number
    lat: number
    lon: number
  }[]
  plots: {
    id: string
    type: string
    coordinates: number[] | number[][]
    label: string | null
    threat_level?: string
  }[]
  cases?: ShareSnapshotCase[]
  canvas?: ShareSnapshotCanvas
  forecastsOpen?: number
  aiBrief?: ShareSnapshotBrief
  generatedAt: string
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

export function buildShareSnapshotState(opts: {
  project: Project | null
  viewport: { latitude: number; longitude: number; zoom: number }
  events: IntelEvent[]
  alerts: CorrelationAlert[]
  plots: Plot[]
}): ShareSnapshotState {
  const { project, viewport, events, alerts, plots } = opts
  const nodes = project?.analyticalCanvas?.nodes ?? []
  const achNodes = nodes.filter((n): n is CanvasACHNode => n.type === 'ach')
  const lead = achNodes.map(achLeadHypothesis).find(Boolean)

  return {
    projectName: project?.name ?? '',
    researchQuestion: project?.researchQuestion?.trim() || undefined,
    viewport,
    eventCount: events.length,
    criticalCount: events.filter(e => e.severity === 'critical').length,
    highCount: events.filter(e => e.severity === 'high').length,
    mediumCount: events.filter(e => e.severity === 'medium').length,
    topEvents: events.slice(0, 30).map(e => ({
      id: e.id,
      title: e.title,
      severity: e.severity,
      country: e.country ?? '',
      lat: e.lat,
      lon: e.lon,
      source: e.source ?? '',
      sourceReliability: e.sourceReliability,
      sourceCredibility: e.sourceCredibility,
      corroborationCount: e.corroborationCount,
      time: e.timestamp ?? '',
    })),
    alerts: alerts.slice(0, 20).map(a => ({
      id: a.id,
      title: a.title,
      severity: a.severity,
      signalCount: a.signalCount ?? 0,
      lat: a.lat ?? 0,
      lon: a.lon ?? 0,
    })),
    plots: plots.slice(0, 50).map(p => ({
      id: p.id,
      type: p.type,
      coordinates: p.coordinates,
      label: p.label,
      threat_level: p.properties?.threat_level,
    })),
    cases: (project?.cases ?? []).length > 0
      ? (project!.cases ?? []).map(c => ({
          name: c.name,
          status: c.status,
          eventCount: c.eventIds.length,
        }))
      : undefined,
    canvas: nodes.length > 0
      ? {
          nodeCount: nodes.length,
          eventNodes: nodes.filter(n => n.type === 'event').length,
          achNodes: achNodes.length,
          leadHypothesis: lead ?? undefined,
        }
      : undefined,
    forecastsOpen: (project?.forecasts ?? []).filter(f => !f.resolved).length || undefined,
    generatedAt: new Date().toISOString(),
  }
}
