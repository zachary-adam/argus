'use client'
import { useEffect, useState } from 'react'
import type { SourceEntry } from '@/app/api/status/route'
import { useStatus } from '@/lib/hooks/useStatus'

function dotStatus(ok: boolean, keyRequired: boolean, hasKey?: boolean, pending?: boolean) {
  if (keyRequired && !hasKey) return { className: 'ui-data-status-dot--muted', title: 'No API key configured' }
  if (pending)                return { className: 'ui-data-status-dot--sync', title: 'Loading…' }
  if (ok)                     return { className: 'ui-data-status-dot--live', title: 'Live' }
                              return { className: 'ui-data-status-dot--fail', title: 'Failed' }
}

function age(fetchedAt: string | null): string {
  if (!fetchedAt) return 'never'
  const s = Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function DataStatusBar() {
  const status = useStatus({ poll: true })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.ui-data-status')) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!status) return null

  const allSources: (SourceEntry & { pending?: boolean; polling?: boolean; optional?: boolean })[] = [
    ...status.sources,
    { id: 'aviation', label: 'Aircraft', count: status.aviation.count, ok: status.aviation.ok, keyRequired: false, pending: status.aviation.pending },
    { id: 'vessels',  label: 'Vessels',  count: status.vessels.count,  ok: status.vessels.ok,  keyRequired: false, pending: status.vessels.pending, polling: !status.aisStreamLive, optional: status.vessels.optional },
  ]

  const failed = allSources.filter(s =>
    !s.ok && !(s.keyRequired && !s.hasKey) && !s.pending && !s.optional
  ).length
  const noKey  = allSources.filter(s => s.keyRequired && !s.hasKey).length
  const live   = allSources.filter(s => s.ok).length
  const total  = allSources.length

  const pillClass = failed > 0
    ? 'ui-data-status-pill--fail'
    : noKey > 0
    ? 'ui-data-status-pill--warn'
    : 'ui-data-status-pill--ok'

  const summaryLabel = status.usingDemo
    ? 'Demo data'
    : failed > 0
      ? `${failed} source${failed > 1 ? 's' : ''} failed`
      : noKey > 0
        ? `${noKey} key${noKey > 1 ? 's' : ''} missing`
        : `${live}/${total} live`

  return (
    <div className="ui-data-status">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`ui-data-status-pill ${pillClass}`}
        title="Data source status"
        aria-expanded={open}
      >
        <span className="ui-data-status-pill__dot" />
        {summaryLabel.toUpperCase()}
        {status.fetchedAt && (
          <span className="ui-data-status-pill__age">· {age(status.fetchedAt)}</span>
        )}
      </button>

      {open && (
        <div className="ui-data-status-menu">
          <div className="ui-section-label" style={{ marginBottom: 10 }}>Data sources</div>

          {status.usingDemo && (
            <div className="ui-callout ui-callout--warn" style={{ marginBottom: 10, fontSize: 10, fontWeight: 600 }}>
              All live sources failed — showing demo data
            </div>
          )}
          {!status.usingDemo && status.usingFallback && (
            <div className="ui-callout ui-callout--warn" style={{ marginBottom: 10, fontSize: 10, fontWeight: 600 }}>
              GDELT API unavailable — some events are cached fallback data
            </div>
          )}

          <div className="ui-data-status-list">
            {allSources.map(src => {
              const d = dotStatus(src.ok, src.keyRequired, src.hasKey, src.pending)
              return (
                <div key={src.id} className="ui-data-status-row">
                  <span title={d.title} className={`ui-data-status-dot ${d.className}`} />
                  <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1 }}>{src.label}</span>
                  {src.keyRequired && !src.hasKey ? (
                    <span className="ui-feed-hint" style={{ fontSize: 9, fontStyle: 'italic' }}>no key</span>
                  ) : src.ok ? (
                    <>
                      <span className="font-mono ui-feed-hint" style={{ fontSize: 9 }}>{src.count}</span>
                      {src.polling && (
                        <span
                          className="ui-chip ui-chip--xs ui-chip--sev-medium"
                          title="No AISSTREAM_API_KEY — using AISHub REST (90s refresh)"
                        >
                          POLL
                        </span>
                      )}
                    </>
                  ) : src.pending ? (
                    <span className="ui-feed-hint" style={{ fontSize: 9, fontStyle: 'italic' }}>warming up</span>
                  ) : src.optional && !src.ok ? (
                    <span className="ui-feed-hint" style={{ fontSize: 9, fontStyle: 'italic' }}>n/a</span>
                  ) : (
                    <span style={{ fontSize: 9, color: 'var(--critical)' }}>failed</span>
                  )}
                </div>
              )
            })}
          </div>

          {status.vault.configured && (
            <div className="ui-data-status-footer">
              <div className="ui-section-label" style={{ marginBottom: 5, fontSize: 9 }}>Vault keys</div>
              {status.vault.keys.length === 0 ? (
                <span className="ui-feed-hint" style={{ fontSize: 10 }}>none stored</span>
              ) : (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {status.vault.keys.map(k => (
                    <span key={k} className="ui-chip ui-chip--xs ui-chip--sev-low font-mono">{k}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {!status.vault.configured && (
            <div className="ui-data-status-footer">
              <p className="ui-feed-hint" style={{ fontSize: 9, lineHeight: 1.55, margin: 0 }}>
                Add <code className="ui-code-inline">VAULT_MASTER_KEY</code> to <code className="ui-code-inline">.env.local</code> to store API keys securely
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
