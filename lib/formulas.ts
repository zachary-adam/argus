import { Formula } from '@/types/project'
import { GOAL_TEMPLATES } from '@/lib/goalTemplates'

export const FORMULA_LIBRARY: Formula[] = [
  {
    id: 'conflict-intensity-score',
    name: 'Conflict Intensity Score',
    category: 'armed-conflict',
    description: 'Composite score measuring active conflict severity using event frequency, fatality rates, actor proliferation, and displacement as proxy indicators.',
    academicBasis: 'Adapted from UCDP Battle-Deaths Dataset methodology (Lacina & Gleditsch, 2005) and Armed Conflict Location & Event Data Project (ACLED) intensity metrics.',
    outputLabel: 'Conflict Intensity',
    outputRange: [0, 100],
    variables: [
      { key: 'event_freq', label: 'Event Frequency', description: 'Number of conflict events per 30-day window in region', weight: 0.30, defaultWeight: 0.30, min: 0, max: 1, citation: 'ACLED Regional Conflict Index' },
      { key: 'fatality_rate', label: 'Fatality Rate', description: 'Estimated fatalities per incident (normalized 0–1 vs regional max)', weight: 0.35, defaultWeight: 0.35, min: 0, max: 1, citation: 'UCDP Georeferenced Event Dataset' },
      { key: 'actor_count', label: 'Armed Actor Proliferation', description: 'Number of distinct armed actors active in region', weight: 0.20, defaultWeight: 0.20, min: 0, max: 1, citation: 'ACLED Actor Typology' },
      { key: 'displacement', label: 'Displacement Pressure', description: 'IDP/refugee outflow as share of regional population', weight: 0.15, defaultWeight: 0.15, min: 0, max: 1, citation: 'UNHCR Global Trends' },
    ],
    assumptions: [
      { id: 'a1', text: 'Conflict events are geocoded accurately to the region of interest', accepted: false },
      { id: 'a2', text: 'Fatality figures from open-source reporting undercount true casualties by 20–40%', accepted: false },
      { id: 'a3', text: 'Actor proliferation is a leading indicator of conflict escalation, not a lagging one', accepted: false },
      { id: 'a4', text: 'Displacement data reflects recent 90-day trends, not cumulative stock', accepted: false },
    ],
  },
  {
    id: 'electoral-violence-risk',
    name: 'Electoral Violence Risk',
    category: 'elections',
    description: 'Pre-election violence probability score based on historical precedent, political exclusion, incumbent behavior, and security force posture.',
    academicBasis: 'Based on Straus & Taylor (2012) "Democratization and Electoral Violence in Sub-Saharan Africa" and the Electoral Integrity Project (Norris, 2014).',
    outputLabel: 'Violence Risk',
    outputRange: [0, 100],
    variables: [
      { key: 'hist_violence', label: 'Historical Violence Precedent', description: 'Prior elections with documented violence in same country/region', weight: 0.30, defaultWeight: 0.30, min: 0, max: 1, citation: 'NELDA Dataset (Hyde & Marinov)' },
      { key: 'political_exclusion', label: 'Political Exclusion Index', description: 'Degree to which major groups are barred from participation', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'V-Dem Electoral Participation Index' },
      { key: 'incumbent_risk', label: 'Incumbent Vulnerability', description: 'Electoral threat perceived by ruling party/incumbent', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'Straus & Taylor (2012)' },
      { key: 'security_posture', label: 'Security Force Militarization', description: 'Level of armed forces deployment ahead of election', weight: 0.20, defaultWeight: 0.20, min: 0, max: 1, citation: 'ACLED Political Violence Dataset' },
    ],
    assumptions: [
      { id: 'a1', text: 'Historical patterns in the same country are the strongest predictor of future violence', accepted: false },
      { id: 'a2', text: 'Security force militarization is measured by observed deployments, not declared mandate', accepted: false },
      { id: 'a3', text: 'This model does not account for international peacekeeping deterrence effects', accepted: false },
    ],
  },
  {
    id: 'fragility-index',
    name: 'State Fragility Index',
    category: 'political-stability',
    description: 'Multidimensional assessment of state fragility combining security apparatus strength, political legitimacy, economic capacity, and social cohesion.',
    academicBasis: 'Based on the Fund for Peace Fragile States Index methodology (2023) and Rotberg\'s "When States Fail" (2004). Operationalized using GDELT and open-source proxy indicators.',
    outputLabel: 'Fragility Score',
    outputRange: [0, 100],
    variables: [
      { key: 'security_apparatus', label: 'Security Apparatus', description: 'State monopoly on violence; presence of paramilitaries, militias', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'Fragile States Index — Security Indicator' },
      { key: 'political_legitimacy', label: 'Political Legitimacy', description: 'Public confidence in government; election credibility; protest levels', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'V-Dem Liberal Democracy Index' },
      { key: 'economic_decline', label: 'Economic Decline', description: 'GDP contraction, inflation, unemployment relative to regional baseline', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'World Bank Economic Indicators' },
      { key: 'group_grievance', label: 'Group Grievance', description: 'Ethnic, religious, or class-based grievances and discrimination', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'Minorities at Risk Dataset' },
    ],
    assumptions: [
      { id: 'a1', text: 'All four dimensions are equally weighted by default; adjust based on analyst judgment', accepted: false },
      { id: 'a2', text: 'Proxy indicators from GDELT event counts are used where direct survey data is unavailable', accepted: false },
      { id: 'a3', text: 'This formula measures current fragility, not trajectory — pair with trend data for forecasting', accepted: false },
    ],
  },
  {
    id: 'gdelt-unrest-index',
    name: 'Civil Unrest Index',
    category: 'civil-unrest',
    description: 'Real-time civil unrest intensity using GDELT event tone, protest frequency, security response escalation, and media attention as inputs.',
    academicBasis: 'Derived from Leetaru & Schrodt (2013) GDELT methodology and Ward et al. (2013) "Comparing GDELT and ICEWS Event Data." Protest detection via CAMEO event codes 14x.',
    outputLabel: 'Unrest Index',
    outputRange: [0, 100],
    variables: [
      { key: 'protest_freq', label: 'Protest Frequency', description: 'CAMEO 14x events (protests, demonstrations) per 7-day window', weight: 0.35, defaultWeight: 0.35, min: 0, max: 1, citation: 'GDELT CAMEO 14x Event Codes' },
      { key: 'security_response', label: 'Security Response Severity', description: 'Police/military response intensity (arrests, violence against protesters)', weight: 0.30, defaultWeight: 0.30, min: 0, max: 1, citation: 'ACLED Political Violence — Civilians' },
      { key: 'grievance_signal', label: 'Economic Grievance Signal', description: 'Inflation, unemployment, fuel price shock severity in region', weight: 0.20, defaultWeight: 0.20, min: 0, max: 1, citation: 'World Bank Commodity Price Data' },
      { key: 'media_attention', label: 'Media Escalation', description: 'Volume and tone of international media coverage (GDELT Global Knowledge Graph)', weight: 0.15, defaultWeight: 0.15, min: 0, max: 1, citation: 'GDELT Global Knowledge Graph (GKG)' },
    ],
    assumptions: [
      { id: 'a1', text: 'GDELT event counts are used as frequency proxies; they may double-count single events across outlets', accepted: false },
      { id: 'a2', text: 'Low media coverage does not equal low unrest — information suppression may inflate this indicator', accepted: false },
      { id: 'a3', text: 'Security response data lags 24–72 hours in open-source reporting', accepted: false },
    ],
  },
  {
    id: 'debt-distress-index',
    name: 'Debt Distress Index',
    category: 'economic-crisis',
    description: 'Assesses sovereign debt stress risk using external debt burden, reserve adequacy, current account dynamics, and creditor composition.',
    academicBasis: 'Based on IMF Debt Sustainability Analysis (DSA) framework and Reinhart & Rogoff (2009) "This Time Is Different." Threshold indicators from IMF LIC DSA (2018).',
    outputLabel: 'Debt Stress Risk',
    outputRange: [0, 100],
    variables: [
      { key: 'debt_to_gdp', label: 'External Debt / GDP', description: 'Total external debt as share of GDP; >60% LIC threshold = high', weight: 0.30, defaultWeight: 0.30, min: 0, max: 1, citation: 'IMF LIC DSA Thresholds (2018)' },
      { key: 'reserve_coverage', label: 'Reserve Coverage', description: 'Foreign reserves in months of import cover; <3 months = critical', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'IMF World Economic Outlook' },
      { key: 'current_account', label: 'Current Account Deficit', description: 'CAD as % of GDP; persistent deficit signals vulnerability', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'Reinhart & Rogoff (2009)' },
      { key: 'creditor_concentration', label: 'Creditor Concentration Risk', description: 'Share of debt held by single bilateral creditor (e.g. China)', weight: 0.20, defaultWeight: 0.20, min: 0, max: 1, citation: 'AidData Tracking Underreported Financial Flows' },
    ],
    assumptions: [
      { id: 'a1', text: 'Debt figures are from most recent IMF Article IV or World Bank data — may lag 6–18 months', accepted: false },
      { id: 'a2', text: 'This model does not capture off-balance-sheet SOE liabilities or collateralized resource loans', accepted: false },
      { id: 'a3', text: 'Creditor concentration risk is directional, not deterministic — political relations matter', accepted: false },
    ],
  },
  {
    id: 'ipc-crisis-model',
    name: 'Humanitarian Crisis Severity',
    category: 'humanitarian',
    description: 'Composite humanitarian crisis score using IPC food security phase, displacement severity, aid access constraints, and health system stress.',
    academicBasis: 'Based on IPC Technical Manual v3.1 (2021) and OCHA Humanitarian Needs Overview methodology. Access constraint scoring from ACAPS Humanitarian Access framework.',
    outputLabel: 'Crisis Severity',
    outputRange: [0, 100],
    variables: [
      { key: 'food_insecurity', label: 'Food Insecurity (IPC Phase)', description: 'Share of population in IPC Phase 3+ (Crisis or above)', weight: 0.35, defaultWeight: 0.35, min: 0, max: 1, citation: 'IPC Technical Manual v3.1 (2021)' },
      { key: 'displacement', label: 'Displacement Severity', description: 'IDP + refugee count relative to pre-crisis baseline population', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'UNHCR Global Trends; DTM IOM' },
      { key: 'aid_access', label: 'Aid Access Constraints', description: 'Physical, administrative, and security barriers to humanitarian delivery', weight: 0.25, defaultWeight: 0.25, min: 0, max: 1, citation: 'ACAPS Humanitarian Access Report' },
      { key: 'health_stress', label: 'Health System Stress', description: 'Functional health facilities; disease outbreak risk; mortality rates', weight: 0.15, defaultWeight: 0.15, min: 0, max: 1, citation: 'WHO Health Cluster Situation Reports' },
    ],
    assumptions: [
      { id: 'a1', text: 'IPC classifications are used as-is; contested classifications in active conflict zones may understate severity', accepted: false },
      { id: 'a2', text: 'Aid access is assessed based on reported constraints, not actual delivery figures', accepted: false },
      { id: 'a3', text: 'Health system stress is proxied from event data where WHO Situation Reports are unavailable', accepted: false },
    ],
  },
]

