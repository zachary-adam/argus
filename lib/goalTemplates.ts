import { GoalTemplate, GoalCategory } from '@/types/project'

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: 'elections',
    category: 'elections',
    name: 'Election Integrity',
    description: 'Monitor electoral processes, detect irregularities, assess stability risk around election cycles.',
    icon: '',
    defaultFormulas: ['electoral-violence-risk'],
    suggestedSources: ['gdelt', 'rss', 'reliefweb', 'wikidata'],
    keyIndicators: [
      'Pre-election violence incidents',
      'Media freedom index',
      'Opposition arrests',
      'Protest frequency delta',
      'International observer access',
    ],
    exampleRegions: ['West Africa', 'Central America', 'Southeast Asia'],
  },
  {
    id: 'civil-unrest',
    category: 'civil-unrest',
    name: 'Civil Unrest',
    description: 'Track protest movements, social mobilization, and mass unrest drivers across a region.',
    icon: '',
    defaultFormulas: ['gdelt-unrest-index'],
    suggestedSources: ['gdelt', 'rss', 'reliefweb'],
    keyIndicators: [
      'Protest event frequency',
      'Security force response severity',
      'Grievance indicators (inflation, unemployment)',
      'Social media mobilization signals',
      'Historical precedent similarity',
    ],
    exampleRegions: ['Middle East & North Africa', 'Sub-Saharan Africa', 'South America'],
  },
  {
    id: 'armed-conflict',
    category: 'armed-conflict',
    name: 'Armed Conflict',
    description: 'Analyze active conflict dynamics, armed group activity, territorial control, and escalation vectors.',
    icon: '',
    defaultFormulas: ['conflict-intensity-score'],
    suggestedSources: ['gdelt', 'reliefweb', 'ocha', 'usgs'],
    keyIndicators: [
      'Battle event frequency',
      'Fatality counts and trend',
      'Displacement figures',
      'Armed actor proliferation',
      'Territorial change rate',
    ],
    exampleRegions: ['Sahel', 'Eastern Europe', 'Middle East'],
  },
  {
    id: 'economic-crisis',
    category: 'economic-crisis',
    name: 'Economic Crisis',
    description: 'Assess economic shock risk — currency collapse, debt distress, sanctions impact, commodity shocks.',
    icon: '',
    defaultFormulas: ['debt-distress-index'],
    suggestedSources: ['gdelt', 'rss', 'wikidata', 'reliefweb'],
    keyIndicators: [
      'Currency depreciation rate',
      'Debt-to-GDP ratio',
      'Foreign reserve levels',
      'Inflation trajectory',
      'Capital flight signals',
    ],
    exampleRegions: ['Latin America', 'Southern Africa', 'Central Asia'],
  },
  {
    id: 'political-stability',
    category: 'political-stability',
    name: 'Political Stability',
    description: 'Assess regime resilience, coup risk, elite fragmentation, and institutional strength.',
    icon: '',
    defaultFormulas: ['fragility-index'],
    suggestedSources: ['gdelt', 'rss', 'wikidata', 'reliefweb'],
    keyIndicators: [
      'Elite cohesion signals',
      'Military loyalty indicators',
      'Constitutional crisis events',
      'Succession uncertainty',
      'Institutional capacity proxies',
    ],
    exampleRegions: ['Central Africa', 'Central Asia', 'Southeast Asia'],
  },
  {
    id: 'humanitarian',
    category: 'humanitarian',
    name: 'Humanitarian Crisis',
    description: 'Monitor food insecurity, displacement, access constraints, and humanitarian response gaps.',
    icon: '',
    defaultFormulas: ['ipc-crisis-model'],
    suggestedSources: ['reliefweb', 'ocha', 'who', 'firms', 'gdacs'],
    keyIndicators: [
      'IPC Phase 3+ population',
      'Displacement trends',
      'Aid access constraints',
      'Health system stress',
      'Climate shock overlay',
    ],
    exampleRegions: ['Horn of Africa', 'Yemen', 'Syria'],
  },
  {
    id: 'maritime-security', category: 'maritime-security', name: 'Maritime Security',
    description: 'Track chokepoint threats, sanctioned/dark-fleet vessels, and naval posture along sea lanes.',
    icon: '', defaultFormulas: [], suggestedSources: ['gdelt', 'rss', 'reliefweb'],
    keyIndicators: ['Vessels near chokepoints', 'Sanctioned/dark-fleet activity', 'Naval deployments', 'Attacks on shipping', 'AIS gaps / spoofing'],
    exampleRegions: ['Red Sea', 'Strait of Hormuz', 'South China Sea'],
  },
  {
    id: 'counterterrorism', category: 'counterterrorism', name: 'Counterterrorism',
    description: 'Monitor militant group activity, attacks, recruitment, and territorial control.',
    icon: '', defaultFormulas: [], suggestedSources: ['gdelt', 'rss', 'acled'],
    keyIndicators: ['Attack frequency & lethality', 'Group claims of responsibility', 'Territorial control shifts', 'Cross-border movement', 'Security force operations'],
    exampleRegions: ['Sahel', 'Levant', 'Afghanistan-Pakistan'],
  },
  {
    id: 'cyber-threat', category: 'cyber-threat', name: 'Cyber Threat',
    description: 'Track cyberattacks, critical-infrastructure intrusions, and state-linked operations.',
    icon: '', defaultFormulas: [], suggestedSources: ['gdelt', 'rss'],
    keyIndicators: ['Critical-infrastructure intrusions', 'Ransomware / disruption events', 'Attributed APT activity', 'Data-breach disclosures', 'OT/ICS targeting'],
    exampleRegions: ['Eastern Europe', 'East Asia', 'North America'],
  },
  {
    id: 'border-migration', category: 'border-migration', name: 'Border & Migration',
    description: 'Assess migration flows, border incidents, and displacement pressure.',
    icon: '', defaultFormulas: [], suggestedSources: ['reliefweb', 'unhcr', 'gdelt', 'rss'],
    keyIndicators: ['Crossing volumes', 'Border clashes/closures', 'Displacement triggers', 'Smuggling-route shifts', 'Host-state response'],
    exampleRegions: ['US-Mexico border', 'Mediterranean', 'Myanmar-Bangladesh'],
  },
  {
    id: 'supply-chain', category: 'supply-chain', name: 'Supply Chain & Trade',
    description: 'Monitor trade disruption, commodity shocks, and logistics chokepoints.',
    icon: '', defaultFormulas: [], suggestedSources: ['gdelt', 'rss'],
    keyIndicators: ['Port/route disruption', 'Commodity price shocks', 'Export controls / sanctions', 'Strikes & blockades', 'Critical-mineral flows'],
    exampleRegions: ['Suez Canal', 'Taiwan Strait', 'Panama Canal'],
  },
  {
    id: 'public-health', category: 'public-health', name: 'Public Health & Pandemic',
    description: 'Track outbreaks, health-system stress, and biosecurity signals.',
    icon: '', defaultFormulas: [], suggestedSources: ['who', 'reliefweb', 'gdelt', 'rss'],
    keyIndicators: ['Outbreak declarations', 'Case/death trends', 'Health-system capacity', 'Vaccine/aid access', 'Cross-border spread risk'],
    exampleRegions: ['Central Africa', 'South Asia', 'Southeast Asia'],
  },
  {
    id: 'information-ops', category: 'information-ops', name: 'Information Operations',
    description: 'Detect disinformation campaigns, narrative manipulation, and coordinated influence.',
    icon: '', defaultFormulas: [], suggestedSources: ['gdelt', 'rss'],
    keyIndicators: ['Coordinated narrative surges', 'State-media amplification', 'Bot/inauthentic activity', 'Deepfake / forgery reports', 'Election-adjacent influence'],
    exampleRegions: ['Eastern Europe', 'Sahel', 'Latin America'],
  },
  {
    id: 'organized-crime', category: 'organized-crime', name: 'Organized Crime & Narcotics',
    description: 'Track cartel/gang activity, trafficking routes, and illicit economies.',
    icon: '', defaultFormulas: [], suggestedSources: ['gdelt', 'rss', 'acled'],
    keyIndicators: ['Cartel/gang violence', 'Trafficking-route shifts', 'Seizures & interdictions', 'Corruption / state capture', 'Territorial control'],
    exampleRegions: ['Mexico & Central America', 'Andean region', 'West Africa'],
  },
]

