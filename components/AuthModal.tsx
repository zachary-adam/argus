'use client'
import { useState } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useAuth } from '@/lib/auth/AuthContext'
import { X, Lock } from 'lucide-react'

export default function AuthModal() {
  const togglePanel = useMapStore(s => s.togglePanel)
  const { signIn } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const close = () => togglePanel('authModal')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn('', password)
    if (error) setError(error)
    else close()
    setLoading(false)
  }

  return (
    <div className="ui-modal-overlay" onClick={close}>
      <div
        className="ui-command-palette panel-slide-in"
        style={{ maxWidth: 360, display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="ui-panel-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Lock size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div>
                <div className="ui-kicker" style={{ marginBottom: 2 }}>Workspace</div>
                <div className="ui-title ui-title--panel">Sign in</div>
              </div>
            </div>
            <button type="button" onClick={close} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </header>

        <div className="ui-panel-body" style={{ padding: '20px 24px' }}>
          {error && (
            <div className="ui-callout ui-callout--error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="Access password"
              className="ui-input"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn--primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? 'Checking…' : 'Sign In'}
            </button>
          </form>

          <p className="ui-feed-hint" style={{ marginTop: 14, textAlign: 'center', lineHeight: 1.55 }}>
            Sign in to sync projects across devices. Briefs auto-save to history when you generate them.
          </p>
        </div>
      </div>
    </div>
  )
}
