'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, Loader } from 'lucide-react'
import { ArgusMark } from '@/components/ArgusMark'

function Spin() {
  return <Loader size={15} style={{ animation: 'spin 0.7s linear infinite' }} />
}

export default function ResetPasswordPage() {
  useEffect(() => { document.body.classList.remove('dark') }, [])
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [busy, setBusy]         = useState(false)
  const [done, setDone]         = useState(false)
  const [err, setErr]           = useState('')
  const [ready, setReady]       = useState(false)

  useEffect(() => {
    const s = createClient()
    if (!s) { router.replace('/auth/login'); return }
    const { data: { subscription } } = s.auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    s.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (data.session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [router])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setErr('Passwords do not match.'); return }
    if (password.length < 8)  { setErr('Password must be at least 8 characters.'); return }
    const s = createClient(); if (!s) return
    setBusy(true); setErr('')
    const { error } = await s.auth.updateUser({ password })
    if (error) { setErr(error.message); setBusy(false) }
    else { setDone(true); setTimeout(() => router.replace('/'), 2200) }
  }

  return (
    <div className="auth-page auth-page--solo">
      <main className="auth-form-wrap">
        <div className="auth-card">
          <div className="auth-logo-compact">
            <div className="home-logo-mark"><ArgusMark size={28} variant="onLight" /></div>
            <div>
              <div className="ui-kicker" style={{ marginBottom: 0, fontSize: 9 }}>Intelligence watch</div>
              <div className="ui-title" style={{ fontSize: 14, lineHeight: 1.2 }}>ARGUS</div>
            </div>
          </div>

          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div className="auth-success-icon">
                <CheckCircle size={22} />
              </div>
              <h2 className="ui-title" style={{ fontSize: 22, marginBottom: 8 }}>Password updated</h2>
              <p className="ui-subtitle">Redirecting to your workspace…</p>
            </div>

          ) : !ready ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Spin />
              <h2 className="ui-title" style={{ fontSize: 20, marginTop: 16, marginBottom: 6 }}>Verifying link…</h2>
              <p className="ui-subtitle">Please wait a moment.</p>
            </div>

          ) : (
            <>
              <button type="button" onClick={() => router.replace('/auth/login')} className="ui-back" style={{ marginBottom: 24 }}>
                <ArrowLeft size={14} /> Back to sign in
              </button>
              <h2 className="ui-title" style={{ fontSize: 24, marginBottom: 6 }}>Set new password</h2>
              <p className="ui-subtitle" style={{ marginBottom: 24 }}>
                Choose a strong password for your account.
              </p>

              {err && (
                <div className="ui-callout ui-callout--error auth-form-message">
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, lineHeight: 1.5 }}>{err}</span>
                </div>
              )}

              <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="ui-input-wrap ui-input-wrap--action">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    required
                    minLength={8}
                    placeholder="New password (min 8 chars)"
                    onChange={e => setPassword(e.target.value)}
                    className="ui-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    className="ui-btn ui-btn--ghost ui-input-wrap__clear"
                    style={{ right: 9, padding: 4, border: 'none', minHeight: 0 }}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <input
                  type="password"
                  value={confirm}
                  required
                  placeholder="Confirm new password"
                  onChange={e => setConfirm(e.target.value)}
                  className="ui-input"
                />
                <button type="submit" disabled={busy} className="ui-btn ui-btn--primary" style={{ width: '100%', marginTop: 4 }}>
                  {busy ? <Spin /> : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
