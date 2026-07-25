'use client'
/**
 * First-run key setup for GitHub installs.
 * Fully skippable — free map + rules briefs work with zero keys.
 */
import { useEffect, useState } from 'react'
import { Key, Check, X, ChevronDown, ChevronRight } from 'lucide-react'
import { KEY_SECTIONS, SETUP_LS_KEY, type KeyField } from '@/lib/keyCatalog'
import { setClientMapboxToken } from '@/lib/mapProvider'

function mirrorPublic(name: string, value: string) {
  if (name === 'NEXT_PUBLIC_MAPBOX_TOKEN') setClientMapboxToken(value)
  if (name === 'NEXT_PUBLIC_GOOGLE_MAPS_KEY') {
    try { localStorage.setItem('argus-google-maps-key', value) } catch { /* ignore */ }
  }
}

export function SetupKeysModal() {
  const [open, setOpen] = useState(false)
  const [vaultOk, setVaultOk] = useState<boolean | null>(null)
  const [configured, setConfigured] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  /** Accordion: one section open at a time so the dialog stays usable on short screens. */
  const [openSection, setOpenSection] = useState<string>('search')

  useEffect(() => {
    try {
      if (localStorage.getItem(SETUP_LS_KEY) === 'done') return
    } catch { /* show setup */ }
    setOpen(true)
    fetch('/api/vault').then(r => r.json()).then(d => {
      setVaultOk(d.configured !== false)
      setConfigured(new Set(Array.isArray(d.keys) ? d.keys : []))
    }).catch(() => setVaultOk(false))
  }, [])

  const dismiss = () => {
    try { localStorage.setItem(SETUP_LS_KEY, 'done') } catch { /* ignore */ }
    setOpen(false)
  }

  const saveField = async (f: KeyField) => {
    const value = drafts[f.name]?.trim()
    if (!value) return
    setSaving(f.name)
    try {
      if (f.clientPublic) mirrorPublic(f.name, value)
      if (vaultOk) {
        const res = await fetch('/api/vault', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: f.name, value }),
        })
        if (res.ok) {
          setConfigured(prev => new Set(prev).add(f.name))
          setDrafts(d => ({ ...d, [f.name]: '' }))
        }
      } else if (f.clientPublic) {
        setConfigured(prev => new Set(prev).add(f.name))
        setDrafts(d => ({ ...d, [f.name]: '' }))
      }
    } finally {
      setSaving(null)
    }
  }

  if (!open) return null

  const sections = KEY_SECTIONS.filter(s => s.fields.some(f => !f.skipSetup))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-keys-title"
      className="argus-setup-overlay"
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div className="argus-setup-modal" onClick={e => e.stopPropagation()}>
        <header className="argus-setup-modal__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="setup-keys-title" className="argus-setup-modal__title">
              Set up API keys
            </div>
            <p className="argus-setup-modal__sub">
              Optional. Free map + rules briefs work with none. Paste keys below — scroll if needed.
              Later: <strong>Settings → Integrations</strong>.
            </p>
          </div>
          <button type="button" onClick={dismiss} aria-label="Close" className="ui-btn ui-btn--ghost" style={{ padding: 6, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </header>

        {vaultOk === false && (
          <div className="ui-callout ui-callout--warn argus-setup-modal__warn">
            Add <code>VAULT_MASTER_KEY</code> to <code>.env.local</code> and restart to save server keys from this UI.
            Mapbox can still be saved for this browser without the vault.
          </div>
        )}

        <div className="argus-setup-modal__body">
          {sections.map(sec => {
            const isOpen = openSection === sec.id
            const fields = sec.fields.filter(f => !f.skipSetup)
            return (
              <div key={sec.id} className="argus-setup-sec">
                <button
                  type="button"
                  className="argus-setup-sec__toggle"
                  aria-expanded={isOpen}
                  onClick={() => setOpenSection(isOpen ? '' : sec.id)}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="argus-setup-sec__title">{sec.title}</span>
                  {sec.fields.some(f => f.hostedOnly) && (
                    <span className="ui-chip ui-chip--xs">Hosted</span>
                  )}
                </button>
                {isOpen && (
                  <div className="argus-setup-sec__fields">
                    <p className="argus-setup-sec__blurb">{sec.blurb}</p>
                    {fields.map(f => (
                      <div key={f.name} className="argus-setup-field">
                        <div className="argus-setup-field__label">
                          <span>{f.label}</span>
                          {configured.has(f.name) && (
                            <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)' }}>Set</span>
                          )}
                          {f.hostedOnly && <span className="ui-chip ui-chip--xs">.env / host</span>}
                        </div>
                        {!f.hostedOnly ? (
                          <div className="ui-input-row">
                            <input
                              type={f.type === 'email' ? 'email' : 'password'}
                              className="ui-input"
                              style={{ flex: 1, minWidth: 0 }}
                              placeholder={f.placeholder}
                              autoComplete="off"
                              value={drafts[f.name] ?? ''}
                              onChange={e => setDrafts(d => ({ ...d, [f.name]: e.target.value }))}
                            />
                            <button
                              type="button"
                              className="ui-btn ui-btn--primary"
                              style={{ fontSize: 11, padding: '0 10px', flexShrink: 0 }}
                              disabled={!drafts[f.name]?.trim() || saving === f.name || (vaultOk === false && !f.clientPublic)}
                              onClick={() => void saveField(f)}
                            >
                              {saving === f.name ? '…' : <><Key size={11} /> Save</>}
                            </button>
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                            Set in hosting dashboard or <code>.env.local</code>, then restart — not stored in the vault for local clones.
                          </p>
                        )}
                        <div className="ui-vault-hint">{f.hint}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <footer className="argus-setup-modal__foot">
          <div className="argus-setup-modal__credit">
            ARGUS · Zachary Adam &amp; Maaz Ahmad ·{' '}
            <a href="https://shamaresearch.com/argus/help.html" target="_blank" rel="noopener noreferrer">
              Full API guide
            </a>
          </div>
          <div className="argus-setup-modal__actions">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={dismiss}>
              Later
            </button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={dismiss}>
              <Check size={12} /> Continue free
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
