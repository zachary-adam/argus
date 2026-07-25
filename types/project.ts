import type { Plot, CorrelationSettings } from '@/types'
import type { Forecast } from '@/lib/forecasting'
export type { Plot, CorrelationSettings }

// Coverage scope for live vessel/aircraft tracking.
export type LiveCoverage = 'focused' | 'global'

// Analysis breadth — from the global firehose down to a single locality. Narrow
// scopes drive query-based ingestion (aimed pulls) instead of relying on the
// global feed, which is what makes hyper-local (a town, a ward) analysis possible.
export type AnalysisScope = 'global' | 'regional' | 'country' | 'local'

export interface Targeting {
  scope: AnalysisScope
  placeName?: string        // e.g. "Kibera, Nairobi" — geocoded + used as a search query
  keywords: string[]        // topics to aim at, e.g. ["election", "violence"]
  watchEntities: string[]   // people/parties/groups to track
  keyDate?: string          // ISO date of a key event (election day, summit) for time-weighting
}

/** Analyst-declared calendar anchor for the situation — polling phase, summit
 *  round, court ruling, deadline, anniversary. Generic: any watch has dates the
 *  analysis pivots around; briefs and panels read them deterministically. */
export interface KeyDate {
  id: string
  label: string
  /** ISO date (YYYY-MM-DD) */
  date: string
  note?: string
}

// Universal Event Schema (AES) — canonical data model for all ingested intelligence
export interface Actor {
  name: string
  type: 'state' | 'non-state' | 'individual' | 'organization' | 'unknown'
  role?: string
}

/** Analyst-declared actor under active tracking — parties, candidates,
 *  commissions, armed groups. Dossiers are DERIVED from the graded corpus by
 *  deterministic name/alias matching (lib/actors.ts); nothing is stored that
 *  can't be traced back to specific events. */
export interface TrackedActor {
  id: string
  name: string
  /** Alternate names matched in event text — acronyms, local-script spellings
   *  (e.g. "TMC", "AITC", "তৃণমূল" for Trinamool Congress). */
  aliases: string[]
  type: Actor['type']
  notes?: string
  createdAt: string
}

export interface Source {
  name: string
  url?: string
  reliability: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' // NATO reliability scale
  credibility: 1 | 2 | 3 | 4 | 5 | 6 // NATO credibility scale
}

export interface AnalystComment {
  text: string
  author: string
  timestamp: string
}

export interface UniversalEvent {
  id: string
  title: string
  summary: string
  category: EventCategory
  subcategory?: string

  // Location
  lat: number
  lon: number
  country: string
  countryCode: string // ISO 3166-1 alpha-2
  region?: string
  locationPrecision: 'exact' | 'city' | 'region' | 'country'

  // Actors
  actors: Actor[]

  // Sources
  sources: Source[]
  sourceCount: number
  corroborationCount: number // how many independent sources confirm

  // Severity & Confidence
  severity: number // 1-10 numeric (not string)
  confidence: number // 0-1
  dataQualityScore: number // 0-1
  formulaFitScore?: number // 0-1, set after formula analysis
  historicalAccuracyScore?: number // 0-1, set from ledger

  // Time
  timestamp: string // ISO 8601
  reportedAt: string // when ARGUS ingested it
  updatedAt?: string

  // Narrative
  analystComments: AnalystComment[]

  // Content
  body?: string  // full extracted article text, preserved from scraping

  // Raw
  rawSource: 'gdelt' | 'gdacs' | 'reliefweb' | 'usgs' | 'rss' | 'manual' | 'wikidata' | 'who' | 'firms' | 'ocha'
  rawId?: string
  rawUrl?: string

  // Project linkage
  projectId: string
  tags: string[]
  flagged: boolean
  /** Analyst explicitly saved to research journal — survives feed churn */
  journalSaved?: boolean
  /** ISO — remove from project/feed after this time; omitted = keep per retention rules */
  expiresAt?: string
  /** When ARGUS first ingested this event (live TTL anchor) */
  ingestedAt?: string
}

