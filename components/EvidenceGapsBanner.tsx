'use client'
import { useMemo, useState, useCallback, useEffect } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { assessEvidenceBalance } from '@/lib/evidenceBalance'
import { effectiveTargeting } from '@/lib/relevance'
import { runTopicPull } from '@/lib/topicPull'
import { hasTopicTargeting } from '@/lib/topicEvents'
import { AlertTriangle, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react'

const dismissKey = (projectId: string) => `argus_evidence_gaps_dismiss_${projectId}`

export function EvidenceGapsBanner() {
  const events = useMapStore(s => s.events)
  const project = useProjectStore(s => s.getActiveProject())
  const [expanded, setExpanded] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!project?.id) return
    try { setDismissed(!!localStorage.getItem(dismissKey(project.id))) } catch { setDismissed(false) }
  }, [project?.id])

  const balance = useMemo(() => {
    if (!project || events.length === 0) return null
    return assessEvidenceBalance(events, {
      watchEntities: project.targeting?.watchEntities ?? effectiveTargeting(project)?.watchEntities,
      countryCodes: project.countryCodes,
    })
  }, [events, project])

  const dismiss = useCallback(() => {
    if (!project) return
    setDismissed(true)
    try { localStorage.setItem(dismissKey(project.id), String(balance?.score ?? 0)) } catch { /* noop */ }
  }, [project, balance?.score])

  const refreshCollect = useCallback(async () => {
    if (!project) return
    const targeting = effectiveTargeting(project)
    if (!hasTopicTargeting(targeting)) {
      useMapStore.getState().pushToast({
        title: 'Set mission targeting first',
        body: 'Add keywords, watch entities, or a focus place in Settings → Targeting.',
        severity: 'medium',
        type: 'system',
      })
      return
    }
    setPulling(true)
    try {
      const result = await runTopicPull(targeting!, project.regionCenter, project.countryCodes ?? [], project.researchQuestion)
      if (!result.ok) {
        useMapStore.getState().pushToast({
          title: 'Collect failed',
          body: result.error ?? 'Could not refresh your topic feed',
          severity: 'medium',
          type: 'system',
        })
      }
    } finally {
      setPulling(false)
    }
  }, [project])

  if (!project || !balance || balance.gaps.length === 0) return null
  if (balance.score >= 75 && balance.confidenceCap === 'HIGH') return null
  if (dismissed) return null

  const topGaps = balance.gaps.slice(0, expanded ? 6 : 2)

  return (
    <div
      className="ui-callout ui-callout--warn"
      style={{ marginBottom: 10, padding: '10px 12px', fontSize: 10, lineHeight: 1.5 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <AlertTriangle size={14} style={{ color: 'var(--high)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
            Evidence balance {balance.score}/100 — brief confidence capped at {balance.confidenceCap}
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {topGaps.map(g => (
              <li key={`${g.type}-${g.label}`} style={{ marginBottom: 3 }}>
                <strong>{g.label}:</strong> {g.detail}
              </li>
            ))}
          </ul>
          {balance.gaps.length > 2 && (
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              style={{ fontSize: 9, padding: '2px 0', marginTop: 4 }}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? <><ChevronUp size={10} /> Show less</> : <><ChevronDown size={10} /> {balance.gaps.length - 2} more gap{balance.gaps.length - 2 !== 1 ? 's' : ''}</>}
            </button>
          )}
        </div>
        <button type="button" className="ui-input-wrap__clear" onClick={dismiss} aria-label="Dismiss evidence gaps" title="Dismiss">
          <X size={12} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingLeft: 22 }}>
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          style={{ fontSize: 9, padding: '5px 10px' }}
          disabled={pulling}
          onClick={() => void refreshCollect()}
        >
          <RefreshCw size={10} className={pulling ? 'ui-spin' : undefined} />
          {pulling ? 'Collecting…' : 'Refresh collect'}
        </button>
        <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>
          Multi-lens pull runs country + entity searches in local languages
        </span>
      </div>
    </div>
  )
}
