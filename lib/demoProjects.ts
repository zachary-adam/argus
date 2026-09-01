import { Project, WatchRule, Incident, UniversalEvent } from '@/types/project'

const DEFAULT_CONNECTORS = [
  { id: 'gdelt',     name: 'GDELT',           enabled: true,  eventCount: 0 },
  { id: 'reliefweb', name: 'ReliefWeb',        enabled: true,  eventCount: 0 },
  { id: 'gdacs',     name: 'GDACS',            enabled: true,  eventCount: 0 },
  { id: 'usgs',      name: 'USGS Earthquakes', enabled: false, eventCount: 0 },
  { id: 'who',       name: 'WHO',              enabled: false, eventCount: 0 },
  { id: 'firms',     name: 'NASA FIRMS',       enabled: false, eventCount: 0 },
  { id: 'rss',       name: 'RSS Feeds',        enabled: true,  eventCount: 0 },
  { id: 'wikidata',  name: 'Wikidata',         enabled: false, eventCount: 0 },
]


function ago(days: number, hours = 0) { return new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString() }

type RawSource = 'gdelt' | 'gdacs' | 'reliefweb' | 'usgs' | 'rss' | 'manual' | 'wikidata' | 'who' | 'firms' | 'ocha'
type Reliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
type Credibility = 1 | 2 | 3 | 4 | 5 | 6

function mkEvent(o: {
  id: string; projectId: string; title: string; summary: string
  category: UniversalEvent['category']; lat: number; lon: number
  country: string; countryCode: string; severity: number
  timestamp: string; source: string; url?: string
  tags?: string[]; rawSource?: RawSource
}): UniversalEvent {
  return {
    id: o.id,
    title: o.title,
    summary: o.summary,
    category: o.category,
    lat: o.lat,
    lon: o.lon,
    country: o.country,
    countryCode: o.countryCode,
    region: undefined,
    locationPrecision: 'city',
    actors: [],
    sources: [{ name: o.source, url: o.url, reliability: 'B' as Reliability, credibility: 3 as Credibility }],
    sourceCount: 1,
    corroborationCount: 1,
    severity: o.severity,
    confidence: 0.75,
    dataQualityScore: 0.7,
    timestamp: o.timestamp,
    reportedAt: o.timestamp,
    analystComments: [],
    rawSource: o.rawSource ?? 'gdelt',
    projectId: o.projectId,
    tags: o.tags ?? [],
    flagged: false,
  }
}