export function getTemplate(id: string): GoalTemplate | undefined {
  return GOAL_TEMPLATES.find(t => t.id === id)
}

/** Validate a raw category/id string against known goal templates. */
export function normalizeGoalCategory(raw: string | undefined | null): GoalCategory | undefined {
  if (!raw?.trim()) return undefined
  const id = raw.trim().toLowerCase().replace(/_/g, '-')
  return GOAL_TEMPLATES.find(t => t.category === id || t.id === id)?.category
}

/** Rules-based category guess when the analyst hasn't picked a template yet. */
export function inferGoalCategoryFromContext(opts: {
  regionName?: string
  countryCodes?: string[]
  researchQuestion?: string
  keywords?: string[]
  goalName?: string
}): GoalCategory | undefined {
  const text = [
    opts.goalName,
    opts.researchQuestion,
    opts.regionName,
    ...(opts.keywords ?? []),
  ].filter(Boolean).join(' ').toLowerCase()

  if (/\b(election|vote|ballot|referendum|polling)\b/.test(text)) return 'elections'
  if (/\b(protest|unrest|riot|demonstration|mobilization)\b/.test(text)) return 'civil-unrest'
  if (/\b(conflict|war|military|lac|border|clash|ceasefire|escalat|standoff|troops|tension)\b/.test(text)) return 'armed-conflict'
  if (/\b(econom|inflation|debt|sanction|currency|trade war)\b/.test(text)) return 'economic-crisis'
  if (/\b(humanitarian|refugee|displaced|famine|aid convoy)\b/.test(text)) return 'humanitarian'
  if (/\b(maritime|vessel|shipping|strait|navy|piracy)\b/.test(text)) return 'maritime-security'
  if (/\b(terror|militant|insurgent|extremist|bombing)\b/.test(text)) return 'counterterrorism'
  if (/\b(cyber|hack|malware|ransomware)\b/.test(text)) return 'cyber-threat'
  if (/\b(migration|migrant|smuggl)\b/.test(text)) return 'border-migration'
  if (/\b(outbreak|pandemic|epidemic|health crisis)\b/.test(text)) return 'public-health'
  if (/\b(disinfo|propaganda|information op|influence op)\b/.test(text)) return 'information-ops'
  if (/\b(cartel|narcotics|trafficking|organized crime)\b/.test(text)) return 'organized-crime'
  if ((opts.countryCodes?.length ?? 0) >= 2) return 'armed-conflict'
  return 'political-stability'
}

