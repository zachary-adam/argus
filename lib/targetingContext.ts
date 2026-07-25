import { Targeting } from '@/types/project'

/**
 * Render a project's targeting into a prompt block so the AI frames its analysis
 * at the right zoom — a local project should get a town-level read, not a country
 * summary. Returns '' for global scope (no extra framing needed).
 */
export function targetingToPrompt(t?: Targeting): string {
  if (!t || t.scope === 'global') return ''
  const lines = [`MISSION TARGETING — analysis scope: ${t.scope.toUpperCase()}.`]
  if (t.placeName) lines.push(`Focus location: ${t.placeName}.`)
  if (t.watchEntities?.length) lines.push(`Watch entities: ${t.watchEntities.join(', ')}.`)
  if (t.keywords?.length) lines.push(`Priority topics: ${t.keywords.join(', ')}.`)
  if (t.keyDate) lines.push(`Key date to weigh: ${t.keyDate}.`)
  lines.push('Center the assessment on this location/topic; relate broader events to it and say so when local reporting is thin.')
  return lines.join('\n')
}
