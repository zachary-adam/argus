'use client'
import { useState, useCallback, useRef, useEffect, type ReactNode, type CSSProperties } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { toIntelEvent, deduplicateEvents } from '@/lib/normalize'
import { useEnrichEvents } from '@/lib/hooks/useEnrichEvents'
import { X, Search, Rss, Globe, Sparkles, ChevronRight, Loader, Check, Plus, RefreshCw, Zap, Radio, BookOpen, ClipboardList } from 'lucide-react'
import { detectBulk, DetectedEntity, TYPE_COLORS } from '@/lib/detectEntity'
import { detectedEntitiesToCanvasNodes } from '@/lib/iocToCanvas'
import { intelToUniversal } from '@/lib/eventPersist'
import { tagEphemeralRss, applyKeepToIntel, DEFAULT_RSS_MAP_RETENTION } from '@/lib/eventRetention'
import type { EventKeepDuration, LiveFeedRetention } from '@/types/project'
import { effectiveTargeting, isSituationRelevant } from '@/lib/relevance'
import { gateBySemanticRelevance } from '@/lib/relevanceClient'
import { getDeepRelevanceFilter } from '@/lib/relevanceMode'
import { buildAiFetchHeaders } from '@/lib/aiConfig'
import { loadAnalysisEngine } from '@/lib/aiMode'
import { GraphNodeType } from '@/types'

type Tab = 'discover' | 'ai' | 'search' | 'rss' | 'url' | 'paste'

interface SearchResult { title: string; url: string; snippet: string; domain: string }
interface ExtractedEvent { id: string; title: string; description: string; timestamp: string; location: { name: string; lat?: number; lng?: number; country?: string }; severity: string; source: { name: string; url?: string }; raw?: { body?: string; url?: string } }

function ls(k: string, fb = '') { try { return localStorage.getItem(k) ?? fb } catch { return fb } }

const SEV_VAR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
}
function sevVar(s: string) { return SEV_VAR[s] ?? 'var(--text-muted)' }

function SourceHint({ children, tall }: { children: ReactNode; tall?: boolean }) {
  return <p className={`ui-source-hint${tall ? ' ui-source-hint--tall' : ''}`}>{children}</p>
}
function SourceErr({ children }: { children: ReactNode }) {
  return <div className="ui-callout ui-callout--error" style={{ fontSize: 11 }}>{children}</div>
}
function SourceOk({ children }: { children: ReactNode }) {
  return <div className="ui-callout ui-callout--ok" style={{ fontSize: 11, fontWeight: 600 }}>{children}</div>
}
function SourceCheckbox({ checked, style }: { checked: boolean; style?: CSSProperties }) {
  return (
    <div className={`ui-source-checkbox${checked ? ' ui-source-checkbox--on' : ''}`} style={style}>
      {checked && <Check size={9} color="#fff" strokeWidth={3} />}
    </div>
  )
}

function KeepDurationChips({
  value,
  onChange,
  options = ['24h', '7d', '30d', 'forever'],
}: {
  value: EventKeepDuration
  onChange: (v: EventKeepDuration) => void
  options?: EventKeepDuration[]
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
      <span className="ui-section-label" style={{ marginBottom: 0, fontSize: 10 }}>Keep for</span>
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`ui-chip ui-chip--xs${value === opt ? ' ui-chip--accent' : ''}`}
        >
          {opt === 'forever' ? 'Forever' : opt}
        </button>
      ))}
    </div>
  )
}