// ── Ukraine demo events ───────────────────────────────────────────────────────
const UKRAINE_EVENTS: UniversalEvent[] = [
  mkEvent({ id: 'dem_ua_1', projectId: 'demo_proj_ukraine_001', title: 'Heavy artillery exchange along Zaporizhzhia front', summary: 'Sustained artillery fire reported along the T0408 highway corridor. Ukrainian forces repelled three assault attempts. UNHCR tracking ~4,200 civilian displacements in 48h window.', category: 'conflict', lat: 47.83, lon: 35.14, country: 'Ukraine', countryCode: 'UA', severity: 9, timestamp: ago(0, 4), source: 'Kyiv Independent', url: 'https://kyivindependent.com/tag/zaporizhzhia', tags: ['artillery', 'zaporizhzhia', 'frontline'] }),
  mkEvent({ id: 'dem_ua_2', projectId: 'demo_proj_ukraine_001', title: 'Russian UAV strike on Dnipro energy infrastructure', summary: 'Shahed-136 drone strike hit transformer station east of Dnipro city. Power outages affecting ~180,000 residents. Emergency crews deployed; repair timeline estimated 72h.', category: 'conflict', lat: 48.45, lon: 35.04, country: 'Ukraine', countryCode: 'UA', severity: 8, timestamp: ago(1, 2), source: 'Reuters', url: 'https://www.reuters.com/world/europe/', tags: ['uav', 'infrastructure', 'dnipro'] }),
  mkEvent({ id: 'dem_ua_3', projectId: 'demo_proj_ukraine_001', title: 'Russian 58th Army force concentration near Tokmak', summary: 'Satellite imagery confirms armored vehicle staging areas 12km south of Tokmak. ISW estimates 3 BTGs repositioned from Kherson sector. Indicative of renewed push toward Zaporizhzhia city.', category: 'conflict', lat: 47.25, lon: 35.71, country: 'Ukraine', countryCode: 'UA', severity: 8, timestamp: ago(2), source: 'ISW', url: 'https://www.understandingwar.org/backgrounder/ukraine-conflict-updates', tags: ['russian-forces', 'tokmak', 'armor'] }),
  mkEvent({ id: 'dem_ua_4', projectId: 'demo_proj_ukraine_001', title: 'Black Sea naval incident — Ukrainian drone boat intercept', summary: 'Ukrainian naval drone intercepted Russian Black Sea Fleet patrol vessel 40nm south of Odesa. No casualties reported. Fleet repositioning observed via AIS gap analysis.', category: 'conflict', lat: 46.48, lon: 30.72, country: 'Ukraine', countryCode: 'UA', severity: 7, timestamp: ago(3), source: 'Defense News', url: 'https://www.defensenews.com/naval/', tags: ['naval', 'black-sea', 'drone'] }),
  mkEvent({ id: 'dem_ua_5', projectId: 'demo_proj_ukraine_001', title: 'Mass civilian evacuation — Kherson right bank', summary: 'Ukrainian authorities ordered evacuation of 12 villages on Kherson right bank following intensified shelling. ~8,500 residents affected. ICRC coordinating corridor logistics.', category: 'humanitarian', lat: 46.63, lon: 32.61, country: 'Ukraine', countryCode: 'UA', severity: 6, timestamp: ago(4), source: 'UNHCR', url: 'https://www.unhcr.org/emergencies/ukraine-emergency', rawSource: 'reliefweb', tags: ['evacuation', 'kherson', 'civilian'] }),
  mkEvent({ id: 'dem_ua_6', projectId: 'demo_proj_ukraine_001', title: 'UN Security Council ceasefire resolution blocked', summary: 'Russian veto blocked UNSC resolution calling for 30-day humanitarian ceasefire. Western allies announced additional military aid package totaling €2.1B. Diplomatic channels assessed as effectively closed.', category: 'political', lat: 50.45, lon: 30.52, country: 'Ukraine', countryCode: 'UA', severity: 5, timestamp: ago(5), source: 'UN News', url: 'https://news.un.org/en/news/topic/peace-and-security', tags: ['diplomacy', 'ceasefire', 'unsc'] }),
  mkEvent({ id: 'dem_ua_7', projectId: 'demo_proj_ukraine_001', title: 'Strike on Belgorod border logistics hub', summary: 'Ukrainian long-range strike hit fuel depot in Belgorod oblast used for Russian supply lines. Significant secondary explosions observed. Russian MoD confirmed the strike, casualties undisclosed.', category: 'conflict', lat: 50.59, lon: 36.58, country: 'Russia', countryCode: 'RU', severity: 7, timestamp: ago(6), source: 'BBC World', url: 'https://www.bbc.com/news/world/europe', tags: ['strike', 'belgorod', 'logistics'] }),
]

