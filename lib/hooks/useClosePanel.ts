'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMapStore } from '@/stores/mapStore'

// Returns { handleClose, closing }.
// Call handleClose() instead of togglePanel directly — it plays the slide-out
// animation for 150ms before actually removing the panel from the DOM.
// Spread `closing` into the root className:
//   <div className={`panel-right${closing ? ' panel-closing' : ''}`}>
export function useClosePanel(panelKey: string, duration = 150) {
  const togglePanel = useMapStore(s => s.togglePanel)
  const [closing, setClosing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleClose = useCallback(() => {
    setClosing(true)
    timerRef.current = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      togglePanel(panelKey as any)
      setClosing(false)
    }, duration)
  }, [panelKey, duration, togglePanel])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { handleClose, closing }
}