export type JournalEntryKind = 'event' | 'paper' | 'note'
export type JournalSignificance = 'key' | 'supporting' | 'background'

/** Curated evidence the analyst chose to keep — political event journal + research library. */
export interface JournalEntry {
  id: string
  kind: JournalEntryKind
  savedAt: string
  updatedAt: string
  title: string
  summary?: string
  /** Analyst reflection — why this matters for the mission */
  note?: string
  tags?: string[]
  significance?: JournalSignificance
  eventId?: string
  lat?: number
  lon?: number
  countryCode?: string
  /** Other journal entries this evidence relates to */
  linkedEntryIds?: string[]
  country?: string
  category?: string
  severity?: number
  eventTimestamp?: string
  url?: string
  source?: string
  body?: string
  authors?: string[]
  year?: number
  abstract?: string
  doi?: string
  venue?: string
  citations?: number
}

/** How a saved paper reads a specific event — permanent analyst mark for briefs. */
export type PaperAnalysisRole = 'explains' | 'context' | 'contradicts' | 'method' | 'forecast'

export interface EventPaperLink {
  id: string
  eventId: string
  /** Journal entry id (kind=paper) — papers live in the research library */
  paperEntryId: string
  /** Analyst mark: what this paper contributes to reading this event */
  analysisMark: string
  role?: PaperAnalysisRole
  attachedAt: string
}

/** Analyst hypothesis revision — how your thinking changed over time. */
export interface HypothesisRevision {
  id: string
  recordedAt: string
  statement: string
  confidence?: 'high' | 'moderate' | 'low'
  rationale?: string
  /** Prior revision this supersedes */
  supersedesId?: string
  linkedJournalIds?: string[]
}

export type WorkspaceMode = 'journal' | 'feed'

/** Which events feed the project brief [E#] corpus — live firehose vs curated journal. */
export type BriefEvidenceMode = 'live' | 'curated' | 'blended'

/** Live firehose TTL — curated / saved events are exempt unless expiresAt is set */
export type LiveFeedRetention = '6h' | '24h' | '48h' | '7d' | '30d'
/** Per-event keep window when analyst saves an ingest */
export type EventKeepDuration = '24h' | '7d' | '30d' | 'forever'

export type EventCategory =
  | 'conflict'
  | 'political'
  | 'economic'
  | 'social'
  | 'environmental'
  | 'cyber'
  | 'disaster'
  | 'humanitarian'
  | 'health'
  | 'elections'

// Analysis profile — derived at project creation from research question + goal
// Controls which analytical tools (especially formula assessment) are surfaced
export type AnalysisProfile = 'conflict' | 'political' | 'economic' | 'humanitarian' | 'general'

// Formula system
export interface FormulaVariable {
  key: string
  label: string
  description: string
  weight: number // 0-1, user-adjustable
  defaultWeight: number
  min: number
  max: number
  citation?: string
}

export interface FormulaAssumption {
  id: string
  text: string
  accepted: boolean
}

export interface Formula {
  id: string
  name: string
  category: GoalCategory
  description: string
  academicBasis: string // citation/source
  variables: FormulaVariable[]
  assumptions: FormulaAssumption[]
  outputLabel: string // e.g. "Instability Score"
  outputRange: [number, number]
}

// Prediction Ledger entry
export interface PredictionEntry {
  id: string
  projectId: string
  formulaId: string
  formulaName: string
  timestamp: string
  inputs: Record<string, number>
  weights: Record<string, number>
  output: number
  outputLabel: string
  narrative: string
  validatedAt?: string
  validatedOutcome?: 'correct' | 'incorrect' | 'partial'
  validationNote?: string
  // ACH-specific (set when entryType === 'ach')
  entryType?: 'formula' | 'ach'
  leadHypothesis?: string
  achConfidence?: 'high' | 'moderate' | 'low'
  achHypotheses?: Array<{ text: string; supports: number; contradicts: number; net: number }>
}

// Three confidence scores
export interface ConfidenceBreakdown {
  dataQuality: number // 0-1: source reliability, corroboration, recency
  formulaFit: number // 0-1: how well formula assumptions match this case
  historicalAccuracy: number // 0-1: ledger scorecard for this formula
  composite: number // weighted average
}

