'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/stores/projectStore'
import { DEMO_PROJECTS } from '@/lib/demoProjects'
import { FEATURES } from '@/lib/features'
import { formatDistanceToNow } from 'date-fns'
import { Plus, Trash2, LogIn, Monitor, ChevronRight, Loader } from 'lucide-react'
import type { Project } from '@/types/project'
import { useAuth } from '@/lib/auth/AuthContext'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { ArgusMark } from '@/components/ArgusMark'
import { IS_CLOUD_MODE } from '@/lib/supabase/config'
import { stationStats, type StationStats } from '@/lib/stationStats'
import { THREAT_LABEL } from '@/lib/threatLevel'

const IS_CLOUD = IS_CLOUD_MODE

type PendingNav =
  | { kind: 'project'; id: string }
  | { kind: 'new' }
  | null

export default function Home() {
  const router = useRouter()
  const { projects, deleteProject, openProject } = useProjectStore()
  const { user, signOut, signInWithGitHub, cloudSyncAvailable } = useAuth()
  const isMobile = useIsMobile()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [pending, setPending] = useState<PendingNav>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const unsub = useProjectStore.persist.onFinishHydration(() => setHydrated(true))
    if (useProjectStore.persist.hasHydrated()) setHydrated(true)
    const fallback = window.setTimeout(() => setHydrated(true), 1500)
    return () => { unsub(); window.clearTimeout(fallback) }
  }, [])

  useEffect(() => {
    if (!showUserMenu) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.home-user-anchor')) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showUserMenu])

  useEffect(() => {
    document.title = 'ARGUS'
    if (!FEATURES.demoProjects) return
    useProjectStore.setState(s => {
      const existingMap = new Map(s.projects.map(p => [p.id, p]))
      let changed = false
      for (const demo of DEMO_PROJECTS) {
        const existing = existingMap.get(demo.id)
        if (!existing) {
          existingMap.set(demo.id, demo)
          changed = true
        } else {
          existingMap.set(demo.id, {
            ...demo,
            events: existing.events,
            deletedEventIds: existing.deletedEventIds,
            analyticalCanvas: existing.analyticalCanvas,
            plots: existing.plots,
            incidents: existing.incidents,
            // Preserve entries the user added; if their demo ledger is still
            // empty, seed the worked example from the demo definition.
            predictionLedger: existing.predictionLedger.length > 0 ? existing.predictionLedger : demo.predictionLedger,
          })
          changed = true
        }
      }
      return changed ? { projects: [...existingMap.values()] } : s
    })
  }, [])

  const sortedProjects = [...projects].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime(),
  )

  const loading = !mounted || (!hydrated && sortedProjects.length === 0)
  const isEmpty = !loading && sortedProjects.length === 0
  const navBusy = pending !== null

  const stations = sortedProjects.map(p => ({ project: p, stats: stationStats(p) }))
  const totalEvents = stations.reduce((n, s) => n + s.stats.eventCount, 0)
  const totalCritical = stations.reduce((n, s) => n + s.stats.criticalCount, 0)
  const bandRank = { critical: 0, high: 1 } as const
  const ticker = stations
    .filter(s => s.stats.topEvent)
    .sort((a, b) => bandRank[a.stats.topEvent!.band] - bandRank[b.stats.topEvent!.band])
    .slice(0, 4)

  const handleOpen = (id: string) => {
    if (navBusy) return
    setPending({ kind: 'project', id })
    openProject(id)
    router.push(isMobile ? `/projects/${id}/brief` : `/projects/${id}`)
  }
  const newProject = () => {
    if (navBusy) return
    setPending({ kind: 'new' })
    router.push('/projects/new')
  }

  return (
    <div className={`sit-page${navBusy ? ' sit-page--nav' : ''}`} aria-busy={navBusy || undefined}>
      {navBusy && (
        <div className="sit-nav-banner" role="status" aria-live="polite">
          <Loader size={14} className="ui-spin" aria-hidden />
          <span>
            {pending?.kind === 'new'
              ? 'Opening new project…'
              : 'Opening project…'}
          </span>
        </div>
      )}

      <header className="sit-bar">
        <div className="sit-bar__brand">
          <ArgusMark size={26} variant="onLight" />
          <span className="ui-wordmark ui-wordmark--sm">ARGUS</span>
        </div>

        {!loading && !isEmpty && !isMobile && (
          <div className="sit-bar__status">
            <span><span className="ui-live-dot" aria-hidden /> {stations.length} theater{stations.length !== 1 ? 's' : ''}</span>
            <span>{totalEvents.toLocaleString()} events</span>
            {totalCritical > 0 && <span className="sit-bar__crit">{totalCritical} critical</span>}
          </div>
        )}

        <div className="sit-bar__actions">
          {mounted && (IS_CLOUD || cloudSyncAvailable) && (
            user ? (
              <div className="home-user-anchor">
                <button
                  type="button"
                  onClick={() => setShowUserMenu(v => !v)}
                  className="ui-btn ui-btn--ghost home-topbar__avatar"
                  aria-label="Account"
                  disabled={navBusy}
                >
                  {(user.name ?? user.email).slice(0, 2).toUpperCase()}
                </button>
                {showUserMenu && (
                  <div className="ui-dropdown-menu ui-dropdown-menu--right home-topbar__menu">
                    <div className="ui-dropdown-head home-topbar__menu-head">
                      <div>{user.name ?? user.email}</div>
                    </div>
                    <button type="button" onClick={() => { signOut(); setShowUserMenu(false) }} className="ui-dropdown-item ui-dropdown-item--danger">
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (IS_CLOUD ? router.push('/auth/login') : void signInWithGitHub())}
                className="ui-btn ui-btn--ghost sit-bar__signin"
                disabled={navBusy}
              >
                <LogIn size={14} aria-hidden />
                <span className="sit-bar__signin-label">Sign in</span>
              </button>
            )
          )}
        </div>
      </header>

      {!loading && !isEmpty && !isMobile && ticker.length > 0 && (
        <div className="sit-ticker" role="status" aria-label="Latest priority signals">
          {ticker.map(({ project, stats }, i) => (
            <span key={project.id} className="sit-ticker__item">
              {i > 0 && <span className="sit-ticker__sep" aria-hidden>·</span>}
              <span className={`sit-ticker__tag sit-ticker__tag--${stats.topEvent!.band}`}>
                {stats.topEvent!.band === 'critical' ? 'CRITICAL' : 'HIGH'}
              </span>
              <span className="sit-ticker__text">{project.regionName} — {stats.topEvent!.title}</span>
            </span>
          ))}
        </div>
      )}

      <main className="sit-body">
        <div className="sit-head">
          <div>
            <h1 className="sit-head__title">{isEmpty ? 'Welcome to ARGUS' : 'Your watch floor'}</h1>
            <p className="sit-head__sub">
              {isMobile
                ? (isEmpty
                  ? 'Your AI brief reader. Create a project on desktop, then tap it here to read saved briefs.'
                  : 'Tap a theater to read its brief history.')
                : (isEmpty
                  ? 'Scope a region, wire in your sources, and track events on a map.'
                  : `${stations.length} theater${stations.length !== 1 ? 's' : ''} monitored`)}
            </p>
          </div>
          {!isMobile && !isEmpty && (
            <button
              type="button"
              onClick={newProject}
              className="ui-btn ui-btn--primary sit-head__new"
              disabled={navBusy}
              aria-busy={pending?.kind === 'new' || undefined}
            >
              {pending?.kind === 'new' ? (
                <><Loader size={14} className="ui-spin" aria-hidden /> Opening…</>
              ) : (
                <><Plus size={14} aria-hidden /> New watch</>
              )}
            </button>
          )}
        </div>

        {loading ? (
          <div className="sit-list" aria-hidden>
            {[1, 2, 3].map(i => (
              <div key={i} className="sit-row-skeleton" />
            ))}
          </div>
        ) : isEmpty && isMobile ? (
          <div className="home-welcome__mobile-note">
            <Monitor size={16} aria-hidden />
            <span>Projects are created on desktop. Open ARGUS in a full browser to set one up.</span>
          </div>
        ) : (
          <div className="sit-list">
            {stations.map(({ project, stats }) => (
              <Station
                key={project.id}
                project={project}
                stats={stats}
                pending={pending?.kind === 'project' && pending.id === project.id}
                disabled={navBusy}
                onOpen={() => handleOpen(project.id)}
                onDelete={() => deleteProject(project.id)}
              />
            ))}
            {!isMobile && (
              <button
                type="button"
                onClick={newProject}
                className={`sit-row sit-row--add${pending?.kind === 'new' ? ' sit-row--pending' : ''}`}
                disabled={navBusy}
                aria-busy={pending?.kind === 'new' || undefined}
              >
                {pending?.kind === 'new' ? (
                  <><Loader size={15} className="ui-spin" aria-hidden /><span>Opening new project…</span></>
                ) : (
                  <><Plus size={15} aria-hidden /><span>Scope a new region</span></>
                )}
              </button>
            )}
          </div>
        )}
        <p className="sit-credit">
          Built by <strong>Zachary Adam</strong> &amp; <strong>Maaz Ahmad</strong>
          {' · '}Shama Research · Open source
        </p>
      </main>
    </div>
  )
}

function Station({ project, stats, onOpen, onDelete, pending, disabled }: {
  project: Project
  stats: StationStats
  onOpen: () => void
  onDelete: () => void
  pending?: boolean
  disabled?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-busy={pending || undefined}
      aria-disabled={disabled || undefined}
      className={`sit-row sit-row--${stats.threat}${pending ? ' sit-row--pending' : ''}${disabled && !pending ? ' sit-row--dim' : ''}`}
      onClick={() => { if (!disabled) onOpen() }}
      onKeyDown={e => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
    >
      <div className="sit-row__main">
        <span className="sit-row__name">{project.name}</span>
        {stats.codes && <span className="sit-row__codes">{stats.codes}</span>}
      </div>

      <span className={`sit-chip sit-chip--${stats.threat}`}>{THREAT_LABEL[stats.threat]}</span>

      <svg className="sit-row__spark" viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden>
        <polyline points={stats.sparkPoints} fill="none" strokeWidth={1.5} />
      </svg>

      {confirming ? (
        <div className="sit-row__confirm" onClick={e => e.stopPropagation()}>
          <span className="sit-row__confirm-label">Delete this theater?</span>
          <button type="button" className="ui-btn ui-btn--danger-ghost sit-row__confirm-btn" onClick={onDelete}>Delete</button>
          <button type="button" className="ui-btn ui-btn--ghost sit-row__confirm-btn" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      ) : pending ? (
        <span className="sit-row__opening">
          <Loader size={14} className="ui-spin" aria-hidden />
          Opening…
        </span>
      ) : (
        <>
          <span className="sit-row__stat">
            <span className="sit-row__stat-n">{stats.eventCount.toLocaleString()}</span> events
          </span>
          {stats.criticalCount > 0 ? (
            <span className="sit-row__stat sit-row__stat--crit">{stats.criticalCount} crit</span>
          ) : stats.highCount > 0 ? (
            <span className="sit-row__stat sit-row__stat--high">{stats.highCount} high</span>
          ) : (
            <span className="sit-row__stat sit-row__stat--muted">clear</span>
          )}
          <span className="sit-row__time">
            {formatDistanceToNow(new Date(project.lastOpenedAt), { addSuffix: true })}
          </span>
          <button
            type="button"
            className="sit-row__delete"
            onClick={e => { e.stopPropagation(); setConfirming(true) }}
            aria-label={`Delete ${project.name}`}
            disabled={disabled}
          >
            <Trash2 size={13} />
          </button>
          <ChevronRight size={16} className="sit-row__chevron" aria-hidden />
        </>
      )}
    </div>
  )
}
