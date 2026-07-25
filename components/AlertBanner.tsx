'use client'
import { useEffect, useRef, useState } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { CorrelationAlert } from '@/types'
import { X, AlertTriangle, ChevronRight } from 'lucide-react'

const DURATION = 5000

const SEV_CLASS: Record<string, { banner: string; kicker: string; icon: string; chip: string }> = {
  critical: {
    banner: 'ui-alert-banner--critical',
    kicker: 'ui-alert-banner__kicker--critical',
    icon: 'ui-alert-banner__icon--critical',
    chip: 'ui-chip--sev-critical',
  },
  high: {
    banner: 'ui-alert-banner--high',
    kicker: 'ui-alert-banner__kicker--high',
    icon: 'ui-alert-banner__icon--high',
    chip: 'ui-chip--sev-high',
  },
  medium: {
    banner: 'ui-alert-banner--medium',
    kicker: 'ui-alert-banner__kicker--medium',
    icon: 'ui-alert-banner__icon--medium',
    chip: 'ui-chip--sev-medium',
  },
}

export function AlertBanner() {
  const alerts      = useMapStore(s => s.alerts)
  const togglePanel = useMapStore(s => s.togglePanel)

  const [banner, setBanner] = useState<CorrelationAlert | null>(null)
  const [animKey, setAnimKey] = useState(0)
  const prevCountRef = useRef(0)
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = () => {
    setBanner(null)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  useEffect(() => {
    if (alerts.length > prevCountRef.current) {
      const newest = alerts[0]
      if (newest) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setBanner(newest)
        setAnimKey(k => k + 1)
        timerRef.current = setTimeout(dismiss, DURATION)
      }
    }
    prevCountRef.current = alerts.length
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [alerts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!banner) return null

  const sev = banner.severity
  const cls = SEV_CLASS[sev] ?? SEV_CLASS.medium

  return (
    <div className={`ui-alert-banner ${cls.banner}`}>
      <div className="ui-alert-banner__body">
        <AlertTriangle size={14} className={cls.icon} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={`ui-alert-banner__kicker ${cls.kicker}`}>
            Correlation alert · {sev}
          </div>
          <div className="ui-alert-banner__title">{banner.title}</div>
          <div className="ui-alert-banner__meta">
            {banner.countries.length > 0 && (
              <span className="ui-subtitle" style={{ fontSize: 10, margin: 0 }}>
                {banner.countries.slice(0, 3).join(' · ')}
              </span>
            )}
            {banner.signalCount > 0 && (
              <span className={`ui-chip ui-chip--xs ${cls.chip}`}>
                {banner.signalCount} signal{banner.signalCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="ui-alert-banner__actions">
          <button
            type="button"
            onClick={dismiss}
            className="ui-btn ui-btn--ghost"
            style={{ padding: 4 }}
            aria-label="Dismiss"
          >
            <X size={11} />
          </button>
          <button
            type="button"
            onClick={() => { togglePanel('alerts'); dismiss() }}
            className="ui-btn ui-btn--ghost"
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '3px 7px',
              gap: 2,
              color: sev === 'critical' ? 'var(--critical)' : sev === 'high' ? 'var(--high)' : 'var(--medium)',
            }}
          >
            View <ChevronRight size={9} />
          </button>
        </div>
      </div>

      <div className="ui-alert-banner__progress">
        <div
          key={animKey}
          className="ui-alert-banner__progress-fill"
          style={{ animation: `alert-banner-shrink ${DURATION}ms linear forwards` }}
        />
      </div>
    </div>
  )
}
