'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { GOAL_TEMPLATES, liveTrackingForGoal } from '@/lib/goalTemplates'
import {
  syncProjectLiveTracking,
  resolveLiveLayers,
  liveLayersAfterGoalChange,
} from '@/lib/liveTracking'
import { GoalCategory, AnalysisScope, BriefEvidenceMode, LiveFeedRetention } from '@/types/project'
import { X, Save, Trash2, AlertTriangle, Check, Eye, EyeOff, Key, Globe, Target, Cpu, Search, ChevronDown, ChevronUp, MapPin, Database, HelpCircle } from 'lucide-react'
import { RegionOption, REGION_OPTIONS, GROUP_ORDER, initRegionIds, regionIdsToCountryCodes } from '@/lib/regions'
import { FEATURES } from '@/lib/features'
import { topicWatchTerms } from '@/lib/topicWatchTerms'
import { useClosePanel } from '@/lib/hooks/useClosePanel'
import { saveAnalysisEngine } from '@/lib/aiMode'
import { clearClientCachesAndReload } from '@/lib/clientCache'
import { downloadProjectBackup, mergeProjectImports, parseProjectBackup } from '@/lib/projectBackup'
import { isSupabaseConfigured, IS_CLOUD_MODE } from '@/lib/supabase/config'
import { useSettingsStore } from '@/stores/settingsStore'
import { SegControl } from '@/components/ui/SegControl'
import { filterIntelByRetention } from '@/lib/eventRetention'
import { KEY_SECTIONS, type KeyField } from '@/lib/keyCatalog'
import { setClientMapboxToken } from '@/lib/mapProvider'

type Tab = 'project' | 'ai' | 'app' | 'keys' | 'help'

const HELP_SIGNUP: Record<string, string> = {
  NEXT_PUBLIC_MAPBOX_TOKEN: 'https://account.mapbox.com',
  GOOGLE_MAPS_KEY: 'https://console.cloud.google.com',
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: 'https://console.cloud.google.com',
  ANTHROPIC_API_KEY: 'https://console.anthropic.com',
  OPENAI_API_KEY: 'https://platform.openai.com',
  SERPER_API_KEY: 'https://serper.dev',
  BRAVE_API_KEY: 'https://api.search.brave.com',
  NEWSAPI_KEY: 'https://newsapi.org',
  GUARDIAN_API_KEY: 'https://open-platform.theguardian.com',
  FIRECRAWL_API_KEY: 'https://firecrawl.dev',
  SEMANTIC_SCHOLAR_API_KEY: 'https://www.semanticscholar.org/product/api',
  ACLED_EMAIL: 'https://acleddata.com',
  ACLED_PASSWORD: 'https://acleddata.com',
  NASA_FIRMS_KEY: 'https://firms.modaps.eosdis.nasa.gov',
  AISSTREAM_API_KEY: 'https://aisstream.io',
  OPENSKY_USERNAME: 'https://opensky-network.org',
  OPENSKY_PASSWORD: 'https://opensky-network.org',
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.com',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'https://supabase.com',
}