// ── RSS Feed Catalogue ──────────────────────────────────────────────────────
const FEED_CATALOGUE: { name: string; url: string; tags: string[]; category: string }[] = [
  // Global News
  { name: 'Reuters World', url: 'https://feeds.reuters.com/reuters/worldNews', tags: ['global','news','politics','conflict','economy'], category: 'Global' },
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', tags: ['global','news','politics','conflict'], category: 'Global' },
  { name: 'AP News', url: 'https://rsshub.app/apnews/topics/apf-intlnews', tags: ['global','news','politics'], category: 'Global' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', tags: ['middle east','global','conflict','politics','arab'], category: 'Global' },
  { name: 'DW World', url: 'https://rss.dw.com/rdf/rss-en-world', tags: ['global','europe','politics','conflict'], category: 'Global' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', tags: ['global','europe','africa','politics'], category: 'Global' },
  { name: 'Voice of America', url: 'https://www.voanews.com/api/zmpqoppeiy', tags: ['global','news','politics','usa'], category: 'Global' },
  // Conflict & Security
  { name: 'Kyiv Independent', url: 'https://kyivindependent.com/feed/', tags: ['ukraine','russia','war','conflict','military','eastern europe'], category: 'Conflict' },
  { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/', tags: ['military','defense','conflict','weapons','navy','army'], category: 'Conflict' },
  { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/', tags: ['military','strategy','conflict','security','geopolitics'], category: 'Conflict' },
  { name: 'Just Security', url: 'https://www.justsecurity.org/feed/', tags: ['security','conflict','political','legal','international law'], category: 'Conflict' },
  { name: 'Bellingcat', url: 'https://www.bellingcat.com/feed/', tags: ['osint','conflict','investigation','russia','military','open source'], category: 'Conflict' },
  { name: 'ISW Institute', url: 'https://understandingwar.org/rss.xml', tags: ['ukraine','russia','war','conflict','military','isw'], category: 'Conflict' },
  // Geopolitics & Diplomacy
  { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/', tags: ['geopolitics','diplomacy','global','political','foreign'], category: 'Geopolitics' },
  { name: 'The Diplomat', url: 'https://thediplomat.com/feed/', tags: ['asia','diplomacy','geopolitics','china','india','pacific'], category: 'Geopolitics' },
  { name: 'CFR Global', url: 'https://www.cfr.org/rss.xml', tags: ['geopolitics','diplomacy','political','global','analysis'], category: 'Geopolitics' },
  { name: 'Chatham House', url: 'https://www.chathamhouse.org/rss.xml', tags: ['geopolitics','policy','political','global','diplomacy'], category: 'Geopolitics' },
  // Middle East
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss', tags: ['middle east','conflict','political','israel','iran','gulf','arab','palestine'], category: 'Middle East' },
  { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/', tags: ['israel','middle east','conflict','hamas','iran'], category: 'Middle East' },
  { name: 'Arab News', url: 'https://www.arabnews.com/rss.xml', tags: ['middle east','saudi','gulf','political','arab'], category: 'Middle East' },
  { name: 'Al-Monitor', url: 'https://www.al-monitor.com/rss', tags: ['middle east','turkey','iran','israel','political','conflict'], category: 'Middle East' },
  // Asia-Pacific
  { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', tags: ['china','asia','political','economic','hong kong','taiwan'], category: 'Asia' },
  { name: 'Nikkei Asia', url: 'https://asia.nikkei.com/rss/feed/nar', tags: ['asia','japan','economic','political','china','indo-pacific'], category: 'Asia' },
  { name: 'The Wire India', url: 'https://thewire.in/rss', tags: ['india','south asia','political','conflict','pakistan','kashmir'], category: 'Asia' },
  { name: 'Radio Free Asia', url: 'https://www.rfa.org/english/RSS', tags: ['china','asia','north korea','myanmar','uyghur','political'], category: 'Asia' },
  // Africa
  { name: 'AllAfrica', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', tags: ['africa','political','conflict','humanitarian','sahel'], category: 'Africa' },
  { name: 'The Africa Report', url: 'https://www.theafricareport.com/feed/', tags: ['africa','political','economic','conflict','sahel','east africa'], category: 'Africa' },
  { name: 'African Arguments', url: 'https://africanarguments.org/feed/', tags: ['africa','political','conflict','humanitarian','analysis'], category: 'Africa' },
  // Humanitarian
  { name: 'ReliefWeb', url: 'https://reliefweb.int/updates/rss.xml', tags: ['humanitarian','disaster','refugee','aid','crisis','famine'], category: 'Humanitarian' },
  { name: 'UNHCR News', url: 'https://www.unhcr.org/rss/news.xml', tags: ['refugee','humanitarian','displacement','asylum','crisis'], category: 'Humanitarian' },
  { name: 'MSF Updates', url: 'https://www.msf.org/rss.xml', tags: ['humanitarian','health','conflict','crisis','medical'], category: 'Humanitarian' },
  { name: 'ICRC', url: 'https://www.icrc.org/en/rss.xml', tags: ['humanitarian','conflict','war','prisoners','international law'], category: 'Humanitarian' },
  // Disasters & Environment
  { name: 'GDACS Alerts', url: 'https://www.gdacs.org/xml/rss.xml', tags: ['disaster','earthquake','flood','environmental','cyclone','tsunami'], category: 'Disasters' },
  { name: 'NASA Earth', url: 'https://earthobservatory.nasa.gov/feeds/earth-observatory.rss', tags: ['environmental','climate','disaster','wildfire','satellite'], category: 'Disasters' },
  // Economic & Finance
  { name: 'Financial Times', url: 'https://www.ft.com/?format=rss', tags: ['economic','finance','global','trade','markets','sanctions'], category: 'Economic' },
  { name: 'IMF News', url: 'https://www.imf.org/en/News/rss?language=ENG&categoryId=0', tags: ['economic','finance','crisis','global','debt','imf'], category: 'Economic' },
  // Health
  { name: 'WHO Outbreaks', url: 'https://www.who.int/feeds/entity/csr/don/en/rss.xml', tags: ['health','disease','outbreak','pandemic','virus','epidemic'], category: 'Health' },
  { name: 'ProMED', url: 'https://promedmail.org/feed/', tags: ['health','disease','outbreak','epidemic','biological'], category: 'Health' },
  // Analysis
  { name: 'IISS', url: 'https://www.iiss.org/en/online-analysis/rss', tags: ['security','military','conflict','geopolitics','nuclear','analysis'], category: 'Analysis' },
  { name: 'Crisis Group', url: 'https://www.crisisgroup.org/rss.xml', tags: ['conflict','geopolitics','humanitarian','analysis','peace','war'], category: 'Analysis' },
]

function scoreFeed(feed: { tags: string[] }, query: string): number {
  const q = query.toLowerCase()
  const words = q.match(/\b\w{3,}\b/g) ?? []
  let score = 0
  for (const tag of feed.tags) {
    if (q.includes(tag)) { score += 2; continue }
    if (words.some(w => tag.includes(w))) score += 1
  }
  return score
}

function getTopFeeds(query: string, limit = 8) {
  const scored = FEED_CATALOGUE.map(f => ({ ...f, score: scoreFeed(f, query) }))
  const matching = scored.filter(f => f.score > 0).sort((a, b) => b.score - a.score)
  if (matching.length >= limit) return matching.slice(0, limit)
  const defaults = scored.filter(f => f.score === 0 && ['Global', 'Geopolitics', 'Conflict'].includes(f.category))
  return [...matching, ...defaults].slice(0, limit)
}

export function IntelSourcePanel({ onClose }: { onClose: () => void }) {
  const togglePanel = useMapStore(s => s.togglePanel)
  const existingEvents = useMapStore(s => s.events)
  const setEvents = useMapStore(s => s.setEvents)
  const { getActiveProject, addEvents, addCustomSource, updateCustomSource } = useProjectStore()
  const project = getActiveProject()

  const [tab, setTab] = useState<Tab>('discover')

  const [searchEngine, setSearchEngine] = useState<'brave' | 'serper'>(() =>
    ls('argus_serper_key') ? 'serper' : 'brave'
  )

  // On mount, ask the server which engines are actually configured (vault / env).
  // This overrides the localStorage-only default so server-side keys are respected.
  useEffect(() => {
    fetch('/api/connectors/websearch')
      .then(r => r.json())
      .then((d: { serper?: boolean; brave?: boolean }) => {
        if (d.serper) setSearchEngine('serper')
        else if (d.brave) setSearchEngine('brave')
      })
      .catch(() => {})
  }, [])

  // Shared: source name + added count
  const [sourceName, setSourceName] = useState('')
  const [addedCount, setAddedCount] = useState(0)

  // AI enrichment
  const { enrichAll, enriching, progress, enrichedCount } = useEnrichEvents()

  // AI suggest state
  const [aiTopic, setAiTopic] = useState(() => project ? `${project.name} — ${project.regionName}` : '')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [suggestedQueries, setSuggestedQueries] = useState<string[]>([])
  const [selectedQueries, setSelectedQueries] = useState<Set<string>>(new Set())

  // Web search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchError, setSearchError] = useState('')
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())

  // Extraction state (used by search tab)
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0, domain: '' })
  const [extractedEvents, setExtractedEvents] = useState<ExtractedEvent[]>([])

  // RSS state
  const [feedUrl, setFeedUrl] = useState('')
  const [rssLoading, setRssLoading] = useState(false)
  const [rssEvents, setRssEvents] = useState<ExtractedEvent[]>([])
  const [rssSelected, setRssSelected] = useState<Set<number>>(new Set())
  const [rssError, setRssError] = useState('')
  const [rssInterval, setRssInterval] = useState(0) // minutes; 0 = off
  const [rssNewCount, setRssNewCount] = useState(0)
  const [rssKeepInProject, setRssKeepInProject] = useState(false)
  const [rssKeepDuration, setRssKeepDuration] = useState<EventKeepDuration>('7d')
  const [manualKeepDuration, setManualKeepDuration] = useState<EventKeepDuration>('forever')
  const rssIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Single URL scrape state
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scrapeLoading, setScrapeLoading] = useState(false)
  const [scrapeError, setScrapeError] = useState('')
  const [scrapeSuccess, setScrapeSuccess] = useState(false)
  const [scrapeEvents, setScrapeEvents] = useState<ExtractedEvent[]>([])
  const [scrapeMode, setScrapeMode] = useState<'ai' | 'basic' | null>(null)
  const aiKeyRef = useRef<boolean | null>(null)

  // Topic discovery query
  const [discoverQuery, setDiscoverQuery] = useState(() => project ? `${project.name} ${project.regionName}` : '')

  // Paste / bulk import state
  const [pasteText, setPasteText] = useState('')
  const [pasteDetected, setPasteDetected] = useState<DetectedEntity[]>([])
  const [pasteOverrides, setPasteOverrides] = useState<Record<number, GraphNodeType>>({})
  const [pasteAdded, setPasteAdded] = useState(0)
  const [pasteMode, setPasteMode] = useState<'ioc' | 'article'>('ioc')

  // Paste article text → AI multi-event extraction state
  const [articleLoading, setArticleLoading] = useState(false)
  const [articleError, setArticleError] = useState('')
  const [articleEvents, setArticleEvents] = useState<ExtractedEvent[]>([])
  const [articleAdded, setArticleAdded] = useState(0)
  const [articleAiReady, setArticleAiReady] = useState<boolean | null>(null)

  const [showAllCategories, setShowAllCategories] = useState(false)

  // ── RSS auto-sync ────────────────────────────────────────────────────────
  useEffect(() => {
    if (rssIntervalRef.current) { clearInterval(rssIntervalRef.current); rssIntervalRef.current = null }
    if (!rssInterval || !feedUrl.trim()) return
    rssIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/connectors/rss', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedUrl }),
        })
        const data = await res.json()
        const fresh: ExtractedEvent[] = data.events ?? []
        const existingIds = new Set(existingEvents.map((e: any) => e.id))
        const newOnes = fresh.filter(e => !existingIds.has(e.id))
        if (newOnes.length > 0) setRssNewCount(n => n + newOnes.length)
      } catch {}
    }, rssInterval * 60 * 1000)
    return () => { if (rssIntervalRef.current) clearInterval(rssIntervalRef.current) }
  }, [rssInterval, feedUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const [closing, setClosing] = useState(false)
  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, 150)
  }, [onClose])

  // ── Add events to map (+ optional project persist) ───────────────────────
  async function addEventsToMap(
    evs: ExtractedEvent[],
    customSource?: string,
    clearAfter?: 'rss' | 'search',
    sourceUrl?: string,
    sourceType?: 'rss' | 'scrape',
    opts?: { persist?: boolean; keepDuration?: EventKeepDuration },
  ) {
    const src = (customSource?.trim() || sourceName.trim()) || undefined
    const normalized = evs.map(e => ({
      ...e,
      source: { ...e.source, ...(src ? { name: src } : {}) },
    })) as any[]
    const deduped = deduplicateEvents(normalized, existingEvents as any)
    let intelEvents = deduped.map(e => toIntelEvent(e, src))

    // Semantic relevance gate on manual ingests (RSS, scrape, web search) — same
    // meaning-based brain as the live feed, so analysts don't paste keyword noise.
    let filteredOut = 0
    if (project && intelEvents.length > 0) {
      const targeting = effectiveTargeting(project)
      const hasMission = targeting && (
        (targeting.keywords?.length ?? 0) > 0
        || (targeting.watchEntities?.length ?? 0) > 0
        || !!targeting.placeName?.trim()
      )
      if (hasMission) {
        const before = intelEvents.length
        if (getDeepRelevanceFilter()) {
          intelEvents = await gateBySemanticRelevance(intelEvents, {
            targeting,
            countryCodes: project.countryCodes,
            researchQuestion: project.researchQuestion,
          })
        } else {
          intelEvents = intelEvents.filter(e =>
            isSituationRelevant(e, targeting, project.countryCodes),
          )
        }
        filteredOut = before - intelEvents.length
      }
    }

    if (intelEvents.length > 0) {
      const isRss = sourceType === 'rss'
      const persist = opts?.persist ?? !isRss
      const keepDuration = opts?.keepDuration ?? (isRss ? rssKeepDuration : manualKeepDuration)
      const rssRetention: LiveFeedRetention = (() => {
        if (!isRss || !sourceUrl || !project) return DEFAULT_RSS_MAP_RETENTION
        return (project.customSources ?? []).find(cs => cs.url === sourceUrl)?.mapRetention ?? DEFAULT_RSS_MAP_RETENTION
      })()
      const mapEvents = isRss && !persist
        ? intelEvents.map(e => tagEphemeralRss(e, rssRetention))
        : intelEvents.map(e => applyKeepToIntel(e, keepDuration, { explicit: keepDuration === 'forever' }))

      setEvents([...existingEvents, ...mapEvents])
      setAddedCount(n => n + mapEvents.length)
      if (project && persist) {
        const existing = new Set(project.events.map((e: any) => e.id))
        const toSave = mapEvents
          .filter((e: any) => !existing.has(e.id))
          .map((e: any) => intelToUniversal(e, project.id, { keepDuration }))
        if (toSave.length > 0) addEvents(project.id, toSave)

        // Track as a custom source for health visibility in ConnectorsPanel
        if (sourceUrl && sourceType) {
          const existingSrc = (project.customSources ?? []).find(cs => cs.url === sourceUrl)
          if (existingSrc) {
            updateCustomSource(project.id, existingSrc.id, {
              lastFetched: new Date().toISOString(),
              eventCount: existingSrc.eventCount + intelEvents.length,
              error: undefined,
              name: src ?? existingSrc.name,
            })
          } else {
            addCustomSource(project.id, {
              id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: sourceType,
              url: sourceUrl,
              name: src ?? (sourceUrl.length > 40 ? sourceUrl.slice(0, 40) + '…' : sourceUrl),
              enabled: true,
              lastFetched: new Date().toISOString(),
              eventCount: intelEvents.length,
              ...(sourceType === 'rss' ? { mapRetention: DEFAULT_RSS_MAP_RETENTION as LiveFeedRetention } : {}),
            })
          }
        }
      }
    }
    if (filteredOut > 0) {
      useMapStore.getState().pushToast({
        title: `${filteredOut} off-mission item${filteredOut !== 1 ? 's' : ''} filtered`,
        body: `Kept ${intelEvents.length} matching your research question. Manual adds now pass the semantic relevance gate.`,
        severity: 'info', type: 'system',
      })
    }
    if (clearAfter === 'rss') { setRssEvents([]); setRssSelected(new Set()) }
    if (clearAfter === 'search') { setExtractedEvents([]) }
    return intelEvents.length
  }

  // ── AI Suggest ───────────────────────────────────────────────────────────
  async function runAISuggest() {
    setAiLoading(true); setAiError('')
    const engine = loadAnalysisEngine(project?.aiMode)
    try {
      const res = await fetch('/api/connectors/suggest-queries', {
        method: 'POST',
        headers: buildAiFetchHeaders('suggest', engine, project),
        body: JSON.stringify({
          purpose: aiTopic,
          apiKey: project?.aiMode === 'byok' ? project.byokApiKey : undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSuggestedQueries(data.queries ?? [])
      setSelectedQueries(new Set(data.queries ?? []))
    } catch (e) { setAiError(String(e)) }
    finally { setAiLoading(false) }
  }

  function toggleQuery(q: string) {
    setSelectedQueries(prev => { const n = new Set(prev); n.has(q) ? n.delete(q) : n.add(q); return n })
  }

  // ── Web Search ───────────────────────────────────────────────────────────
  // Returns the client-side key (if any). Empty string is fine — server uses vault/env.
  function getSearchKey() {
    return searchEngine === 'serper' ? ls('argus_serper_key') : ls('argus_brave_key')
  }

  async function runSearch(query: string) {
    setSearchLoading(true); setSearchError(''); setSearchResults([]); setSelectedUrls(new Set())
    try {
      const res = await fetch('/api/connectors/websearch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, engine: searchEngine, apiKey: getSearchKey(), count: 20 }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const results: SearchResult[] = data.results ?? []
      setSearchResults(results)
      setSelectedUrls(new Set(results.map((r: SearchResult) => r.url)))
    } catch (e) { setSearchError(String(e)) }
    finally { setSearchLoading(false) }
  }

  async function runAllSelectedQueries() {
    setSearchLoading(true); setSearchError(''); setSearchResults([]); setSelectedUrls(new Set())
    const key = getSearchKey()
    const queries = [...selectedQueries].slice(0, 6)
    const allResults: SearchResult[] = []
    const seen = new Set<string>()
    for (const q of queries) {
      try {
        const res = await fetch('/api/connectors/websearch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, engine: searchEngine, apiKey: key, count: 10 }),
        })
        const data = await res.json()
        for (const r of data.results ?? []) {
          if (!seen.has(r.url)) { seen.add(r.url); allResults.push(r) }
        }
      } catch {}
    }
    setSearchResults(allResults)
    setSelectedUrls(new Set(allResults.map((r: SearchResult) => r.url)))
    setSearchLoading(false)
    if (allResults.length === 0) setSearchError('No results — check your API key.')
  }

  // ── Extract from URLs (with live progress) ───────────────────────────────
  async function extractSelected() {
    setExtracting(true); setExtractedEvents([])
    const urls = [...selectedUrls].slice(0, 20)
    setExtractProgress({ current: 0, total: urls.length, domain: '' })
    const events: ExtractedEvent[] = []
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]
      let domain = url
      try { domain = new URL(url).hostname.replace('www.', '') } catch {}
      setExtractProgress({ current: i + 1, total: urls.length, domain })
      try {
        const res = await fetch('/api/connectors/scrape', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })
        const data = await res.json()
        if (data.event) events.push(data.event)
      } catch {}
    }
    setExtractedEvents(events)
    setExtracting(false)
    setExtractProgress({ current: 0, total: 0, domain: '' })
  }

  function removeExtractedEvent(index: number) {
    setExtractedEvents(prev => prev.filter((_, i) => i !== index))
  }

  // ── RSS ──────────────────────────────────────────────────────────────────
  async function fetchRSS(url?: string) {
    const targetUrl = url ?? feedUrl
    setRssLoading(true); setRssError(''); setRssEvents([]); setRssSelected(new Set()); setRssNewCount(0)
    try {
      const res = await fetch('/api/connectors/rss', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedUrl: targetUrl }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const evs: ExtractedEvent[] = data.events ?? []
      setRssEvents(evs)
      setRssSelected(new Set(evs.map((_, i) => i)))
    } catch (e) { setRssError(String(e)) }
    finally { setRssLoading(false) }
  }

  // ── Single URL scrape ────────────────────────────────────────────────────
  // True when an AI key exists anywhere (localStorage mirror or server vault).
  async function hasAiKey(): Promise<boolean> {
    if (aiKeyRef.current !== null) return aiKeyRef.current
    let has = !!(ls('argus_openai_key') || ls('argus_anthropic_key'))
    if (!has) {
      try {
        const v = await fetch('/api/vault').then(r => r.json()) as { keys?: string[] }
        has = !!v.keys?.some(k => k === 'OPENAI_API_KEY' || k === 'ANTHROPIC_API_KEY')
      } catch { /* fall through */ }
    }
    aiKeyRef.current = has
    return has
  }

  async function scrapeOne() {
    setScrapeLoading(true); setScrapeError(''); setScrapeSuccess(false); setScrapeEvents([]); setScrapeMode(null)
    try {
      // With an AI key: multi-event LLM extraction. If the AI ran and found
      // nothing, report that honestly — don't synthesize an event from page
      // metadata. Fall back to the metadata scrape only when the call fails.
      if (await hasAiKey()) {
        const engine = loadAnalysisEngine(project?.aiMode)
        try {
          const res = await fetch('/api/connectors/ai-extract', {
            method: 'POST',
            headers: buildAiFetchHeaders('suggest', engine, project),
            body: JSON.stringify({
              url: scrapeUrl,
              apiKey: project?.aiMode === 'byok' ? project.byokApiKey : undefined,
            }),
          })
          const data = await res.json()
          if (res.ok && Array.isArray(data.events)) {
            setScrapeMode('ai')
            if (data.events.length === 0) setScrapeError('AI read the article but found no distinct events to extract.')
            else setScrapeEvents(data.events)
            return
          }
        } catch { /* fall through to metadata scrape */ }
      }
      const res = await fetch('/api/connectors/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.event) { setScrapeEvents([data.event]); setScrapeMode('basic') }
      else throw new Error('No event could be extracted from this URL')
    } catch (e) { setScrapeError(String(e)) }
    finally { setScrapeLoading(false) }
  }

  // ── Pasted article text → AI multi-event extraction ─────────────────────
  async function extractArticle() {
    setArticleLoading(true); setArticleError(''); setArticleEvents([]); setArticleAdded(0)
    try {
      // Pasted-text extraction has no offline fallback (unlike URL scrape, which
      // degrades to a metadata scrape). Say so plainly instead of firing a call
      // that 400s and surfaces a raw error object.
      if (!(await hasAiKey())) {
        setArticleError('Auto-extracting events from pasted text needs an AI key. Add one in Settings → App, or paste a URL instead (that works without a key).')
        return
      }
      const engine = loadAnalysisEngine(project?.aiMode)
      const res = await fetch('/api/connectors/ai-extract', {
        method: 'POST',
        headers: buildAiFetchHeaders('suggest', engine, project),
        body: JSON.stringify({
          text: pasteText,
          sourceName: sourceName.trim() || undefined,
          apiKey: project?.aiMode === 'byok' ? project.byokApiKey : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Extraction failed')
      const evs: ExtractedEvent[] = data.events ?? []
      if (evs.length === 0) setArticleError('AI read the text but found no distinct events to extract.')
      else setArticleEvents(evs)
    } catch (e) { setArticleError(String(e)) }
    finally { setArticleLoading(false) }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'discover', label: 'Topics',  icon: <BookOpen size={11}/> },
    { id: 'ai',       label: 'AI',      icon: <Sparkles size={11}/> },
    { id: 'search',   label: 'Search',  icon: <Search size={11}/> },
    { id: 'rss',      label: 'RSS',     icon: <Rss size={11}/> },
    { id: 'url',      label: 'URL',     icon: <Globe size={11}/> },
    { id: 'paste',    label: 'Paste',   icon: <ClipboardList size={11}/> },
  ]

  const topFeeds = getTopFeeds(discoverQuery)

  const pasteModeToggle = (
    <div style={{ display: 'flex', gap: 6 }}>
      {([['ioc', 'Indicators'], ['article', 'Article text']] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => { setPasteMode(mode); if (mode === 'article' && articleAiReady === null) void hasAiKey().then(setArticleAiReady) }}
          className={`ui-plot-mode-btn${pasteMode === mode ? ' ui-plot-mode-btn--active' : ''}`}
          style={{ flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700 }}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className={`ui-panel-drawer ui-panel-drawer--import panel-slide-in${closing ? ' panel-closing' : ''}`}>
      <header className="ui-panel-header" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div>
            <div className="ui-kicker" style={{ marginBottom: 4 }}>Import</div>
            <div className="ui-title ui-title--panel">Add Source</div>
            {project && <p className="ui-subtitle ui-subtitle--panel" style={{ marginTop: 6 }}>{project.name}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {addedCount > 0 && (
              <span className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)' }}>
                +{addedCount} on map
              </span>
            )}
            {enrichedCount > 0 && !enriching && (
              <span className="ui-chip ui-chip--xs">{enrichedCount} enriched</span>
            )}
            {addedCount > 0 && (
              <button type="button" onClick={() => enrichAll()} disabled={enriching} title="Enrich all map events with AI" className="ui-btn ui-btn--ghost" style={{ fontSize: 10, padding: '4px 8px' }}>
                {enriching ? <><Loader size={10}/> {progress}%</> : <><Zap size={10}/> Enrich</>}
              </button>
            )}
            <button type="button" onClick={handleClose} className="ui-btn ui-btn--ghost ui-btn--icon" aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { handleClose(); togglePanel('connectors') }}
          className="ui-link"
          style={{ fontSize: 10, marginBottom: 10, display: 'block' }}
        >
          Toggle live feeds (GDELT, ReliefWeb…) →
        </button>

        <input
          className="ui-input"
          style={{ marginBottom: 10, padding: '7px 10px', fontSize: 11 }}
          placeholder="Source label (optional) — tags all imported events"
          value={sourceName}
          onChange={e => setSourceName(e.target.value)}
        />

        <div className="ui-panel-tabs ui-feed-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              className={`ui-feed-tab${tab === t.id ? ' ui-feed-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 4px', flex: 1, minWidth: 0 }}
            >
              {t.icon}
              <span style={{ fontSize: 9 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="ui-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 32 }}>

        {/* ── TOPIC DISCOVERY ──────────────────────────────────────────── */}
        {tab === 'discover' && (
          <>
            <SourceHint>
              Find the best RSS feeds for your project topic. Scored against a catalogue of {FEED_CATALOGUE.length}+ curated sources.
            </SourceHint>
            <input
              className="ui-input"
              placeholder="Describe your topic — e.g. Ukraine conflict, Sahel crisis, South China Sea…"
              value={discoverQuery}
              onChange={e => setDiscoverQuery(e.target.value)}
            />

            {topFeeds.length > 0 && (
              <>
                <div className="ui-section-label">Top matches for your topic</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {topFeeds.map((feed, i) => (
                    <div key={i} className="ui-source-card">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{feed.name}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{feed.category} · {feed.tags.slice(0, 4).join(', ')}</div>
                      </div>
                      {feed.score > 0 && (
                        <span className="ui-source-match-badge">
                          {feed.score > 1 ? 'Strong match' : 'Match'}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => { setFeedUrl(feed.url); setTab('rss'); fetchRSS(feed.url) }}
                        className="ui-btn ui-btn--primary"
                        style={{ flexShrink: 0, fontSize: 10, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <Rss size={10}/> Load
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowAllCategories(v => !v)}
              className="ui-link"
              style={{ fontSize: 10, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {showAllCategories ? '▾' : '▸'} Browse all {FEED_CATALOGUE.length} sources by category
            </button>
            {showAllCategories && ['Global', 'Conflict', 'Geopolitics', 'Middle East', 'Asia', 'Africa', 'Humanitarian', 'Disasters', 'Economic', 'Health', 'Analysis'].map(cat => {
              const catFeeds = FEED_CATALOGUE.filter(f => f.category === cat)
              if (!catFeeds.length) return null
              return (
                <div key={cat}>
                  <div className="ui-section-label" style={{ marginBottom: 4 }}>{cat}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {catFeeds.map(f => (
                      <button
                        key={f.url}
                        type="button"
                        onClick={() => { setFeedUrl(f.url); setTab('rss'); fetchRSS(f.url) }}
                        className="ui-chip ui-chip--xs"
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── AI SUGGEST ───────────────────────────────────────────────── */}
        {tab === 'ai' && (
          <>
            <SourceHint>
              Describe your research focus. AI generates targeted search queries to run against web search.
            </SourceHint>
            <textarea
              className="ui-input"
              value={aiTopic}
              onChange={e => setAiTopic(e.target.value)}
              rows={3}
              placeholder="e.g. Pakistan economic crisis IMF negotiations 2025"
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
            <button
              type="button"
              onClick={runAISuggest}
              disabled={aiLoading || !aiTopic.trim()}
              className="ui-btn ui-btn--primary ui-btn--block"
              style={{ fontSize: 12, fontWeight: 700, gap: 6, padding: 10 }}
            >
              {aiLoading ? <><Loader size={13}/> Generating queries…</> : <><Sparkles size={13}/> Generate Queries</>}
            </button>
            {aiError && <SourceErr>{aiError}</SourceErr>}

            {suggestedQueries.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="ui-section-label">{suggestedQueries.length} queries</span>
                  <button type="button" onClick={() => setSelectedQueries(new Set(suggestedQueries))} className="ui-link" style={{ fontSize: 10 }}>
                    Select all
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {suggestedQueries.map((q, i) => (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleQuery(q)}
                      onKeyDown={e => e.key === 'Enter' && toggleQuery(q)}
                      className={`ui-source-select-row ui-source-select-row--align-center${selectedQueries.has(q) ? ' ui-source-select-row--on' : ''}`}
                    >
                      <SourceCheckbox checked={selectedQueries.has(q)} />
                      <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, lineHeight: 1.4 }}>{q}</span>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setSearchQuery(q); setTab('search'); runSearch(q) }}
                        className="ui-btn ui-btn--ghost"
                        style={{ padding: 2, flexShrink: 0 }}
                        title="Search this query now"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                {selectedQueries.size > 0 && (
                  <button
                    type="button"
                    onClick={() => { setTab('search'); runAllSelectedQueries() }}
                    className="ui-btn ui-btn--primary ui-btn--block"
                    style={{ fontSize: 12, fontWeight: 700, gap: 6, padding: 10 }}
                  >
                    <Search size={13}/> Search {selectedQueries.size} queries
                  </button>
                )}
              </>
            )}
          </>
        )}

        {/* ── WEB SEARCH ───────────────────────────────────────────────── */}
        {tab === 'search' && (
          <>
            <SourceHint>Search the web and extract events from article results.</SourceHint>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['serper', 'brave'] as const).map(eng => (
                <button
                  key={eng}
                  type="button"
                  onClick={() => setSearchEngine(eng)}
                  className={`ui-plot-mode-btn${searchEngine === eng ? ' ui-plot-mode-btn--active' : ''}`}
                  style={{ flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 700 }}
                >
                  {eng === 'serper' ? 'Google (Serper)' : 'Brave Search'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="ui-input"
                style={{ flex: 1 }}
                placeholder="Search query…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch(searchQuery)}
              />
              <button
                type="button"
                onClick={() => runSearch(searchQuery)}
                disabled={searchLoading || !searchQuery.trim()}
                className="ui-btn ui-btn--primary"
                style={{ flexShrink: 0, padding: '8px 12px', fontSize: 11, gap: 4 }}
              >
                {searchLoading ? <Loader size={12}/> : <Search size={12}/>}
              </button>
            </div>
            {searchError && <SourceErr>{searchError}</SourceErr>}

            {searchResults.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="ui-section-label">{searchResults.length} results · {selectedUrls.size} selected</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setSelectedUrls(new Set(searchResults.map(r => r.url)))} className="ui-link" style={{ fontSize: 10 }}>All</button>
                    <button type="button" onClick={() => setSelectedUrls(new Set())} className="ui-link" style={{ fontSize: 10, color: 'var(--text-muted)' }}>None</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {searchResults.map((r, i) => (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedUrls(prev => { const n = new Set(prev); n.has(r.url) ? n.delete(r.url) : n.add(r.url); return n })}
                      onKeyDown={e => e.key === 'Enter' && setSelectedUrls(prev => { const n = new Set(prev); n.has(r.url) ? n.delete(r.url) : n.add(r.url); return n })}
                      className={`ui-source-select-row${selectedUrls.has(r.url) ? ' ui-source-select-row--on' : ''}`}
                    >
                      <SourceCheckbox checked={selectedUrls.has(r.url)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: 2 }}>{r.title}</div>
                        <div style={{ fontSize: 9, color: 'var(--accent)', marginBottom: 3 }}>{r.domain}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.snippet?.slice(0, 120)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedUrls.size > 0 && (
                  <button
                    type="button"
                    onClick={extractSelected}
                    disabled={extracting}
                    className="ui-btn ui-btn--success ui-btn--block"
                    style={{ fontSize: 12, fontWeight: 700, gap: 6, padding: 10 }}
                  >
                    {extracting
                      ? <><Loader size={13}/> Extracting {extractProgress.current}/{extractProgress.total}: {extractProgress.domain.slice(0, 28)}…</>
                      : <><RefreshCw size={13}/> Extract Events from {selectedUrls.size} URLs</>
                    }
                  </button>
                )}

                {extractedEvents.length > 0 && (
                  <>
                    <div className="ui-section-label">{extractedEvents.length} events extracted</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                      {extractedEvents.map((e, i) => (
                        <div key={i} className="ui-source-event-row">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: sevVar(e.severity), flexShrink: 0 }} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 }}>{e.title}</span>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.location?.name} · {e.source?.name}</div>
                          </div>
                          <button type="button" onClick={() => removeExtractedEvent(i)} className="ui-btn ui-btn--ghost" style={{ flexShrink: 0, padding: 2 }}>
                            <X size={11}/>
                          </button>
                        </div>
                      ))}
                    </div>
                    <KeepDurationChips value={manualKeepDuration} onChange={setManualKeepDuration} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => void addEventsToMap(extractedEvents, undefined, 'search', undefined, undefined, { persist: true, keepDuration: manualKeepDuration })}
                        className="ui-btn ui-btn--primary"
                        style={{ flex: 1, fontSize: 12, fontWeight: 700, gap: 6, padding: 10, justifyContent: 'center' }}
                      >
                        <Plus size={13}/> Add {extractedEvents.length} Events
                      </button>
                      <button
                        type="button"
                        onClick={async () => { await addEventsToMap(extractedEvents, undefined, 'search', undefined, undefined, { persist: true, keepDuration: manualKeepDuration }); await new Promise(r => setTimeout(r, 200)); enrichAll() }}
                        disabled={enriching}
                        className="ui-btn ui-btn--ai"
                        style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, gap: 6 }}
                      >
                        {enriching ? <Loader size={13}/> : <Zap size={13}/>}
                        {enriching ? `${progress}%` : 'AI'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── RSS ─────────────────────────────────────────────────────── */}
        {tab === 'rss' && (
          <>
            <SourceHint>Fetch any RSS/Atom feed. Events are geolocated and placed on the map.</SourceHint>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
                { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
                { name: 'ReliefWeb', url: 'https://reliefweb.int/updates/rss.xml' },
                { name: 'Foreign Policy', url: 'https://foreignpolicy.com/feed/' },
                { name: 'Kyiv Independent', url: 'https://kyivindependent.com/feed/' },
                { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss' },
                { name: 'The Diplomat', url: 'https://thediplomat.com/feed/' },
                { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/' },
              ].map(f => (
                <button
                  key={f.url}
                  type="button"
                  onClick={() => setFeedUrl(f.url)}
                  className={`ui-chip ui-chip--xs${feedUrl === f.url ? ' ui-chip--accent' : ''}`}
                >
                  {f.name}
                </button>
              ))}
            </div>

            <input className="ui-input" placeholder="Or paste any RSS/Atom URL…" value={feedUrl} onChange={e => setFeedUrl(e.target.value)} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Radio size={11} color={rssInterval > 0 ? 'var(--low)' : 'var(--text-muted)'} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Auto-sync:</span>
              {[{ label: 'Off', val: 0 }, { label: '5m', val: 5 }, { label: '15m', val: 15 }, { label: '30m', val: 30 }, { label: '1h', val: 60 }].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setRssInterval(opt.val)}
                  className={`ui-chip ui-chip--xs${rssInterval === opt.val ? ' ui-chip--accent' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
              {rssNewCount > 0 && (
                <button type="button" onClick={() => fetchRSS()} className="ui-chip ui-chip--xs" style={{ color: 'var(--low)', borderColor: 'var(--badge-green-border)', background: 'var(--badge-green-bg)', fontWeight: 700 }}>
                  +{rssNewCount} new — reload
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => fetchRSS()}
              disabled={rssLoading || !feedUrl.trim()}
              className="ui-btn ui-btn--primary ui-btn--block"
              style={{ fontSize: 12, fontWeight: 700, gap: 6, padding: 10 }}
            >
              {rssLoading ? <><Loader size={13}/> Fetching…</> : <><Rss size={13}/> Fetch Feed</>}
            </button>

            {rssError && <SourceErr>{rssError}</SourceErr>}

            {rssEvents.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="ui-section-label" style={{ flex: 1 }}>{rssEvents.length} events · {rssSelected.size} selected</span>
                  <button type="button" onClick={() => setRssSelected(new Set(rssEvents.map((_, i) => i)))} className="ui-link" style={{ fontSize: 10, fontWeight: 600 }}>All</button>
                  <button type="button" onClick={() => setRssSelected(new Set())} className="ui-link" style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>None</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                  {rssEvents.map((e, i) => {
                    const sel = rssSelected.has(i)
                    return (
                      <div
                        key={i}
                        role="button"
                        tabIndex={0}
                        onClick={() => setRssSelected(prev => { const n = new Set(prev); sel ? n.delete(i) : n.add(i); return n })}
                        onKeyDown={ev => ev.key === 'Enter' && setRssSelected(prev => { const n = new Set(prev); sel ? n.delete(i) : n.add(i); return n })}
                        className={`ui-source-event-row ui-source-event-row--selectable${sel ? ' ui-source-event-row--on' : ''}`}
                      >
                        <SourceCheckbox checked={sel} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: sevVar(e.severity), flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3 }}>{e.title}</span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.location?.name || 'Unknown location'} · {e.source?.name}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {rssSelected.size > 0 && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={rssKeepInProject}
                        onChange={e => setRssKeepInProject(e.target.checked)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      Keep in project (otherwise map-only for 7 days)
                    </label>
                    {rssKeepInProject && (
                      <KeepDurationChips value={rssKeepDuration} onChange={setRssKeepDuration} options={['7d', '30d', 'forever']} />
                    )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void addEventsToMap(
                        rssEvents.filter((_, i) => rssSelected.has(i)),
                        undefined, 'rss', feedUrl, 'rss',
                        { persist: rssKeepInProject, keepDuration: rssKeepDuration },
                      )}
                      className="ui-btn ui-btn--primary"
                      style={{ flex: 1, fontSize: 12, fontWeight: 700, gap: 6, padding: 10, justifyContent: 'center' }}
                    >
                      <Plus size={13}/> Add {rssSelected.size} Events
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await addEventsToMap(
                          rssEvents.filter((_, i) => rssSelected.has(i)),
                          undefined, 'rss', feedUrl, 'rss',
                          { persist: rssKeepInProject, keepDuration: rssKeepDuration },
                        )
                        await new Promise(r => setTimeout(r, 200))
                        enrichAll()
                      }}
                      disabled={enriching}
                      className="ui-btn ui-btn--ai"
                      style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, gap: 6 }}
                    >
                      {enriching ? <Loader size={13}/> : <Zap size={13}/>}
                      {enriching ? `${progress}%` : 'AI'}
                    </button>
                  </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── SCRAPE URL ───────────────────────────────────────────────── */}
        {tab === 'url' && (
          <>
            <SourceHint>Paste any article URL — ARGUS extracts it and lets you review before adding to the map.</SourceHint>
            <input
              className="ui-input"
              placeholder="https://…"
              value={scrapeUrl}
              onChange={e => { setScrapeUrl(e.target.value); setScrapeSuccess(false); setScrapeEvents([]); setScrapeMode(null) }}
              onKeyDown={e => e.key === 'Enter' && scrapeEvents.length === 0 && scrapeOne()}
            />
            {scrapeEvents.length === 0 && (
              <button
                type="button"
                onClick={scrapeOne}
                disabled={scrapeLoading || !scrapeUrl.trim()}
                className="ui-btn ui-btn--primary ui-btn--block"
                style={{ fontSize: 12, fontWeight: 700, gap: 6, padding: 10 }}
              >
                {scrapeLoading ? <><Loader size={13}/> Extracting…</> : <><Globe size={13}/> Extract for Review</>}
              </button>
            )}
            {scrapeError && <SourceErr>{scrapeError}</SourceErr>}

            {scrapeEvents.length > 0 && (
              <div className="ui-source-preview">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div className="ui-section-label" style={{ marginBottom: 0 }}>
                    Review {scrapeEvents.length} extracted event{scrapeEvents.length !== 1 ? 's' : ''}
                  </div>
                  <span className="ui-chip ui-chip--xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {scrapeMode === 'ai' ? <><Sparkles size={9}/> AI extraction</> : 'Metadata'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', marginBottom: 12 }}>
                  {scrapeEvents.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: sevVar(ev.severity), flexShrink: 0, marginTop: 3 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{ev.title}</span>
                        {ev.description && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                            {ev.description.slice(0, 220)}{ev.description.length > 220 ? '…' : ''}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                          {ev.location?.name || 'Unknown location'} · {ev.source?.name} · <span style={{ color: sevVar(ev.severity), fontWeight: 700 }}>{ev.severity}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScrapeEvents(prev => prev.filter((_, j) => j !== i))}
                        className="ui-btn ui-btn--ghost"
                        style={{ flexShrink: 0, padding: 2 }}
                        aria-label="Remove event"
                      >
                        <X size={11}/>
                      </button>
                    </div>
                  ))}
                </div>
                <KeepDurationChips value={manualKeepDuration} onChange={setManualKeepDuration} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const n = await addEventsToMap(scrapeEvents, undefined, undefined, scrapeUrl, 'scrape', { persist: true, keepDuration: manualKeepDuration })
                      if (n > 0) { setScrapeEvents([]); setScrapeMode(null); setScrapeSuccess(true); setScrapeUrl('') }
                    }}
                    className="ui-btn ui-btn--success"
                    style={{ flex: 1, fontSize: 11, fontWeight: 700, gap: 4, justifyContent: 'center', padding: '8px 0' }}
                  >
                    <Plus size={12}/> Add {scrapeEvents.length > 1 ? `${scrapeEvents.length} Events` : ''} to Map
                  </button>
                  <button type="button" onClick={() => { setScrapeEvents([]); setScrapeMode(null) }} className="ui-btn ui-btn--danger-ghost" style={{ fontSize: 11, fontWeight: 700, padding: '8px 14px' }}>
                    Discard
                  </button>
                </div>
              </div>
            )}

            {scrapeSuccess && scrapeEvents.length === 0 && <SourceOk>✓ Added to map</SourceOk>}
            <div className="ui-source-info-box">
              With an AI key (Settings → API Keys), every distinct event in the article is extracted. Without one, falls back to HTML metadata + Jina Reader — one event per URL, no key needed.
            </div>
          </>
        )}

        {/* ── PASTE / BULK IMPORT ─────────────────────────────────────── */}
        {tab === 'paste' && pasteMode === 'ioc' && (
          <>
            {pasteModeToggle}
            <SourceHint tall>
              Paste a raw dump of indicators — one per line, or comma/tab separated. ARGUS auto-detects IPs, domains, emails, hashes, CVEs, crypto wallets, URLs, and more.
            </SourceHint>
            <textarea
              className="ui-input"
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setPasteDetected([]); setPasteAdded(0); setArticleEvents([]); setArticleError(''); setArticleAdded(0) }}
              placeholder={'8.8.8.8\nexample.com\nuser@domain.com\nCVE-2024-1234\n0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'}
              rows={7}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  if (!pasteText.trim()) return
                  const detected = detectBulk(pasteText)
                  setPasteDetected(detected)
                  setPasteOverrides({})
                  setPasteAdded(0)
                }}
                className="ui-btn ui-btn--primary"
                style={{ fontSize: 11, fontWeight: 700, padding: '7px 14px' }}
              >
                Detect types
              </button>
              {pasteAdded > 0 && (
                <span style={{ fontSize: 10, color: 'var(--low)', fontWeight: 700 }}>✓ {pasteAdded} entities added to canvas</span>
              )}
            </div>

            {pasteDetected.length > 0 && (
              <>
                <div className="ui-section-label">{pasteDetected.length} entities detected — review and correct types</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                  {pasteDetected.map((e, i) => {
                    const type = (pasteOverrides[i] ?? e.type) as GraphNodeType
                    return (
                      <div key={i} className="ui-source-paste-row">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[type] ?? 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1, wordBreak: 'break-all' }}>{e.raw.length > 50 ? e.raw.slice(0, 50) + '…' : e.raw}</span>
                        <select
                          className="ui-input"
                          value={type}
                          onChange={ev => setPasteOverrides(prev => ({ ...prev, [i]: ev.target.value as GraphNodeType }))}
                          style={{ fontSize: 10, padding: '2px 4px', width: 'auto' }}
                        >
                          {(['ip','domain','email','url','phone','person','organization','hash','wallet','cve','custom'] as GraphNodeType[]).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <span style={{ fontSize: 9, color: e.confidence === 'high' ? 'var(--low)' : e.confidence === 'medium' ? 'var(--medium-text)' : 'var(--text-muted)' }}>
                          {e.confidence}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!project) return
                    const { addCanvasNodes } = useProjectStore.getState()
                    const { togglePanel, pushToast } = useMapStore.getState()
                    const items = pasteDetected.map((e, i) => ({
                      type: (pasteOverrides[i] ?? e.type) as GraphNodeType,
                      raw: e.raw,
                      label: e.label,
                    }))
                    const nodes = detectedEntitiesToCanvasNodes(items)
                    addCanvasNodes(project.id, nodes)
                    togglePanel('canvas')
                    pushToast({
                      title: 'Entities added to canvas',
                      body: `${nodes.length} IOC${nodes.length !== 1 ? 's' : ''} placed on analyst canvas`,
                      severity: 'info',
                      type: 'system',
                    })
                    setPasteAdded(nodes.length)
                    setPasteText('')
                    setPasteDetected([])
                  }}
                  className="ui-btn ui-btn--success"
                  style={{ fontSize: 12, fontWeight: 700, padding: '8px 16px' }}
                >
                  Add {pasteDetected.length} to analyst canvas
                </button>
              </>
            )}
          </>
        )}

        {/* ── PASTE ARTICLE TEXT → AI EVENTS ──────────────────────────── */}
        {tab === 'paste' && pasteMode === 'article' && (
          <>
            {pasteModeToggle}
            <SourceHint tall>
              Paste raw text from any source — a local-language article, a Telegram or X post, a field report. AI extracts every distinct event with location, severity, and actors.
            </SourceHint>
            <textarea
              className="ui-input"
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setPasteDetected([]); setPasteAdded(0); setArticleEvents([]); setArticleError(''); setArticleAdded(0) }}
              placeholder="Paste article or post text in any language…"
              rows={9}
              style={{ resize: 'vertical', lineHeight: 1.5 }}
            />
            {articleEvents.length === 0 && (
              <button
                type="button"
                onClick={extractArticle}
                disabled={articleLoading || !pasteText.trim() || articleAiReady === false}
                className="ui-btn ui-btn--primary ui-btn--block"
                style={{ fontSize: 12, fontWeight: 700, gap: 6, padding: 10 }}
              >
                {articleLoading ? <><Loader size={13}/> Extracting…</> : <><Sparkles size={13}/> Extract Events</>}
              </button>
            )}
            {articleError && <SourceErr>{articleError}</SourceErr>}

            {articleEvents.length > 0 && (
              <div className="ui-source-preview">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div className="ui-section-label" style={{ marginBottom: 0 }}>
                    Review {articleEvents.length} extracted event{articleEvents.length !== 1 ? 's' : ''}
                  </div>
                  <span className="ui-chip ui-chip--xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={9}/> AI extraction
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', marginBottom: 12 }}>
                  {articleEvents.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: sevVar(ev.severity), flexShrink: 0, marginTop: 3 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{ev.title}</span>
                        {ev.description && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                            {ev.description.slice(0, 220)}{ev.description.length > 220 ? '…' : ''}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                          {ev.location?.name || 'Unknown location'} · {ev.source?.name} · <span style={{ color: sevVar(ev.severity), fontWeight: 700 }}>{ev.severity}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setArticleEvents(prev => prev.filter((_, j) => j !== i))}
                        className="ui-btn ui-btn--ghost"
                        style={{ flexShrink: 0, padding: 2 }}
                        aria-label="Remove event"
                      >
                        <X size={11}/>
                      </button>
                    </div>
                  ))}
                </div>
                <KeepDurationChips value={manualKeepDuration} onChange={setManualKeepDuration} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const n = await addEventsToMap(articleEvents, undefined, undefined, undefined, undefined, { persist: true, keepDuration: manualKeepDuration })
                      if (n > 0) { setArticleEvents([]); setArticleAdded(n); setPasteText('') }
                    }}
                    className="ui-btn ui-btn--success"
                    style={{ flex: 1, fontSize: 11, fontWeight: 700, gap: 4, justifyContent: 'center', padding: '8px 0' }}
                  >
                    <Plus size={12}/> Add {articleEvents.length > 1 ? `${articleEvents.length} Events` : ''} to Map
                  </button>
                  <button type="button" onClick={() => setArticleEvents([])} className="ui-btn ui-btn--danger-ghost" style={{ fontSize: 11, fontWeight: 700, padding: '8px 14px' }}>
                    Discard
                  </button>
                </div>
              </div>
            )}

            {articleAdded > 0 && articleEvents.length === 0 && <SourceOk>✓ {articleAdded} event{articleAdded !== 1 ? 's' : ''} added to map</SourceOk>}
            <div className="ui-source-info-box">
              {articleAiReady === false
                ? 'AI extraction needs an API key — add an OpenAI key in Settings → API Keys, or save one in the Vault.'
                : 'Works in any language. The source label above tags where the text came from (e.g. a Telegram channel name).'}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