// ── Sahel demo events ─────────────────────────────────────────────────────────
const SAHEL_EVENTS: UniversalEvent[] = [
  mkEvent({ id: 'dem_waf_1', projectId: 'demo_proj_westafrica_001', title: 'Burkina Faso junta indefinitely postpones 2025 elections', summary: 'MPSR military council announced elections cannot proceed due to "prevailing security conditions." ECOWAS Emergency Summit convened. AES bloc (Mali, Niger, BF) issued joint statement backing the decision. Opposition leaders placed under house arrest.', category: 'political', lat: 12.37, lon: -1.53, country: 'Burkina Faso', countryCode: 'BF', severity: 9, timestamp: ago(1, 3), source: 'Al Jazeera', url: 'https://www.aljazeera.com/where/burkina-faso/', tags: ['junta', 'elections', 'burkina-faso', 'ecowas'] }),
  mkEvent({ id: 'dem_waf_2', projectId: 'demo_proj_westafrica_001', title: 'Wagner-linked forces advance toward Mopti, central Mali', summary: 'MINUSMA successor mission reports Wagner-Africa contingent (~400 personnel) moving toward Mopti. Locals report summary executions in Djenné. French DGSE assessing repositioning as pre-election pressure operation.', category: 'conflict', lat: 14.49, lon: -4.20, country: 'Mali', countryCode: 'ML', severity: 9, timestamp: ago(2), source: 'France 24', url: 'https://www.france24.com/en/africa/', tags: ['wagner', 'mali', 'mopti', 'violence'] }),
  mkEvent({ id: 'dem_waf_3', projectId: 'demo_proj_westafrica_001', title: 'Opposition coalition arrests — Ouagadougou', summary: '14 opposition leaders detained without charge following banned protest. Internet throttling confirmed via IODA and OONI data. Three journalists expelled from the country. Human Rights Watch calling for immediate international response.', category: 'political', lat: 12.37, lon: -1.53, country: 'Burkina Faso', countryCode: 'BF', severity: 7, timestamp: ago(2, 8), source: 'HRW', url: 'https://www.hrw.org/africa/burkina-faso', rawSource: 'reliefweb', tags: ['arrests', 'censorship', 'repression'] }),
  mkEvent({ id: 'dem_waf_4', projectId: 'demo_proj_westafrica_001', title: 'Pre-election violence spike in Kayes region, Mali', summary: 'Three political party offices torched in Kayes over 48 hours. Ethnic dimension emerging: Bambara-Fulani tensions cited by local sources. 22 wounded, 2 critical. State of emergency extended to Kayes region.', category: 'conflict', lat: 14.44, lon: -11.44, country: 'Mali', countryCode: 'ML', severity: 7, timestamp: ago(3), source: 'AllAfrica', url: 'https://allafrica.com/mali/', tags: ['violence', 'mali', 'elections', 'ethnic'] }),
  mkEvent({ id: 'dem_waf_5', projectId: 'demo_proj_westafrica_001', title: 'Niger suspends ECOWAS observer missions', summary: 'CNSP government in Niamey formally suspended all ECOWAS election monitoring activity. AU mediator talks collapsed after 2nd session. Remaining diplomatic staff ordered to leave within 72h.', category: 'political', lat: 13.51, lon: 2.11, country: 'Niger', countryCode: 'NE', severity: 6, timestamp: ago(4), source: 'Voice of America', url: 'https://www.voanews.com/z/4251', tags: ['niger', 'ecowas', 'diplomacy'] }),
  mkEvent({ id: 'dem_waf_6', projectId: 'demo_proj_westafrica_001', title: 'Humanitarian access blocked — Tahoua corridor, Niger', summary: 'WFP convoy denied passage to Tahoua for 11th consecutive day. ~340,000 persons affected in high-food-insecurity zone. Médecins Sans Frontières suspending northern Niger operations citing safety.', category: 'humanitarian', lat: 14.88, lon: 5.27, country: 'Niger', countryCode: 'NE', severity: 6, timestamp: ago(5), source: 'ReliefWeb', url: 'https://reliefweb.int/country/ner', rawSource: 'reliefweb', tags: ['humanitarian', 'wfp', 'access'] }),
  mkEvent({ id: 'dem_waf_7', projectId: 'demo_proj_westafrica_001', title: 'Senegal election integrity concerns — Dakar protests', summary: 'Tens of thousands march in Dakar demanding independent electoral commission audit. Two protesters killed by security forces. Opposition coalition threatens election boycott if demands not met within 7 days.', category: 'elections', lat: 14.69, lon: -17.44, country: 'Senegal', countryCode: 'SN', severity: 5, timestamp: ago(6), source: 'The Africa Report', url: 'https://www.theafricareport.com/senegal/', tags: ['senegal', 'elections', 'protest'] }),
]

