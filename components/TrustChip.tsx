import { eventConfidence, confidenceLabel, natoCode, stalenessFactor } from '@/lib/sourceWeight'
import type { IntelEvent } from '@/types'

/**
 * The single, canonical way to display an event's trust signal across every surface
 * (feed, detail drawer, share snapshot). Shows a plain-language confidence label;
 * NATO Admiralty code (e.g. B3) stays in the tooltip for analysts who want it.
 */
type TrustInput = {
  source?: string
  sourceReliability?: string
  sourceCredibility?: number
  corroborationCount?: number
  timestamp?: string
}

export function TrustChip({ event, size }: { event: TrustInput; size?: 'xs' }) {
  const e = {
    source: (event.source ?? '') as IntelEvent['source'],
    sourceReliability: event.sourceReliability,
    sourceCredibility: event.sourceCredibility,
    corroborationCount: event.corroborationCount,
  }
  const raw = eventConfidence(e)
  const staleness = stalenessFactor(event.timestamp, event.corroborationCount ?? 1)
  const conf = raw * staleness
  const tier = conf >= 0.75 ? 'high' : conf >= 0.5 ? 'mod' : 'low'
  const code = natoCode(e)
  const label = confidenceLabel(conf)
  const corr = event.corroborationCount && event.corroborationCount > 1 ? event.corroborationCount : null
  const agedNote = staleness < 1
    ? ` · aged −${Math.round((1 - staleness) * 100)}% (uncorroborated confidence decays after 72h)`
    : ''
  const title = `${label} source (${code})${corr ? ` · ${corr} independent sources` : ''}${agedNote}`
  return (
    <span
      title={title}
      className={`ui-chip ui-trust-chip ui-trust-chip--${tier}${size === 'xs' ? ' ui-chip--xs' : ''}`}
    >
      {label}{corr ? ` ×${corr}` : ''}
    </span>
  )
}
