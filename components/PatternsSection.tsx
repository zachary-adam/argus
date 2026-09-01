'use client'
import { useCallback, useMemo, useState, useEffect } from 'react'
import { CheckSquare, Loader2, MapPin, Plus, BarChart2, Sparkles, Square, X, Zap } from 'lucide-react'
import type { IntelEvent } from '@/types'
import type { Pattern } from '@/types/project'
import { useMapStore } from '@/stores/mapStore'
import { useActiveProject } from '@/lib/hooks/useActiveProject'
import { useProjectStore } from '@/stores/projectStore'
import { useSettingsStore } from '@/stores/settingsStore'
import {
  buildPatternCorpus,
  flyToPatternEvidence,
  mergePatterns,
  MIN_PATTERN_CORPUS,
  novelCorrelationPatterns,
  patternCorpusReady,
  scanPatternsStrict,
} from '@/lib/patterns'
import { evaluateAdvancedRule, evaluateManualRule, type FollowDim, type RuleDim } from '@/lib/patternRules'
import { buildAiFetchHeaders } from '@/lib/aiConfig'
import { hasValidGeo } from '@/lib/geo'
import { OriginBadge } from '@/components/OriginBadge'

const CATEGORIES: IntelEvent['category'][] = [
  'conflict', 'political', 'economic', 'social', 'environmental', 'cyber', 'disaster', 'humanitarian', 'health',
]

type SourceTab = 'rules' | 'ai' | 'manual' | 'all'

