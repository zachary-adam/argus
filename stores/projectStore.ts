import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Project, UniversalEvent, PredictionEntry, ConnectorStatus, CustomSource, Incident, IncidentStage, IncidentNote, WatchRule, Plot, CanvasNode, CanvasEdge, CanvasEdgeKind, SituationCase, CaseStatus, SavedMonitor, JournalEntry, HypothesisRevision, EventPaperLink, TrackedActor, KeyDate } from '@/types/project'
import { CorrelationSettings, SignalConfig } from '@/types'
import { migrateInvestigationGraph } from '@/lib/migrateInvestigationGraph'
import { createDebouncedStorage } from '@/lib/debouncedStorage'
import { filterUniversalByRetention, DEFAULT_LIVE_FEED_RETENTION } from '@/lib/eventRetention'
import { defaultLiveLayersForGoal } from '@/lib/liveTracking'
import type { Forecast } from '@/lib/forecasting'

interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null

  // Project CRUD
  createProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'lastOpenedAt' | 'events' | 'plots' | 'predictionLedger' | 'forecasts' | 'connectors' | 'formulaWeightOverrides' | 'incidents' | 'watchRules' | 'journal'>) => Project
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  openProject: (id: string) => void
  closeProject: () => void
  getActiveProject: () => Project | null

  // Local plots (no Supabase — persisted in project store)
  addPlot: (projectId: string, plot: Plot) => void
  removePlot: (projectId: string, plotId: string) => void

  // Events
  addEvent: (projectId: string, event: UniversalEvent) => void
  addEvents: (projectId: string, events: UniversalEvent[]) => void
  removeEvent: (projectId: string, eventId: string) => void
  updateEvent: (projectId: string, eventId: string, updates: Partial<UniversalEvent>) => void
  clearProjectEvents: (projectId: string) => void
  pruneExpiredEvents: (projectId: string) => void

  // Prediction Ledger
  addPrediction: (projectId: string, entry: PredictionEntry) => void
  updatePrediction: (projectId: string, entryId: string, patch: Partial<PredictionEntry>) => void
  validatePrediction: (projectId: string, entryId: string, outcome: PredictionEntry['validatedOutcome'], note?: string) => void
  removePrediction: (projectId: string, entryId: string) => void

  // Forecasts (probabilistic claims — syncs with project)
  addForecast: (projectId: string, forecast: Omit<Forecast, 'id' | 'createdAt'>) => void
  resolveForecast: (projectId: string, forecastId: string, outcome: 0 | 1) => void
  removeForecast: (projectId: string, forecastId: string) => void

  // Connectors
  setConnectors: (projectId: string, connectors: ConnectorStatus[]) => void
  updateConnector: (projectId: string, connectorId: string, updates: Partial<ConnectorStatus>) => void

  // Custom sources (user-added RSS / scrape)
  addCustomSource: (projectId: string, source: CustomSource) => void
  updateCustomSource: (projectId: string, sourceId: string, updates: Partial<CustomSource>) => void
  removeCustomSource: (projectId: string, sourceId: string) => void

  // Correlation settings
  updateCorrelationSignal: (projectId: string, signal: keyof CorrelationSettings, updates: Partial<SignalConfig>) => void
  resetCorrelationSettings: (projectId: string) => void

  // Formula weights
  setFormulaWeight: (projectId: string, formulaId: string, variableKey: string, weight: number) => void

  // Watch Rules
  createWatchRule: (projectId: string, rule: Omit<WatchRule, 'id' | 'projectId' | 'createdAt' | 'fireCount'>) => WatchRule
  updateWatchRule: (projectId: string, ruleId: string, updates: Partial<WatchRule>) => void
  deleteWatchRule: (projectId: string, ruleId: string) => void
  toggleWatchRule: (projectId: string, ruleId: string) => void
  recordWatchFire: (projectId: string, ruleId: string) => void

  // Saved topic monitors (NLQ)
  saveMonitor: (projectId: string, data: { label: string; query: string }) => SavedMonitor
  deleteMonitor: (projectId: string, monitorId: string) => void
  recordMonitorRun: (projectId: string, monitorId: string, matchCount: number) => void

  // Incidents
  createIncident: (projectId: string, incident: Omit<Incident, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'notes' | 'updates'>) => Incident
  updateIncident: (projectId: string, incidentId: string, updates: Partial<Incident>) => void
  setIncidentStage: (projectId: string, incidentId: string, stage: IncidentStage) => void
  addIncidentNote: (projectId: string, incidentId: string, note: Omit<IncidentNote, 'id'>) => void
  deleteIncident: (projectId: string, incidentId: string) => void

  // Analyst Canvas
  addCanvasNode: (projectId: string, node: CanvasNode) => void
  addCanvasNodes: (projectId: string, nodes: CanvasNode[]) => void
  updateCanvasNode: (projectId: string, nodeId: string, updates: Partial<CanvasNode>) => void
  layoutCanvasNodes: (projectId: string, positions: Record<string, { x: number; y: number }>) => void
  removeCanvasNode: (projectId: string, nodeId: string) => void
  addCanvasEdge: (projectId: string, edge: CanvasEdge) => void
  updateCanvasEdge: (projectId: string, edgeId: string, updates: { kind: CanvasEdgeKind }) => void
  removeCanvasEdge: (projectId: string, edgeId: string) => void
  clearAnalystCanvas: (projectId: string) => void

  // Situation / Case Tracker
  createCase: (projectId: string, data: { name: string; description?: string; researchQuestion?: string; notes?: string; status?: CaseStatus; tags?: string[] }) => SituationCase
  updateCase: (projectId: string, caseId: string, updates: Partial<SituationCase>) => void
  deleteCase: (projectId: string, caseId: string) => void
  addEventToCase: (projectId: string, caseId: string, eventId: string) => void
  removeEventFromCase: (projectId: string, caseId: string, eventId: string) => void

  // Research journal
  addJournalEntry: (projectId: string, entry: JournalEntry) => void
  updateJournalEntry: (projectId: string, entryId: string, updates: Partial<JournalEntry>) => void
  removeJournalEntry: (projectId: string, entryId: string) => void

  // Event ↔ paper analysis marks
  attachEventPaper: (projectId: string, link: EventPaperLink) => void
  updateEventPaperLink: (projectId: string, linkId: string, updates: Partial<Pick<EventPaperLink, 'analysisMark' | 'role'>>) => void
  removeEventPaperLink: (projectId: string, linkId: string) => void

  // Hypothesis revision log
  addHypothesisRevision: (projectId: string, revision: HypothesisRevision) => void
  updateHypothesisRevision: (projectId: string, revisionId: string, updates: Partial<HypothesisRevision>) => void
  removeHypothesisRevision: (projectId: string, revisionId: string) => void

  // Tracked actors (dossiers derived in lib/actors.ts)
  addTrackedActor: (projectId: string, actor: TrackedActor) => void
  updateTrackedActor: (projectId: string, actorId: string, updates: Partial<TrackedActor>) => void
  removeTrackedActor: (projectId: string, actorId: string) => void

  // Situation calendar (key dates)
  addKeyDate: (projectId: string, keyDate: KeyDate) => void
  updateKeyDate: (projectId: string, keyDateId: string, updates: Partial<KeyDate>) => void
  removeKeyDate: (projectId: string, keyDateId: string) => void
}

