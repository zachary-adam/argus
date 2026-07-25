'use client'
import { useMapStore, type Panels } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { useAuth } from '@/lib/auth/AuthContext'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChevronLeft, MoreHorizontal, Map, Newspaper, BookMarked, PenTool } from 'lucide-react'
import { IntelSourcePanel } from './IntelSourcePanel'

const TABS = [
  { id: 'map' as const, label: 'Map', icon: Map },
  { id: 'feed' as const, label: 'Events', icon: Newspaper },
  { id: 'research' as const, label: 'Research', icon: BookMarked },
  { id: 'canvas' as const, label: 'Canvas', icon: PenTool },
]

const SIDE_PANEL_ORDER = ['velocity', 'forecasts', 'anomaly', 'country', 'alerts', 'plotsPanel'] as const
const SIDE_PANEL_LABELS: Record<(typeof SIDE_PANEL_ORDER)[number], string> = {
  velocity: 'Velocity',
  forecasts: 'Forecasts',
  anomaly: 'Anomaly',
  country: 'Country',
  alerts: 'Alerts',
  plotsPanel: 'Plots',
}

const OVERLAY_PANEL_ORDER = ['settings', 'connectors', 'export', 'briefHistory', 'overview', 'timeline', 'incidents', 'watchRules', 'topic', 'cases'] as const
const OVERLAY_PANEL_LABELS: Record<(typeof OVERLAY_PANEL_ORDER)[number], string> = {
  settings: 'Settings',
  connectors: 'Sources',
  export: 'Export',
  briefHistory: 'Briefs',
  overview: 'Overview',
  timeline: 'Chronology',
  incidents: 'Incidents',
  watchRules: 'Watch rules',
  topic: 'Topic tracker',
  cases: 'Cases',
}