export default function PatternsSection() {
  const mapEvents = useMapStore(s => s.events)
  const alerts = useMapStore(s => s.alerts)
  const flyTo = useMapStore(s => s.flyTo)
  const setSelectedEvent = useMapStore(s => s.setSelectedEvent)
  const pushToast = useMapStore(s => s.pushToast)
  const project = useActiveProject()
  const updateProject = useProjectStore(s => s.updateProject)
  const patternsEnabled = useSettingsStore(s => s.patternsEnabled)
  const setPatternsEnabled = useSettingsStore(s => s.setPatternsEnabled)

  const [debouncedMapEvents, setDebouncedMapEvents] = useState(mapEvents)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMapEvents(mapEvents), 400)
    return () => clearTimeout(t)
  }, [mapEvents])

  const [busy, setBusy] = useState<'rules' | 'ai' | null>(null)
  const [sourceTab, setSourceTab] = useState<SourceTab>('rules')
  const [testIfCat, setTestIfCat] = useState<IntelEvent['category']>('political')
  const [testThenCat, setTestThenCat] = useState<IntelEvent['category']>('humanitarian')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [triggerKind, setTriggerKind] = useState<RuleDim>('category')
  const [triggerValue, setTriggerValue] = useState('political')
  const [followKind, setFollowKind] = useState<FollowDim>('category')
  const [followValue, setFollowValue] = useState('humanitarian')
  const [scope, setScope] = useState('')

  const corpus = useMemo(
    () => buildPatternCorpus(project, debouncedMapEvents as IntelEvent[]),
    [project, debouncedMapEvents],
  )

  const saved = useMemo(() => project?.patterns ?? [], [project?.patterns])
  const counts = useMemo(() => ({
    rules: saved.filter(p => p.source === 'rules').length,
    ai: saved.filter(p => p.source === 'ai').length,
    manual: saved.filter(p => p.source === 'manual').length,
    all: saved.length,
  }), [saved])

  const liveCorrelation = useMemo(
    () => patternsEnabled ? novelCorrelationPatterns(saved, alerts) : [],
    [saved, alerts, patternsEnabled],
  )
  const corpusReady = patternCorpusReady(corpus.length)

  const displayPatterns = useMemo(() => {
    let list = [...saved]
    if (sourceTab !== 'all') list = list.filter(p => p.source === sourceTab)
    return list.sort((a, b) => {
      if (a.includeInBrief !== b.includeInBrief) return a.includeInBrief ? -1 : 1
      return b.hitRate - a.hitRate || b.hits - a.hits
    })
  }, [saved, sourceTab])

  const persist = useCallback((next: Pattern[]) => {
    if (!project) return
    updateProject(project.id, { patterns: next })
  }, [project, updateProject])

  const runScan = useCallback(() => {
    if (!project || !patternsEnabled) return
    if (!corpusReady) {
      pushToast({
        title: 'Need more events',
        body: `Save at least ${MIN_PATTERN_CORPUS} events to your journal or feed first.`,
        severity: 'info',
        type: 'system',
      })
      return
    }
    setBusy('rules')
    try {
      const found = scanPatternsStrict(corpus, { windowHours: 48, maxEvents: 400, maxResults: 12 })
        .map(p => ({ ...p, source: 'rules' as const }))
      const kept = (project.patterns ?? []).filter(p => p.source !== 'rules')
      persist(mergePatterns(kept, found))
      setSourceTab('rules')
      pushToast({
        title: found.length ? `${found.length} counted pattern${found.length === 1 ? '' : 's'}` : 'No strong patterns',
        body: found.length
          ? 'Showing Counted tab — no AI involved.'
          : 'Nothing met the threshold yet.',
        severity: 'info',
        type: 'system',
      })
    } finally {
      setBusy(null)
    }
  }, [project, corpus, corpusReady, patternsEnabled, persist, pushToast])

  const runAi = useCallback(async () => {
    if (!project || !corpusReady || !patternsEnabled) return
    setBusy('ai')
    try {
      const res = await fetch('/api/patterns', {
        method: 'POST',
        headers: buildAiFetchHeaders('brief', 'ai', project),
        body: JSON.stringify({
          events: corpus.slice(0, 60),
          journalSnippets: (project.journal ?? []).filter(j => j.summary?.trim()).map(j => j.summary!.slice(0, 240)).slice(0, 12),
          paperTitles: (project.journal ?? []).filter(j => j.kind === 'paper').map(j => j.title).slice(0, 12),
          windowHours: 48,
          apiKey: project.aiMode === 'byok' ? project.byokApiKey : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        pushToast({ title: 'AI failed', body: err?.error ?? `HTTP ${res.status}`, severity: 'high', type: 'system' })
        return
      }
      const data = await res.json() as { patterns: Pattern[] }
      const aiPatterns = (data.patterns ?? []).map(p => ({ ...p, source: 'ai' as const }))
      const kept = (project.patterns ?? []).filter(p => p.source !== 'ai')
      persist(mergePatterns(kept, aiPatterns))
      setSourceTab('ai')
      pushToast({
        title: `${aiPatterns.length} AI suggestion${aiPatterns.length === 1 ? '' : 's'}`,
        body: 'Showing AI tab — verify before adding to brief.',
        severity: 'info',
        type: 'system',
      })
    } catch (e) {
      pushToast({ title: 'AI failed', body: (e as Error).message, severity: 'high', type: 'system' })
    } finally {
      setBusy(null)
    }
  }, [project, corpus, corpusReady, patternsEnabled, persist, pushToast])

  const runHypothesis = useCallback(() => {
    if (!project || corpus.length < 2 || !patternsEnabled) return
    let p: Pattern | null
    if (!showAdvanced) {
      p = evaluateManualRule(corpus, { ifCategory: testIfCat, thenCategory: testThenCat, windowHours: 48 })
    } else {
      if (!triggerValue.trim()) {
        pushToast({ title: 'Trigger required', body: 'Fill in the IF value.', severity: 'info', type: 'system' })
        return
      }
      if (followKind !== 'severityEscalates' && !followValue.trim()) {
        pushToast({ title: 'Follow-up required', body: 'Fill in the THEN value.', severity: 'info', type: 'system' })
        return
      }
      p = evaluateAdvancedRule(corpus, {
        triggerKind,
        triggerValue: triggerValue.trim(),
        followupKind: followKind,
        followupValue: followKind === 'severityEscalates' ? undefined : followValue.trim(),
        scopeCountryCode: scope.trim() || undefined,
        windowHours: 48,
      })
    }
    if (!p) return
    persist(mergePatterns(project.patterns ?? [], [p]))
    setSourceTab('manual')
    pushToast({ title: 'Test saved', body: 'Showing Your tests tab.', severity: 'info', type: 'system' })
  }, [project, corpus, patternsEnabled, showAdvanced, testIfCat, testThenCat, triggerKind, triggerValue, followKind, followValue, scope, persist, pushToast])

  const addCorrelation = useCallback((p: Pattern) => {
    if (!project) return
    persist(mergePatterns(project.patterns ?? [], [{ ...p, includeInBrief: false }]))
  }, [project, persist])

  const toggleBrief = (id: string) => {
    if (!project) return
    persist((project.patterns ?? []).map(p => p.id === id ? { ...p, includeInBrief: !p.includeInBrief } : p))
  }

  const remove = (id: string) => {
    if (!project) return
    persist((project.patterns ?? []).filter(p => p.id !== id))
  }

  const clearTab = () => {
    if (!project) return
    const next = saved.filter(p => p.source !== sourceTab)
    persist(next)
    pushToast({ title: 'Cleared', body: `Removed ${saved.length - next.length} from this tab.`, severity: 'info', type: 'system' })
  }

  const showOnMap = (p: Pattern) => {
    const ev = flyToPatternEvidence(p, corpus, { flyTo, setSelectedEvent })
    if (!ev) pushToast({ title: 'No map location', body: 'No coordinates for this pattern.', severity: 'info', type: 'system' })
  }

  if (!project) {
    return <p className="ui-feed-hint">Open a project to work with patterns.</p>
  }

  if (!patternsEnabled) {
    return (
      <div className="ui-patterns ui-patterns--off">
        <p className="ui-patterns__off-title">Pattern recognition is off</p>
        <p className="ui-patterns__off-lead">No scans, alerts, or pattern notes in briefs.</p>
        <button type="button" className="ui-btn ui-btn--primary" onClick={() => setPatternsEnabled(true)}>
          Turn on pattern recognition
        </button>
      </div>
    )
  }

  return (
    <div className="ui-patterns">
      <div className="ui-patterns__top">
        <span className="ui-patterns__top-label">Patterns</span>
        <button type="button" className="ui-link" onClick={() => setPatternsEnabled(false)}>Turn off</button>
      </div>

      <div className="ui-patterns__choose">
        <button
          type="button"
          onClick={runScan}
          disabled={busy !== null || !corpusReady}
          className="ui-patterns__mode ui-patterns__mode--rules"
        >
          {busy === 'rules' ? <Loader2 size={18} className="ui-spin" /> : <BarChart2 size={18} />}
          <span className="ui-patterns__mode-title">Count from events</span>
          <span className="ui-patterns__mode-sub">Math on your data · no AI</span>
        </button>
        <button
          type="button"
          onClick={() => void runAi()}
          disabled={busy !== null || !corpusReady}
          className="ui-patterns__mode ui-patterns__mode--ai"
        >
          {busy === 'ai' ? <Loader2 size={18} className="ui-spin" /> : <Sparkles size={18} />}
          <span className="ui-patterns__mode-title">Ask AI</span>
          <span className="ui-patterns__mode-sub">Separate · verify each one</span>
        </button>
      </div>

      {!corpusReady && (
        <p className="ui-patterns__hint">{corpus.length}/{MIN_PATTERN_CORPUS} events — need more before scanning.</p>
      )}

      <div className="ui-patterns__list-head">
        <label className="ui-patterns__list-select">
          <span>Show</span>
          <select
            value={sourceTab}
            onChange={e => setSourceTab(e.target.value as SourceTab)}
            className="ui-input ui-input--compact"
          >
            <option value="rules">Counted ({counts.rules})</option>
            <option value="ai">AI ({counts.ai})</option>
            <option value="manual">Your tests ({counts.manual})</option>
            <option value="all">All ({counts.all})</option>
          </select>
        </label>
        {displayPatterns.length > 0 && sourceTab !== 'all' && (
          <button type="button" className="ui-link" onClick={clearTab}>Clear</button>
        )}
      </div>

      {liveCorrelation.length > 0 && (
        <section className="ui-patterns__alerts">
          <header className="ui-patterns__alerts-head">
            <Zap size={12} /> {liveCorrelation.length} new alert{liveCorrelation.length === 1 ? '' : 's'}
          </header>
          {liveCorrelation.slice(0, 2).map(p => (
            <PatternCard key={p.id} pattern={p} corpus={corpus} mode="alert" onPrimary={() => addCorrelation(p)} onShowMap={() => {}} onRemove={() => {}} />
          ))}
        </section>
      )}

      {displayPatterns.length === 0 ? (
        <p className="ui-patterns__empty">
          {sourceTab === 'rules' && 'Nothing counted yet — tap “Count from events” above.'}
          {sourceTab === 'ai' && 'No AI suggestions yet — tap “Ask AI” above.'}
          {sourceTab === 'manual' && 'No tests yet — use Advanced below.'}
          {sourceTab === 'all' && 'No patterns saved yet.'}
        </p>
      ) : (
        <div className="ui-patterns__list">
          {displayPatterns.map(p => (
            <PatternCard
              key={p.id}
              pattern={p}
              corpus={corpus}
              mode="saved"
              onPrimary={() => toggleBrief(p.id)}
              onShowMap={() => showOnMap(p)}
              onRemove={() => remove(p.id)}
            />
          ))}
        </div>
      )}

      <details className="ui-patterns__advanced">
        <summary>Advanced — test your own if/then</summary>
        <div className="ui-patterns__hypothesis-body">
          {!showAdvanced ? (
            <div className="ui-patterns__hypothesis-grid">
              <label className="ui-patterns__field">
                <span>When</span>
                <select value={testIfCat} onChange={e => setTestIfCat(e.target.value as IntelEvent['category'])} className="ui-input ui-input--compact">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="ui-patterns__field">
                <span>Then within 48h</span>
                <select value={testThenCat} onChange={e => setTestThenCat(e.target.value as IntelEvent['category'])} className="ui-input ui-input--compact">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
          ) : (
            <div className="ui-patterns__hypothesis-grid ui-patterns__hypothesis-grid--stack">
              <DimRow label="When" kind={triggerKind} onKind={k => { setTriggerKind(k); setTriggerValue(k === 'category' ? 'political' : k === 'source' ? 'rss' : '') }} value={triggerValue} onValue={setTriggerValue} />
              <DimRow label="Then" kind={followKind as RuleDim} onKind={k => setFollowKind(k as FollowDim)} value={followValue} onValue={setFollowValue} followKinds />
              <label className="ui-patterns__field">
                <span>Country (optional)</span>
                <input value={scope} onChange={e => setScope(e.target.value.toUpperCase().slice(0, 3))} placeholder="UKR" className="ui-input ui-input--compact" />
              </label>
            </div>
          )}
          <div className="ui-patterns__hypothesis-foot">
            <button type="button" onClick={runHypothesis} disabled={corpus.length < 2} className="ui-btn ui-btn--ghost">
              Run test
            </button>
            <button type="button" onClick={() => setShowAdvanced(v => !v)} className="ui-link">
              {showAdvanced ? 'Simple' : 'More filters'}
            </button>
          </div>
        </div>
      </details>
    </div>
  )
}

function DimRow({
  label, kind, onKind, value, onValue, followKinds,
}: {
  label: string
  kind: RuleDim
  onKind: (k: RuleDim) => void
  value: string
  onValue: (v: string) => void
  followKinds?: boolean
}) {
  const kinds: { v: RuleDim | FollowDim; l: string }[] = followKinds
    ? [
        { v: 'category', l: 'category' },
        { v: 'actor', l: 'actor' },
        { v: 'country', l: 'country' },
        { v: 'source', l: 'source' },
        { v: 'severityEscalates', l: 'escalation' },
      ]
    : [
        { v: 'category', l: 'category' },
        { v: 'actor', l: 'actor' },
        { v: 'country', l: 'country' },
        { v: 'source', l: 'source' },
      ]
  return (
    <label className="ui-patterns__field ui-patterns__field--row">
      <span>{label}</span>
      <div className="ui-patterns__dim">
        <select value={kind} onChange={e => onKind(e.target.value as RuleDim)} className="ui-input ui-input--compact">
          {kinds.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
        </select>
        {(kind as string) === 'severityEscalates' ? (
          <span className="ui-feed-hint">higher severity</span>
        ) : kind === 'category' ? (
          <select value={CATEGORIES.includes(value as IntelEvent['category']) ? value : 'political'} onChange={e => onValue(e.target.value)} className="ui-input ui-input--compact">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <input value={value} onChange={e => onValue(e.target.value)} placeholder={kind === 'actor' ? 'Actor' : kind === 'country' ? 'ISO' : 'Source'} className="ui-input ui-input--compact" />
        )}
      </div>
    </label>
  )
}

function PatternCard({
  pattern: p,
  corpus,
  mode,
  onPrimary,
  onShowMap,
  onRemove,
}: {
  pattern: Pattern
  corpus: IntelEvent[]
  mode: 'saved' | 'alert'
  onPrimary: () => void
  onShowMap: () => void
  onRemove: () => void
}) {
  const total = p.hits + p.misses
  const hasGeo = p.evidence.eventIds.some(id => {
    const ev = corpus.find(e => e.id === id)
    return ev && hasValidGeo(ev.lat, ev.lon)
  })
  const source = p.source ?? 'rules'

  return (
    <article className={`ui-patterns__card${p.includeInBrief ? ' ui-patterns__card--brief' : ''}`}>
      <div className="ui-patterns__card-main">
        {mode === 'saved' ? (
          <button type="button" onClick={onPrimary} className="ui-patterns__check" title={p.includeInBrief ? 'In brief' : 'Add to brief'} aria-pressed={p.includeInBrief}>
            {p.includeInBrief ? <CheckSquare size={15} /> : <Square size={15} />}
          </button>
        ) : (
          <button type="button" onClick={onPrimary} className="ui-btn ui-btn--ghost ui-patterns__save">
            <Plus size={11} /> Save
          </button>
        )}
        <div className="ui-patterns__card-text">
          <OriginBadge kind={source} size="md" />
          <h4 className="ui-patterns__card-title">{p.name}</h4>
          <p className="ui-patterns__card-if">When: {p.if}</p>
          <p className="ui-patterns__card-then">Then: {p.then}</p>
          {source === 'ai' ? (
            <span className="ui-patterns__rate--ok">
              {p.evidence.eventIds.length} cited event{p.evidence.eventIds.length !== 1 ? 's' : ''}
            </span>
          ) : total > 0 ? (
            <span className={p.hitRate >= 0.5 ? 'ui-patterns__rate--ok' : 'ui-patterns__rate--low'}>
              {Math.round(p.hitRate * 100)}% · {p.hits}/{total} cases
            </span>
          ) : (
            <span className="ui-patterns__rate--low">No matches yet</span>
          )}
        </div>
      </div>
      <div className="ui-patterns__card-actions">
        {hasGeo && (
          <button type="button" onClick={onShowMap} className="ui-patterns__icon-btn" title="Show on map" aria-label="Show on map">
            <MapPin size={13} />
          </button>
        )}
        {mode === 'saved' && (
          <button type="button" onClick={onRemove} className="ui-patterns__icon-btn" title="Remove" aria-label="Remove">
            <X size={13} />
          </button>
        )}
      </div>
    </article>
  )
}