function generateId(): string {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const DEFAULT_CONNECTORS: ConnectorStatus[] = [
  { id: 'gdelt', name: 'GDELT', enabled: true, eventCount: 0 },
  { id: 'reliefweb', name: 'ReliefWeb', enabled: true, eventCount: 0 },
  { id: 'gdacs', name: 'GDACS', enabled: false, eventCount: 0 },
  { id: 'usgs', name: 'USGS Earthquakes', enabled: false, eventCount: 0 },
  { id: 'who', name: 'WHO', enabled: false, eventCount: 0 },
  { id: 'firms', name: 'NASA FIRMS', enabled: false, eventCount: 0 },
  { id: 'acled', name: 'ACLED', enabled: false, eventCount: 0 },
  { id: 'rss', name: 'RSS Feeds', enabled: false, eventCount: 0 },
  { id: 'wikidata', name: 'Wikidata', enabled: false, eventCount: 0 },
]

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      createProject: (projectData) => {
        const now = new Date().toISOString()
        const project: Project = {
          ...projectData,
          id: generateId(),
          events: [],
          deletedEventIds: [],
          plots: [],
          predictionLedger: [],
          forecasts: [],
          analyticalCanvas: { nodes: [], edges: [] },
          connectors: DEFAULT_CONNECTORS,
          formulaWeightOverrides: {},
          incidents: [],
          watchRules: [],
          journal: [],
          hypothesisLog: [],
          eventPaperLinks: [],
          workspaceMode: 'feed',
          briefEvidenceMode: 'blended',
          savedMonitors: [],
          liveLayers: projectData.liveLayers ?? defaultLiveLayersForGoal(projectData.goalTemplateId),
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
        }
        set(s => ({ projects: [...s.projects, project] }))
        return project
      },

      updateProject: (id, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
        ),
      })),

      deleteProject: (id) => set(s => ({
        projects: s.projects.filter(p => p.id !== id),
        activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
      })),

      openProject: (id) => {
        const now = new Date().toISOString()
        set(s => ({
          activeProjectId: id,
          projects: s.projects.map(p => p.id === id ? { ...p, lastOpenedAt: now } : p),
        }))
      },

      closeProject: () => set({ activeProjectId: null }),

      getActiveProject: () => {
        const { projects, activeProjectId } = get()
        return projects.find(p => p.id === activeProjectId) ?? null
      },

      addPlot: (projectId, plot) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, plots: [...(p.plots ?? []), plot], updatedAt: new Date().toISOString() }
            : p
        ),
      })),

      removePlot: (projectId, plotId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, plots: (p.plots ?? []).filter(pl => pl.id !== plotId), updatedAt: new Date().toISOString() }
            : p
        ),
      })),

      addEvent: (projectId, event) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, events: [...p.events, event], updatedAt: new Date().toISOString() }
            : p
        ),
      })),

      addEvents: (projectId, events) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, events: [...p.events, ...events], updatedAt: new Date().toISOString() }
            : p
        ),
      })),

      removeEvent: (projectId, eventId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                events: p.events.filter(e => e.id !== eventId),
                deletedEventIds: [...new Set([...(p.deletedEventIds ?? []), eventId])],
              }
            : p
        ),
      })),

      clearProjectEvents: (projectId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, events: [], deletedEventIds: [], updatedAt: new Date().toISOString() }
            : p
        ),
      })),

      pruneExpiredEvents: (projectId) => set(s => {
        const p = s.projects.find(x => x.id === projectId)
        if (!p) return s
        const retention = p.liveFeedRetention ?? DEFAULT_LIVE_FEED_RETENTION
        const kept = filterUniversalByRetention(p.events, retention)
        if (kept.length === p.events.length) return s
        return {
          projects: s.projects.map(proj =>
            proj.id === projectId
              ? { ...proj, events: kept, updatedAt: new Date().toISOString() }
              : proj,
          ),
        }
      }),

      updateEvent: (projectId, eventId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, events: p.events.map(e => e.id === eventId ? { ...e, ...updates } : e) }
            : p
        ),
      })),

      addPrediction: (projectId, entry) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, predictionLedger: [...p.predictionLedger, entry] }
            : p
        ),
      })),

      updatePrediction: (projectId, entryId, patch) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                predictionLedger: p.predictionLedger.map(e =>
                  e.id === entryId ? { ...e, ...patch } : e
                ),
              }
            : p
        ),
      })),

      validatePrediction: (projectId, entryId, outcome, note) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                predictionLedger: p.predictionLedger.map(e =>
                  e.id === entryId
                    ? {
                        ...e,
                        validatedOutcome: outcome,
                        validationNote: outcome ? (note ?? e.validationNote) : undefined,
                        validatedAt: outcome ? new Date().toISOString() : undefined,
                      }
                    : e
                ),
              }
            : p
        ),
      })),

      removePrediction: (projectId, entryId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, predictionLedger: p.predictionLedger.filter(e => e.id !== entryId) }
            : p
        ),
      })),

      addForecast: (projectId, forecast) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                forecasts: [{
                  ...forecast,
                  id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  createdAt: new Date().toISOString(),
                }, ...(p.forecasts ?? [])],
                updatedAt: new Date().toISOString(),
              }
            : p
        ),
      })),

      resolveForecast: (projectId, forecastId, outcome) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                forecasts: (p.forecasts ?? []).map(f =>
                  f.id === forecastId
                    ? { ...f, resolved: true, outcome, resolvedAt: new Date().toISOString() }
                    : f
                ),
                updatedAt: new Date().toISOString(),
              }
            : p
        ),
      })),

      removeForecast: (projectId, forecastId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                forecasts: (p.forecasts ?? []).filter(f => f.id !== forecastId),
                updatedAt: new Date().toISOString(),
              }
            : p
        ),
      })),

      setConnectors: (projectId, connectors) => set(s => ({
        projects: s.projects.map(p => p.id === projectId ? { ...p, connectors } : p),
      })),

      updateConnector: (projectId, connectorId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, connectors: p.connectors.map(c => c.id === connectorId ? { ...c, ...updates } : c) }
            : p
        ),
      })),

      addCustomSource: (projectId, source) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, customSources: [...(p.customSources ?? []).filter(cs => cs.url !== source.url), source] }
            : p
        ),
      })),

      updateCustomSource: (projectId, sourceId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, customSources: (p.customSources ?? []).map(cs => cs.id === sourceId ? { ...cs, ...updates } : cs) }
            : p
        ),
      })),

      removeCustomSource: (projectId, sourceId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, customSources: (p.customSources ?? []).filter(cs => cs.id !== sourceId) }
            : p
        ),
      })),

      updateCorrelationSignal: (projectId, signal, updates) => set(s => ({
        projects: s.projects.map(p => {
          if (p.id !== projectId) return p
          const { DEFAULT_CORRELATION_SETTINGS } = require('@/types')
          const current = p.correlationSettings ?? DEFAULT_CORRELATION_SETTINGS
          return { ...p, correlationSettings: { ...current, [signal]: { ...current[signal], ...updates } } }
        }),
      })),

      resetCorrelationSettings: (projectId) => set(s => ({
        projects: s.projects.map(p => {
          if (p.id !== projectId) return p
          return { ...p, correlationSettings: undefined }
        }),
      })),

      setFormulaWeight: (projectId, formulaId, variableKey, weight) => set(s => ({
        projects: s.projects.map(p => {
          if (p.id !== projectId) return p
          const overrides = { ...p.formulaWeightOverrides }
          overrides[formulaId] = { ...(overrides[formulaId] ?? {}), [variableKey]: weight }
          return { ...p, formulaWeightOverrides: overrides }
        }),
      })),

      createWatchRule: (projectId, data) => {
        const rule: WatchRule = {
          ...data,
          id: `wr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          projectId,
          fireCount: 0,
          createdAt: new Date().toISOString(),
        }
        set(s => ({
          projects: s.projects.map(p =>
            p.id === projectId
              ? { ...p, watchRules: [...(p.watchRules ?? []), rule] }
              : p
          ),
        }))
        return rule
      },

      updateWatchRule: (projectId, ruleId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, watchRules: (p.watchRules ?? []).map(r => r.id === ruleId ? { ...r, ...updates } : r) }
            : p
        ),
      })),

      deleteWatchRule: (projectId, ruleId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, watchRules: (p.watchRules ?? []).filter(r => r.id !== ruleId) }
            : p
        ),
      })),

      toggleWatchRule: (projectId, ruleId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, watchRules: (p.watchRules ?? []).map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r) }
            : p
        ),
      })),

      recordWatchFire: (projectId, ruleId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                watchRules: (p.watchRules ?? []).map(r =>
                  r.id === ruleId
                    ? { ...r, fireCount: r.fireCount + 1, lastFiredAt: new Date().toISOString() }
                    : r
                ),
              }
            : p
        ),
      })),

      saveMonitor: (projectId, data) => {
        const monitor: SavedMonitor = {
          id: `mon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          label: data.label.trim() || data.query.trim().slice(0, 48),
          query: data.query.trim(),
          createdAt: new Date().toISOString(),
        }
        set(s => ({
          projects: s.projects.map(p =>
            p.id === projectId
              ? { ...p, savedMonitors: [...(p.savedMonitors ?? []), monitor] }
              : p
          ),
        }))
        return monitor
      },

      deleteMonitor: (projectId, monitorId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, savedMonitors: (p.savedMonitors ?? []).filter(m => m.id !== monitorId) }
            : p
        ),
      })),

      recordMonitorRun: (projectId, monitorId, matchCount) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                savedMonitors: (p.savedMonitors ?? []).map(m =>
                  m.id === monitorId
                    ? { ...m, lastRunAt: new Date().toISOString(), lastMatchCount: matchCount }
                    : m
                ),
              }
            : p
        ),
      })),

      createIncident: (projectId, data) => {
        const now = new Date().toISOString()
        const incident: Incident = {
          ...data,
          id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          projectId,
          notes: [],
          updates: [{ ts: now, text: `Incident created at stage: ${data.stage}` }],
          createdAt: now,
          updatedAt: now,
        }
        set(s => ({
          projects: s.projects.map(p =>
            p.id === projectId
              ? { ...p, incidents: [...(p.incidents ?? []), incident] }
              : p
          ),
        }))
        return incident
      },

      updateIncident: (projectId, incidentId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                incidents: (p.incidents ?? []).map(i =>
                  i.id === incidentId ? { ...i, ...updates, updatedAt: new Date().toISOString() } : i
                ),
              }
            : p
        ),
      })),

      setIncidentStage: (projectId, incidentId, stage) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                incidents: (p.incidents ?? []).map(i => {
                  if (i.id !== incidentId) return i
                  const ts = new Date().toISOString()
                  const entry = { ts, text: `Stage changed from ${i.stage} to ${stage}`, stageChange: stage }
                  return {
                    ...i, stage,
                    updatedAt: ts,
                    closedAt: stage === 'closed' ? ts : i.closedAt,
                    updates: [...(i.updates ?? []), entry],
                  }
                }),
              }
            : p
        ),
      })),

      addIncidentNote: (projectId, incidentId, noteData) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                incidents: (p.incidents ?? []).map(i =>
                  i.id === incidentId
                    ? {
                        ...i,
                        updatedAt: new Date().toISOString(),
                        notes: [...i.notes, { ...noteData, id: `note_${Date.now()}` }],
                      }
                    : i
                ),
              }
            : p
        ),
      })),

      deleteIncident: (projectId, incidentId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, incidents: (p.incidents ?? []).filter(i => i.id !== incidentId) }
            : p
        ),
      })),

      // Situation / Case Tracker
      createCase: (projectId, data) => {
        const now = new Date().toISOString()
        const sc: SituationCase = {
          id: `case_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: data.name,
          description: data.description,
          researchQuestion: data.researchQuestion,
          eventIds: [],
          notes: data.notes ?? '',
          status: data.status ?? 'active',
          tags: data.tags ?? [],
          createdAt: now,
          updatedAt: now,
        }
        set(s => ({
          projects: s.projects.map(p =>
            p.id === projectId
              ? { ...p, cases: [...(p.cases ?? []), sc], updatedAt: now }
              : p
          ),
        }))
        return sc
      },

      updateCase: (projectId, caseId, updates) => set(s => ({
        projects: s.projects.map(p => {
          if (p.id !== projectId) return p
          const now = new Date().toISOString()
          return {
            ...p,
            updatedAt: now,
            cases: (p.cases ?? []).map(c =>
              c.id === caseId ? { ...c, ...updates, updatedAt: now } : c
            ),
          }
        }),
      })),

      deleteCase: (projectId, caseId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, cases: (p.cases ?? []).filter(c => c.id !== caseId), updatedAt: new Date().toISOString() }
            : p
        ),
      })),

      addEventToCase: (projectId, caseId, eventId) => set(s => ({
        projects: s.projects.map(p => {
          if (p.id !== projectId) return p
          const now = new Date().toISOString()
          return {
            ...p,
            updatedAt: now,
            cases: (p.cases ?? []).map(c =>
              c.id === caseId && !c.eventIds.includes(eventId)
                ? { ...c, eventIds: [...c.eventIds, eventId], updatedAt: now }
                : c
            ),
          }
        }),
      })),

      removeEventFromCase: (projectId, caseId, eventId) => set(s => ({
        projects: s.projects.map(p => {
          if (p.id !== projectId) return p
          const now = new Date().toISOString()
          return {
            ...p,
            updatedAt: now,
            cases: (p.cases ?? []).map(c =>
              c.id === caseId
                ? { ...c, eventIds: c.eventIds.filter(id => id !== eventId), updatedAt: now }
                : c
            ),
          }
        }),
      })),

      // Analyst Canvas
      addCanvasNode: (projectId, node) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: {
            nodes: [...(p.analyticalCanvas?.nodes ?? []).filter(n => n.id !== node.id), node],
            edges: p.analyticalCanvas?.edges ?? [],
          },
        }),
      })),

      addCanvasNodes: (projectId, nodes) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: {
            nodes: [
              ...(p.analyticalCanvas?.nodes ?? []).filter(n => !nodes.find(nn => nn.id === n.id)),
              ...nodes,
            ],
            edges: p.analyticalCanvas?.edges ?? [],
          },
        }),
      })),

      updateCanvasNode: (projectId, nodeId, updates) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: {
            nodes: (p.analyticalCanvas?.nodes ?? []).map(n => n.id === nodeId ? { ...n, ...updates } as CanvasNode : n),
            edges: p.analyticalCanvas?.edges ?? [],
          },
        }),
      })),

      layoutCanvasNodes: (projectId, positions) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: {
            nodes: (p.analyticalCanvas?.nodes ?? []).map(n => {
              const pos = positions[n.id]
              return pos ? { ...n, x: pos.x, y: pos.y } : n
            }),
            edges: p.analyticalCanvas?.edges ?? [],
          },
        }),
      })),

      removeCanvasNode: (projectId, nodeId) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: {
            nodes: (p.analyticalCanvas?.nodes ?? []).filter(n => n.id !== nodeId),
            edges: (p.analyticalCanvas?.edges ?? []).filter(e => e.source !== nodeId && e.target !== nodeId),
          },
        }),
      })),

      addCanvasEdge: (projectId, edge) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: {
            nodes: p.analyticalCanvas?.nodes ?? [],
            edges: [...(p.analyticalCanvas?.edges ?? []).filter(e => e.id !== edge.id), edge],
          },
        }),
      })),

      updateCanvasEdge: (projectId, edgeId, updates) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: {
            nodes: p.analyticalCanvas?.nodes ?? [],
            edges: (p.analyticalCanvas?.edges ?? []).map(e => e.id === edgeId ? { ...e, ...updates } : e),
          },
        }),
      })),

      removeCanvasEdge: (projectId, edgeId) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: {
            nodes: p.analyticalCanvas?.nodes ?? [],
            edges: (p.analyticalCanvas?.edges ?? []).filter(e => e.id !== edgeId),
          },
        }),
      })),

      clearAnalystCanvas: (projectId) => set(s => ({
        projects: s.projects.map(p => p.id !== projectId ? p : {
          ...p,
          analyticalCanvas: { nodes: [], edges: [] },
        }),
      })),

      addJournalEntry: (projectId, entry) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, journal: [...(p.journal ?? []), entry], updatedAt: new Date().toISOString() }
            : p,
        ),
      })),

      updateJournalEntry: (projectId, entryId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                journal: (p.journal ?? []).map(e =>
                  e.id === entryId ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e,
                ),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      })),

      removeJournalEntry: (projectId, entryId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                journal: (p.journal ?? []).filter(e => e.id !== entryId),
                eventPaperLinks: (p.eventPaperLinks ?? []).filter(l => l.paperEntryId !== entryId),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      })),

      attachEventPaper: (projectId, link) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, eventPaperLinks: [...(p.eventPaperLinks ?? []), link], updatedAt: new Date().toISOString() }
            : p,
        ),
      })),

      updateEventPaperLink: (projectId, linkId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                eventPaperLinks: (p.eventPaperLinks ?? []).map(l =>
                  l.id === linkId ? { ...l, ...updates } : l,
                ),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      })),

      removeEventPaperLink: (projectId, linkId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, eventPaperLinks: (p.eventPaperLinks ?? []).filter(l => l.id !== linkId), updatedAt: new Date().toISOString() }
            : p,
        ),
      })),

      addHypothesisRevision: (projectId, revision) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, hypothesisLog: [...(p.hypothesisLog ?? []), revision], updatedAt: new Date().toISOString() }
            : p,
        ),
      })),

      updateHypothesisRevision: (projectId, revisionId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                hypothesisLog: (p.hypothesisLog ?? []).map(h =>
                  h.id === revisionId ? { ...h, ...updates } : h,
                ),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      })),

      removeHypothesisRevision: (projectId, revisionId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, hypothesisLog: (p.hypothesisLog ?? []).filter(h => h.id !== revisionId), updatedAt: new Date().toISOString() }
            : p,
        ),
      })),

      addTrackedActor: (projectId, actor) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                trackedActors: [
                  ...(p.trackedActors ?? []).filter(a => a.name.toLowerCase() !== actor.name.toLowerCase()),
                  actor,
                ],
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      })),

      updateTrackedActor: (projectId, actorId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                trackedActors: (p.trackedActors ?? []).map(a => a.id === actorId ? { ...a, ...updates } : a),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      })),

      removeTrackedActor: (projectId, actorId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, trackedActors: (p.trackedActors ?? []).filter(a => a.id !== actorId), updatedAt: new Date().toISOString() }
            : p,
        ),
      })),

      addKeyDate: (projectId, keyDate) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, keyDates: [...(p.keyDates ?? []), keyDate], updatedAt: new Date().toISOString() }
            : p,
        ),
      })),

      updateKeyDate: (projectId, keyDateId, updates) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? {
                ...p,
                keyDates: (p.keyDates ?? []).map(d => d.id === keyDateId ? { ...d, ...updates } : d),
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      })),

      removeKeyDate: (projectId, keyDateId) => set(s => ({
        projects: s.projects.map(p =>
          p.id === projectId
            ? { ...p, keyDates: (p.keyDates ?? []).filter(d => d.id !== keyDateId), updatedAt: new Date().toISOString() }
            : p,
        ),
      })),
    }),
    {
      name: 'argus-projects',
      version: 7,
      storage: createJSONStorage(() => createDebouncedStorage(750)),
      migrate: (persisted, version) => {
        let state = persisted as { projects?: Project[]; activeProjectId?: string | null }
        if (!state?.projects) return state
        if (version < 2) {
          state = {
            ...state,
            projects: state.projects.map(p => migrateInvestigationGraph(p)),
          }
        }
        if (version < 3) {
          state = {
            ...state,
            projects: (state.projects ?? []).map(p => ({ ...p, forecasts: p.forecasts ?? [] })),
          }
        }
        if (version < 4) {
          state = {
            ...state,
            projects: (state.projects ?? []).map(p => ({ ...p, journal: p.journal ?? [] })),
          }
        }
        if (version < 5) {
          state = {
            ...state,
            projects: (state.projects ?? []).map(p => ({
              ...p,
              hypothesisLog: p.hypothesisLog ?? [],
              workspaceMode: p.workspaceMode ?? 'feed',
            })),
          }
        }
        if (version < 6) {
          state = {
            ...state,
            projects: (state.projects ?? []).map(p => ({
              ...p,
              eventPaperLinks: p.eventPaperLinks ?? [],
            })),
          }
        }
        if (version < 7) {
          state = {
            ...state,
            projects: (state.projects ?? []).map(p => ({
              ...p,
              briefEvidenceMode: p.briefEvidenceMode ?? 'blended',
            })),
          }
        }
        return state
      },
    }
  )
)
