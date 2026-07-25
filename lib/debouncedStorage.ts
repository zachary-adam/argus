import type { StateStorage } from 'zustand/middleware'

/** Debounce localStorage writes — reduces main-thread jank when state updates rapidly. */
export function createDebouncedStorage(delayMs = 750): StateStorage {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const pending = new Map<string, string>()

  function flush(name: string) {
    const value = pending.get(name)
    if (value === undefined) return
    const timer = timers.get(name)
    if (timer) clearTimeout(timer)
    timers.delete(name)
    pending.delete(name)
    if (typeof localStorage === 'undefined') return
    try { localStorage.setItem(name, value) } catch { /* quota */ }
  }

  function flushAll() {
    for (const name of [...pending.keys()]) flush(name)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushAll)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushAll()
    })
  }

  return {
    getItem: name => {
      if (typeof localStorage === 'undefined') return null
      try { return localStorage.getItem(name) } catch { return null }
    },
    setItem: (name, value) => {
      if (typeof localStorage === 'undefined') return
      pending.set(name, value)
      const prev = timers.get(name)
      if (prev) clearTimeout(prev)
      timers.set(name, setTimeout(() => flush(name), delayMs))
    },
    removeItem: name => {
      const prev = timers.get(name)
      if (prev) clearTimeout(prev)
      timers.delete(name)
      pending.delete(name)
      if (typeof localStorage === 'undefined') return
      try { localStorage.removeItem(name) } catch { /* noop */ }
    },
  }
}
