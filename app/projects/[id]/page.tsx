'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useCallback, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import nextDynamic from 'next/dynamic'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import Header from '@/components/Header'
import { WorkspaceSkeleton, FeedPanelSkeleton, ResearchPanelSkeleton, CanvasPanelSkeleton } from '@/components/skeletons'
import MapLoadPlaceholder from '@/components/MapLoadPlaceholder'
import { Toaster } from '@/components/Toaster'
import { useWorkspaceSync } from '@/lib/hooks/useWorkspaceSync'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useProjectEvents } from '@/lib/hooks/useProjectEvents'
import { usePromotedMarks } from '@/lib/hooks/usePromotedMarks'
import { useTargetedEvents } from '@/lib/hooks/useTargetedEvents'
import { useLiveVessels } from '@/lib/hooks/useLiveVessels'
import { syncProjectLiveTracking, resolveLiveLayers } from '@/lib/liveTracking'
import { usePlaybackTracks } from '@/lib/hooks/usePlaybackTracks'
import { useAnomalyAlerts } from '@/lib/hooks/useAnomalyAlerts'
import { useSituationMonitor } from '@/lib/hooks/useSituationMonitor'
import { useProjectPlotsHydration } from '@/lib/hooks/useScopedPlots'
import { useMigrateForecasts } from '@/lib/hooks/useMigrateForecasts'
import { PerfOverlay } from '@/components/PerfOverlay'
import { AlertBanner } from '@/components/AlertBanner'

const dn = (p: string, label?: string) => nextDynamic(
  () => import(`@/components/${p}`),
  { ssr: false, loading: () => <WorkspaceSkeleton label={label} /> },
)
const TimelineScrubber  = dn('TimelineScrubber')
const ArgusMap          = nextDynamic(() => import('@/components/ArgusMap'), { ssr: false, loading: () => <MapLoadPlaceholder /> })
const EventFeed         = nextDynamic(() => import('@/components/EventFeed'), { ssr: false, loading: () => <FeedPanelSkeleton /> })
const EventDetailPanel  = dn('EventDetailPanel')
const CountryPanel      = dn('CountryPanel')
const AlertsPanel       = dn('AlertsPanel')
const CommandBar        = dn('CommandBar')
const AuthModal         = dn('AuthModal')
const AnomalyPanel      = dn('AnomalyPanel')
const TimelinePanel     = dn('TimelinePanel')
const ConnectorsPanel   = dn('ConnectorsPanel')
const ExportPanel       = dn('ExportPanel')
const BriefHistoryPanel = dn('BriefHistoryPanel')
const ProjectOverview   = dn('ProjectOverview')
const SettingsPanel     = dn('SettingsPanel')
const IncidentPanel     = dn('IncidentPanel')
const WatchRulesPanel   = dn('WatchRulesPanel')
const PlotsPanel        = dn('PlotsPanel')
const VelocityPanel     = dn('VelocityPanel')
const ForecastsPanel    = dn('ForecastsPanel')
const AnalystCanvas     = nextDynamic(() => import('@/components/AnalystCanvas'), { ssr: false, loading: () => <CanvasPanelSkeleton /> })
const LedgerPanel       = dn('LedgerPanel', 'Loading ledger')
const CaseTrackerPanel  = dn('CaseTrackerPanel')
const ActorsPanel       = dn('ActorsPanel')
const ThreadsPanel      = dn('ThreadsPanel')
const MonitorPanel      = dn('MonitorPanel')
const ResearchJournalPanel = nextDynamic(() => import('@/components/ResearchJournalPanel'), { ssr: false, loading: () => <ResearchPanelSkeleton /> })
const TopicPanel        = dn('TopicPanel')
const ProjectMenu       = dn('ProjectMenu', 'Loading menu')

