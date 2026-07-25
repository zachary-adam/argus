'use client'

import { useEffect, useState } from 'react'
import { ArgusMark } from '@/components/ArgusMark'

export function AuthBrandAside() {
  const [eventCount, setEventCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/status')
      .then(r => r.ok ? r.json() : null)
      .then((d: { sources?: { count: number }[] } | null) => {
        if (!d?.sources) return
        const total = d.sources.reduce((n, s) => n + (s.count || 0), 0)
        if (total > 0) setEventCount(total)
      })
      .catch(() => {})
  }, [])

  const liveLabel = eventCount
    ? `${eventCount.toLocaleString()} events indexed across live feeds`
    : 'Live feeds indexing regional events'

  return (
    <aside className="auth-brand">
      <div className="auth-brand-map" aria-hidden>
        <div className="auth-brand-map-grid" />
        <svg className="auth-brand-map-svg" viewBox="0 0 400 300">
          {/* Graticule — wireframe globe, crisp 1px strokes */}
          <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55">
            <circle cx="250" cy="150" r="115" />
            <ellipse cx="250" cy="150" rx="44" ry="115" />
            <ellipse cx="250" cy="150" rx="86" ry="115" />
            <ellipse cx="250" cy="150" rx="115" ry="44" />
            <ellipse cx="250" cy="150" rx="115" ry="86" />
            <line x1="250" y1="35" x2="250" y2="265" />
            <line x1="135" y1="150" x2="365" y2="150" />
          </g>
          {/* Plotted contacts — point + range ring */}
          <g strokeWidth="1">
            <circle cx="292" cy="102" r="3" fill="var(--medium)" />
            <circle cx="292" cy="102" r="9" fill="none" stroke="var(--medium)" opacity="0.5" />
            <circle cx="228" cy="176" r="2.5" fill="var(--low)" />
            <circle cx="228" cy="176" r="8" fill="none" stroke="var(--low)" opacity="0.5" />
            <circle cx="312" cy="188" r="2.5" fill="var(--critical)" />
          </g>
        </svg>
      </div>

      <div className="auth-brand-top">
        <div className="auth-brand-logo">
          <div className="auth-brand-logo-mark"><ArgusMark size={36} variant="onDark" /></div>
          <div>
            <div className="auth-brand-logo-name ui-wordmark">ARGUS</div>
            <div className="auth-brand-logo-tag">Intelligence watch</div>
          </div>
        </div>
      </div>

      <div className="auth-brand-bottom">
        <div className="auth-live-badge">
          <span className="ui-live-dot" aria-hidden />
          {liveLabel}
        </div>
        <div className="auth-brand-value">
          <p className="auth-brand-value__lead">
            Scope a region, wire your sources, and track events on a map.
          </p>
          <ul className="auth-brand-value__list">
            <li>Live feeds and your connectors in one event stream</li>
            <li>Correlation alerts when patterns cluster in an area</li>
            <li>Export and briefs from data you actually collected</li>
          </ul>
        </div>
      </div>
    </aside>
  )
}