function truncateCrumb(text: string | undefined | null, max = 34) {
  const t = (text ?? '').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function getSidePanelLabel(panels: Panels) {
  for (const key of SIDE_PANEL_ORDER) {
    if (panels[key]) return SIDE_PANEL_LABELS[key]
  }
  return null
}

function getOverlayLabel(panels: Panels) {
  for (const key of OVERLAY_PANEL_ORDER) {
    if (panels[key]) return OVERLAY_PANEL_LABELS[key]
  }
  return null
}

export default function Header() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const panels = useMapStore(s => s.panels)
  const focusWorkbench = useMapStore(s => s.focusWorkbench)
  const togglePanel = useMapStore(s => s.togglePanel)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const selectedEvent = useMapStore(s => s.selectedEvent)
  const addSourceOpen = useMapStore(s => s.addSourceOpen)
  const setAddSourceOpen = useMapStore(s => s.setAddSourceOpen)
  const { getActiveProject } = useProjectStore()
  const { user, isAuthenticated, signOut } = useAuth()
  const router = useRouter()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeProject = getActiveProject()

  const activeTab = panels.canvas ? 'canvas'
    : panels.ledger ? 'ledger'
    : panels.menu ? 'menu'
    : panels.journal ? 'research'
    : panels.eventFeed ? 'feed'
    : 'map'

  const viewLabel = panels.menu ? 'Menu'
    : panels.ledger ? 'Ledger'
    : panels.canvas ? 'Canvas'
    : panels.journal ? 'Research'
    : panels.eventFeed ? 'Events'
    : 'Map'

  const overlayLabel = getOverlayLabel(panels)
  const sidePanelLabel = activeTab === 'map' ? getSidePanelLabel(panels) : null
  const eventLabel = selectedEvent ? truncateCrumb(selectedEvent.title) : null
  const contextLabel = overlayLabel ?? eventLabel ?? sidePanelLabel

  const resetViewDepth = () => {
    if (overlayLabel) {
      for (const key of OVERLAY_PANEL_ORDER) {
        if (panels[key]) togglePanel(key)
      }
      return
    }
    if (selectedEvent) {
      setSelectedEvent(null)
      return
    }
    if (sidePanelLabel) {
      for (const key of SIDE_PANEL_ORDER) {
        if (panels[key]) togglePanel(key)
      }
    }
  }

  const isElectronMac = mounted &&
    typeof navigator !== 'undefined' &&
    navigator.userAgent.includes('Electron') && navigator.platform.startsWith('Mac')

  if (!mounted) return <header className="ui-app-header ui-header-workspace" />

  return (
    <header
      className="ui-app-header ui-header-workspace"
      style={{
        paddingLeft: isElectronMac ? 84 : undefined,
        ...(isElectronMac ? { WebkitAppRegion: 'drag' } as React.CSSProperties : {}),
      }}
    >
      <div className="ui-header-workspace__brand" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {activeProject ? (
          <>
            <button type="button" onClick={() => router.push('/')} className="ui-header-workspace__back" aria-label="All projects">
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <div className="ui-header-workspace__title-wrap">
              <span className="ui-header-workspace__title">{activeProject.name}</span>
              <nav className="ui-header-crumb" aria-label="Location">
                <button type="button" className="ui-header-crumb__link" onClick={() => router.push('/')}>
                  Projects
                </button>
                <span className="ui-header-crumb__sep" aria-hidden>/</span>
                {contextLabel ? (
                  <>
                    <button
                      type="button"
                      className="ui-header-crumb__view ui-header-crumb__view--link"
                      onClick={resetViewDepth}
                      title={`Back to ${viewLabel}`}
                    >
                      {viewLabel}
                    </button>
                    <span className="ui-header-crumb__sep" aria-hidden>/</span>
                    <span className="ui-header-crumb__context" title={contextLabel}>
                      {contextLabel}
                    </span>
                  </>
                ) : (
                  <span className="ui-header-crumb__view">{viewLabel}</span>
                )}
                {activeProject.regionName && (
                  <>
                    <span className="ui-header-crumb__sep ui-header-crumb__sep--dot" aria-hidden>·</span>
                    <span className="ui-header-crumb__region" title={activeProject.regionName}>
                      {activeProject.regionName}
                    </span>
                  </>
                )}
              </nav>
            </div>
          </>
        ) : (
          <span className="ui-wordmark ui-wordmark--sm">ARGUS</span>
        )}
      </div>

      {activeProject && (
        <nav className="ui-header-workspace__nav" aria-label="Workspace" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="ui-seg-nav ui-seg-nav--icon-rail">
            {TABS.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`ui-seg-nav__btn ui-seg-nav__btn--icon${activeTab === tab.id ? ' ui-seg-nav__btn--active' : ''}`}
                  onClick={() => focusWorkbench(tab.id)}
                  aria-label={tab.label}
                  title={tab.label}
                >
                  <Icon size={15} strokeWidth={2} className="ui-seg-nav__icon" aria-hidden />
                  <span className="ui-seg-nav__label">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      <div className="ui-header-workspace__actions" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {activeProject && (
          <button
            type="button"
            className={`ui-header-workspace__menu${panels.menu ? ' ui-header-workspace__menu--active' : ''}`}
            onClick={() => focusWorkbench(panels.menu ? 'map' : 'menu')}
            aria-label="Project menu"
            aria-expanded={panels.menu}
          >
            <MoreHorizontal size={16} />
          </button>
        )}

        {isAuthenticated ? (
          <div ref={userMenuRef} className="ui-header-workspace__user-wrap">
            <button
              type="button"
              onClick={() => setShowUserMenu(v => !v)}
              className="ui-header-workspace__user"
              aria-label="Account"
            >
              {user?.email?.slice(0, 2).toUpperCase()}
            </button>
            {showUserMenu && (
              <div className="ui-dropdown-menu ui-dropdown-menu--right" style={{ top: 36, minWidth: 200 }}>
                <div className="ui-dropdown-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{user?.email}</div>
                </div>
                <button type="button" className="ui-dropdown-item" onClick={() => { signOut(); setShowUserMenu(false) }}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => togglePanel('authModal')}
            className="ui-header-workspace__signin"
          >
            Sign in
          </button>
        )}
      </div>

      {addSourceOpen && createPortal(
        <IntelSourcePanel onClose={() => setAddSourceOpen(false)} />,
        document.body,
      )}
    </header>
  )
}
