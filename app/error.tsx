'use client'

export default function GlobalAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 32,
      background: '#F7F8FA',
      color: '#001F3F',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>ARGUS failed to load</div>
      <p style={{ fontSize: 13, maxWidth: 420, textAlign: 'center', lineHeight: 1.55, margin: 0, color: '#5A6B82' }}>
        {error.message || 'Something went wrong while starting the app.'}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          padding: '10px 18px',
          background: '#1E488F',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Try again
      </button>
    </div>
  )
}
