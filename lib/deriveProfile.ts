import type { AnalysisProfile, GoalCategory } from '@/types/project'

export function deriveProfile(goal: GoalCategory | null, q: string): AnalysisProfile {
  if (goal === 'armed-conflict' || goal === 'counterterrorism' || goal === 'maritime-security' || goal === 'border-migration') return 'conflict'
  if (goal === 'elections' || goal === 'political-stability' || goal === 'information-ops' || goal === 'organized-crime' || goal === 'civil-unrest') return 'political'
  if (goal === 'economic-crisis' || goal === 'supply-chain') return 'economic'
  if (goal === 'public-health' || goal === 'humanitarian') return 'humanitarian'
  const lower = q.toLowerCase()
  if (/conflict|war|weapon|military|attack|bomb|militant|terror|coup|armed/.test(lower)) return 'conflict'
  if (/election|vote|protest|political|democracy|authoritarian|corruption|governance/.test(lower)) return 'political'
  if (/econom|gdp|debt|inflation|crisis|market|currency|trade|recession|fiscal/.test(lower)) return 'economic'
  if (/health|disease|epidemic|hunger|famine|displace|flood|disaster|humanitar|refugee/.test(lower)) return 'humanitarian'
  return 'general'
}
