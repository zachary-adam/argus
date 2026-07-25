/**
 * Indicators & Warning (I&W) — the core political-risk analytic technique.
 *
 * The analyst defines falsifiable indicators ("what would confirm / break this
 * hypothesis"), each bound to match terms. As live events flow in, an indicator
 * "trips" when events match its terms — turning the canvas into a live warning
 * board. Deliberately lightweight (keyword match over event text) so it's self
 * contained and explainable, not a black box.
 */
import type { CanvasIndicator } from '@/types/project'
import type { GoalCategory } from '@/types/project'

export interface IndicatorMatch {
  matchCount: number
  tripped: boolean
  sampleTitles: string[]
}

/** Split a raw "troops, mobilization; armor" string into clean lowercase terms. */
export function indicatorTerms(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length >= 2)
}

/** Count events whose title/summary contains any of the indicator's terms. */
export function evaluateIndicator(
  keywords: string,
  events: Array<{ title?: string; summary?: string }>,
): IndicatorMatch {
  const terms = indicatorTerms(keywords)
  if (terms.length === 0) return { matchCount: 0, tripped: false, sampleTitles: [] }
  const matched = events.filter(e => {
    const hay = `${e.title ?? ''} ${e.summary ?? ''}`.toLowerCase()
    return terms.some(t => hay.includes(t))
  })
  return {
    matchCount: matched.length,
    tripped: matched.length > 0,
    sampleTitles: matched.slice(0, 3).map(e => e.title ?? '').filter(Boolean),
  }
}

let _seq = 0
function mkIndicator(text: string, keywords: string, direction: 'confirms' | 'refutes'): CanvasIndicator {
  return { id: `ind_${Date.now()}_${_seq++}`, text, keywords, direction }
}

/** Starter indicator sets per goal — a credible first draft the analyst then tunes.
 *  Partial: goals without a tailored set fall back to `default`. */
const STARTERS: Partial<Record<GoalCategory, Array<[string, string, 'confirms' | 'refutes']>>>
  & { default: Array<[string, string, 'confirms' | 'refutes']> } = {
  elections: [
    ['Inflammatory rhetoric from candidates or parties', 'incite, hate speech, inflammatory, ethnic, provocation', 'confirms'],
    ['Security forces deployed ahead of polls', 'deployment, troops, paramilitary, curfew, security forces', 'confirms'],
    ['Voter intimidation or ballot interference', 'intimidation, voter, ballot, polling station, rigging', 'confirms'],
    ['Opposition shifts to legal challenge or boycott', 'boycott, court, petition, legal challenge, walkout', 'refutes'],
  ],
  'armed-conflict': [
    ['Cross-border troop or armor movements', 'troop, armor, tank, deployment, mobilization, reinforcement', 'confirms'],
    ['Strikes on civilian infrastructure', 'hospital, power plant, civilian, energy, infrastructure, water', 'confirms'],
    ['Heavy shelling or frontline offensive', 'shelling, offensive, assault, frontline, advance', 'confirms'],
    ['Ceasefire or negotiation signals', 'ceasefire, truce, negotiation, peace talks, withdrawal', 'refutes'],
  ],
  'civil-unrest': [
    ['Protest size or frequency rising', 'protest, demonstration, rally, march, strike', 'confirms'],
    ['Security crackdown on demonstrators', 'crackdown, arrest, tear gas, police, detained', 'confirms'],
    ['General strike or labor mobilization', 'general strike, union, walkout, shutdown', 'confirms'],
    ['Government concession or dialogue offer', 'concession, dialogue, talks, reform, resign', 'refutes'],
  ],
  'political-stability': [
    ['Elite defections or coup rumors', 'coup, defection, resignation, mutiny, faction', 'confirms'],
    ['Mass anti-government mobilization', 'protest, uprising, opposition, rally', 'confirms'],
    ['Crackdown on dissent or media', 'censorship, arrest, crackdown, dissident, shutdown', 'confirms'],
    ['Institutional or elite bargain holds', 'agreement, coalition, power-sharing, stability', 'refutes'],
  ],
  'economic-crisis': [
    ['Currency or reserve collapse', 'devaluation, currency, reserves, default, inflation', 'confirms'],
    ['Subsidy cuts or price shocks', 'subsidy, price hike, fuel, bread, austerity', 'confirms'],
    ['Bank runs or capital flight', 'bank run, capital flight, withdrawal, freeze', 'confirms'],
    ['IMF deal or external bailout', 'IMF, bailout, loan, restructuring, package', 'refutes'],
  ],
  humanitarian: [
    ['Displacement or refugee surge', 'displacement, refugee, IDP, flee, exodus', 'confirms'],
    ['Aid access blocked or attacked', 'aid blocked, convoy, access denied, attack on aid', 'confirms'],
    ['Disease outbreak or famine signals', 'outbreak, cholera, famine, malnutrition, epidemic', 'confirms'],
    ['Humanitarian corridor or relief opens', 'corridor, relief, ceasefire, access granted', 'refutes'],
  ],
  'maritime-security': [
    ['Attacks or seizures near chokepoint', 'attack, seizure, hijack, missile, drone boat', 'confirms'],
    ['Naval buildup or blockade', 'naval, blockade, warship, patrol, escort', 'confirms'],
    ['Insurance withdrawal or rerouting', 'insurance, reroute, suspend, premium', 'confirms'],
    ['De-escalation or corridor agreement', 'agreement, de-escalation, corridor, talks', 'refutes'],
  ],
  counterterrorism: [
    ['Attack claims or cell activity', 'claim, attack, bombing, cell, militant', 'confirms'],
    ['Recruitment or propaganda surge', 'recruitment, propaganda, pledge, radicalization', 'confirms'],
    ['Cross-border fighter movement', 'fighter, border crossing, infiltration, smuggling', 'confirms'],
    ['Leadership decapitation or surrender', 'killed, captured, surrender, raid, leader', 'refutes'],
  ],
  default: [
    ['Escalatory rhetoric or threats', 'threat, ultimatum, escalate, warning, provocation', 'confirms'],
    ['Security force mobilization', 'deployment, troops, security, mobilization, forces', 'confirms'],
    ['Violence or casualties reported', 'killed, attack, clash, violence, casualties', 'confirms'],
    ['De-escalation or negotiation', 'talks, ceasefire, agreement, dialogue, withdrawal', 'refutes'],
  ],
}

/** Build a starter I&W node for a goal at a canvas position. */
export function createStarterIndicatorNode(
  x: number, y: number, opts: { goalTemplateId?: GoalCategory; researchQuestion?: string },
): import('@/types/project').CanvasIndicatorNode {
  const set = STARTERS[opts.goalTemplateId ?? 'default'] ?? STARTERS.default
  return {
    id: `cn_${Date.now()}`,
    type: 'indicator',
    x, y,
    title: opts.researchQuestion?.trim() ? opts.researchQuestion.trim().slice(0, 80) : 'Indicators & Warning',
    indicators: set.map(([text, keywords, direction]) => mkIndicator(text, keywords, direction)),
  }
}
