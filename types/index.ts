export interface IntelEvent {
  id: string
  source: 'gdelt' | 'acled' | 'usgs' | 'gdacs' | 'who' | 'firms' | 'reliefweb' | 'ocha' | 'fewsnet' | 'rss' | 'unhcr' | 'ucdp' | 'analyst'
  category: 'conflict' | 'political' | 'economic' | 'social' | 'environmental' | 'cyber' | 'earthquake' | 'wildfire' | 'disaster' | 'humanitarian' | 'health'
  title: string
  summary: string
  lat: number
  lon: number
  country: string
  countryCode: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  timestamp: string
  url: string
  fatalities?: number
  geoPrecision?: 'exact' | 'city' | 'country'  // 'country' ⇒ placed at a country centroid, not a precise location
  source_detail?: string
  body?: string   // full extracted article text (up to 4000 chars), present for user-added sources
  tags?: string[]  // analyst-applied import labels
  /** ISO — when ARGUS first ingested this row (live feed TTL anchor) */
  ingestedAt?: string
  /** ISO — drop from feed/map after this time (curated events may set explicitly) */
  expiresAt?: string
  relevanceScore?: number  // 0-100 semantic relevance to the project mission (set by semanticRerank on aimed pulls)

  // Intelligence quality metadata (populated from UniversalEvent)
  actors?: { name: string; type: string; role?: string }[]
  sourceReliability?: string  // NATO A-F scale
  sourceCredibility?: number  // NATO 1-6 scale
  corroborationCount?: number // independent sources confirming
  confidence?: number         // 0-1
  dataQualityScore?: number   // 0-1
  analystComments?: string[]  // analyst note text
  flagged?: boolean

  // Information-operations flag: fact-check/debunk posts & social shares are NOT
  // ground-truth events. Tagged (not deleted) so they're quarantined from
  // alerts/risk and shown under a separate "Disinfo" filter. See lib/infoOps.ts.
  infoOps?: boolean
  infoOpsReason?: string | null
}

export interface CorrelationAlert {
  id: string
  title: string
  summary: string
  severity: 'critical' | 'high' | 'medium'
  pattern: string
  signals: string[]       // exact facts that triggered this alert
  signalCount: number     // how many independent signals fired
  countries: string[]
  lat: number
  lon: number
  timestamp: string
  // no confidence score — see signals[] for what actually fired
}

export interface Situation {
  id: string
  name: string
  countries: string[]
  eventCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
  trend: 'escalating' | 'stable' | 'de-escalating'
  trendPercent: number
  sources: string[]
  topEvents: IntelEvent[]
  lat: number
  lon: number
  activeSince: string
}

export interface CountryProfile {
  name: string
  code: string
  capital: string
  region: string
  subregion: string
  population: number
  flag: string
  riskScore: number
  gdp: number
  gdpGrowth: number
  inflation: number
  militarySpending: number
  debtToGdp: number
  freedomScore: number
  fragilityScore: number
  recentEvents: IntelEvent[]
  economicHistory: { year: number; gdp: number; inflation: number }[]
}

export interface Plot {
  id: string
  workspace_id: string
  type: 'point' | 'zone' | 'polygon'
  coordinates: number[] | number[][]
  properties: {
    category?: 'military' | 'economic' | 'political' | 'infrastructure' | 'humanitarian' | 'intelligence' | 'custom'
    threat_level?: 'critical' | 'high' | 'medium' | 'low' | 'info'
    confidence?: 'confirmed' | 'probable' | 'possible' | 'unconfirmed'
    ai_include?: boolean  // default true; when false AI never sees this plot
    radius?: number
    color?: string
    notes?: string
    projectId?: string  // when set, plot is scoped to that project; omitted = workspace-wide
    snapshot?: string  // URL of a captured recon image (Static Maps proxy)
    promoted?: boolean // true ⇒ surfaced into the event feed as an analyst IntelEvent
  }
  label: string | null
  created_at: string
}

