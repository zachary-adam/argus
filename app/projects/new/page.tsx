'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/stores/projectStore'
import { GOAL_TEMPLATES, defaultKeywordsForGoal, liveTrackingForGoal } from '@/lib/goalTemplates'
import { defaultLiveLayersForGoal } from '@/lib/liveTracking'
import { GoalCategory, AnalysisScope } from '@/types/project'
import { ArrowLeft, ArrowRight, Check, Globe, MapPin, Search, X, ChevronDown, ChevronUp, Zap, RefreshCw } from 'lucide-react'
import { REGION_OPTIONS, GROUP_ORDER, RegionOption, regionIdsToCountryCodes, getRegionCenter } from '@/lib/regions'
import { deriveProfile } from '@/lib/deriveProfile'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useAiAvailable } from '@/lib/hooks/useStatus'
import { loadAnalysisEngine, saveAnalysisEngine, type AnalysisEngine } from '@/lib/aiMode'
import { buildAiFetchHeaders } from '@/lib/aiConfig'
import { AnalysisEngineToggle } from '@/components/ui/AnalysisEngineToggle'

type Step = 1 | 2 | 3

const STEPS = [
  { n: 1, label: 'Name' },
  { n: 2, label: 'Region' },
  { n: 3, label: 'Mission' },
] as const

const CONTEXT = [
  { icon: MapPin, text: 'Map and feed scoped to your region' },
  { icon: Zap,    text: 'AI briefs from your research and events' },
  { icon: Globe,  text: 'GDELT, RSS, or paste your own sources' },
]