// Goal templates
export type GoalCategory =
  | 'elections'
  | 'civil-unrest'
  | 'armed-conflict'
  | 'economic-crisis'
  | 'political-stability'
  | 'humanitarian'
  | 'maritime-security'
  | 'counterterrorism'
  | 'cyber-threat'
  | 'border-migration'
  | 'supply-chain'
  | 'public-health'
  | 'information-ops'
  | 'organized-crime'

export interface GoalTemplate {
  id: string
  category: GoalCategory
  name: string
  description: string
  icon: string // emoji
  defaultFormulas: string[] // formula IDs
  suggestedSources: string[]
  keyIndicators: string[]
  exampleRegions: string[]
}

// Saved NLQ monitors — persistent topic watches per project
export interface SavedMonitor {
  id: string
  label: string
  query: string
  createdAt: string
  lastRunAt?: string
  lastMatchCount?: number
}

// Watch Rules
export type WatchConditionField = 'severity' | 'category' | 'country' | 'fatalities' | 'source' | 'title' | 'summary' | 'text'
export type WatchConditionOp = 'equals' | 'contains' | 'gte' | 'lte'
export type WatchRuleAction = 'notify' | 'incident' | 'both'
/** `topic` = aimed Google News / web search + your pasted sources only — skips firehose noise. */
export type WatchEventScope = 'all' | 'topic'

export interface WatchCondition {
  field: WatchConditionField
  op: WatchConditionOp
  value: string | number
}

export interface WatchRule {
  id: string
  projectId: string
  name: string
  enabled: boolean
  conditions: WatchCondition[]   // AND logic
  windowHours: number            // time window to evaluate over
  threshold: number              // min events matching before firing
  action: WatchRuleAction
  incidentSeverity: 'critical' | 'high' | 'medium' | 'low'
  /** When `topic`, only aimed pulls and user-added sources count — not GDELT firehose. */
  eventScope?: WatchEventScope
  createdAt: string
  lastFiredAt?: string
  fireCount: number
}

// Data connector
export interface ConnectorStatus {
  id: string
  name: string
  enabled: boolean
  lastFetched?: string
  eventCount: number
  error?: string
}

// User-added custom source (RSS feed or scraped URL)
export interface CustomSource {
  id: string
  type: 'rss' | 'scrape'
  url: string
  name: string
  enabled: boolean
  lastFetched?: string
  eventCount: number   // cumulative events added from this source
  error?: string
  autoSyncMinutes?: number  // 0 or absent = off
  /** How long RSS items from this feed stay on the map when not saved to project */
  mapRetention?: LiveFeedRetention
}

// Incident Tracker
export type IncidentStage = 'monitoring' | 'active' | 'escalated' | 'closed'

export interface IncidentNote {
  id: string
  text: string
  author: string
  timestamp: string
}

export interface IncidentUpdate {
  ts: string
  text: string
  stageChange?: string
}

export interface Incident {
  id: string
  projectId: string
  title: string
  summary: string
  stage: IncidentStage
  severity: 'critical' | 'high' | 'medium' | 'low'
  country: string
  category: string
  linkedEventIds: string[] // IntelEvent ids
  notes: IncidentNote[]
  updates: IncidentUpdate[]
  assignee?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  tags: string[]
}

// Project — the top-level container
export interface Project {
  id: string
  name: string
  description?: string

  // Region
  regionName: string // human-readable, e.g. "West Africa"
  regionBounds?: [number, number, number, number] // [west, south, east, north]
  regionCenter: [number, number] // [lon, lat]
  regionZoom: number
  countryCodes: string[] // ISO alpha-2 codes to focus on

  // Goal
  goalTemplateId?: GoalCategory
  goalCustomNotes?: string

  // Research mission — free-text question the analyst is trying to answer;
  // drives AI brief generation and determines which analytical tools are shown
  researchQuestion?: string
  analysisProfile?: AnalysisProfile