// ── Pakistan demo events ──────────────────────────────────────────────────────
const PAKISTAN_EVENTS: UniversalEvent[] = [
  mkEvent({ id: 'dem_pk_1', projectId: 'demo_proj_pakistan_001', title: 'IMF halts 3rd SBA tranche — fiscal target breach', summary: 'IMF Article IV mission concluded without agreement. Pakistan missed primary balance target by 0.3% GDP. SBP gross reserves fell to $7.8B (1.6 months import cover). Next review date pushed to Q3 2025. Market reacted with 420bps spread widening.', category: 'economic', lat: 33.72, lon: 73.06, country: 'Pakistan', countryCode: 'PK', severity: 8, timestamp: ago(0, 6), source: 'Financial Times', url: 'https://www.ft.com/pakistan', tags: ['imf', 'fiscal', 'reserves', 'tranche'] }),
  mkEvent({ id: 'dem_pk_2', projectId: 'demo_proj_pakistan_001', title: 'PTI long march reaches Rawalpindi — 200,000 strong', summary: 'Pakistan Tehreek-e-Insaf supporters converged on D-Chowk, Rawalpindi in largest demonstration since 2022. Internet suspended across Islamabad Capital Territory. Army deployed under Article 245. Government threatening crackdown within 24h.', category: 'social', lat: 33.60, lon: 73.04, country: 'Pakistan', countryCode: 'PK', severity: 8, timestamp: ago(1), source: 'Dawn', url: 'https://www.dawn.com', tags: ['pti', 'protest', 'march', 'rawalpindi'] }),
  mkEvent({ id: 'dem_pk_3', projectId: 'demo_proj_pakistan_001', title: 'Rupee hits all-time low — 310 PKR/USD', summary: 'Pakistani rupee fell to 310 per dollar in interbank trading, a record low. SBP emergency intervention failed to arrest slide. Fuel prices hiked 18% to comply with IMF conditionality. Multiple textile mills announced closure, 40,000 jobs at risk.', category: 'economic', lat: 24.86, lon: 67.01, country: 'Pakistan', countryCode: 'PK', severity: 7, timestamp: ago(2), source: 'Bloomberg', url: 'https://www.bloomberg.com/asia', tags: ['currency', 'rupee', 'imf', 'inflation'] }),
  mkEvent({ id: 'dem_pk_4', projectId: 'demo_proj_pakistan_001', title: 'Mass protests in Karachi over fuel and flour prices', summary: 'Spontaneous protests spread across Karachi\'s industrial zones. Factory workers blockaded main roads. Police used tear gas; 47 arrests. Parallel demonstrations in Lahore and Multan. Opposition leaders called for nationwide strike on Saturday.', category: 'social', lat: 24.86, lon: 67.01, country: 'Pakistan', countryCode: 'PK', severity: 7, timestamp: ago(3), source: 'Geo News', url: 'https://www.geo.tv', tags: ['protests', 'karachi', 'inflation', 'fuel'] }),
  mkEvent({ id: 'dem_pk_5', projectId: 'demo_proj_pakistan_001', title: 'TTP attack on Peshawar security checkpoint — 9 killed', summary: 'Tehrik-i-Taliban Pakistan carried out coordinated attack on police checkpoint in Peshawar. IED followed by gunfire. 9 security personnel killed, 14 wounded. TTP claimed responsibility via Telegram. Army conducting sweep operations in KP tribal belt.', category: 'conflict', lat: 34.01, lon: 71.58, country: 'Pakistan', countryCode: 'PK', severity: 7, timestamp: ago(4), source: 'Reuters', url: 'https://www.reuters.com/world/asia-pacific/', tags: ['ttp', 'peshawar', 'terrorism', 'kp'] }),
  mkEvent({ id: 'dem_pk_6', projectId: 'demo_proj_pakistan_001', title: 'National debt service cost exceeds 90% of revenue', summary: 'Finance Ministry quarterly report reveals interest payments consuming 91% of federal revenue in Q2 FY25. IMF technical memo warns of "debt distress trajectory." World Bank suspended disbursement pending fiscal review. Sovereign credit rating downgraded to CCC+ by Fitch.', category: 'economic', lat: 33.72, lon: 73.06, country: 'Pakistan', countryCode: 'PK', severity: 6, timestamp: ago(5), source: 'IMF', url: 'https://www.imf.org/en/Countries/PAK', rawSource: 'reliefweb', tags: ['debt', 'fiscal', 'rating', 'imf'] }),
  mkEvent({ id: 'dem_pk_7', projectId: 'demo_proj_pakistan_001', title: 'Balochistan separatist attack on gas pipeline', summary: 'BLA claimed attack on SNGPL gas pipeline in Sui district, Balochistan. Supply to Punjab disrupted for 36h. Second attack in 10 days on critical energy infrastructure. Security forces deployment increased in Dera Bugti district.', category: 'conflict', lat: 28.64, lon: 69.01, country: 'Pakistan', countryCode: 'PK', severity: 5, timestamp: ago(7), source: 'Dawn', url: 'https://www.dawn.com/news/balochistan', tags: ['bla', 'balochistan', 'pipeline', 'energy'] }),
]