export default function NewProjectPage() {
  const router = useRouter()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (isMobile) router.replace('/')
  }, [isMobile, router])

  const { createProject, openProject } = useProjectStore()

  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds]   = useState<string[]>([])
  const [regionSearch, setRegionSearch] = useState('')
  const [regionOpen, setRegionOpen]     = useState(false)
  const regionRef = useRef<HTMLDivElement>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>([20, 10])
  const [mapZoom, setMapZoom]     = useState(3)
  const [goalTemplateId, setGoalTemplateId] = useState<GoalCategory | null>(null)
  const [researchQuestion, setResearchQuestion] = useState('')
  const [liveLayers, setLiveLayers] = useState(defaultLiveLayersForGoal(null))

  useEffect(() => {
    if (goalTemplateId) setLiveLayers(defaultLiveLayersForGoal(goalTemplateId))
  }, [goalTemplateId])

  // Targeting (broad↔specific)
  const [scope, setScope] = useState<AnalysisScope>('global')
  const [placeName, setPlaceName] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [keyDate, setKeyDate] = useState('')
  const [kwDraft, setKwDraft] = useState('')
  const [entDraft, setEntDraft] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [missionSuggested, setMissionSuggested] = useState(false)
  const [missionSuggestError, setMissionSuggestError] = useState('')
  const [missionEngine, setMissionEngine] = useState<AnalysisEngine>('ai')
  const aiAvailable = useAiAvailable()
  const [locating, setLocating] = useState(false)
  const [placeResolved, setPlaceResolved] = useState<string | null>(null)
  const [autoCollect, setAutoCollect] = useState(true)
  const [creating, setCreating] = useState(false)

  // AI-suggest full mission setup (research Q + keywords + entities + place).
  const suggestFullMission = async () => {
    setSuggesting(true)
    setMissionSuggestError('')
    try {
      const goalName = GOAL_TEMPLATES.find(t => t.category === goalTemplateId)?.name ?? goalTemplateId ?? 'general monitoring'
      const regionName = REGION_OPTIONS.filter(r => selectedIds.includes(r.id)).map(r => r.name).join(', ')
      const res = await fetch('/api/connectors/suggest-targeting', {
        method: 'POST',
        headers: buildAiFetchHeaders('suggest', missionEngine),
        body: JSON.stringify({
          goal: goalName,
          goalTemplateId: goalTemplateId ?? undefined,
          placeName: placeName.trim() || undefined,
          regionName: regionName || undefined,
          countryCodes: regionIdsToCountryCodes(selectedIds),
          scope,
        }),
      })
      if (res.ok) {
        const d = await res.json() as {
          researchQuestion?: string
          suggestedPlace?: string
          keywords?: string[]
          entities?: string[]
          suggestedGoalTemplateId?: GoalCategory
          offline?: boolean
        }
        if (d.researchQuestion) setResearchQuestion(d.researchQuestion)
        if (d.suggestedPlace && !placeName.trim()) setPlaceName(d.suggestedPlace)
        if (d.keywords?.length) setKeywords(k => [...new Set([...k, ...d.keywords!])])
        if (d.entities?.length) setEntities(s => [...new Set([...s, ...d.entities!])])
        if (!goalTemplateId && d.suggestedGoalTemplateId) setGoalTemplateId(d.suggestedGoalTemplateId)
        setMissionSuggested(true)
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setMissionSuggestError(err.error ?? 'Mission suggest failed — try again or write your question manually.')
      }
    } catch {
      setMissionSuggestError('Mission suggest failed — check your connection and try again.')
    } finally { setSuggesting(false) }
  }

  // Geocode the focus place and recenter the map on it.
  const locatePlace = async () => {
    const q = placeName.trim()
    if (!q) return
    setLocating(true); setPlaceResolved(null)
    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()
      if (token) {
        const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&limit=1`)
        const d = await res.json() as { features?: { center: [number, number]; place_name: string }[] }
        const f = d.features?.[0]
        if (f) { setMapCenter(f.center); setMapZoom(scope === 'local' ? 10 : scope === 'country' ? 5 : 6); setPlaceResolved(f.place_name) }
        else setPlaceResolved('Not found — try a fuller name')
        return
      }
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
      const d = await res.json() as { center?: [number, number]; place_name?: string; lon?: number; lat?: number; label?: string; name?: string }[]
      const f = Array.isArray(d) ? d[0] : null
      if (f?.center) {
        setMapCenter(f.center)
        setMapZoom(scope === 'local' ? 10 : scope === 'country' ? 5 : 6)
        setPlaceResolved(f.place_name || q)
      } else setPlaceResolved('Not found — try a fuller name')
    } catch { setPlaceResolved('Lookup failed') } finally { setLocating(false) }
  }

  const canNext1  = name.trim().length >= 2
  const canNext2  = selectedIds.length > 0
  const canNext3  = researchQuestion.trim().length >= 8

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(e.target as Node)) {
        setRegionOpen(false); setRegionSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    setMissionEngine(loadAnalysisEngine('cloud'))
  }, [])

  // Step 3: offer a one-click mission draft when region is set but the analyst
  // hasn't typed a research question yet (cheap gpt-4o-mini call).
  useEffect(() => {
    if (step !== 3 || missionSuggested || suggesting) return
    if (researchQuestion.trim().length >= 8) return
    if (selectedIds.length === 0 && !placeName.trim()) return
    void suggestFullMission()
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRegion = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      if (!prev.includes(id)) {
        const c = getRegionCenter(id)
        if (c) { setMapCenter(c.center); setMapZoom(c.zoom) }
      }
      return next
    })
  }, [])

  const handleCreate = () => {
    if (creating) return
    setCreating(true)
    const sel          = REGION_OPTIONS.filter(r => selectedIds.includes(r.id))
    const regionName   = sel.map(r => r.name).join(', ')
    const countryCodes = regionIdsToCountryCodes(selectedIds)
    const seededKeywords = keywords.length > 0 ? keywords : (goalTemplateId ? defaultKeywordsForGoal(goalTemplateId) : [])
    const targeting = {
      scope,
      placeName: placeName.trim() || undefined,
      keywords: seededKeywords,
      watchEntities: entities,
      keyDate: keyDate || undefined,
    }
    const profile = deriveProfile(goalTemplateId, researchQuestion)
    const project = createProject({
      name: name.trim(),
      regionName,
      regionCenter: mapCenter,
      regionZoom: mapZoom,
      countryCodes,
      goalTemplateId: goalTemplateId ?? undefined,
      researchQuestion: researchQuestion.trim(),
      analysisProfile: profile,
      aiMode: missionEngine === 'rules' ? 'none' : 'cloud',
      storage: 'local',
      liveLayers,
      targeting,
    })
    if (autoCollect) {
      try {
        sessionStorage.setItem('argus-auto-collect', JSON.stringify({ projectId: project.id, at: Date.now() }))
      } catch { /* ignore */ }
    }
    openProject(project.id)
    router.push(`/projects/${project.id}`)
  }

  const q = regionSearch.toLowerCase()
  const filteredMacros    = REGION_OPTIONS.filter(r => r.type === 'macro'   && (!q || r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q)))
  const filteredCountries = REGION_OPTIONS.filter(r => r.type === 'country' && (!q || r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q)))
  const countryGroups: Record<string, RegionOption[]> = {}
  filteredCountries.forEach(c => { if (!countryGroups[c.group]) countryGroups[c.group] = []; countryGroups[c.group].push(c) })
  const sortedCountryGroups = GROUP_ORDER.filter(g => countryGroups[g]?.length)
  const scopedCountryCodes = regionIdsToCountryCodes(selectedIds)

  if (isMobile) return null

  return (
    <div className="wizard-page wizard-page--simple">

      <aside className="wizard-sidebar">
        <div className="wizard-sidebar__intro">
          <div className="ui-wordmark ui-wordmark--sm">ARGUS</div>
          <div className="wizard-sidebar__title">New project</div>
          <p className="wizard-sidebar__subtitle">
            Pick a region and the question you are trying to answer.
          </p>
        </div>

        <div className="wizard-steps">
          {STEPS.map((s, i) => {
            const done    = s.n < step
            const active  = s.n === step
            const pending = s.n > step
            return (
              <div key={s.n} className="wizard-step">
                <div className="wizard-step__rail">
                  <div className={`wizard-step__dot${done ? ' wizard-step__dot--done' : active ? ' wizard-step__dot--active' : ' wizard-step__dot--pending'}`}>
                    {done ? <Check size={11} strokeWidth={3} /> : s.n}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`wizard-step__line${done ? ' wizard-step__line--done' : ''}`} />
                  )}
                </div>
                <div className={`wizard-step__body${i < STEPS.length - 1 ? ' wizard-step__body--spaced' : ''}`}>
                  <div className={`wizard-step__label${pending ? ' wizard-step__label--pending' : ''}${active ? ' wizard-step__label--active' : ''}`}>{s.label}</div>
                  {active && (
                    <div className="wizard-step__hint">
                      {s.n === 1 && 'What are you watching?'}
                      {s.n === 2 && 'Where is the focus area?'}
                      {s.n === 3 && 'What are you trying to find out?'}
                    </div>
                  )}
                  {done && s.n === 1 && name && <div className="wizard-step__done">{name}</div>}
                  {done && s.n === 2 && selectedIds.length > 0 && (
                    <div className="wizard-step__done">{scopedCountryCodes.length} countries</div>
                  )}
                  {done && s.n === 3 && researchQuestion && (
                    <div className="wizard-step__done">{researchQuestion.slice(0, 60)}{researchQuestion.length > 60 ? '…' : ''}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="wizard-sidebar__footer">
          <div className="ui-section-label" style={{ marginBottom: 12 }}>What you get</div>
          <ul className="wizard-value-list">
            {CONTEXT.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={12} className="wizard-value-list__icon" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="wizard-main">

        <div className="wizard-main__nav">
          <button
            type="button"
            onClick={() => step === 1 ? router.back() : setStep(s => (s - 1) as Step)}
            className="ui-back"
          >
            <ArrowLeft size={13} /> {step === 1 ? 'Back to projects' : 'Back'}
          </button>
        </div>

        <div className="wizard-main__inner">

          {/* Step 1 — Name */}
          {step === 1 && (
            <StepCard title="Name your project" subtitle="Give this workspace a clear, memorable name.">
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && canNext1 && setStep(2)}
                placeholder="e.g. Sahel Conflict Watch · Nigeria Elections 2027"
                className="ui-input"
              />
              <NextButton disabled={!canNext1} onClick={() => setStep(2)} />
            </StepCard>
          )}

          {/* Step 2 — Region */}
          {step === 2 && (
            <StepCard title="Define the region scope" subtitle="Select regions or countries to scope all data fetching and AI analysis.">

              <div ref={regionRef} style={{ marginBottom: 12 }}>
                <div
                  onClick={() => setRegionOpen(v => !v)}
                  onKeyDown={e => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRegionOpen(v => !v) }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-expanded={regionOpen}
                  aria-label="Select regions or countries"
                  className={`wizard-region-trigger${regionOpen ? ' wizard-region-trigger--open' : ''}`}
                >
                  {selectedIds.length === 0 && (
                    <span className="ui-feed-hint" style={{ flex: 1, fontSize: 13 }}>Search and select regions or countries…</span>
                  )}
                  {selectedIds.map(id => {
                    const r = REGION_OPTIONS.find(o => o.id === id)
                    if (!r) return null
                    return (
                      <span key={id} className="ui-chip ui-chip--xs ui-chip--accent" style={{ gap: 3 }}>
                        {r.name}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); toggleRegion(id) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', display: 'flex', alignItems: 'center' }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    )
                  })}
                  <span style={{ marginLeft: 'auto', paddingLeft: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {regionOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </span>
                </div>

                {regionOpen && (
                  <div className="wizard-region-dropdown">
                    <div className="wizard-region-search">
                      <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <input
                        autoFocus
                        value={regionSearch}
                        onChange={e => setRegionSearch(e.target.value)}
                        placeholder="Search regions or countries…"
                        onClick={e => e.stopPropagation()}
                      />
                      {regionSearch && (
                        <button type="button" onClick={() => setRegionSearch('')} className="ui-btn ui-btn--ghost" style={{ padding: 0, minHeight: 0 }}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                    <div className="wizard-region-list">
                      {filteredMacros.length > 0 && (
                        <>
                          <div style={{ padding: '6px 10px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-elevated)', borderBottom: '1px solid var(--border)' }}>
                            <Globe size={9} /> Macro Regions
                          </div>
                          {filteredMacros.map(r => {
                            const sel = selectedIds.includes(r.id)
                            return (
                              <div
                                key={r.id}
                                onClick={() => toggleRegion(r.id)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRegion(r.id) } }}
                                role="checkbox"
                                aria-checked={sel}
                                aria-label={r.name}
                                tabIndex={0}
                                className={`wizard-region-row${sel ? ' wizard-region-row--selected' : ''}`}
                              >
                                <div style={{ width: 15, height: 15, borderRadius: 'var(--radius-sm)', border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {sel && <Check size={9} color="white" strokeWidth={3} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: sel ? 700 : 400, color: sel ? 'var(--accent)' : 'var(--text-primary)' }}>{r.name}</div>
                                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{r.group} · {r.codes.length} countries</div>
                                </div>
                              </div>
                            )
                          })}
                        </>
                      )}
                      {filteredCountries.length > 0 && (
                        <>
                          <div style={{ padding: '6px 10px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-elevated)', borderBottom: '1px solid var(--border)', borderTop: filteredMacros.length > 0 ? '2px solid var(--border)' : undefined }}>
                            <MapPin size={9} /> Individual Countries
                          </div>
                          {sortedCountryGroups.map(group => (
                            <div key={group}>
                              {!q && <div style={{ padding: '4px 12px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'var(--surface-elevated)', opacity: 0.7 }}>{group}</div>}
                              {countryGroups[group].map(r => {
                                const sel = selectedIds.includes(r.id)
                                return (
                                  <div
                                    key={r.id}
                                    onClick={() => toggleRegion(r.id)}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRegion(r.id) } }}
                                    role="checkbox"
                                    aria-checked={sel}
                                    aria-label={r.name}
                                    tabIndex={0}
                                    className={`wizard-region-row${sel ? ' wizard-region-row--selected' : ''}`}
                                    style={{ padding: '7px 12px' }}
                                  >
                                    <div style={{ width: 15, height: 15, borderRadius: 'var(--radius-sm)', border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      {sel && <Check size={9} color="white" strokeWidth={3} />}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: sel ? 700 : 400, color: sel ? 'var(--accent)' : 'var(--text-primary)' }}>{r.name}</div>
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </>
                      )}
                      {filteredMacros.length === 0 && filteredCountries.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No results for &ldquo;{regionSearch}&rdquo;</div>
                      )}
                    </div>
                    {selectedIds.length > 0 && (
                      <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-elevated)' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{selectedIds.length} selected · {scopedCountryCodes.length} countries</span>
                        <button onClick={() => setSelectedIds([])} style={{ fontSize: 10, color: 'var(--badge-red-fg)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Clear all</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <RegionMap center={mapCenter} zoom={mapZoom} onMove={(center, zoom) => { setMapCenter(center); setMapZoom(zoom) }} />

              {selectedIds.length > 0 && (
                <div className="ui-callout" style={{ marginTop: 8, fontSize: 10, color: 'var(--accent)' }}>
                  <strong>{scopedCountryCodes.length} {scopedCountryCodes.length === 1 ? 'country' : 'countries'}</strong> will be scoped: {scopedCountryCodes.slice(0, 12).join(', ')}{scopedCountryCodes.length > 12 ? ` +${scopedCountryCodes.length - 12} more` : ''}
                </div>
              )}

              <NextButton disabled={!canNext2} onClick={() => setStep(3)} />
            </StepCard>
          )}

          {/* Step 3 — Mission */}
          {step === 3 && (
            <div className="wizard-step3-card">
              <div className="wizard-step3-card__head">
                <div className="ui-kicker" style={{ marginBottom: 6 }}>Mission</div>
                <h2 className="ui-title ui-title--panel">What are you watching?</h2>
                <p className="ui-subtitle ui-subtitle--panel">
                  One clear question is enough to get started. You can tune sources and alerts later.
                </p>
              </div>

              <div className="wizard-step3-card__body">
                <div className="wizard-mission-block">
                  <div className="wizard-mission-head">
                    <div className="ui-section-label" style={{ marginBottom: 0 }}>Research question</div>
                    <div className="wizard-mission-head__actions">
                      <div className="wizard-mission-engine">
                        <AnalysisEngineToggle
                          compact
                          value={missionEngine}
                          aiAvailable={aiAvailable}
                          onChange={v => { setMissionEngine(v); saveAnalysisEngine(v) }}
                        />
                        <span className="ui-feed-hint wizard-mission-engine__hint">
                          Sets AI vs rules for this project
                        </span>
                      </div>
                      <button type="button" onClick={suggestFullMission} disabled={suggesting || selectedIds.length === 0}
                        className="ui-btn ui-btn--ghost wizard-btn--suggest">
                        <Zap size={10} /> {suggesting ? 'Suggesting…' : 'Suggest mission'}
                      </button>
                    </div>
                  </div>
                  {missionSuggested && researchQuestion.trim().length >= 8 && (
                    <div className="wizard-mission-suggested">
                      <Zap size={11} strokeWidth={2.25} />
                      <span>
                        Draft filled by {missionEngine === 'ai' ? 'AI' : 'rules'} — edit anything before creating.
                        {!goalTemplateId ? '' : ` Category: ${GOAL_TEMPLATES.find(t => t.category === goalTemplateId)?.name ?? goalTemplateId}.`}
                      </span>
                    </div>
                  )}
                  {missionSuggestError && (
                    <div className="ui-callout ui-callout--warn" style={{ marginBottom: 8, fontSize: 11 }}>
                      {missionSuggestError}
                    </div>
                  )}
                  <textarea
                    autoFocus
                    value={researchQuestion}
                    onChange={e => { setResearchQuestion(e.target.value); setMissionSuggested(false); setMissionSuggestError('') }}
                    placeholder={`Write your research question...\n\nExamples:\n• Is electoral violence likely before Kenya's 2027 elections?\n• What are the patterns of gender-based violence in Punjab province?\n• Is Sudan's debt crisis accelerating displacement?`}
                    className={`ui-input wizard-textarea${researchQuestion.trim().length >= 8 ? ' wizard-textarea--valid' : ''}`}
                  />
                  {researchQuestion.trim().length > 0 && researchQuestion.trim().length < 8 && (
                    <div className="ui-feed-hint" style={{ marginTop: 4 }}>A bit more detail helps tune the analysis…</div>
                  )}
                </div>

                <div className="wizard-mission-block wizard-mission-block--compact">
                  <details className="wizard-details">
                    <summary className="wizard-details__summary">
                      Closest category <span className="wizard-details__optional">optional</span>
                    </summary>
                    <div className="wizard-details__body">
                  <div className="wizard-goal-grid">
                    {GOAL_TEMPLATES.map(template => {
                      const active = goalTemplateId === template.category
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setGoalTemplateId(s => s === template.category ? null : template.category)}
                          className={`wizard-goal-btn${active ? ' wizard-goal-btn--active' : ''}`}
                        >
                          <div className="ui-kicker" style={{ marginBottom: 2, color: active ? 'var(--accent)' : undefined }}>{template.name}</div>
                          <div className="ui-feed-hint" style={{ lineHeight: 1.4 }}>{template.description}</div>
                        </button>
                      )
                    })}
                  </div>

                  {goalTemplateId && (() => {
                    const t = GOAL_TEMPLATES.find(t => t.category === goalTemplateId)!
                    return (
                      <div className="ui-callout" style={{ marginTop: 8 }}>
                        <div className="ui-section-label" style={{ marginBottom: 7 }}>Key indicators</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {t.keyIndicators.map(ind => (
                            <div key={ind} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text-secondary)' }}>
                              <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                              {ind}
                            </div>
                          ))}
                        </div>
                        {(() => {
                          const lt = liveTrackingForGoal(goalTemplateId)
                          if (!lt.vessels && !lt.aviation) return null
                          const lyr = [lt.vessels && 'vessel (AIS)', lt.aviation && 'aircraft (ADS-B)'].filter(Boolean).join(' + ')
                          return (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                              <div className="ui-section-label" style={{ marginBottom: 5 }}>Live map layers</div>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--high)', flexShrink: 0, marginTop: 6 }} />
                                <div>Turns on <strong style={{ color: 'var(--text-primary)' }}>live {lyr} tracking</strong> on the map — real-time positions for this mission. Heads-up: live feeds can add some latency.</div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })()}
                    </div>
                  </details>
                </div>

                {/* Targeting — open by default so place + keywords get set */}
                <details className="wizard-details" open>
                  <summary className="wizard-details__summary">Aim the collect (place + topics)</summary>
                  <div className="wizard-details__body">
                <div className="wizard-targeting-block">
                  <div className="ui-section-label" style={{ marginBottom: 7 }}>How broad or specific?</div>
                  <div className="wizard-scope-row">
                    {([['global', 'Global', 'whole-world feed'], ['regional', 'Regional', 'a region'], ['country', 'Country', 'one country'], ['local', 'Local', 'a city / town / ward']] as const).map(([sc, lbl, desc]) => {
                      const sel = scope === sc
                      return (
                        <button key={sc} type="button" onClick={() => setScope(sc)} title={desc}
                          className={`wizard-scope-btn${sel ? ' wizard-scope-btn--active' : ''}`}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{lbl}</div>
                          <div className="ui-feed-hint" style={{ fontSize: 8 }}>{desc}</div>
                        </button>
                      )
                    })}
                  </div>

                  {scope !== 'global' && (
                    <div className="ui-callout" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p className="ui-feed-hint" style={{ margin: 0, lineHeight: 1.5 }}>
                        Required for a useful feed: a focus place plus topics. Example — place <em>Jamia Nagar, Delhi</em>, topics <em>election</em>, <em>student union</em>.
                      </p>
                      <div className="wizard-place-row">
                        <input value={placeName} onChange={e => { setPlaceName(e.target.value); setPlaceResolved(null) }} placeholder="Focus place — e.g. Jamia Nagar, Delhi"
                          className="ui-input" style={{ flex: 1 }} />
                        <button type="button" onClick={locatePlace} disabled={!placeName.trim() || locating}
                          className="ui-btn ui-btn--ghost wizard-place-row__btn">
                          <MapPin size={11} /> {locating ? '…' : 'Locate'}
                        </button>
                      </div>
                      {placeResolved && <div className="ui-feed-hint">📍 {placeResolved}</div>}

                      <button type="button" onClick={suggestFullMission} disabled={suggesting || (selectedIds.length === 0 && !placeName.trim() && !goalTemplateId)}
                        className="ui-btn ui-btn--ghost wizard-btn--retarget">
                        <Zap size={11} /> {suggesting ? 'Suggesting…' : 'AI: refresh topics & entities'}
                      </button>

                      <ChipField label="Topics / keywords" items={keywords} draft={kwDraft} setDraft={setKwDraft}
                        onAdd={v => setKeywords(k => [...new Set([...k, v])])} onRemove={v => setKeywords(k => k.filter(x => x !== v))}
                        placeholder="add a topic + Enter (e.g. election, student union)" />
                      <ChipField label="Watch entities" items={entities} draft={entDraft} setDraft={setEntDraft}
                        onAdd={v => setEntities(s => [...new Set([...s, v])])} onRemove={v => setEntities(s => s.filter(x => x !== v))}
                        placeholder="add a person / party / group + Enter" />

                      <div>
                        <div className="ui-section-label" style={{ marginBottom: 4 }}>Key date (optional)</div>
                        <input type="date" value={keyDate} onChange={e => setKeyDate(e.target.value)} className="ui-input" />
                      </div>
                    </div>
                  )}
                </div>
                  </div>
                </details>
              </div>

              <div className="wizard-step3-card__foot">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 14,
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoCollect}
                    onChange={e => setAutoCollect(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong style={{ color: 'var(--text)' }}>Collect events automatically</strong>
                    <br />
                    Pull news and sources for your keywords as soon as the project opens — no empty map wait.
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!canNext3 || creating}
                  onClick={() => canNext3 && handleCreate()}
                  className="ui-btn ui-btn--primary wizard-create-btn"
                >
                  {creating ? (
                    <><RefreshCw size={15} className="ui-spin" /> Opening…</>
                  ) : (
                    <><Check size={15} /> Create project</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function RegionMap({ center, zoom, onMove }: { center: [number, number]; zoom: number; onMove: (center: [number, number], zoom: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const prevCenter = useRef(center)
  const prevZoom   = useRef(zoom)

  useEffect(() => {
    if (!containerRef.current) return
    let destroyed = false
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim()
    const boot = async () => {
      if (token) {
        const { default: mapboxgl } = await import('mapbox-gl')
        await import('mapbox-gl/dist/mapbox-gl.css' as any)
        if (destroyed || !containerRef.current) return
        mapboxgl.accessToken = token
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: 'mapbox://styles/mapbox/light-v11',
          center, zoom, attributionControl: false,
        })
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
        map.on('moveend', () => { const c = map.getCenter(); onMove([c.lng, c.lat], map.getZoom()) })
        mapRef.current = map
        return
      }
      const { default: maplibregl } = await import('maplibre-gl')
      await import('maplibre-gl/dist/maplibre-gl.css' as any)
      if (destroyed || !containerRef.current) return
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center, zoom, attributionControl: false,
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.on('moveend', () => { const c = map.getCenter(); onMove([c.lng, c.lat], map.getZoom()) })
      mapRef.current = map
    }
    void boot()
    return () => { destroyed = true; mapRef.current?.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapRef.current) return
    if (center[0] !== prevCenter.current[0] || center[1] !== prevCenter.current[1] || zoom !== prevZoom.current) {
      mapRef.current.flyTo({ center, zoom, duration: 900, essential: true })
      prevCenter.current = center; prevZoom.current = zoom
    }
  }, [center, zoom])

  return (
    <div className="wizard-region-map">
      <div ref={containerRef} className="wizard-region-map__canvas" />
      {/* Crosshair */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', width: 20, height: 20 }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--accent)', opacity: 0.7 }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--accent)', opacity: 0.7 }} />
      </div>
      <div className="wizard-region-map__hint">
        Pan &amp; zoom to fine-tune
      </div>
    </div>
  )
}

function ChipField({ label, items, draft, setDraft, onAdd, onRemove, placeholder }: {
  label: string; items: string[]; draft: string; setDraft: (v: string) => void
  onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string
}) {
  const commit = () => { const v = draft.trim(); if (v) { onAdd(v); setDraft('') } }
  return (
    <div>
      <div className="ui-section-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: items.length ? 6 : 0 }}>
        {items.map(it => (
          <span key={it} className="ui-chip ui-chip--xs ui-chip--accent">
            {it}
            <button type="button" onClick={() => onRemove(it)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}><X size={11} /></button>
          </span>
        ))}
      </div>
      <input value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        onBlur={commit} placeholder={placeholder}
        className="ui-input" />
    </div>
  )
}

function StepCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="wizard-card">
      <div className="wizard-card__head">
        <h2 className="ui-title ui-title--panel">{title}</h2>
        <p className="ui-subtitle ui-subtitle--panel">{subtitle}</p>
      </div>
      <div className="wizard-card__body">{children}</div>
    </div>
  )
}

function NextButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="ui-btn ui-btn--primary wizard-next-btn"
    >
      Next <ArrowRight size={14} />
    </button>
  )
}