  // Data
  events: UniversalEvent[]
  deletedEventIds?: string[]  // permanently suppressed — filtered from all incoming streams
  plots: Plot[]
  predictionLedger: PredictionEntry[]
  forecasts?: Forecast[]
  connectors: ConnectorStatus[]
  customSources?: CustomSource[]

  // Correlation signal tuning (per-project, analyst-configurable)
  correlationSettings?: CorrelationSettings

  // Live tracking layers — vessels (AIS) and aircraft (ADS-B), opt-in per project.
  // coverage 'focused' = strategic chokepoints/corridors; 'global' = whole world, no cap.
  liveLayers?: { vessels: boolean; aviation: boolean; coverage: LiveCoverage }

  // Analysis targeting — broad↔specific scope + aimed query inputs.
  targeting?: Targeting

  // Formula workspace
  activeFormulaId?: string
  formulaWeightOverrides: Record<string, Record<string, number>> // formulaId -> variableKey -> weight

  // Storage mode — chosen at creation; undefined treated as 'local' for legacy projects
  storage?: 'local' | 'github'

  // GitHub sync (per-project dedicated repo)
  githubRepo?: string   // "owner/repo-name" — if set, syncs here instead of global repo
  githubBranch?: string // defaults to "main"

  // Visibility — private by default; public = pinned shareable snapshot link
  isPublic?: boolean
  shareSnapshotId?: string  // ID of the active public snapshot; clearing this revokes access

  // Meta
  createdAt: string
  updatedAt: string
  lastOpenedAt: string

  // AI
  aiMode: 'none' | 'cloud' | 'byok' | 'local'
  byokApiKey?: string

  // Incident Tracker
  incidents: Incident[]

  // Watch Rules
  watchRules: WatchRule[]

  // Saved map queries / topic monitors (NLQ)
  savedMonitors?: SavedMonitor[]

  // Analyst Canvas
  analyticalCanvas?: AnalystCanvasData

  // Situation / Case Tracker
  cases?: SituationCase[]

  /** Analyst-curated journal — saved events, papers, and field notes */
  journal?: JournalEntry[]

  /** Permanent event↔paper links with analyst analysis marks (for briefs) */
  eventPaperLinks?: EventPaperLink[]

  /** Hypothesis evolution log — humanist revision trail */
  hypothesisLog?: HypothesisRevision[]

  /** Default workspace when opening project: curated journal vs live feed */
  workspaceMode?: WorkspaceMode

  /** Events included in AI brief [E#] corpus — defaults to blended when journal has entries */
  briefEvidenceMode?: BriefEvidenceMode

  /** How long live firehose events stay on the map before auto-pruning (curated events exempt) */
  liveFeedRetention?: LiveFeedRetention

  /** Analyst pattern library — if/then rules surfaced by the rules engine,
   *  proposed by AI, or hand-authored. Checked patterns flow into briefs. */
  patterns?: Pattern[]

  /** Actors under active tracking — dossiers derived from the graded corpus */
  trackedActors?: TrackedActor[]

  /** Situation calendar — key dates the analysis pivots around */
  keyDates?: KeyDate[]
}

// ── PATTERN RECOGNITION ────────────────────────────────────────────────────────
// Patterns describe what was observed in the corpus, not what will happen.
// Every pattern is either a deterministic rule scan, an AI proposal, or an
// analyst-authored hypothesis the engine evaluates against actual events.

export type PatternSource = 'rules' | 'ai' | 'manual' | 'correlation'
export type PatternConfidence = 'low' | 'moderate' | 'high'

export interface PatternEvidence {
  /** IntelEvent.id values that support the pattern. */
  eventIds: string[]
  /** Optional research-paper ids (from journal eventPaperLinks). */
  paperIds?: string[]
}