// Baseline search keywords per goal — used to scope a NEW project's collection
// from minute one when the analyst hasn't typed their own. Key-free, so every
// project is situation-scoped on creation instead of showing global noise.
export const GOAL_KEYWORDS: Record<string, string[]> = {
  'elections':           ['election', 'vote', 'polling', 'ballot', 'candidate', 'electoral commission', 'campaign'],
  'civil-unrest':        ['protest', 'demonstration', 'riot', 'strike', 'unrest', 'clashes', 'crackdown'],
  'armed-conflict':      ['attack', 'offensive', 'airstrike', 'clashes', 'militants', 'ceasefire', 'casualties', 'frontline'],
  'economic-crisis':     ['inflation', 'currency', 'default', 'sanctions', 'debt', 'devaluation', 'shortage', 'bailout'],
  'political-stability': ['coup', 'resignation', 'opposition', 'cabinet', 'no-confidence', 'crackdown', 'unrest'],
  'humanitarian':        ['displacement', 'refugees', 'famine', 'aid', 'humanitarian', 'food insecurity', 'shortage'],
  'maritime-security':   ['vessel', 'strait', 'navy', 'shipping', 'tanker', 'blockade', 'piracy'],
  'counterterrorism':    ['militants', 'attack', 'bombing', 'insurgents', 'terror', 'extremist', 'IED'],
  'cyber-threat':        ['cyberattack', 'hack', 'breach', 'ransomware', 'infrastructure', 'malware', 'intrusion'],
  'border-migration':    ['border', 'migrants', 'crossing', 'refugees', 'displacement', 'smuggling'],
  'supply-chain':        ['shortage', 'trade', 'export', 'tariff', 'logistics', 'commodity', 'disruption'],
  'public-health':       ['outbreak', 'disease', 'epidemic', 'health', 'vaccine', 'quarantine', 'cases'],
  'information-ops':     ['disinformation', 'propaganda', 'fake', 'narrative', 'influence', 'deepfake', 'bot'],
  'organized-crime':     ['cartel', 'gang', 'trafficking', 'narcotics', 'seizure', 'corruption', 'smuggling'],
}

export function defaultKeywordsForGoal(goalId?: string | null): string[] {
  return (goalId && GOAL_KEYWORDS[goalId]) ? GOAL_KEYWORDS[goalId] : []
}

// Live tracking (AIS vessels / ADS-B aircraft) is a high-latency capability, so
// it's turned on only for the goals whose mission actually needs it — not
// globally. Every other goal keeps it off, so the political-risk loop stays fast.
// Adjust the mapping here to change which missions get live tracking.
export function liveTrackingForGoal(goalId?: string | null): { vessels: boolean; aviation: boolean } {
  switch (goalId) {
    case 'maritime-security': return { vessels: true,  aviation: true  }  // naval posture + dark-fleet
    case 'armed-conflict':
    case 'counterterrorism':  return { vessels: false, aviation: true  }  // military air movements
    default:                  return { vessels: false, aviation: false }
  }
}

// Human-readable summary of the live layers a goal turns on — used to tell the
// analyst, at goal-selection time, what they'll see (and that it can add lag).
export function liveTrackingSummary(goalId?: string | null): string | null {
  const c = liveTrackingForGoal(goalId)
  if (c.vessels && c.aviation) return 'Live vessel (AIS) + aircraft (ADS-B) tracking'
  if (c.vessels)               return 'Live vessel (AIS) tracking'
  if (c.aviation)              return 'Live aircraft (ADS-B) tracking'
  return null
}
