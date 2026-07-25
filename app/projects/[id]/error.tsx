'use client'
import { useEffect } from 'react'

function isStaleChunkError(message: string): boolean {
  return /loading chunk|chunkloaderror|failed to fetch dynamically imported module/i.test(message)
}

export default function ProjectError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const staleChunk = isStaleChunkError(error.message ?? '')

  useEffect(() => { console.error('[project-workspace]', error) }, [error])

  useEffect(() => {
    if (!staleChunk) return
    // After a dev rebuild the browser often holds dead chunk URLs — one hard reload fixes it.
    const key = 'argus-chunk-reload'
    if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      window.location.reload()
    }
  }, [staleChunk])

  function handleReload() {
    if (staleChunk) window.location.reload()
    else reset()
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 16, padding: 32,
      background: 'var(--bg)', color: 'var(--text-primary)',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.15em', color: '#DC2626', textTransform: 'uppercase' }}>
        Workspace Error
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
        {error.message || 'An unexpected error occurred in the workspace.'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
        {staleChunk
          ? 'The app was rebuilt while this tab was open. Reload once to fetch the new code — your project data is safe.'
          : 'Your data is safe. This error has been logged.'}
        {error.digest && <span> (ref: {error.digest})</span>}
      </div>
      <button
        onClick={handleReload}
        style={{
          padding: '8px 20px', background: '#1D4ED8', color: 'white',
          border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          fontSize: 12, fontWeight: 700, marginTop: 8,
        }}
      >
        {staleChunk ? 'Reload page' : 'Reload workspace'}
      </button>
    </div>
  )
}