export interface Pattern {
  id: string
  name: string
  /** Human-readable "if" clause — what triggers the pattern. */
  if: string
  /** Human-readable "then" clause — what tends to follow. */
  then: string
  source: PatternSource
  evidence: PatternEvidence
  /** Times the rule fired correctly (if-occurred AND then-occurred in window). */
  hits: number
  /** Times the if-clause fired but the then-clause didn't (in window). */
  misses: number
  /** hits / (hits + misses), 0 when no data. */
  hitRate: number
  confidence: PatternConfidence
  /** Time window in hours used to evaluate the rule (default 48). */
  windowHours?: number
  /** Analyst opted to include this pattern in the next generated brief. */
  includeInBrief?: boolean
  /** Set when sourced from a live correlation alert. */
  correlationAlertId?: string
  createdAt: string
}

// ── ANALYST CANVAS ─────────────────────────────────────────────────────────────

export type CanvasEdgeKind =
  | 'causes' | 'correlates' | 'funds' | 'threatens' | 'depends_on'
  | 'contradicts' | 'supports' | 'leads_to' | 'linked'

interface CanvasNodeBase {
  id: string
  x: number
  y: number
}

export interface CanvasEventNode extends CanvasNodeBase {
  type: 'event'
  eventId: string
}

export interface CanvasSourceNode extends CanvasNodeBase {
  type: 'source'
  title: string
  authors: string[]
  year?: number
  abstract?: string
  doi?: string
  url?: string
  venue?: string
  /** Links canvas node back to a research journal entry */
  journalEntryId?: string
}

export interface CanvasNoteNode extends CanvasNodeBase {
  type: 'note'
  content: string
  color?: string
  journalEntryId?: string
}

export interface CanvasEntityNode extends CanvasNodeBase {
  type: 'entity'
  label: string
  entityType: 'country' | 'actor' | 'organization' | 'location'
  countryCode?: string
  description?: string
}

export interface CanvasAssessmentNode extends CanvasNodeBase {
  type: 'assessment'
  formulaId: string
  values: Record<string, number>       // variable key → 0-1 analyst rating
  assumptionsAccepted: string[]        // assumption IDs the analyst has confirmed
  ledgerEntryId?: string               // set after recording to prediction ledger
  narrative?: string                   // analyst's free-text reasoning
}

// ── ACH (Analysis of Competing Hypotheses) node ──────────────────────────────

export interface ACHHypothesis {
  id: string
  text: string
}

export type ACHRating = 'supports' | 'neutral' | 'contradicts'

export interface ACHEventScore {
  nodeId: string         // canvas event node id
  hypothesisId: string
  rating: ACHRating
  rationale: string
}

export interface CanvasACHNode extends CanvasNodeBase {
  type: 'ach'
  hypotheses: ACHHypothesis[]
  scores: ACHEventScore[]
  confidence: 'high' | 'moderate' | 'low'
  narrative?: string
  scoredAt?: string
  ledgerEntryId?: string
  forecastTracked?: boolean   // lead hypothesis promoted to a calibrated forecast
  /** Journal entry IDs used as ACH evidence columns (alongside linked event nodes). */
  journalEvidenceIds?: string[]
}

// ── Indicators & Warning (I&W) node ──────────────────────────────────────────

export interface CanvasIndicator {
  id: string
  text: string                       // the warning indicator ("Cross-border troop movements")
  keywords: string                   // comma-separated terms matched against live event text
  direction: 'confirms' | 'refutes'  // tripping supports or breaks the watched hypothesis
}

export interface CanvasIndicatorNode extends CanvasNodeBase {
  type: 'indicator'
  title: string                      // what these indicators are warning for
  indicators: CanvasIndicator[]
}

export type CanvasNode = CanvasEventNode | CanvasNoteNode | CanvasEntityNode | CanvasSourceNode | CanvasAssessmentNode | CanvasACHNode | CanvasIndicatorNode

export interface CanvasEdge {
  id: string
  source: string
  target: string
  kind: CanvasEdgeKind
}

export interface AnalystCanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

// ── SITUATION / CASE TRACKER ──────────────────────────────────────────────────

export type CaseStatus = 'active' | 'monitoring' | 'closed'

export interface SituationCase {
  id: string
  name: string
  description?: string
  researchQuestion?: string
  eventIds: string[]
  notes: string
  status: CaseStatus
  tags: string[]
  createdAt: string
  updatedAt: string
}