export default function ProjectWorkspace() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [mounted, setMounted] = useState(false)
  const [storeHydrated, setStoreHydrated] = useState(false)
  const isMobile = useIsMobile()
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const unsub = useProjectStore.persist.onFinishHydration(() => setStoreHydrated(true))
    if (useProjectStore.persist.hasHydrated()) setStoreHydrated(true)
    const fallback = window.setTimeout(() => setStoreHydrated(true), 1500)
    return () => { unsub(); window.clearTimeout(fallback) }
  }, [])

  const panels        = useMapStore(s => s.panels)
  const togglePanel   = useMapStore(s => s.togglePanel)
  const focusWorkbench = useMapStore(s => s.focusWorkbench)
  const flyTo         = useMapStore(s => s.flyTo)
  const selectedEvent = useMapStore(s => s.selectedEvent)
  const { projects, openProject } = useProjectStore()

  const project = projects.find(p => p.id === projectId)
  const live = resolveLiveLayers(project)

  const fullscreenWorkbench =
    panels.canvas || panels.ledger || panels.menu

  useEffect(() => {
    if (isMobile && project) {
      router.replace(`/projects/${projectId}/brief`)
    }
  }, [isMobile, project, projectId, router])

  useEffect(() => {
    if (!storeHydrated) return
    if (!project) { router.replace('/'); return }
    useMapStore.getState().clearProjectData()
    openProject(projectId)
    document.title = `${project.name} — ARGUS`
    flyTo(project.regionCenter[1], project.regionCenter[0], project.regionZoom)
    syncProjectLiveTracking(project)
    focusWorkbench('map')
  }, [storeHydrated, projectId, project?.goalTemplateId, project?.liveLayers, project?.regionCenter, project?.regionZoom]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.classList.remove('dark')
  }, [])

  useWorkspaceSync()
  useProjectEvents()
  usePromotedMarks()
  useTargetedEvents()
  useLiveVessels(live.vessels)
  usePlaybackTracks()
  useProjectPlotsHydration()
  useMigrateForecasts()
  useAnomalyAlerts()
  useSituationMonitor()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable
    const mod = e.metaKey || e.ctrlKey

    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      const s = useMapStore.getState()
      const p = s.panels
      if (p.canvas || p.ledger || p.menu) {
        togglePanel('commandBar')
      } else {
        if (p.commandBar) togglePanel('commandBar')
        s.requestMapQueryFocus()
      }
      return
    }

    if (mod && e.key === ',') {
      e.preventDefault()
      togglePanel('settings')
      return
    }

    if (e.key === 'Escape' && inInput) return

    if (e.key === 'Escape') {
      const s = useMapStore.getState()
      if (s.selectedEvent) { s.setSelectedEvent(null); return }
      const p = s.panels
      if (p.eventFeed || p.journal || p.menu) { focusWorkbench('map'); return }
      if (p.velocity) { togglePanel('velocity'); return }
      if (p.forecasts) { togglePanel('forecasts'); return }
      if (p.anomaly) { togglePanel('anomaly'); return }
      if (p.country) { togglePanel('country'); return }
      if (p.alerts) { togglePanel('alerts'); return }
      if (p.plotsPanel) { togglePanel('plotsPanel'); return }
      if (p.commandBar) { togglePanel('commandBar'); return }
      if (p.timeline) { togglePanel('timeline'); return }
      if (p.scrubber) { togglePanel('scrubber'); return }
      s.closeAllPanels()
    }
  }, [togglePanel, focusWorkbench])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Warm the code-split event-detail chunk shortly after load so the FIRST
  // event-open is instant instead of waiting on a download.
  useEffect(() => {
    const t = setTimeout(() => { import('@/components/EventDetailPanel').catch(() => {}) }, 1200)
    return () => clearTimeout(t)
  }, [])

  const sidePanelOpen = !!(panels.velocity || panels.forecasts || panels.anomaly || panels.country || panels.alerts || panels.plotsPanel)

  if (isMobile) {
    return <WorkspaceSkeleton label="Opening briefs…" />
  }

  return (
    <div className="argus-workspace">
      <Header />

      {!mounted && <WorkspaceSkeleton label="Loading project" />}

      {mounted && panels.canvas && <AnalystCanvas />}
      {mounted && panels.ledger && <LedgerPanel />}
      {mounted && panels.menu && <ProjectMenu />}

      {mounted && panels.cases && <CaseTrackerPanel />}

      <div className={`argus-workspace__map-row${fullscreenWorkbench ? ' argus-workspace__map-row--hidden' : ''}`}>
        <div className="argus-workspace__map-col argus-workspace__map-col--plain">
          <div className={`map-stage${panels.eventFeed ? ' map-stage--feed-open' : ''}${panels.journal ? ' map-stage--journal-open' : ''}${sidePanelOpen ? ' map-stage--side-open' : ''}`}>
            {/* Unmount Mapbox while canvas/ledger/menu owns the screen — hidden maps still burn GPU. */}
            {mounted && !fullscreenWorkbench && <ArgusMap />}
            {mounted && panels.eventFeed && <EventFeed />}
            {mounted && panels.actors && <ActorsPanel />}
            {mounted && panels.threads && <ThreadsPanel />}
            {mounted && panels.monitor && <MonitorPanel />}
            {mounted && panels.journal && <ResearchJournalPanel />}
            {mounted && <AlertBanner />}
            <div className="map-dock-time">
              {mounted && panels.scrubber && <TimelineScrubber />}
            </div>
          </div>

          {mounted && panels.velocity  ? <VelocityPanel />  :
           panels.forecasts ? <ForecastsPanel /> :
           panels.anomaly   ? <AnomalyPanel />   :
           panels.country   ? <CountryPanel />   :
           panels.alerts    ? <AlertsPanel />    :
           panels.plotsPanel ? <PlotsPanel />    :
           null}
        </div>
      </div>

      {mounted && panels.commandBar   && <CommandBar />}
      {mounted && panels.authModal    && <AuthModal />}
      {mounted && panels.timeline     && <TimelinePanel />}
      {mounted && panels.connectors   && <ConnectorsPanel />}
      {mounted && panels.export       && <ExportPanel />}
      {mounted && panels.briefHistory && <BriefHistoryPanel />}
      {mounted && panels.overview     && <ProjectOverview />}
      {mounted && panels.settings     && <SettingsPanel />}
      {mounted && panels.incidents    && <IncidentPanel />}
      {mounted && panels.watchRules   && <WatchRulesPanel />}
      {mounted && panels.topic       && <TopicPanel />}
      {/* Top-level so the event detail overlays ANY tab (map, canvas, research…), not just the map. */}
      {mounted && selectedEvent && <EventDetailPanel />}
      {mounted && <Toaster />}
      {mounted && process.env.NODE_ENV === 'development' && <PerfOverlay />}
    </div>
  )
}
