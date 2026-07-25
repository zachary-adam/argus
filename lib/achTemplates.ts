import type { ACHHypothesis, CanvasACHNode, GoalCategory } from '@/types/project'

/** Three competing hypotheses per goal template — ACH starter set. */
export const ACH_STARTER_HYPOTHESES: Record<GoalCategory | 'default', [string, string, string]> = {
  elections: [
    'Pre-election violence intensifies as polls approach',
    'Electoral process proceeds with isolated incidents only',
    'Opposition boycott or legal challenge drives instability more than street violence',
  ],
  'civil-unrest': [
    'Protest cycle escalates into sustained mass confrontation',
    'Mobilization peaks and recedes without regime-threatening unrest',
    'Security crackdown suppresses further mobilization before escalation',
  ],
  'armed-conflict': [
    'Fighting intensifies along current frontlines',
    'Conflict settles into protracted stalemate with localized flare-ups',
    'External pressure or negotiation produces a ceasefire window',
  ],
  'economic-crisis': [
    'Economic shock triggers broader political instability',
    'Adjustment measures contain the crisis without regime-threatening fallout',
    'External bailout or commodity recovery averts the worst-case trajectory',
  ],
  'political-stability': [
    'Regime cohesion erodes; leadership transition or coup risk rises',
    'Elite bargain holds and institutions absorb pressure',
    'Opposition fragmentation prevents a coordinated challenge to incumbents',
  ],
  humanitarian: [
    'Crisis deepens; access constraints and displacement accelerate',
    'Humanitarian response contains worst outcomes in key corridors',
    'Seasonal or diplomatic factors temporarily ease pressure',
  ],
  'maritime-security': [
    'Chokepoint disruption escalates (attacks, blockades, or insurance withdrawal)',
    'Tensions persist but commercial traffic continues with elevated risk premiums',
    'Naval diplomacy or corridor rerouting reduces immediate threat',
  ],
  counterterrorism: [
    'Militant activity escalates in frequency or lethality',
    'Security operations contain groups without eliminating capability',
    'Factional splits or local deals reduce attack tempo',
  ],
  'cyber-threat': [
    'Critical-infrastructure targeting escalates to disruptive effect',
    'Activity remains espionage-focused without operational disruption',
    'Attribution noise hides a state-sponsored campaign below public threshold',
  ],
  'border-migration': [
    'Displacement flows accelerate due to upstream push factors',
    'Flows stabilize at the current elevated baseline',
    'Host-state policies materially reduce crossings',
  ],
  'supply-chain': [
    'Logistics chokepoint triggers cascading trade disruption',
    'Disruption is localized and absorbed by alternate routing',
    'Policy intervention prevents a sustained supply shock',
  ],
  'public-health': [
    'Outbreak spreads beyond current geography or strain tier',
    'Containment measures limit spread to defined corridors',
    'Reporting gaps exaggerate the apparent trajectory',
  ],
  'information-ops': [
    'Coordinated influence campaign is shaping measurable outcomes',
    'Narrative surges are organic and fragmented, not centrally directed',
    'Counter-narratives and platform action blunt operational impact',
  ],
  'organized-crime': [
    'Cartel violence and territorial contest intensify',
    'Violence plateaus under tacit equilibria between groups',
    'State interdiction shifts routes without reducing underlying capacity',
  ],
  default: [
    'The dominant risk scenario is unfolding as analysts fear',
    'Headline risk is overstated; underlying conditions are more stable',
    'An underweighted alternative explanation fits the evidence better',
  ],
}

export function starterACHHypothesisTexts(opts?: {
  goalTemplateId?: GoalCategory | string | null
  researchQuestion?: string | null
}): [string, string, string] {
  const goalId = opts?.goalTemplateId
  const base = (goalId && goalId in ACH_STARTER_HYPOTHESES)
    ? ACH_STARTER_HYPOTHESES[goalId as GoalCategory]
    : ACH_STARTER_HYPOTHESES.default

  const q = opts?.researchQuestion?.trim()
  if (!q) return base

  const stem = q.replace(/\?+$/, '').trim()
  return [
    `${base[0]} (relevant to: ${stem})`,
    `${base[1]} (relevant to: ${stem})`,
    `${base[2]} (relevant to: ${stem})`,
  ]
}

export function createStarterACHHypotheses(opts?: {
  goalTemplateId?: GoalCategory | string | null
  researchQuestion?: string | null
  stamp?: number
}): ACHHypothesis[] {
  const stamp = opts?.stamp ?? Date.now()
  return starterACHHypothesisTexts(opts).map((text, i) => ({
    id: `h_${stamp}_${i + 1}`,
    text,
  }))
}

export function createStarterACHNode(
  x: number,
  y: number,
  opts?: {
    goalTemplateId?: GoalCategory | string | null
    researchQuestion?: string | null
  },
): CanvasACHNode {
  const stamp = Date.now()
  const researchQuestion = opts?.researchQuestion?.trim()
  return {
    id: `cn_${stamp}`,
    type: 'ach',
    x,
    y,
    hypotheses: createStarterACHHypotheses({ ...opts, stamp }),
    scores: [],
    confidence: 'moderate',
    narrative: researchQuestion ?? '',
  }
}
