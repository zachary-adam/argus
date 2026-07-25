'use client'
import { useEffect, useState } from 'react'

/** True when viewport is below the mobile breakpoint (default 768px). */
export function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [breakpoint])

  return mobile
}