export const DEMO_PROJECTS: Project[] = [
  // ─── 1. Eastern Europe — Armed Conflict ──────────────────────────────────
  {
    id: 'demo_proj_ukraine_001',
    name: 'Ukraine — Eastern Front Monitor',
    description: 'Real-time conflict tracking across the Donbas front line, naval activity in the Black Sea, and Russian force posture shifts.',
    regionName: 'Eastern Europe',
    regionBounds: [22.0, 44.0, 40.5, 52.5],
    regionCenter: [32.0, 48.5],
    regionZoom: 5.5,
    countryCodes: ['UA', 'RU', 'BY', 'MD'],
    goalTemplateId: 'armed-conflict',
    goalCustomNotes: 'Focus on frontline kilometer changes, UAV strike vectors, and Black Sea naval chokepoint activity. Secondary watch on Belarusian force posture near Gomel.',
    events: UKRAINE_EVENTS,
    plots: [],
    predictionLedger: [],
    forecasts: [],
    connectors: DEFAULT_CONNECTORS.map(c =>
      c.id === 'rss' || c.id === 'gdelt' || c.id === 'reliefweb'
        ? { ...c, enabled: true }
        : c
    ),
    activeFormulaId: 'conflict-intensity-score',
    formulaWeightOverrides: {},
    watchRules: [
      {
        id: 'wr_demo_ua_001',
        projectId: 'demo_proj_ukraine_001',
        name: 'Kherson Escalation',
        enabled: true,
        conditions: [
          { field: 'country', op: 'equals', value: 'UA' },
          { field: 'category', op: 'equals', value: 'conflict' },
          { field: 'severity', op: 'gte', value: 7 },
        ],
        windowHours: 6,
        threshold: 3,
        action: 'both',
        incidentSeverity: 'critical',
        createdAt: ago(14),
        fireCount: 4,
        lastFiredAt: ago(1),
      },
      {
        id: 'wr_demo_ua_002',
        projectId: 'demo_proj_ukraine_001',
        name: 'Black Sea Naval Activity',
        enabled: true,
        conditions: [
          { field: 'category', op: 'equals', value: 'conflict' },
          { field: 'severity', op: 'gte', value: 5 },
        ],
        windowHours: 12,
        threshold: 2,
        action: 'notify',
        incidentSeverity: 'high',
        createdAt: ago(10),
        fireCount: 7,
        lastFiredAt: ago(0),
      },
    ] as WatchRule[],
    incidents: [
      {
        id: 'inc_demo_ua_001',
        projectId: 'demo_proj_ukraine_001',
        title: 'Sustained Artillery Barrage — Zaporizhzhia Oblast',
        summary: 'Confirmed heavy artillery exchange along the T0408 highway corridor. Multiple civilian structures hit. UNHCR reporting displacement surge of ~4,200 persons in 48h.',
        stage: 'escalated',
        severity: 'critical',
        country: 'UA',
        category: 'conflict',
        linkedEventIds: ['dem_ua_1'],
        notes: [
          {
            id: 'note_demo_ua_001',
            text: 'ISW confirms 14km of front movement over 72h. Russian 58th Army units identified near Tokmak.',
            author: 'Analyst',
            timestamp: ago(1),
          },
        ],
        tags: ['artillery', 'displacement', 'zaporizhzhia'],
        createdAt: ago(3),
        updatedAt: ago(1),
      },
    ] as Incident[],
    aiMode: 'none',
    createdAt: ago(30),
    updatedAt: ago(1),
    lastOpenedAt: ago(2),
  },

  // ─── 2. West Africa — Elections ──────────────────────────────────────────
  {
    id: 'demo_proj_westafrica_001',
    name: 'Sahel Elections — 2025 Watch',
    description: 'Monitoring pre-election violence risk, democratic backsliding, and junta pressure across the Sahel ahead of scheduled elections in Mali, Burkina Faso, and Niger.',
    regionName: 'West Africa / Sahel',
    regionBounds: [-17.5, 9.0, 24.0, 23.5],
    regionCenter: [3.0, 16.0],
    regionZoom: 4.5,
    countryCodes: ['ML', 'BF', 'NE', 'TD', 'SN', 'GN', 'MR'],
    goalTemplateId: 'elections',
    goalCustomNotes: 'Track junta activity, ECOWAS responses, and Wagner/AES alliance dynamics. Key election dates: Mali TBD (junta delay expected), Burkina Faso Q3 2025.',
    events: SAHEL_EVENTS,
    plots: [],
    predictionLedger: [],
    forecasts: [],
    connectors: DEFAULT_CONNECTORS.map(c =>
      ['gdelt', 'reliefweb', 'rss', 'wikidata'].includes(c.id)
        ? { ...c, enabled: true }
        : c
    ),
    activeFormulaId: 'electoral-violence-risk',
    formulaWeightOverrides: {},
    watchRules: [
      {
        id: 'wr_demo_waf_001',
        projectId: 'demo_proj_westafrica_001',
        name: 'Coup / Junta Action',
        enabled: true,
        conditions: [
          { field: 'category', op: 'equals', value: 'political' },
          { field: 'severity', op: 'gte', value: 8 },
        ],
        windowHours: 24,
        threshold: 1,
        action: 'both',
        incidentSeverity: 'critical',
        createdAt: ago(20),
        fireCount: 1,
        lastFiredAt: ago(12),
      },
      {
        id: 'wr_demo_waf_002',
        projectId: 'demo_proj_westafrica_001',
        name: 'Pre-Election Violence Spike',
        enabled: true,
        conditions: [
          { field: 'category', op: 'equals', value: 'conflict' },
          { field: 'severity', op: 'gte', value: 5 },
        ],
        windowHours: 48,
        threshold: 4,
        action: 'notify',
        incidentSeverity: 'high',
        createdAt: ago(18),
        fireCount: 2,
        lastFiredAt: ago(4),
      },
    ] as WatchRule[],
    incidents: [
      {
        id: 'inc_demo_waf_001',
        projectId: 'demo_proj_westafrica_001',
        title: 'Burkina Faso — Transitional Charter Breach',
        summary: 'MPSR junta announced indefinite postponement of promised 2025 elections, citing security conditions. ECOWAS condemned the decision; AES bloc offered implicit support.',
        stage: 'active',
        severity: 'high',
        country: 'BF',
        category: 'political',
        linkedEventIds: ['dem_waf_1'],
        notes: [
          {
            id: 'note_demo_waf_001',
            text: 'Opposition leaders detained in Ouagadougou — 3 confirmed, more reported. Internet throttling observed via IODA.',
            author: 'Analyst',
            timestamp: ago(2),
          },
        ],
        tags: ['junta', 'elections', 'burkina-faso', 'ecowas'],
        createdAt: ago(7),
        updatedAt: ago(2),
      },
    ] as Incident[],
    aiMode: 'none',
    createdAt: ago(45),
    updatedAt: ago(2),
    lastOpenedAt: ago(3),
  },

  // ─── 3. South Asia — Economic Crisis ─────────────────────────────────────
  {
    id: 'demo_proj_pakistan_001',
    name: 'Pakistan — Economic Stability Monitor',
    description: 'Tracking IMF program compliance, currency reserves, political crisis spillover on fiscal stability, and civil unrest driven by inflation and fuel price shocks.',
    regionName: 'South Asia',
    regionBounds: [60.5, 23.0, 77.5, 37.5],
    regionCenter: [69.5, 30.0],
    regionZoom: 5.0,
    countryCodes: ['PK', 'AF', 'IN'],
    goalTemplateId: 'economic-crisis',
    goalCustomNotes: 'Primary focus: SBP FX reserve trajectory, IMF tranche conditions, PTI protest-driven governance disruption. Secondary: spillover security events from KP/Balochistan.',
    events: PAKISTAN_EVENTS,
    plots: [],
    // Worked example so the Ledger opens with real entries instead of a blank
    // "No predictions recorded" screen: one validated formula call, one ACH card,
    // and one manually-logged call still awaiting its outcome.
    predictionLedger: [
      {
        id: 'pred_demo_pk_1',
        projectId: 'demo_proj_pakistan_001',
        formulaId: 'currency-crisis-index',
        formulaName: 'Currency Crisis Index',
        timestamp: ago(30),
        inputs: { reserve_cover: 0.85, spread_widening: 0.78, inflation: 0.72, political_risk: 0.90 },
        weights: { reserve_cover: 0.30, spread_widening: 0.25, inflation: 0.20, political_risk: 0.25 },
        output: 82,
        outputLabel: 'Currency Crisis Risk',
        narrative: 'Reserves under 2 months of import cover, spreads widening, PTI unrest building — the model flagged high crisis risk 30 days out.',
        entryType: 'formula',
        validatedAt: ago(2),
        validatedOutcome: 'correct',
        validationNote: 'Rupee hit a record 310/USD — the high-risk call was confirmed.',
      },
      {
        id: 'pred_demo_pk_2',
        projectId: 'demo_proj_pakistan_001',
        formulaId: 'ach',
        formulaName: 'ACH — IMF program outcome',
        timestamp: ago(6),
        inputs: {},
        weights: {},
        output: 0,
        outputLabel: 'ACH',
        narrative: 'Competing hypotheses on where the stalled IMF 3rd tranche lands.',
        entryType: 'ach',
        leadHypothesis: 'IMF suspends the program; Pakistan slides toward a disorderly default within 90 days',
        achConfidence: 'moderate',
        achHypotheses: [
          { text: 'IMF suspends the program; disorderly default path within 90 days', supports: 4, contradicts: 1, net: 3 },
          { text: 'Last-minute waiver keeps the program alive under tighter conditions', supports: 2, contradicts: 2, net: 0 },
          { text: 'Gulf/China bilateral rollover bridges the gap; program frozen, no default', supports: 3, contradicts: 3, net: 0 },
        ],
      },
      {
        id: 'pred_demo_pk_3',
        projectId: 'demo_proj_pakistan_001',
        formulaId: 'manual',
        formulaName: 'Nationwide strike spreads beyond Karachi within 2 weeks',
        timestamp: ago(3),
        inputs: {},
        weights: {},
        output: 60,
        outputLabel: 'Prediction',
        narrative: 'Opposition called a Saturday strike; fuel and flour protests already spreading to Lahore and Multan.',
        entryType: 'manual',
      },
    ],
    forecasts: [
      {
        id: 'fc_demo_pk_1',
        statement: 'SBP gross FX reserves fall below $6B before the next IMF review',
        probability: 0.65,
        createdAt: ago(20),
        dueDate: ago(-30), // ~30 days from now
        basis: 'Reserves at $7.8B and falling; no tranche disbursement expected near-term.',
        projectId: 'demo_proj_pakistan_001',
      },
    ],
    connectors: DEFAULT_CONNECTORS.map(c =>
      ['gdelt', 'rss', 'reliefweb'].includes(c.id)
        ? { ...c, enabled: true }
        : c
    ),
    activeFormulaId: undefined,
    formulaWeightOverrides: {},
    watchRules: [
      {
        id: 'wr_demo_pk_001',
        projectId: 'demo_proj_pakistan_001',
        name: 'Mass Protest — Islamabad',
        enabled: true,
        conditions: [
          { field: 'country', op: 'equals', value: 'PK' },
          { field: 'category', op: 'equals', value: 'social' },
          { field: 'severity', op: 'gte', value: 6 },
        ],
        windowHours: 12,
        threshold: 2,
        action: 'both',
        incidentSeverity: 'high',
        createdAt: ago(25),
        fireCount: 3,
        lastFiredAt: ago(5),
      },
      {
        id: 'wr_demo_pk_002',
        projectId: 'demo_proj_pakistan_001',
        name: 'KP Security Deterioration',
        enabled: true,
        conditions: [
          { field: 'country', op: 'equals', value: 'PK' },
          { field: 'category', op: 'equals', value: 'conflict' },
          { field: 'severity', op: 'gte', value: 6 },
        ],
        windowHours: 24,
        threshold: 3,
        action: 'notify',
        incidentSeverity: 'high',
        createdAt: ago(15),
        fireCount: 5,
        lastFiredAt: ago(2),
      },
    ] as WatchRule[],
    incidents: [
      {
        id: 'inc_demo_pk_001',
        projectId: 'demo_proj_pakistan_001',
        title: 'IMF Review Stalled — 3rd Tranche at Risk',
        summary: 'IMF Article IV consultations stalled on fiscal consolidation targets. SBP gross reserves at $8.2B (1.8 months import cover). Market pricing 340bps spread vs. 90-day T-bills.',
        stage: 'monitoring',
        severity: 'high',
        country: 'PK',
        category: 'economic',
        linkedEventIds: ['dem_pk_1'],
        notes: [
          {
            id: 'note_demo_pk_001',
            text: 'Finance Ministry revised FY25 primary deficit target to 1.1% GDP, still above IMF\'s 0.8% requirement. Next review date: 2025-06-15.',
            author: 'Analyst',
            timestamp: ago(3),
          },
        ],
        tags: ['imf', 'reserves', 'currency', 'fiscal'],
        createdAt: ago(10),
        updatedAt: ago(3),
      },
    ] as Incident[],
    aiMode: 'none',
    createdAt: ago(60),
    updatedAt: ago(3),
    lastOpenedAt: ago(4),
  },
]