export function getFormulasForGoal(goalId: string): Formula[] {
  return FORMULA_LIBRARY.filter(f => f.category === goalId)
}

/** Primary formula for a goal template — falls back to first category match. */
export function defaultFormulaIdForGoal(goalId?: string | null): string {
  const tpl = GOAL_TEMPLATES.find(g => g.id === goalId)
  for (const id of tpl?.defaultFormulas ?? []) {
    if (getFormula(id)) return id
  }
  return getFormulasForGoal(goalId ?? '')[0]?.id ?? FORMULA_LIBRARY[0].id
}

export function getFormula(id: string): Formula | undefined {
  return FORMULA_LIBRARY.find(f => f.id === id)
}

// Execute a formula given variable values (0-1) and weight overrides
export function executeFormula(
  formula: Formula,
  values: Record<string, number>,
  weightOverrides?: Record<string, number>
): number {
  let totalWeight = 0
  let weightedSum = 0
  for (const v of formula.variables) {
    const w = weightOverrides?.[v.key] ?? v.weight
    const val = values[v.key] ?? 0
    weightedSum += val * w
    totalWeight += w
  }
  if (totalWeight === 0) return 0
  return Math.round((weightedSum / totalWeight) * 100)
}

// Compute confidence breakdown from event data and formula assumptions
export function computeConfidence(
  formula: Formula,
  values: Record<string, number>,
  eventCount: number,
  ledgerAccuracy?: number // 0-1 from prediction ledger
): { dataQuality: number; formulaFit: number; historicalAccuracy: number; composite: number } {
  // Data quality: based on how many variables have non-default values + event volume
  const filledVars = Object.values(values).filter(v => v > 0).length
  const varCoverage = filledVars / formula.variables.length
  const eventBonus = Math.min(1, eventCount / 20)
  const dataQuality = Math.round((varCoverage * 0.7 + eventBonus * 0.3) * 100) / 100

  // Formula fit: based on assumptions accepted
  const acceptedAssumptions = formula.assumptions.filter(a => a.accepted).length
  const formulaFit = formula.assumptions.length === 0 ? 0 : Math.round((acceptedAssumptions / formula.assumptions.length) * 100) / 100

  // Historical accuracy: from ledger, default 0.5 if unknown
  const historicalAccuracy = ledgerAccuracy ?? 0.5

  const composite = Math.round(((dataQuality * 0.4 + formulaFit * 0.35 + historicalAccuracy * 0.25)) * 100) / 100

  return { dataQuality, formulaFit, historicalAccuracy, composite }
}
