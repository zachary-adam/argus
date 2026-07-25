'use client'
import { useEffect, useState } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { X, Radio, BookMarked, Rss } from 'lucide-react'

function dismissKeyFor(projectId: string) {
  return `argus_empty_${projectId}`
}

/** Centered map card when a project has no events yet. */
export function OnboardingBanner() {
  const events = useMapStore(s => s.events)
  const eventsLoading = useMapStore(s => s.eventsLoading)
  const topicPull = useMapStore(s => s.topicPull)
  const panels = useMapStore(s => s.panels)
  const addSourceOpen = useMapStore(s => s.addSourceOpen)
  const selectedEvent = useMapStore(s => s.selectedEvent)
  const setAddSourceOpen = useMapStore(s => s.setAddSourceOpen)
  const togglePanel = useMapStore(s => s.togglePanel)
  const openJournal = useMapStore(s => s.openJournal)
  const focusWorkbench = useMapStore(s => s.focusWorkbench)
  const project = useProjectStore(s => s.getActiveProject())

  const mapObscured =
    addSourceOpen
    || selectedEvent
    || panels.eventFeed
    || panels.journal
    || panels.canvas
    || panels.menu
    || panels.velocity
    || panels.forecasts
    || panels.anomaly
    || panels.country
    || panels.alerts
    || panels.plotsPanel

  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!project?.id) return
    try {
      setDismissed(!!localStorage.getItem(dismissKeyFor(project.id)))
    } catch {
      setDismissed(false)
    }
  }, [project?.id])

  const dismiss = () => {
    if (!project?.id) return
    setDismissed(true)
    try {
      localStorage.setItem(dismissKeyFor(project.id), '1')
    } catch { /* noop */ }
  }

  if (!project || events.length > 0 || mapObscured) return null

  if (eventsLoading || topicPull.querying) {
    return (
      <div className="map-empty-state map-empty-state--loading" role="status">
        <div className="map-empty-state__spinner" aria-hidden />
        <p className="map-empty-state__title">
          {topicPull.querying ? 'Collecting events…' : 'Loading events…'}
        </p>
        <p className="map-empty-state__hint">
          {topicPull.querying
            ? `Searching news and sources for ${project.regionName}`
            : `Checking feeds for ${project.regionName}`}
        </p>
      </div>
    )
  }

  if (dismissed) return null

  const lead = project.researchQuestion?.trim()
    ? project.researchQuestion.trim()
    : `Start watching ${project.regionName} in three steps.`

  return (
    <div className="map-empty-state">
      <button
        type="button"
        onClick={dismiss}
        className="map-empty-state__dismiss ui-btn ui-btn--ghost ui-btn--icon"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
      <p className="map-empty-state__kicker">Getting started</p>
      <h2 className="map-empty-state__title">Your map is ready</h2>
      <p className="map-empty-state__hint">{lead}</p>
      <ul className="map-empty-state__steps">
        <li>
          <button
            type="button"
            className="map-empty-state__step map-empty-state__step--primary"
            onClick={() => setAddSourceOpen(true)}
          >
            <span className="map-empty-state__step-icon" aria-hidden><Radio size={16} /></span>
            <span className="map-empty-state__step-copy">
              <span className="map-empty-state__step-label">Add a source</span>
              <span className="map-empty-state__step-desc">Paste a URL or article clip</span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="map-empty-state__step"
            onClick={() => { focusWorkbench('research'); openJournal('entries') }}
          >
            <span className="map-empty-state__step-icon" aria-hidden><BookMarked size={16} /></span>
            <span className="map-empty-state__step-copy">
              <span className="map-empty-state__step-label">Open Research</span>
              <span className="map-empty-state__step-desc">Save papers and notes for briefs</span>
            </span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className="map-empty-state__step"
            onClick={() => { focusWorkbench('map'); togglePanel('connectors') }}
          >
            <span className="map-empty-state__step-icon" aria-hidden><Rss size={16} /></span>
            <span className="map-empty-state__step-copy">
              <span className="map-empty-state__step-label">Turn on live feeds</span>
              <span className="map-empty-state__step-desc">GDELT, RSS, and connectors</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  )
}
