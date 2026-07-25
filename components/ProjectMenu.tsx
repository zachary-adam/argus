'use client'
import { useRef, useState, type ReactNode } from 'react'
import {
  ChevronRight, Target, Rss, Link2, Bell, Briefcase, AlertTriangle, Eye,
  TrendingUp, Sparkles, LineChart, Clock, Play, BookOpen, Settings, FileDown,
  History, LayoutGrid, Upload, Download, X, Users, GitBranch, Radar,
} from 'lucide-react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { downloadProjectBackup, mergeProjectImports, parseProjectBackup } from '@/lib/projectBackup'

function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ui-menu-group">
      <h2 className="ui-menu-group__title">{title}</h2>
      <div className="ui-menu-group__card">{children}</div>
    </section>
  )
}

function Row({
  icon: Icon,
  label,
  hint,
  onClick,
  active,
  disabled,
  badge,
}: {
  icon?: typeof Target
  label: string
  hint?: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  badge?: number
}) {
  return (
    <button
      type="button"
      className={`ui-menu-row${active ? ' ui-menu-row--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && (
        <span className="ui-menu-row__icon" aria-hidden>
          <Icon size={16} strokeWidth={2} />
        </span>
      )}
      <span className="ui-menu-row__text">
        <span className="ui-menu-row__label">{label}</span>
        {hint && <span className="ui-menu-row__hint">{hint}</span>}
      </span>
      {badge != null && badge > 0 && (
        <span className="ui-chip ui-chip--xs" style={{ background: 'var(--critical)', color: '#fff', borderColor: 'transparent', fontWeight: 700, marginRight: 4 }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      <ChevronRight size={15} className="ui-menu-row__chevron" aria-hidden />
    </button>
  )
}

export default function ProjectMenu() {
  const focusWorkbench = useMapStore(s => s.focusWorkbench)
  const togglePanel = useMapStore(s => s.togglePanel)
  const pushToast = useMapStore(s => s.pushToast)
  const panels = useMapStore(s => s.panels)
  const monitorUnseen = useMapStore(s => s.monitorUnseen)
  const projects = useProjectStore(s => s.projects)
  const project = useProjectStore(s => s.getActiveProject())
  const importRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const proMode = useSettingsStore(s => s.proMode)
  const setProMode = useSettingsStore(s => s.setProMode)

  const enableProMode = () => {
    setProMode(true)
    pushToast({
      title: 'Analyst tools on',
      body: 'Velocity, incidents, watch rules, and more are in Advanced below.',
      severity: 'info',
      type: 'system',
    })
  }

  const open = (key: keyof typeof panels) => {
    focusWorkbench('map')
    togglePanel(key)
  }

  const closeMenu = () => focusWorkbench('map')

  const handleExport = () => {
    downloadProjectBackup(projects)
    pushToast({ title: 'Backup downloaded', body: 'All projects saved to JSON', severity: 'info', type: 'system' })
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const imported = parseProjectBackup(text)
      const merged = mergeProjectImports(projects, imported)
      useProjectStore.setState({ projects: merged })
      pushToast({
        title: 'Import complete',
        body: `Merged ${imported.length} project${imported.length !== 1 ? 's' : ''}`,
        severity: 'info',
        type: 'system',
      })
    } catch (err) {
      pushToast({
        title: 'Import failed',
        body: err instanceof Error ? err.message : 'Invalid backup file',
        severity: 'medium',
        type: 'system',
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="ui-fullscreen-workspace ui-project-menu">
      <div className="ui-project-menu__scroll">
        <header className="ui-project-menu__hero">
          <div className="ui-project-menu__hero-top">
            <div>
              <h1 className="ui-title ui-title--panel ui-project-menu__title">More</h1>
              {project?.name && <p className="ui-project-menu__sub">{project.name}</p>}
            </div>
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--icon ui-project-menu__close"
              onClick={closeMenu}
              aria-label="Back to map"
            >
              <X size={16} />
            </button>
          </div>
          <p className="ui-feed-hint ui-project-menu__lead">
            Sources, export, and settings — Map, Events, and Research stay in the header.
          </p>
        </header>

        <div className="ui-project-menu__body">
          <MenuGroup title="Sources">
            <Row icon={Rss} label="Live feeds" hint="GDELT, RSS, connectors" onClick={() => open('connectors')} active={panels.connectors} />
            <Row icon={Link2} label="Add source" hint="Paste a URL or article" onClick={() => useMapStore.getState().setAddSourceOpen(true)} />
            <Row icon={Target} label="Your topic" hint="Keywords and region scope" onClick={() => open('topic')} active={panels.topic} />
          </MenuGroup>

          <MenuGroup title="Output">
            <Row
              icon={FileDown}
              label="Export"
              hint="Markdown, PDF, CSV"
              onClick={() => {
                useMapStore.setState(s => ({
                  panels: {
                    ...s.panels,
                    menu: false,
                    canvas: false,
                    ledger: false,
                    journal: false,
                    eventFeed: false,
                    export: true,
                  },
                }))
              }}
              active={panels.export}
            />
            <Row icon={History} label="Brief history" onClick={() => open('briefHistory')} active={panels.briefHistory} />
            <Row
              icon={BookOpen}
              label="Ledger"
              hint="Validate canvas formula & ACH scores"
              onClick={() => open('ledger')}
              active={panels.ledger}
              badge={(project?.predictionLedger ?? []).filter(e => !e.validatedOutcome).length || undefined}
            />
            <Row
              icon={LineChart}
              label="Forecasts"
              hint="Dated probability calls"
              onClick={() => open('forecasts')}
              active={panels.forecasts}
              badge={(project?.forecasts ?? []).filter(f => !f.resolved).length || undefined}
            />
            <Row icon={Settings} label="Settings" onClick={() => open('settings')} active={panels.settings} />
          </MenuGroup>

          {!proMode ? (
            <div className="ui-menu-pro-card">
              <div className="ui-menu-pro-card__main">
                <span className="ui-menu-pro-card__icon" aria-hidden>
                  <TrendingUp size={18} strokeWidth={2} />
                </span>
                <div className="ui-menu-pro-card__copy">
                  <div className="ui-menu-pro-card__title">Analyst tools</div>
                  <p className="ui-menu-pro-card__desc">
                    Velocity, incidents, watch rules, chronology, and more.
                  </p>
                </div>
              </div>
              <button type="button" className="ui-btn ui-btn--primary ui-menu-pro-card__btn" onClick={enableProMode}>
                Turn on
              </button>
            </div>
          ) : (
          <details className="ui-menu-advanced" open>
            <summary className="ui-menu-advanced__summary">Analyst tools</summary>
            <div className="ui-menu-advanced__body">
              <MenuGroup title="Operations">
                <Row icon={Bell} label="Alerts" onClick={() => open('alerts')} active={panels.alerts} />
                <Row icon={Briefcase} label="Cases" onClick={() => open('cases')} active={panels.cases} />
                <Row icon={AlertTriangle} label="Incidents" onClick={() => open('incidents')} active={panels.incidents} />
                <Row icon={Eye} label="Watch rules" onClick={() => open('watchRules')} active={panels.watchRules} />
              </MenuGroup>

              <MenuGroup title="Analysis">
                <Row icon={Radar} label="Monitor" hint="Live change alerts" onClick={() => open('monitor')} active={panels.monitor} badge={monitorUnseen} />
                <Row icon={Users} label="Actors" onClick={() => open('actors')} active={panels.actors} />
                <Row icon={GitBranch} label="Threads" onClick={() => open('threads')} active={panels.threads} />
                <Row icon={TrendingUp} label="Velocity" onClick={() => open('velocity')} active={panels.velocity} />
                <Row icon={Sparkles} label="Anomalies" onClick={() => open('anomaly')} active={panels.anomaly} />
                <Row icon={Clock} label="Chronology" onClick={() => open('timeline')} active={panels.timeline} />
                <Row icon={Play} label="Map replay" onClick={() => open('scrubber')} active={panels.scrubber} />
                <Row icon={LayoutGrid} label="Overview" onClick={() => open('overview')} active={panels.overview} />
              </MenuGroup>
            </div>
          </details>
          )}

          <div className="ui-menu-backup">
            <button type="button" className="ui-btn ui-btn--ghost ui-menu-backup__btn" onClick={handleExport}>
              <Download size={14} /> Export backup
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-menu-backup__btn"
              disabled={importing}
              onClick={() => !importing && importRef.current?.click()}
            >
              <Upload size={14} /> {importing ? 'Importing…' : 'Import backup'}
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) void handleImport(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