function VaultKeySection({ fields, title, blurb }: { fields: KeyField[]; title: string; blurb?: string }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  const [vaultAvailable, setVaultAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/vault').then(r => r.json()).then(d => {
      setVaultAvailable(d.configured ?? false)
      const conf: Record<string, boolean> = {}
      for (const f of fields) conf[f.name] = (d.keys ?? []).includes(f.name)
      setConfigured(conf)
    }).catch(() => setVaultAvailable(false))
  }, [fields])

  const saveKey = async (name: string, field: KeyField) => {
    const value = values[name]?.trim()
    if (!value) return
    if (field.clientPublic && name === 'NEXT_PUBLIC_MAPBOX_TOKEN') setClientMapboxToken(value)
    if (field.hostedOnly) return // must use .env
    const res = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value }),
    })
    if (res.ok || (field.clientPublic && vaultAvailable === false)) {
      setSaved(s => ({ ...s, [name]: true }))
      setConfigured(s => ({ ...s, [name]: true }))
      setValues(v => ({ ...v, [name]: '' }))
      setTimeout(() => setSaved(s => ({ ...s, [name]: false })), 2000)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ui-section-label" style={{ marginBottom: 0 }}>{title}</div>
      {blurb && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: -6 }}>{blurb}</div>}

      {vaultAvailable === false && (
        <div className="ui-callout ui-callout--warn">
          <strong>Vault not configured.</strong> Add <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>VAULT_MASTER_KEY</code> to <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>.env.local</code> and restart to enable encrypted key storage.
        </div>
      )}

      {fields.map(f => (
        <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</span>
            {configured[f.name] && (
              <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)' }}>Configured</span>
            )}
            {f.hostedOnly && <span className="ui-chip ui-chip--xs">Hosted / .env</span>}
          </div>
          {f.hostedOnly ? (
            <div className="ui-vault-hint">{f.hint}</div>
          ) : (
            <>
              <div className="ui-input-row">
                <div className={`ui-input-wrap${f.type === 'password' ? ' ui-input-wrap--action' : ''}`} style={{ flex: 1 }}>
                  <input
                    type={show[f.name] ? 'text' : (f.type ?? 'text')}
                    value={values[f.name] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                    placeholder={configured[f.name] ? '••••••••••••• (already set — enter new value to replace)' : f.placeholder}
                    className="ui-input"
                  />
                  {f.type === 'password' && (
                    <button
                      type="button"
                      onClick={() => setShow(s => ({ ...s, [f.name]: !s[f.name] }))}
                      className="ui-input-wrap__clear"
                      style={{ right: 9 }}
                    >
                      {show[f.name] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => saveKey(f.name, f)}
                  disabled={!values[f.name]?.trim() || (vaultAvailable === false && !f.clientPublic)}
                  className="ui-btn ui-btn--primary"
                  style={{
                    fontSize: 11,
                    padding: '0 12px',
                    whiteSpace: 'nowrap',
                    ...(saved[f.name] ? { background: 'var(--low)' } : {}),
                  }}
                >
                  {saved[f.name] ? <><Check size={11} /> Saved</> : <><Key size={11} /> Save</>}
                </button>
              </div>
              <div className="ui-vault-hint">{f.hint}</div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── AI API keys — backed by the server VAULT (single source of truth, the same
//    store as Intel Sources → Vault). No more localStorage copy / contradiction.
function CloudKeySection() {
  const [vaultKeys, setVaultKeys] = useState<string[]>([])
  const [configured, setConfigured] = useState(true)
  const [showA, setShowA] = useState(false)
  const [showO, setShowO] = useState(false)
  const [savedA, setSavedA] = useState(false)
  const [savedO, setSavedO] = useState(false)
  const [draftA, setDraftA] = useState('')
  const [draftO, setDraftO] = useState('')

  useEffect(() => {
    fetch('/api/vault').then(r => r.json()).then(d => {
      setConfigured(d.configured !== false)
      setVaultKeys(Array.isArray(d.keys) ? d.keys : [])
    }).catch(() => {})
  }, [])

  const saveKey = async (name: string, draft: string, setDraft: (v: string) => void, setSaved: (v: boolean) => void, lsKey: string) => {
    if (!draft.trim()) return
    const res = await fetch('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, value: draft.trim() }) })
    if (res.ok) {
      setVaultKeys(k => k.includes(name) ? k : [...k, name])
      setDraft(''); setSaved(true); setTimeout(() => setSaved(false), 2000)
      try { localStorage.removeItem(lsKey) } catch {} // drop any legacy browser copy
    }
  }
  const removeKey = async (name: string) => {
    await fetch(`/api/vault/${name}`, { method: 'DELETE' })
    setVaultKeys(k => k.filter(n => n !== name))
  }
  const saveA = () => saveKey('ANTHROPIC_API_KEY', draftA, setDraftA, setSavedA, 'argus_anthropic_key')
  const saveO = () => saveKey('OPENAI_API_KEY', draftO, setDraftO, setSavedO, 'argus_openai_key')
  const anthropicKey = vaultKeys.includes('ANTHROPIC_API_KEY') ? 'set' : ''
  const openaiKey = vaultKeys.includes('OPENAI_API_KEY') ? 'set' : ''

  const field = (opts: {
    label: string; hint: string; placeholder: string
    value: string; onChange: (v: string) => void
    show: boolean; onToggleShow: () => void
    draft: string; onSave: () => void; saved: boolean
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{opts.label}</span>
        {opts.value && (
          <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)' }}>Set</span>
        )}
      </div>
      <div className="ui-input-row">
        <div className="ui-input-wrap ui-input-wrap--action" style={{ flex: 1 }}>
          <input
            type={opts.show ? 'text' : 'password'}
            value={opts.draft}
            onChange={e => opts.onChange(e.target.value)}
            placeholder={opts.value ? '••••••••••••• (set — enter new to replace)' : opts.placeholder}
            className="ui-input"
          />
          <button type="button" onClick={opts.onToggleShow} className="ui-input-wrap__clear" style={{ right: 9 }}>
            {opts.show ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <button
          type="button"
          onClick={opts.onSave}
          disabled={!opts.draft.trim()}
          className="ui-btn ui-btn--primary"
          style={{ fontSize: 11, padding: '0 12px', whiteSpace: 'nowrap', ...(opts.saved ? { background: 'var(--low)' } : {}) }}
        >
          {opts.saved ? <><Check size={11} /> Saved</> : <><Key size={11} /> Save</>}
        </button>
      </div>
      <div className="ui-vault-hint">{opts.hint}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="ui-callout ui-callout--ok">
        Keys are encrypted server-side (AES-256-GCM) in the <strong>vault</strong> — the single place ARGUS reads them.
        This is the same store as <strong>Intel Sources → Vault</strong>; set a key in either place and it works everywhere.
      </div>
      {!configured && (
        <div className="ui-callout ui-callout--warn">
          Vault not configured — add <code>VAULT_MASTER_KEY</code> to <code>.env.local</code> and restart to store keys.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="ui-section-label" style={{ marginBottom: 0 }}>AI Providers</div>
        {field({
          label: 'Anthropic (Claude)', hint: 'Used for AI analysis and briefs — console.anthropic.com',
          placeholder: 'sk-ant-api03-...', value: anthropicKey,
          draft: draftA, onChange: setDraftA,
          show: showA, onToggleShow: () => setShowA(s => !s),
          onSave: saveA, saved: savedA,
        })}
        {field({
          label: 'OpenAI (GPT-4o)', hint: 'Fallback AI analyst — platform.openai.com',
          placeholder: 'sk-proj-...', value: openaiKey,
          draft: draftO, onChange: setDraftO,
          show: showO, onToggleShow: () => setShowO(s => !s),
          onSave: saveO, saved: savedO,
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {anthropicKey && (
          <button type="button" onClick={() => { if (confirm('Remove the Anthropic key from the vault?')) removeKey('ANTHROPIC_API_KEY') }}
            className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '5px 10px' }}>
            Remove Anthropic key
          </button>
        )}
        {openaiKey && (
          <button type="button" onClick={() => { if (confirm('Remove the OpenAI key from the vault?')) removeKey('OPENAI_API_KEY') }}
            className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '5px 10px' }}>
            Remove OpenAI key
          </button>
        )}
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────
export default function SettingsPanel() {
  const { handleClose, closing } = useClosePanel('settings')
  const viewport = useMapStore(s => s.viewport)
  const setEvents = useMapStore(s => s.setEvents)
  const setAlerts = useMapStore(s => s.setAlerts)
  const setSituations = useMapStore(s => s.setSituations)
  const router = useRouter()

  const { getActiveProject, updateProject, deleteProject, closeProject, pruneExpiredEvents } = useProjectStore()
  const project = getActiveProject()

  // Live tracking layers — apply to the project and the live map immediately.
  const liveLayers = resolveLiveLayers(project)
  const setLive = (partial: Partial<typeof liveLayers>) => {
    if (!project) return
    const next = { ...liveLayers, ...partial }
    updateProject(project.id, { liveLayers: next })
    syncProjectLiveTracking({ ...project, liveLayers: next })
  }

  const [tab, setTab] = useState<Tab>('project')

  // Project tab state
  const [name, setName] = useState(project?.name ?? '')
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>(() =>
    initRegionIds(project?.countryCodes ?? [], project?.regionName ?? '')
  )
  const [regionSearch, setRegionSearch] = useState('')
  const [regionOpen, setRegionOpen]     = useState(false)
  const regionRef = useRef<HTMLDivElement>(null)

  const [goalTemplateId, setGoalTemplateId] = useState<GoalCategory>(project?.goalTemplateId ?? 'armed-conflict')
  const goalLiveDefaults = liveTrackingForGoal(goalTemplateId)
  const [saved, setSaved]                   = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState(false)
  const [confirmReset, setConfirmReset]     = useState(false)
  const [resetDone, setResetDone]           = useState(false)
  const [cacheClearing, setCacheClearing]   = useState(false)
  const importBackupRef = useRef<HTMLInputElement>(null)
  const deepRelevanceFilter = useSettingsStore(s => s.deepRelevanceFilter)
  const setDeepRelevanceFilter = useSettingsStore(s => s.setDeepRelevanceFilter)
  const patternsEnabled = useSettingsStore(s => s.patternsEnabled)
  const setPatternsEnabled = useSettingsStore(s => s.setPatternsEnabled)
  const proMode = useSettingsStore(s => s.proMode)
  const setProMode = useSettingsStore(s => s.setProMode)

  // AI tab state
  const [aiMode, setAiMode]     = useState<'none' | 'cloud' | 'byok' | 'local'>(project?.aiMode ?? 'none')
  const [byokKey, setByokKey]   = useState(project?.byokApiKey ?? '')
  const [showKey, setShowKey]   = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  // Targeting state (broad↔specific) — committed live to the project.
  const [tScope, setTScope]     = useState<AnalysisScope>(project?.targeting?.scope ?? 'global')
  const [tPlace, setTPlace]     = useState(project?.targeting?.placeName ?? '')
  const [tKeywords, setTKeywords] = useState((project?.targeting?.keywords ?? []).join(', '))
  const [tEntities, setTEntities] = useState((project?.targeting?.watchEntities ?? []).join(', '))
  const [tKeyDate, setTKeyDate] = useState(project?.targeting?.keyDate ?? '')

  const parseList = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
  const beatPreview = useMemo(() => {
    if (!project) return []
    return topicWatchTerms({
      scope: tScope,
      placeName: tPlace.trim() || undefined,
      keywords: parseList(tKeywords),
      watchEntities: parseList(tEntities),
    }, regionIdsToCountryCodes(selectedRegionIds))
  }, [project, tScope, tPlace, tKeywords, tEntities, selectedRegionIds])

  const commitTargeting = (partial: Partial<{ scope: AnalysisScope; placeName: string; keywords: string; entities: string; keyDate: string }>) => {
    if (!project) return
    updateProject(project.id, { targeting: {
      scope: partial.scope ?? tScope,
      placeName: (partial.placeName ?? tPlace).trim() || undefined,
      keywords: parseList(partial.keywords ?? tKeywords),
      watchEntities: parseList(partial.entities ?? tEntities),
      keyDate: (partial.keyDate ?? tKeyDate) || undefined,
    } })
  }

  const targetingDraftRef = useRef({ tScope, tPlace, tKeywords, tEntities, tKeyDate })
  targetingDraftRef.current = { tScope, tPlace, tKeywords, tEntities, tKeyDate }
  const targetingTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const flushTargeting = useCallback(() => {
    if (!project) return
    if (targetingTimerRef.current) {
      clearTimeout(targetingTimerRef.current)
      targetingTimerRef.current = undefined
    }
    const t = targetingDraftRef.current
    updateProject(project.id, { targeting: {
      scope: t.tScope,
      placeName: t.tPlace.trim() || undefined,
      keywords: parseList(t.tKeywords),
      watchEntities: parseList(t.tEntities),
      keyDate: t.tKeyDate || undefined,
    } })
  }, [project, updateProject])

  const scheduleTargeting = useCallback(() => {
    if (targetingTimerRef.current) clearTimeout(targetingTimerRef.current)
    targetingTimerRef.current = setTimeout(flushTargeting, 400)
  }, [flushTargeting])

  useEffect(() => () => {
    if (targetingTimerRef.current) {
      clearTimeout(targetingTimerRef.current)
      targetingTimerRef.current = undefined
    }
    const p = useProjectStore.getState().getActiveProject()
    if (!p) return
    const t = targetingDraftRef.current
    useProjectStore.getState().updateProject(p.id, {
      targeting: {
        scope: t.tScope,
        placeName: t.tPlace.trim() || undefined,
        keywords: parseList(t.tKeywords),
        watchEntities: parseList(t.tEntities),
        keyDate: t.tKeyDate || undefined,
      },
    })
  }, [])

  useEffect(() => {
    if (project) {
      setName(project.name)
      setSelectedRegionIds(initRegionIds(project.countryCodes ?? [], project.regionName))
      setGoalTemplateId(project.goalTemplateId ?? 'armed-conflict')
      setAiMode(project.aiMode)
      setByokKey(project.byokApiKey ?? '')
      setTScope(project.targeting?.scope ?? 'global')
      setTPlace(project.targeting?.placeName ?? '')
      setTKeywords((project.targeting?.keywords ?? []).join(', '))
      setTEntities((project.targeting?.watchEntities ?? []).join(', '))
      setTKeyDate(project.targeting?.keyDate ?? '')
    }
  }, [project])

  // Close region dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(e.target as Node)) {
        setRegionOpen(false)
        setRegionSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const toggleRegion = (id: string) =>
    setSelectedRegionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const saveProject = () => {
    if (!project) return
    const sel = REGION_OPTIONS.filter(r => selectedRegionIds.includes(r.id))
    const regionName = sel.map(r => r.name).join(', ') || project.regionName
    const countryCodes = regionIdsToCountryCodes(selectedRegionIds)
    const nextLive = liveLayersAfterGoalChange(
      liveLayers,
      project.goalTemplateId,
      goalTemplateId,
    )
    const livePatch =
      nextLive.vessels !== liveLayers.vessels
      || nextLive.aviation !== liveLayers.aviation
      || nextLive.coverage !== liveLayers.coverage
        ? { liveLayers: nextLive }
        : {}
    const updates = {
      name: name.trim(),
      regionName,
      countryCodes,
      goalTemplateId,
      ...livePatch,
    }
    updateProject(project.id, updates)
    syncProjectLiveTracking({ ...project, ...updates, liveLayers: nextLive })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const saveAI = () => {
    if (!project) return
    updateProject(project.id, { aiMode, byokApiKey: byokKey.trim() || undefined })
    saveAnalysisEngine(aiMode === 'none' ? 'rules' : 'ai')
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  const handleDelete = () => {
    if (!project) return
    deleteProject(project.id)
    closeProject()
    router.push('/')
  }

  const canSave = name.trim().length >= 2

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'project', label: 'Essentials', icon: Globe },
    { key: 'app', label: 'Preferences', icon: Target },
    { key: 'ai', label: 'Pro', icon: Cpu },
    { key: 'keys' as Tab, label: 'Integrations', icon: Database },
    { key: 'help', label: 'Help', icon: HelpCircle },
  ]

  // ── Region selector helpers ──────────────────────────────────────────────
  const q = regionSearch.toLowerCase()
  const filteredMacros = REGION_OPTIONS.filter(
    r => r.type === 'macro' && (!q || r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q))
  )
  const filteredCountries = REGION_OPTIONS.filter(
    r => r.type === 'country' && (!q || r.name.toLowerCase().includes(q) || r.group.toLowerCase().includes(q))
  )

  // Group countries by region when not searching
  const countryGroups: Record<string, RegionOption[]> = {}
  filteredCountries.forEach(c => {
    if (!countryGroups[c.group]) countryGroups[c.group] = []
    countryGroups[c.group].push(c)
  })
  const sortedCountryGroups = GROUP_ORDER.filter(g => countryGroups[g]?.length)

  return (
    <div className="ui-modal-overlay" onClick={handleClose}>
      <div
        className={`ui-modal--md ui-command-palette panel-slide-in${closing ? ' panel-closing' : ''}`}
        style={{ maxHeight: 'min(84vh, 84dvh)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="ui-panel-header" style={{ paddingBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <div>
              <div className="ui-kicker" style={{ marginBottom: 4 }}>Settings</div>
              <div className="ui-title ui-title--panel">Your workspace</div>
              {project && <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>{project.name}</p>}
            </div>
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>

          <div className="ui-panel-tabs ui-feed-tabs">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={`ui-feed-tab${tab === key ? ' ui-feed-tab--active' : ''}`}
                onClick={() => setTab(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px' }}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="ui-panel-body" style={{ padding: '20px 24px' }}>

          {/* PROJECT TAB */}
          {tab === 'project' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!project && (
                <div className="ui-panel-empty">
                  <div className="ui-panel-empty__title">No active project</div>
                  <p className="ui-feed-hint">Open a project to edit its settings.</p>
                </div>
              )}

              {project && (
                <>
                  <Field label="Project Name" hint="Must be at least 2 characters">
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="ui-input"
                    />
                  </Field>

                  {/* ── Live tracking layers (hidden while the liveTracking flag is off) ── */}
                  {FEATURES.liveTracking && (
                  <Field label="Live Tracking" hint="Mission type sets defaults. Enable only the feeds you need — each layer uses a case-appropriate map filter (air vs maritime).">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {([['vessels', 'Vessels'], ['aviation', 'Aircraft']] as const).map(([key, lbl]) => {
                          const on = liveLayers[key]
                          const isDefault = goalLiveDefaults[key] === on
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setLive({ [key]: !on } as Partial<typeof liveLayers>)}
                              className={`ui-settings-toggle${on ? ' ui-settings-toggle--on' : ''}`}
                              title={isDefault ? 'Default for this mission type' : 'Custom override'}
                            >
                              {on ? '● ' : '○ '}{lbl}
                            </button>
                          )
                        })}
                      </div>
                      {(!goalLiveDefaults.vessels && liveLayers.vessels) || (!goalLiveDefaults.aviation && liveLayers.aviation) ? (
                        <div className="ui-callout" style={{ fontSize: 10, lineHeight: 1.5 }}>
                          Manual override active — layers stay on even when not default for this mission.
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {([['focused', 'Focused', 'chokepoints & conflict zones'], ['global', 'Global', 'whole world · heavier']] as const).map(([cov, lbl, desc]) => {
                          const sel = liveLayers.coverage === cov
                          const disabled = !liveLayers.vessels && !liveLayers.aviation
                          return (
                            <button
                              key={cov}
                              type="button"
                              disabled={disabled}
                              onClick={() => setLive({ coverage: cov })}
                              title={desc}
                              className={`ui-settings-toggle ui-settings-toggle--sm${sel ? ' ui-settings-toggle--warn-on' : ''}`}
                              style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
                            >
                              <div>{lbl}</div>
                              <div style={{ fontSize: 8, fontWeight: 400, color: 'var(--text-muted)' }}>{desc}</div>
                            </button>
                          )
                        })}
                      </div>
                      {liveLayers.coverage === 'global' && (
                        <div className="ui-callout ui-callout--warn" style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 10, lineHeight: 1.5 }}>
                          <AlertTriangle size={12} style={{ color: 'var(--high)', flexShrink: 0, marginTop: 1 }} />
                          <div>
                            Global pulls the whole world — thousands more markers, so the map runs heavier. It also can&apos;t show literally every craft: only transponder-equipped ones in coverage. Real vessels need an AIS key; global aircraft use OpenSky (rate-limited).
                          </div>
                        </div>
                      )}
                    </div>
                  </Field>
                  )}

                  {/* ── Your topic (aimed search + alerts) ── */}
                  <Field label="Your topic" hint="Pulls on-topic Google News, powers Your Topic panel, and beat alerts">
                    <div className="ui-callout" style={{ marginBottom: 10, fontSize: 11 }}>
                      Put <strong>entities</strong> (Hezbollah, Netanyahu) and <strong>country names</strong> (Israel, Lebanon) here.
                      Generic words like coup or cabinet match news worldwide — only use those with a focus place.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="ui-input" value={tEntities} onChange={e => { setTEntities(e.target.value); scheduleTargeting() }} onBlur={flushTargeting}
                        placeholder="Entities — comma separated (Hezbollah, Netanyahu)" />
                      <input className="ui-input" value={tKeywords} onChange={e => { setTKeywords(e.target.value); scheduleTargeting() }} onBlur={flushTargeting}
                        placeholder="Keywords — prefer place/country names (Israel, Gaza, Lebanon)" />
                      <input className="ui-input" value={tPlace} onChange={e => { setTPlace(e.target.value); scheduleTargeting() }} onBlur={flushTargeting}
                        placeholder="Focus place (optional) — e.g. Gaza, Beirut" />
                      {beatPreview.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Will watch:</span>
                          {beatPreview.map(t => <span key={t} className="ui-chip ui-chip--accent">{t}</span>)}
                        </div>
                      )}
                      <div>
                        <div className="ui-section-label" style={{ marginBottom: 6 }}>Feed breadth</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {([['global', 'Global'], ['regional', 'Regional'], ['country', 'Country'], ['local', 'Local']] as const).map(([sc, lbl]) => {
                            const sel = tScope === sc
                            return (
                              <button key={sc} type="button" onClick={() => { setTScope(sc); commitTargeting({ scope: sc }) }}
                                className={`ui-btn ${sel ? 'ui-btn--primary' : 'ui-btn--ghost'}`}
                                style={{ flex: 1, fontSize: 10, padding: '6px 4px' }}>
                                {lbl}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <input type="date" value={tKeyDate} onChange={e => { setTKeyDate(e.target.value); commitTargeting({ keyDate: e.target.value }) }}
                        className="ui-input" style={{ width: 'auto' }} title="Key date for time-weighting (optional)" />
                    </div>
                  </Field>

                  <Field
                    label="Brief evidence mode"
                    hint="Controls which events become [E#] citations in AI project briefs. Curated = journal saves only. Blended = journal first + up to 30 supplemental live events. Live = all live events (capped at 80 highest-severity items)."
                  >
                    <SegControl<BriefEvidenceMode>
                      size="sm"
                      value={project.briefEvidenceMode ?? 'blended'}
                      onChange={mode => updateProject(project.id, { briefEvidenceMode: mode })}
                      options={[
                        { value: 'blended', label: 'Journal + live' },
                        { value: 'curated', label: 'Journal only' },
                        { value: 'live', label: 'Live feed' },
                      ]}
                    />
                  </Field>

                  <Field
                    label="Live feed retention"
                    hint="GDELT and global RSS drop from the map after this window. Saved and journal events stay until you delete them. Topic-pull rows use their own 7-day project TTL."
                  >
                    <SegControl<LiveFeedRetention>
                      size="sm"
                      value={project.liveFeedRetention ?? '48h'}
                      onChange={r => {
                        updateProject(project.id, { liveFeedRetention: r })
                        const pruned = filterIntelByRetention(useMapStore.getState().events, r)
                        setEvents(pruned)
                        pruneExpiredEvents(project.id)
                      }}
                      options={[
                        { value: '6h', label: '6h' },
                        { value: '24h', label: '24h' },
                        { value: '48h', label: '48h' },
                        { value: '7d', label: '7d' },
                        { value: '30d', label: '30d' },
                      ]}
                    />
                  </Field>

                  {/* ── Region Scope selector ── */}
                  <Field label="Region Scope" hint="Scopes AI analysis · select multiple regions or countries">
                    <div ref={regionRef} style={{ position: 'relative' }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setRegionOpen(v => !v)}
                        onKeyDown={e => e.key === 'Enter' && setRegionOpen(v => !v)}
                        className={`wizard-region-trigger${regionOpen ? ' wizard-region-trigger--open' : ''}`}
                      >
                        {selectedRegionIds.length === 0 && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                            Search and select regions or countries...
                          </span>
                        )}
                        {selectedRegionIds.map(id => {
                          const r = REGION_OPTIONS.find(o => o.id === id)
                          if (!r) return null
                          const isMacro = r.type === 'macro'
                          return (
                            <span key={id} className={`ui-region-tag${isMacro ? ' ui-region-tag--macro' : ' ui-region-tag--country'}`}>
                              {r.name}
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); toggleRegion(id) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', marginLeft: 1, display: 'flex', alignItems: 'center' }}
                              >
                                <X size={9} />
                              </button>
                            </span>
                          )
                        })}
                        <span style={{ marginLeft: 'auto', paddingLeft: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          {regionOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </span>
                      </div>

                      {regionOpen && (
                        <div className="wizard-region-dropdown" style={{ zIndex: 10, position: 'relative' }}>
                          <div className="wizard-region-search">
                            <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <input
                              autoFocus
                              value={regionSearch}
                              onChange={e => setRegionSearch(e.target.value)}
                              placeholder="Search regions or countries..."
                              onClick={e => e.stopPropagation()}
                            />
                            {regionSearch && (
                              <button type="button" onClick={() => setRegionSearch('')} className="ui-btn ui-btn--ghost" style={{ padding: 0, minWidth: 0 }}>
                                <X size={11} />
                              </button>
                            )}
                          </div>

                          <div className="wizard-region-list" style={{ maxHeight: 260 }}>
                            {/* Macro Regions section */}
                            {filteredMacros.length > 0 && (
                              <>
                                <div style={{ padding: '6px 10px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-elevated)', borderBottom: '1px solid var(--border)' }}>
                                  <Globe size={9} /> Macro Regions
                                </div>
                                {filteredMacros.map(r => {
                                  const sel = selectedRegionIds.includes(r.id)
                                  return (
                                    <div
                                      key={r.id}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => toggleRegion(r.id)}
                                      onKeyDown={e => e.key === 'Enter' && toggleRegion(r.id)}
                                      className={`wizard-region-row${sel ? ' wizard-region-row--selected' : ''}`}
                                    >
                                      <div style={{ width: 14, height: 14, borderRadius: 'var(--radius-sm)', border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {sel && <Check size={9} color="white" strokeWidth={3} />}
                                      </div>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: sel ? 700 : 400, color: sel ? 'var(--accent)' : 'var(--text-primary)' }}>{r.name}</div>
                                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{r.group} · {r.codes.length} countries</div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </>
                            )}

                            {/* Countries section */}
                            {filteredCountries.length > 0 && (
                              <>
                                <div style={{ padding: '6px 10px 4px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface-elevated)', borderBottom: '1px solid var(--border)', borderTop: filteredMacros.length > 0 ? '2px solid var(--border)' : undefined }}>
                                  <MapPin size={9} /> Individual Countries
                                </div>
                                {sortedCountryGroups.map(group => (
                                  <div key={group}>
                                    {!q && (
                                      <div style={{ padding: '4px 12px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'var(--surface-elevated)', opacity: 0.7 }}>
                                        {group}
                                      </div>
                                    )}
                                    {countryGroups[group].map(r => {
                                      const sel = selectedRegionIds.includes(r.id)
                                      return (
                                        <div
                                          key={r.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => toggleRegion(r.id)}
                                          onKeyDown={e => e.key === 'Enter' && toggleRegion(r.id)}
                                          className={`wizard-region-row${sel ? ' wizard-region-row--selected' : ''}`}
                                          style={{ padding: '6px 12px' }}
                                        >
                                          <div style={{ width: 14, height: 14, borderRadius: 'var(--radius-sm)', border: `1.5px solid ${sel ? 'var(--low)' : 'var(--border)'}`, background: sel ? 'var(--low)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            {sel && <Check size={9} color="white" strokeWidth={3} />}
                                          </div>
                                          <div style={{ fontSize: 12, fontWeight: sel ? 700 : 400, color: sel ? 'var(--low)' : 'var(--text-primary)' }}>{r.name}</div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                ))}
                              </>
                            )}

                            {filteredMacros.length === 0 && filteredCountries.length === 0 && (
                              <div className="ui-panel-empty" style={{ padding: '20px 12px' }}>
                                <p className="ui-feed-hint">No results for &ldquo;{regionSearch}&rdquo;</p>
                              </div>
                            )}
                          </div>

                          {/* Footer */}
                          {selectedRegionIds.length > 0 && (
                            <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-elevated)' }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                {selectedRegionIds.length} selected · {[...new Set(REGION_OPTIONS.filter(r => selectedRegionIds.includes(r.id)).flatMap(r => r.codes))].length} countries
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedRegionIds([])}
                                className="ui-link"
                                style={{ fontSize: 10, color: 'var(--badge-red-fg)', fontWeight: 600 }}
                              >
                                Clear all
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Map view lock — separate from region selector */}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => {
                          if (!project) return
                          updateProject(project.id, {
                            regionCenter: [viewport.longitude, viewport.latitude],
                            regionZoom: viewport.zoom,
                          })
                        }}
                        style={{
                          fontSize: 10, padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                          background: 'var(--surface-elevated)', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <Target size={10} /> Lock to current map view
                      </button>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {viewport.latitude.toFixed(2)}°, {viewport.longitude.toFixed(2)}° · zoom {viewport.zoom.toFixed(1)}
                      </span>
                    </div>
                  </Field>

                  <Field label="Analysis Goal" hint="Changing goal updates suggested formulas">
                    <div className="wizard-goal-grid">
                      {GOAL_TEMPLATES.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setGoalTemplateId(t.category)}
                          className={`wizard-goal-btn${goalTemplateId === t.category ? ' wizard-goal-btn--active' : ''}`}
                          style={{ fontSize: 11, color: goalTemplateId === t.category ? undefined : 'var(--text-secondary)' }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      disabled={!canSave}
                      onClick={saveProject}
                      className="ui-btn ui-btn--primary"
                      style={{ alignSelf: 'flex-start', ...(saved ? { background: 'var(--low)' } : {}) }}
                    >
                      {saved ? <Check size={13} /> : <Save size={13} />}
                      {saved ? 'Saved' : 'Save Changes'}
                    </button>
                  </div>

                  <div className="ui-danger-zone">
                    <div className="ui-danger-zone__label">Danger Zone</div>

                    <div style={{ marginBottom: 10 }}>
                      {!confirmReset ? (
                        <button type="button" onClick={() => setConfirmReset(true)} className="ui-danger-btn ui-danger-btn--warn">
                          <AlertTriangle size={12} /> Reset Project Data
                        </button>
                      ) : (
                        <div className="ui-danger-panel ui-danger-panel--warn">
                          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <AlertTriangle size={14} style={{ color: 'var(--high)', flexShrink: 0 }} />
                            <div style={{ fontSize: 11, color: 'var(--high-text)', lineHeight: 1.5 }}>
                              This will clear all events, alerts, and situations from the current session. Project settings are preserved.
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setEvents([])
                                setAlerts([])
                                setSituations([])
                                setConfirmReset(false)
                                setResetDone(true)
                                setTimeout(() => setResetDone(false), 2000)
                              }}
                              className="ui-btn ui-btn--primary"
                              style={{ fontSize: 11, fontWeight: 700, padding: '6px 14px', background: 'var(--high)', border: 'none' }}
                            >
                              {resetDone ? 'Cleared' : 'Clear All Data'}
                            </button>
                            <button type="button" onClick={() => setConfirmReset(false)} className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '6px 14px' }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {!confirmDelete ? (
                      <button type="button" onClick={() => setConfirmDelete(true)} className="ui-danger-btn ui-danger-btn--critical">
                        <Trash2 size={12} /> Delete Project
                      </button>
                    ) : (
                      <div className="ui-danger-panel ui-danger-panel--critical">
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <AlertTriangle size={14} style={{ color: 'var(--critical)', flexShrink: 0 }} />
                          <div style={{ fontSize: 11, color: 'var(--critical)', lineHeight: 1.5 }}>
                            This will permanently delete <strong>{project.name}</strong> including all events, formula runs, and predictions. This cannot be undone.
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" onClick={handleDelete} className="ui-btn ui-btn--primary" style={{ fontSize: 11, fontWeight: 700, padding: '6px 14px', background: 'var(--critical)', border: 'none' }}>
                            Delete Forever
                          </button>
                          <button type="button" onClick={() => setConfirmDelete(false)} className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '6px 14px' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI TAB */}
          {tab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                padding: '12px 14px', borderRadius: 'var(--radius-md)',
                background: 'color-mix(in srgb, var(--accent) 8%, var(--surface-elevated))',
                border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border))',
                fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>Rules and AI are both always available.</strong>{' '}
                Use the <strong>Rules | AI ✦</strong> toggle on the map query bar and canvas toolbar to switch per action.
                Rule-based mode costs nothing; AI uses API credits when keys are configured below.
              </div>

              <Field label="Project default" hint="Starting mode when you open NLQ, briefs, or ACH — override anytime from the toolbar">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {([
                    { id: 'none', label: 'Rule-based (Rules)', desc: 'Keyword filters, template briefs, heuristic ACH — no API spend.' },
                    { id: 'cloud', label: 'AI-assisted — Cloud', desc: 'Narrative synthesis via server API keys (.env or vault).' },
                    { id: 'byok', label: 'AI-assisted — Your key', desc: 'Per-project OpenAI/Anthropic key override.' },
                    { id: 'local', label: 'AI-assisted — Local (Ollama)', desc: 'Run Llama / Mistral locally — no external API calls.' },
                  ] as { id: typeof aiMode; label: string; desc: string }[]).map(m => (
                    <label
                      key={m.id}
                      className={`ui-settings-option${aiMode === m.id ? ' ui-settings-option--selected' : ''}`}
                    >
                      <input type="radio" name="aiMode" value={m.id} checked={aiMode === m.id} onChange={() => setAiMode(m.id)} style={{ accentColor: 'var(--accent)', marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{m.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>{m.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </Field>

              {aiMode === 'byok' && (
                <Field label="API Key" hint="Optional per-project override — otherwise the vault key (API Keys tab) is used">
                  <div className="ui-input-wrap ui-input-wrap--action">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={byokKey}
                      onChange={e => setByokKey(e.target.value)}
                      placeholder="sk-... or sk-ant-..."
                      className="ui-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(v => !v)}
                      className="ui-input-wrap__clear"
                      style={{ right: 10 }}
                    >
                      {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-muted)' }}>
                    OpenAI: <code style={{ fontFamily: 'monospace' }}>sk-proj-...</code> · Anthropic: <code style={{ fontFamily: 'monospace' }}>sk-ant-api03-...</code>
                  </div>
                </Field>
              )}

              {aiMode === 'local' && (
                <div style={{ padding: '12px 14px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong>Ollama setup:</strong> Install <code style={{ fontFamily: 'monospace', fontSize: 10 }}>ollama</code>, then run <code style={{ fontFamily: 'monospace', fontSize: 10 }}>ollama pull llama3.1</code>. ARGUS will call <code style={{ fontFamily: 'monospace', fontSize: 10 }}>localhost:11434</code> automatically.
                </div>
              )}

              <button
                type="button"
                onClick={saveAI}
                className="ui-btn ui-btn--primary"
                style={{ alignSelf: 'flex-start', ...(keySaved ? { background: 'var(--low)' } : {}) }}
              >
                {keySaved ? <Check size={13} /> : <Key size={13} />}
                {keySaved ? 'Saved' : 'Save AI Settings'}
              </button>
            </div>
          )}

          {/* APP TAB */}
          {tab === 'app' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Field label="Keyboard Shortcuts">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { keys: '⌘K', desc: 'Open command bar / search' },
                    { keys: 'Esc', desc: 'Close all panels' },
                    { keys: '⌘,', desc: 'Open settings' },
                  ].map(({ keys, desc }) => (
                    <div key={keys} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</span>
                      <kbd className="ui-kbd">{keys}</kbd>
                    </div>
                  ))}
                </div>
              </Field>

              <Field label="Analyst tools" hint="Show velocity, ledger, incidents, and more in the ⋯ menu." stack>
                <SegControl<'off' | 'on'>
                  size="sm"
                  className="ui-seg-control--fluid"
                  value={proMode ? 'on' : 'off'}
                  onChange={v => setProMode(v === 'on')}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' },
                  ]}
                />
              </Field>

              <Field label="Pattern recognition" hint="Pattern scans, Research alerts, and brief pattern notes." stack>
                <SegControl<'off' | 'on'>
                  size="sm"
                  className="ui-seg-control--fluid"
                  value={patternsEnabled ? 'on' : 'off'}
                  onChange={v => setPatternsEnabled(v === 'on')}
                  options={[
                    { value: 'on', label: 'On' },
                    { value: 'off', label: 'Off' },
                  ]}
                />
              </Field>

              <Field label="Live feed relevance" hint="Keyword rules are the default (fast). Deep filter uses AI embeddings when keys are set — heavier on CPU/network." stack>
                <SegControl<'off' | 'on'>
                  size="sm"
                  className="ui-seg-control--fluid"
                  value={deepRelevanceFilter ? 'on' : 'off'}
                  onChange={v => setDeepRelevanceFilter(v === 'on')}
                  options={[
                    { value: 'on', label: 'Deep filter ✦' },
                    { value: 'off', label: 'Keyword rules (faster)' },
                  ]}
                />
              </Field>

              <Field label="Project backup" hint="Export all workspaces to JSON, or import a previous backup. Safe to run anytime.">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => downloadProjectBackup(useProjectStore.getState().projects)}
                  >
                    <Database size={12} /> Export all projects
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    style={{ fontSize: 11 }}
                    onClick={() => importBackupRef.current?.click()}
                  >
                    Import backup
                  </button>
                  <input
                    ref={importBackupRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      void f.text().then(text => {
                        const imported = parseProjectBackup(text)
                        const merged = mergeProjectImports(useProjectStore.getState().projects, imported)
                        useProjectStore.setState({ projects: merged })
                      }).catch(() => {})
                      e.target.value = ''
                    }}
                  />
                </div>
              </Field>

              {!IS_CLOUD_MODE && isSupabaseConfigured() && (
                <Field label="Cloud backup" hint="Sign in on the home page with GitHub to sync projects to Supabase while keeping local mode.">
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Supabase is configured — use <strong>Back up to cloud</strong> on the workbench home screen.
                  </span>
                </Field>
              )}

              <Field label="Performance & cache" hint="Clears NLQ, relevance, and API caches. Projects and settings are kept. Page reloads automatically.">
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost"
                  style={{ alignSelf: 'flex-start', fontSize: 11 }}
                  disabled={cacheClearing}
                  onClick={async () => {
                    setCacheClearing(true)
                    await clearClientCachesAndReload()
                  }}
                >
                  <Database size={12} />
                  {cacheClearing ? 'Clearing…' : 'Clear cache & reload'}
                </button>
              </Field>

              <Field label="About">
                <div className="ui-callout">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Version</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>1.0.0</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Edition</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Web / Desktop</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Built by</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>Zachary Adam &amp; Maaz Ahmad</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Studio</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Shama Research</span>
                  </div>
                </div>
              </Field>
            </div>
          )}

          {/* KEYS TAB — one universal catalog for every integration */}
          {tab === 'keys' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                All keys in one place. Nothing is required to start — free map + rules briefs work with zero keys.
                Server keys need <code style={{ fontFamily: 'monospace', fontSize: 10 }}>VAULT_MASTER_KEY</code> in <code style={{ fontFamily: 'monospace', fontSize: 10 }}>.env.local</code>.
                Supabase is for hosted apps only (accounts / sync).
                {' '}See the <button type="button" className="ui-btn ui-btn--ghost" style={{ fontSize: 11, padding: '0 4px', display: 'inline' }} onClick={() => setTab('help')}>Help</button> tab for signup links, or{' '}
                <a href="https://shamaresearch.com/argus/help.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)' }}>shamaresearch.com/argus/help</a>.
              </div>
              {IS_CLOUD_MODE && (
                <>
                  <CloudKeySection />
                  <div style={{ borderTop: '1px solid var(--border)' }} />
                </>
              )}
              {KEY_SECTIONS.map((sec, i) => (
                <div key={sec.id}>
                  {i > 0 && <div style={{ borderTop: '1px solid var(--border)', marginBottom: 28 }} />}
                  <VaultKeySection title={sec.title} blurb={sec.blurb} fields={sec.fields} />
                </div>
              ))}
            </div>
          )}

          {tab === 'help' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22, fontSize: 12, lineHeight: 1.55, color: 'var(--text-muted)' }}>
              <div>
                <div className="ui-section-label" style={{ marginBottom: 8 }}>Nothing required</div>
                <p style={{ margin: 0 }}>
                  Free OpenStreetMap basemap (MapLibre). Rules-based briefs and trust grades. Add keys only for richer search, AI drafts, conflict feeds, or live tracks.
                </p>
                <p style={{ margin: '10px 0 0' }}>
                  Full guide:{' '}
                  <a href="https://shamaresearch.com/argus/help.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text)' }}>
                    shamaresearch.com/argus/help
                  </a>
                </p>
              </div>
              <div>
                <div className="ui-section-label" style={{ marginBottom: 8 }}>Recommended first</div>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li><strong style={{ color: 'var(--text)' }}>Serper</strong> — aimed / niche web collect</li>
                  <li><strong style={{ color: 'var(--text)' }}>Brave</strong> — complement or alternative search</li>
                  <li><strong style={{ color: 'var(--text)' }}>Anthropic or OpenAI</strong> — only if you want AI briefs</li>
                </ol>
              </div>
              {KEY_SECTIONS.map(sec => (
                <div key={sec.id}>
                  <div className="ui-section-label" style={{ marginBottom: 6 }}>{sec.title}</div>
                  <p style={{ margin: '0 0 10px', fontSize: 11 }}>{sec.blurb}</p>
                  <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sec.fields.map(f => {
                      const href = HELP_SIGNUP[f.name]
                      return (
                        <li key={f.name} style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <div style={{ color: 'var(--text)', fontFamily: 'monospace', fontSize: 11 }}>{f.name}</div>
                          <div style={{ marginTop: 4 }}>{f.hint}</div>
                          {href && (
                            <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 4, color: 'var(--text)', fontSize: 11 }}>
                              Get key →
                            </a>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
              <div>
                <div className="ui-section-label" style={{ marginBottom: 8 }}>Where to put keys</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li><code style={{ fontFamily: 'monospace', fontSize: 10 }}>.env.local</code> then restart (best for Serper / AI / ACLED)</li>
                  <li>Settings → Integrations (needs <code style={{ fontFamily: 'monospace', fontSize: 10 }}>VAULT_MASTER_KEY</code>)</li>
                  <li>Never commit <code style={{ fontFamily: 'monospace', fontSize: 10 }}>.env.local</code> or <code style={{ fontFamily: 'monospace', fontSize: 10 }}>.vault.enc.json</code></li>
                </ul>
              </div>
              <p style={{ margin: 0, fontSize: 11 }}>
                ARGUS by <strong style={{ color: 'var(--text)' }}>Zachary Adam</strong> &amp;{' '}
                <strong style={{ color: 'var(--text)' }}>Maaz Ahmad</strong> · Shama Research
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, stack, children }: { label: string; hint?: string; stack?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className={`ui-field-head${stack ? ' ui-field-head--stack' : ''}`}>
        <div className="ui-section-label" style={{ marginBottom: 0 }}>{label}</div>
        {hint && <div className="ui-field-hint">{hint}</div>}
      </div>
      {children}
    </div>
  )
}
