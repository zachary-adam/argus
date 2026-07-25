'use client'
import { memo, useEffect, useRef } from 'react'
import { useMapStore, AppToast } from '@/stores/mapStore'
import { X, AlertTriangle, Bell, Zap, Ship, Plane } from 'lucide-react'

const TOAST_DURATION_MS = 8000

const SEV_COLOR: Record<AppToast['severity'], string> = {
  critical: 'var(--critical)',
  high:     'var(--high)',
  medium:   'var(--medium)',
  info:     'var(--accent)',
}

function ToastIcon({ type }: { type: AppToast['type'] }) {
  const s = { width: 14, height: 14 }
  if (type === 'watch-rule')       return <Bell {...s} />
  if (type === 'critical-event')   return <AlertTriangle {...s} />
  if (type === 'correlation')      return <Zap {...s} />
  if (type === 'vessel-anomaly')   return <Ship {...s} />
  if (type === 'aircraft-anomaly') return <Plane {...s} />
  return <Bell {...s} />
}

const Toast = memo(function Toast({ toast }: { toast: AppToast }) {
  const dismissToast = useMapStore(s => s.dismissToast)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const flyTo = useMapStore(s => s.flyTo)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [toast.id, dismissToast])

  const color = SEV_COLOR[toast.severity]

  const handleClick = () => {
    if (toast.eventId) {
      const ev = useMapStore.getState().events.find(e => e.id === toast.eventId)
      if (ev) {
        setSelectedEvent(ev)
        flyTo(ev.lat, ev.lon, 6)
      }
    }
    dismissToast(toast.id)
  }

  return (
    <div
      className={`ui-toast${toast.eventId ? ' ui-toast--clickable' : ''}`}
      onClick={handleClick}
      role={toast.eventId ? 'button' : 'status'}
      style={{ '--toast-accent': color } as React.CSSProperties}
    >
      <div className="ui-toast__body">
        <span className="ui-toast__icon" aria-hidden>
          <ToastIcon type={toast.type} />
        </span>
        <div className="ui-toast__text">
          <div className="ui-toast__title">{toast.title}</div>
          <div className="ui-toast__body-text">{toast.body}</div>
          {toast.eventId && (
            <div className="ui-toast__hint">Click to view</div>
          )}
        </div>
        <button
          type="button"
          className="ui-toast__dismiss"
          onClick={e => { e.stopPropagation(); dismissToast(toast.id) }}
          aria-label="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
      <div key={toast.id} className="ui-toast__progress" aria-hidden />
    </div>
  )
})

export function Toaster() {
  const toasts = useMapStore(s => s.toasts)
  const clearAllToasts = useMapStore(s => s.clearAllToasts)

  if (toasts.length === 0) return null

  return (
    <div className="ui-toast-stack">
      {toasts.length > 1 && (
        <div className="ui-toast-stack__actions">
          <button type="button" className="ui-toast-clear" onClick={clearAllToasts}>
            <X size={10} />
            Clear all ({toasts.length})
          </button>
        </div>
      )}

      {toasts.slice().reverse().map(t => (
        <div key={t.id} className="ui-toast-stack__item">
          <Toast toast={t} />
        </div>
      ))}
    </div>
  )
}