export interface WorkspaceData {
  id: string
  user_id: string
  name: string
  is_default: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Commodity {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  trend: 'up' | 'down' | 'flat'
}

export interface AircraftPosition {
  icao24: string
  callsign: string
  origin_country: string
  longitude: number
  latitude: number
  baro_altitude: number
  velocity: number
  track: number       // true track angle, degrees clockwise from north
  on_ground: boolean
  type: 'military' | 'cargo' | 'civil' | 'drone'
  simulated?: boolean  // true ⇒ procedural placeholder, not real ADS-B data
}

export interface VesselPosition {
  mmsi: string
  name: string
  lat: number
  lon: number
  speed: number
  heading: number
  ship_type: string
  flag: string
  destination: string
  sanctioned: boolean
  simulated?: boolean  // true ⇒ procedural placeholder, not real AIS data
}

// ── ANOMALY DETECTION ─────────────────────────────────────────────────────────

export interface AnomalyAlert {
  id: string
  country: string
  countryCode: string
  category: IntelEvent['category']
  /** Z-score deviation from 90-day rolling baseline */
  zScore: number
  /** CUSUM cumulative sum — sustained upward shift detector */
  cusum: number
  /** Observed event count in current window */
  observed: number
  /** Expected count from baseline */
  expected: number
  /** % above baseline */
  deviationPct: number
  severity: 'critical' | 'high' | 'medium'
  headline: string
  summary: string
  lat: number
  lon: number
  timestamp: string
}

// ── ESCALATION FORECAST ───────────────────────────────────────────────────────

export interface EscalationForecast {
  id: string
  country: string
  countryCode: string
  /** 0–100 probability of conflict escalation in next 72 h */
  probability72h: number
  /** 0–100 probability in next 7 days */
  probability7d: number
  trend: 'escalating' | 'stable' | 'de-escalating'
  /** IC-style confidence level */
  confidence: 'very high' | 'high' | 'moderate' | 'low'
  /** Key drivers cited in reasoning chain */
  drivers: string[]
  /** Full chain-of-thought reasoning narrative */
  reasoning: string
  /** Suggested watch indicators */
  watchIndicators: string[]
  lat: number
  lon: number
  generatedAt: string
}

// ── KNOWLEDGE GRAPH ───────────────────────────────────────────────────────────

export type ActorType = 'country' | 'militia' | 'state-actor' | 'ngo' | 'corporation' | 'chokepoint' | 'cable' | 'event'
export type EdgeType =
  | 'funds'
  | 'attacks'
  | 'allied_with'
  | 'sanctioned_by'
  | 'controls'
  | 'threatens'
  | 'borders'
  | 'depends_on'
  | 'hosts'
  | 'occurred_in'

export interface ActorNode {
  id: string
  label: string
  type: ActorType
  lat?: number
  lon?: number
  riskScore?: number
  /** Event IDs that involve this actor */
  eventIds: string[]
  metadata: Record<string, string | number | boolean>
}

export interface ActorEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  weight: number
  evidence: string[]
  timestamp: string
}

export interface KnowledgeGraph {
  nodes: ActorNode[]
  edges: ActorEdge[]
  generatedAt: string
}

// ── MOE ROUTER ────────────────────────────────────────────────────────────────

export type ExpertDomain = 'maritime' | 'conflict' | 'economic' | 'humanitarian' | 'aviation' | 'political'

export interface ExpertSignal {
  id: string
  domain: ExpertDomain
  title: string
  assessment: string
  /** Specific sub-patterns this expert fired on */
  patterns: string[]
  confidence: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  affectedCountries: string[]
  affectedChokepoints: string[]
  supportingEventIds: string[]
  timestamp: string
}

// ── CORRELATION SETTINGS ───────────────────────────────────────────────────────

export interface SignalConfig {
  enabled: boolean
  radiusKm: number
  hoursBack: number
  minEvents: number
}

