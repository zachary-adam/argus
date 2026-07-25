import { useCallback, useEffect, useRef, useState } from 'react'

/** Debounced local draft → persist. Flushes on unmount so refresh doesn't drop edits. */
export function useDebouncedDraft(
  onPersist: (value: string) => void,
  opts?: { delay?: number; trim?: boolean },
) {
  const delay = opts?.delay ?? 400
  const trim = opts?.trim ?? false
  const [saved, setSaved] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const valueRef = useRef('')
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist

  const flush = useCallback((value?: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
    const next = value ?? valueRef.current
    onPersistRef.current(trim ? next.trim() : next)
    setSaved(true)
  }, [trim])

  const schedule = useCallback((value: string) => {
    valueRef.current = value
    setSaved(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => flush(value), delay)
  }, [delay, flush])

  useEffect(() => () => flush(), [flush])

  return { saved, schedule, flush, valueRef }
}
