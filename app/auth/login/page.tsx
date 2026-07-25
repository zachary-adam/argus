'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Loader } from 'lucide-react'
import { AuthBrandAside } from '@/components/AuthBrandAside'

type Mode = 'signin' | 'signup' | 'forgot' | 'sent'

function GHIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function GIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function Spin() {
  return <Loader size={15} style={{ animation: 'spin 0.7s linear infinite' }} />
}

function passwordStrength(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' }
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 10) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++
  const score = Math.min(4, s)
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  return { score, label: labels[score] }
}

export default function LoginPage() {
  return <Suspense><LoginPageInner /></Suspense>
}

function LoginPageInner() {
  const router   = useRouter()
  const params   = useSearchParams()
  const [mode, setMode]         = useState<Mode>('signin')
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [agreed, setAgreed]     = useState(false)
  const [busy, setBusy]         = useState<string | null>(null)
  const [err, setErr]           = useState('')
  const [note, setNote]         = useState('')
  const oauthErr = params.get('error')

  const strength = useMemo(() => passwordStrength(password), [password])

  useEffect(() => {
    const s = createClient(); if (!s) return
    s.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (data.session) router.replace('/')
    })
    document.body.classList.remove('dark')
  }, [router])

  const oAuth = async (provider: 'github' | 'google') => {
    const s = createClient(); if (!s) return
    setBusy(provider)
    await s.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback`, ...(provider === 'github' ? { scopes: 'read:user user:email' } : {}) },
    })
  }

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'signup' && !agreed) { setErr('Please accept the terms to continue.'); return }
    const s = createClient(); if (!s) return
    setBusy('email'); setErr('')
    const { error } = mode === 'signup'
      ? await s.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() || undefined } },
        })
      : await s.auth.signInWithPassword({ email, password })
    if (error) { setErr(error.message); setBusy(null) }
    else if (mode === 'signup') { setNote('Check your email for a confirmation link.'); setBusy(null) }
    else router.replace('/')
  }

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    const s = createClient(); if (!s) return
    setBusy('forgot'); setErr('')
    const { error } = await s.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset` })
    setBusy(null)
    if (error) setErr(error.message); else setMode('sent')
  }

  const go = (m: Mode) => { setMode(m); setErr(''); setNote('') }

  return (
    <div className="auth-page">
      <AuthBrandAside />

      <main className="auth-form-wrap">
        <div className="auth-form-header">
          <Link href="/" className="ui-back">
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>

        <div className="auth-card">
          {mode === 'sent' ? (
            <div style={{ textAlign: 'center' }}>
              <div className="auth-success-icon">
                <CheckCircle size={22} />
              </div>
              <h2 className="ui-title" style={{ fontSize: 22, marginBottom: 8 }}>Check your inbox</h2>
              <p className="ui-subtitle" style={{ marginBottom: 24 }}>
                Reset link sent to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
              </p>
              <button type="button" onClick={() => go('signin')} className="ui-btn ui-btn--ghost" style={{ display: 'inline-flex' }}>
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </div>

          ) : mode === 'forgot' ? (
            <>
              <button type="button" onClick={() => go('signin')} className="ui-back" style={{ marginBottom: 24 }}>
                <ArrowLeft size={14} /> Back
              </button>
              <h2 className="ui-title" style={{ fontSize: 24, marginBottom: 6 }}>Reset password</h2>
              <p className="ui-subtitle" style={{ marginBottom: 24 }}>
                We&apos;ll email you a link to choose a new password.
              </p>
              {err && <ErrBox msg={err} />}
              <form onSubmit={onForgot} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <AuthField label="Work email" type="email" placeholder="you@newsroom.org" value={email} onChange={setEmail} />
                <button type="submit" disabled={busy === 'forgot'} className="ui-btn ui-btn--primary" style={{ width: '100%' }}>
                  {busy === 'forgot' ? <Spin /> : <>Send reset link <ArrowRight size={14} /></>}
                </button>
              </form>
            </>

          ) : (
            <>
              <div className="auth-segment" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={`auth-segment-btn${mode === 'signup' ? ' auth-segment-btn--active' : ''}`}
                  onClick={() => go('signup')}
                >
                  Create account
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signin'}
                  className={`auth-segment-btn${mode === 'signin' ? ' auth-segment-btn--active' : ''}`}
                  onClick={() => go('signin')}
                >
                  Sign in
                </button>
              </div>

              <div style={{ marginBottom: 24 }}>
                <h2 className="ui-title" style={{ fontSize: 26, marginBottom: 8 }}>
                  {mode === 'signup' ? 'Create your workspace' : 'Welcome back'}
                </h2>
                <p className="ui-subtitle">
                  {mode === 'signup'
                    ? 'Full workbench access. Bring your own sources or enable live feeds.'
                    : 'Sign in to your ARGUS workspace to pick up where you left off.'}
                </p>
              </div>

              {(oauthErr || err) && <ErrBox msg={oauthErr ? 'Sign-in failed. Try email instead.' : err} />}
              {note && (
                <div className="ui-callout ui-callout--ok auth-form-message" style={{ marginBottom: 16, fontSize: 13 }}>
                  {note}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => oAuth('google')} disabled={!!busy} type="button" className="ui-btn ui-btn--ghost" style={{ width: '100%' }}>
                  {busy === 'google' ? <Spin /> : <GIcon />}
                  {busy !== 'google' && 'Continue with Google'}
                </button>
                <button onClick={() => oAuth('github')} disabled={!!busy} type="button" className="ui-btn ui-btn--ghost" style={{ width: '100%' }}>
                  {busy === 'github' ? <Spin /> : <GHIcon />}
                  {busy !== 'github' && 'Continue with GitHub'}
                </button>
              </div>

              <div className="ui-divider">or with email</div>

              <form onSubmit={onEmail} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {mode === 'signup' && (
                  <AuthField label="Full name" type="text" placeholder="Renée Maddox" value={fullName} onChange={setFullName} autoComplete="name" />
                )}
                <AuthField label="Work email" type="email" placeholder="you@newsroom.org" value={email} onChange={setEmail} autoComplete="email" />
                <AuthField
                  label="Password"
                  type={showPw ? 'text' : 'password'}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  labelExtra={mode === 'signin' ? (
                    <button type="button" onClick={() => go('forgot')} className="ui-link" style={{ fontSize: 11 }}>
                      Forgot?
                    </button>
                  ) : undefined}
                  suffix={
                    <button type="button" onClick={() => setShowPw(s => !s)} className="ui-btn ui-btn--ghost" style={{ padding: 4, border: 'none', minHeight: 0 }}>
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  }
                />
                {mode === 'signup' && password.length > 0 && (
                  <div className="auth-strength">
                    <div className="auth-strength-bars">
                      {[1, 2, 3, 4].map(i => (
                        <div
                          key={i}
                          className={`auth-strength-bar${strength.score >= i ? ` auth-strength-bar--on-${i}` : ''}`}
                        />
                      ))}
                    </div>
                    <span className="auth-strength-label">{strength.label}</span>
                  </div>
                )}
                {mode === 'signup' && (
                  <label className="auth-terms">
                    <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                    <span>
                      I agree to the{' '}
                      <a href="#" className="ui-link" style={{ fontSize: 'inherit' }}>Terms</a>
                      {' '}and{' '}
                      <a href="#" className="ui-link" style={{ fontSize: 'inherit' }}>Privacy Policy</a>
                      , including data handling for OSINT sources.
                    </span>
                  </label>
                )}
                <button type="submit" disabled={busy === 'email'} className="ui-btn ui-btn--primary" style={{ width: '100%' }}>
                  {busy === 'email' ? <Spin /> : (
                    <>{mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={14} /></>
                  )}
                </button>
              </form>

              <p className="ui-feed-hint" style={{ textAlign: 'center', marginTop: 20, fontSize: 13 }}>
                {mode === 'signup' ? (
                  <>Already have an account?{' '}
                    <button type="button" onClick={() => go('signin')} className="ui-link">Sign in</button>
                  </>
                ) : (
                  <>New to ARGUS?{' '}
                    <button type="button" onClick={() => go('signup')} className="ui-link">Create one</button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function AuthField({ label, type, placeholder, value, onChange, suffix, labelExtra, autoComplete }: {
  label: string; type: string; placeholder: string; value: string
  onChange: (v: string) => void; suffix?: React.ReactNode; labelExtra?: React.ReactNode
  autoComplete?: string
}) {
  return (
    <div className="auth-field">
      <div className="auth-field-label-row">
        <label className="auth-field-label">{label}</label>
        {labelExtra}
      </div>
      <div className={`ui-input-wrap${suffix ? ' ui-input-wrap--action' : ''}`}>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          required={type !== 'text' || label !== 'Full name'}
          autoComplete={autoComplete}
          onChange={e => onChange(e.target.value)}
          className="ui-input"
        />
        {suffix && (
          <div style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
            {suffix}
          </div>
        )}
      </div>
    </div>
  )
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="ui-callout ui-callout--error auth-form-message">
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, lineHeight: 1.5 }}>{msg}</span>
    </div>
  )
}