export interface CorrelationSettings {
  maritime:               SignalConfig  // radiusKm=300, hoursBack=48, minEvents=3
  conflictEscalation:     SignalConfig  // hoursBack=168, minEvents=4
  compoundCrisis:         SignalConfig  // hoursBack=720, minEvents=minCategories=3
  regionalInstability:    SignalConfig  // radiusKm=500, hoursBack=168, minEvents=4
  infrastructureThreat:   SignalConfig  // radiusKm=100, minEvents=1
  humanitarianConvergence:SignalConfig  // hoursBack=336, minEvents=3
  politicalDestabilization:SignalConfig // hoursBack=168, minEvents=3
  spillover:              SignalConfig  // hoursBack=336, minEvents=minConflict=1
  cascading:              SignalConfig  // minEvents=minNeighbors=2
  sanctionedVessel:       SignalConfig  // radiusKm=150
  milAviation:            SignalConfig  // radiusKm=200, hoursBack=24, minEvents=minAircraft=2
  isrOps:                 SignalConfig  // radiusKm=500, hoursBack=24
  combinedArms:           SignalConfig  // radiusKm=vesselRadius=200
  darkFleet:              SignalConfig  // radiusKm=80, minEvents=minVessels=3
}

export const DEFAULT_CORRELATION_SETTINGS: CorrelationSettings = {
  maritime:                { enabled: true, radiusKm: 300, hoursBack: 48,  minEvents: 3 },
  conflictEscalation:      { enabled: true, radiusKm: 0,   hoursBack: 168, minEvents: 4 },
  compoundCrisis:          { enabled: true, radiusKm: 0,   hoursBack: 720, minEvents: 3 },
  regionalInstability:     { enabled: true, radiusKm: 500, hoursBack: 168, minEvents: 4 },
  infrastructureThreat:    { enabled: true, radiusKm: 100, hoursBack: 0,   minEvents: 1 },
  humanitarianConvergence: { enabled: true, radiusKm: 0,   hoursBack: 336, minEvents: 3 },
  politicalDestabilization:{ enabled: true, radiusKm: 0,   hoursBack: 168, minEvents: 3 },
  spillover:               { enabled: true, radiusKm: 0,   hoursBack: 336, minEvents: 1 },
  cascading:               { enabled: true, radiusKm: 0,   hoursBack: 0,   minEvents: 2 },
  sanctionedVessel:        { enabled: true, radiusKm: 150, hoursBack: 0,   minEvents: 1 },
  milAviation:             { enabled: true, radiusKm: 200, hoursBack: 24,  minEvents: 2 },
  isrOps:                  { enabled: true, radiusKm: 500, hoursBack: 24,  minEvents: 1 },
  combinedArms:            { enabled: true, radiusKm: 200, hoursBack: 0,   minEvents: 1 },
  darkFleet:               { enabled: true, radiusKm: 80,  hoursBack: 0,   minEvents: 3 },
}

// ── IOC / entity detection (paste workflow) ────────────────────────────────────

export type GraphNodeType =
  | 'ip' | 'domain' | 'email' | 'url' | 'phone'
  | 'person' | 'organization' | 'country'
  | 'hash' | 'wallet' | 'cve'
  | 'event' | 'custom'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string        // display text on the canvas
  value: string        // the primary value (IP address, domain string, etc.)
  properties?: Record<string, string | number | boolean | null>
  color?: string       // override color (defaults to type colour)
  pinned?: boolean     // locked in place on the canvas
  fx?: number          // fixed x position (set when pinned)
  fy?: number          // fixed y position (set when pinned)
  fromEventId?: string // event that generated this node (if auto-populated)
}

export interface GraphEdge {
  id: string
  source: string   // GraphNode id
  target: string   // GraphNode id
  label: string    // e.g. RESOLVES_TO, BELONGS_TO, SENT_TO
  directed?: boolean
  properties?: Record<string, string | number | boolean | null>
}
