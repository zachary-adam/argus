'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Map, Source, Layer, Marker } from '@/components/map/MapGL'
import { USE_MAPBOX, MAPBOX_TOKEN, resolveMapStyle } from '@/lib/mapProvider'
import { AlertTriangle, Shield, Activity, Globe, ExternalLink, Copy, Check, FolderSearch, BarChart2, FileText } from 'lucide-react'
import { TrustChip } from '@/components/TrustChip'
import { ArgusMark } from '@/components/ArgusMark'
import type { ShareSnapshotState } from '@/lib/shareSnapshot'

const TOKEN = MAPBOX_TOKEN

/** Map layer colors — dark theme severity tokens */
const MAP_SEV: Record<string, string> = {
  critical: '#F0556A', high: '#F0954A', medium: '#E3C04A', low: '#5FB89A', info: '#8593A0',
}

interface SnapshotState extends ShareSnapshotState {}
interface Snapshot {
  id: string; title: string; description: string
  state: SnapshotState; created_at: string
}


function sevColor(severity: string) {
  return MAP_SEV[severity] ?? MAP_SEV.info
}

export default function SharePage() {
  const { id } = useParams<{ id: string }>()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [copied, setCopied] = useState(false)
  const mapRef = useRef(null)

  useEffect(() => {
    fetch(`/api/snapshots/${id}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json() })
      .then(data => {
        setSnap(data)
        if (data?.title) document.title = `${data.title} — ARGUS`
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  const copy = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="share-page share-page--simple share-page--centered">
        <div className="share-state-card">
          <div className="share-spinner" aria-hidden />
          <p className="ui-subtitle">Loading snapshot…</p>
        </div>
      </div>
    )
  }

  if (notFound || !snap) {
    return (
      <div className="share-page share-page--simple share-page--centered">
        <div className="share-state-card share-empty">
          <div className="share-empty__glyph" aria-hidden>?</div>
          <h1 className="ui-title ui-title--panel">Snapshot not found</h1>
          <p className="ui-subtitle ui-subtitle--panel">
            This link may have expired or been removed.
          </p>
          <Link href="/" className="ui-btn ui-btn--primary">Open ARGUS</Link>
        </div>
      </div>
    )
  }

  const s = snap.state
  const eventsGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: s.topEvents.filter(e => e.lat && e.lon).map(e => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
      properties: { severity: e.severity },
    })),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const severityLayerColors: any = [
    'match', ['get', 'severity'],
    'critical', MAP_SEV.critical,
    'high', MAP_SEV.high,
    'medium', MAP_SEV.medium,
    'low', MAP_SEV.low,
    MAP_SEV.info,
  ]

  const generatedDate = new Date(snap.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const stats = [
    { label: 'Events', value: s.eventCount, tone: 'accent' as const, icon: <Activity size={13} /> },
    { label: 'Critical', value: s.criticalCount, tone: 'critical' as const, icon: <AlertTriangle size={13} /> },
    { label: 'High', value: s.highCount, tone: 'high' as const, icon: <Shield size={13} /> },
    { label: 'Alerts', value: s.alerts?.length ?? 0, tone: 'medium' as const, icon: <Globe size={13} /> },
  ]

  return (
    <div className="share-page share-page--simple">
      <header className="share-topbar">
        <div className="share-topbar__inner">
          <div className="share-topbar__brand">
            <div className="home-logo-mark"><ArgusMark size={28} variant="onLight" /></div>
            <div>
              <div className="ui-wordmark ui-wordmark--sm">ARGUS</div>
              <div className="share-topbar__tag">Shared snapshot</div>
            </div>
          </div>
          <div className="share-topbar__actions">
            <button type="button" onClick={copy} className="ui-btn ui-btn--ghost share-topbar__btn">
              {copied ? <><Check size={12} className="share-topbar__copied" /> Copied</> : <><Copy size={12} /> Copy link</>}
            </button>
            <Link href="/" className="ui-btn ui-btn--primary share-topbar__btn">
              <ExternalLink size={11} /> Open ARGUS
            </Link>
          </div>
        </div>
      </header>

      <main className="share-shell">
        <section className="share-hero">
          <div>
            {s.projectName && (
              <div className="ui-kicker" style={{ marginBottom: 6 }}>{s.projectName}</div>
            )}
            <h1 className="share-hero__title">{snap.title}</h1>
            {snap.description && (
              <p className="share-hero__desc">{snap.description}</p>
            )}
            {s.researchQuestion && (
              <p className="share-hero__question">{s.researchQuestion}</p>
            )}
            <p className="share-meta">
              Captured {generatedDate} · Read-only · Point-in-time export, not live data
            </p>
          </div>

          <div className="share-stats">
            {stats.map(stat => (
              <div key={stat.label} className={`share-stat share-stat--${stat.tone}`}>
                <div className="share-stat__icon">{stat.icon}</div>
                <div className="share-stat__n">{stat.value}</div>
                <div className="share-stat__label">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="share-layout">
          <div className="share-map">
            <Map
              ref={mapRef}
              {...(USE_MAPBOX ? { mapboxAccessToken: TOKEN } : {})}
              mapStyle={resolveMapStyle()}
              initialViewState={s.viewport ?? { latitude: 30, longitude: 30, zoom: 2 }}
              style={{ width: '100%', height: '100%' }}
              fadeDuration={0}
              renderWorldCopies={false}
              interactive
              {...(USE_MAPBOX ? { projection: 'globe' as const } : {})}
            >
              {s.topEvents.length > 0 && (
                <Source id="events" type="geojson" data={eventsGeoJSON}>
                  <Layer id="events-halo" type="circle" paint={{
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4, 6, 10],
                    'circle-color': severityLayerColors,
                    'circle-opacity': 0.15,
                  }} />
                  <Layer id="events-dot" type="circle" paint={{
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 6, 5],
                    'circle-color': severityLayerColors,
                    'circle-opacity': 0.9,
                  }} />
                </Source>
              )}
              {s.plots?.map(p => {
                if (p.type !== 'point') return null
                const [lon, lat] = p.coordinates as number[]
                return (
                  <Marker key={p.id} latitude={lat} longitude={lon}>
                    <div
                      className="share-plot-dot"
                      style={{ background: sevColor(p.threat_level ?? 'info') }}
                    />
                  </Marker>
                )
              })}
            </Map>
          </div>

          <aside className="share-sidebar">
            {s.aiBrief && (
              <div className="share-card share-card--brief">
                <div className="share-card__head">
                  <FileText size={12} className="share-card__icon" />
                  <span>AI assessment</span>
                </div>
                <div className="share-card__body share-card__body--short">
                  <p className="share-brief-bluf">{s.aiBrief.bluf}</p>
                  <p className="share-brief-text">{s.aiBrief.situation}</p>
                  {s.aiBrief.keyFindings.length > 0 && (
                    <ul className="share-brief-list">
                      {s.aiBrief.keyFindings.map((f, i) => (
                        <li key={i}>
                          <strong>{f.finding}</strong>
                          <span className="share-row__meta"> — {f.significance}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="share-brief-text">
                    <strong>Outlook:</strong> {s.aiBrief.outlook}
                  </p>
                  <p className="share-brief-note">{s.aiBrief.analystNote}</p>
                  <p className="share-brief-disclaimer">
                    AI-generated summary of the analyst&apos;s collected evidence — a draft assessment, not independently verified reporting.
                  </p>
                </div>
              </div>
            )}

            {s.canvas && s.canvas.nodeCount > 0 && (
              <div className="share-card">
                <div className="share-card__head">
                  <BarChart2 size={12} className="share-card__icon" />
                  <span>Analyst canvas</span>
                  <span className="share-card__count">{s.canvas.nodeCount} nodes</span>
                </div>
                <div className="share-card__body share-card__body--short">
                  <p className="share-card__summary">
                    {s.canvas.eventNodes} events · {s.canvas.achNodes} ACH
                    {s.forecastsOpen ? ` · ${s.forecastsOpen} open forecast${s.forecastsOpen !== 1 ? 's' : ''}` : ''}
                  </p>
                  {s.canvas.leadHypothesis && (
                    <p className="share-card__highlight">
                      Lead hypothesis: {s.canvas.leadHypothesis}
                    </p>
                  )}
                </div>
              </div>
            )}

            {s.cases && s.cases.length > 0 && (
              <div className="share-card">
                <div className="share-card__head">
                  <FolderSearch size={12} className="share-card__icon" />
                  <span>Cases</span>
                  <span className="share-card__count">{s.cases.length}</span>
                </div>
                <div className="share-card__body share-card__body--short">
                  {s.cases.map((c, i) => (
                    <div key={i} className="share-row ui-notif-row--static">
                      <div className="share-row__main">
                        <div className="share-row__title">{c.name}</div>
                        <div className="share-row__meta">
                          {c.status} · {c.eventCount} event{c.eventCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.alerts?.length > 0 && (
              <div className="share-card">
                <div className="share-card__head">
                  <AlertTriangle size={12} className="share-card__icon share-card__icon--medium" />
                  <span>Correlation alerts</span>
                  <span className="share-card__count share-card__count--medium">{s.alerts.length}</span>
                </div>
                <div className="share-card__body share-card__body--short">
                  {s.alerts.slice(0, 8).map(a => (
                    <div key={a.id} className="share-row ui-notif-row--static">
                      <div className="share-row__dot" style={{ background: sevColor(a.severity) }} />
                      <div className="share-row__main">
                        <div className="share-row__title">{a.title}</div>
                        <div className="share-row__meta">
                          {a.signalCount} event{a.signalCount !== 1 ? 's' : ''} · {a.severity}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="share-card share-card--grow">
              <div className="share-card__head">
                <Activity size={12} className="share-card__icon" />
                <span>Top events</span>
                <span className="share-card__count">{Math.min(s.topEvents.length, 15)}</span>
              </div>
              <div className="share-card__body">
                {s.topEvents.slice(0, 15).map(e => (
                  <div key={e.id} className="share-row ui-notif-row--static">
                    <div className="share-row__dot" style={{ background: sevColor(e.severity) }} />
                    <div className="share-row__main">
                      <div className="share-row__title">{e.title}</div>
                      <div className="share-row__meta share-row__meta--inline">
                        <span>{e.country} · {e.source} · {e.severity}</span>
                        <TrustChip event={e} size="xs" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="share-footer">
        <p>Read-only snapshot exported from ARGUS — not live data.</p>
        <p style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>Built by Zachary Adam &amp; Maaz Ahmad · Shama Research</p>
        <Link href="/" className="ui-btn ui-btn--primary">
          <ExternalLink size={13} /> Open full workbench
        </Link>
      </footer>
    </div>
  )
}
