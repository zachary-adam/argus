import { useState, useCallback } from 'react'
import { useMapStore } from '@/stores/mapStore'
import { useProjectStore } from '@/stores/projectStore'
import { IntelEvent } from '@/types'
import { intelToUniversal } from '@/lib/eventPersist'
import { KNOWN_LOCATIONS } from '@/lib/locations'
import { buildAiFetchHeaders } from '@/lib/aiConfig'
import { loadAnalysisEngine } from '@/lib/aiMode'

function ls(k: string) { try { return localStorage.getItem(k) ?? '' } catch { return '' } }

interface EnrichedResult {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  actors: string[]
  country: string
  city: string
  lat: number
  lon: number
  summary: string
  tags: string[]
}

function resolveCoords(city: string, country: string, fallbackLat: number, fallbackLon: number): { lat: number; lon: number } {
  // Exact city match in the gazetteer is the most precise — use it first.
  const cityKey = city?.toLowerCase().trim()
  if (cityKey && KNOWN_LOCATIONS[cityKey]) {
    return { lat: KNOWN_LOCATIONS[cityKey].lat, lon: KNOWN_LOCATIONS[cityKey].lng }
  }
  // Otherwise prefer the model's own coordinates: it read the article and points
  // at the actual incident, whereas the gazetteer country entry is just a centroid
  // that would pile every event onto the capital.
  if (fallbackLat !== 0 || fallbackLon !== 0) return { lat: fallbackLat, lon: fallbackLon }
  // Last resort: country centroid.
  const countryKey = country?.toLowerCase().trim()
  if (countryKey && KNOWN_LOCATIONS[countryKey]) {
    return { lat: KNOWN_LOCATIONS[countryKey].lat, lon: KNOWN_LOCATIONS[countryKey].lng }
  }
  return { lat: 0, lon: 0 }
}

export function useEnrichEvents() {
  const setEvents = useMapStore(s => s.setEvents)
  const [enriching, setEnriching] = useState(false)
  const [progress, setProgress] = useState(0)
  const [enrichedCount, setEnrichedCount] = useState(0)
  const [error, setError] = useState('')

  const enrichAll = useCallback(async (targetEvents?: IntelEvent[]) => {
    // Keys live in the server vault / .env. Block only when none exist anywhere.
    let hasKey = !!ls('argus_openai_key') || !!ls('argus_anthropic_key')
    if (!hasKey) {
      try {
        const v = await fetch('/api/vault').then(r => r.json()) as { keys?: string[] }
        hasKey = !!v.keys?.some(k => k === 'OPENAI_API_KEY' || k === 'ANTHROPIC_API_KEY')
      } catch { /* fall through */ }
    }
    if (!hasKey) { setError('Add an AI key in Settings → API Keys (vault)'); return }

    const pool = (targetEvents ?? useMapStore.getState().events).filter(e => !(e as any)._enriched)
    if (!pool.length) { setError('All events already enriched.'); return }

    setEnriching(true); setError(''); setProgress(0); setEnrichedCount(0)

    const BATCH = 8
    const enrichedMap = new Map<string, EnrichedResult>()
    let done = 0

    const project = useProjectStore.getState().getActiveProject()
    const engine = loadAnalysisEngine(project?.aiMode)

    for (let i = 0; i < pool.length; i += BATCH) {
      const batch = pool.slice(i, i + BATCH)
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: buildAiFetchHeaders('enrich', engine, project),
          body: JSON.stringify({
            apiKey: project?.aiMode === 'byok' ? project.byokApiKey : undefined,
            events: batch.map(e => ({
              id: e.id,
              title: e.title,
              description: e.summary || '',
              location: e.country || '',
            })),
          }),
        })
        const data = await res.json() as { results?: EnrichedResult[]; error?: string }
        if (data.error) throw new Error(data.error)
        for (const r of data.results ?? []) enrichedMap.set(r.id, r)
      } catch {}

      done += batch.length
      setProgress(Math.round((done / pool.length) * 100))
    }

    // Merge enrichments back into event list
    const allEvents = useMapStore.getState().events
    const updated = allEvents.map(e => {
      const r = enrichedMap.get(e.id)
      if (!r) return e
      const coords = resolveCoords(r.city, r.country, r.lat, r.lon)
      return {
        ...e,
        severity: r.severity || e.severity,
        category: (r.category || e.category) as IntelEvent['category'],
        country: r.country || e.country,
        summary: r.summary || e.summary,
        lat: coords.lat !== 0 ? coords.lat : e.lat,
        lon: coords.lon !== 0 ? coords.lon : e.lon,
        // Structured actors persist (eventPersist carries them to the project
        // store) and feed actor dossiers; _actors kept for legacy readers.
        actors: r.actors?.length
          ? r.actors.map(name => ({ name, type: 'unknown' as const }))
          : (e as IntelEvent).actors,
        _enriched: true,
        _actors: r.actors,
        _tags: r.tags,
        _city: r.city,
      } as IntelEvent
    })

    setEvents(updated)
    setEnrichedCount(enrichedMap.size)

    if (project && enrichedMap.size > 0) {
      const { updateEvent } = useProjectStore.getState()
      for (const e of updated) {
        if (!enrichedMap.has(e.id)) continue
        if (!project.events.some(pe => pe.id === e.id)) continue
        const u = intelToUniversal(e, project.id)
        updateEvent(project.id, e.id, {
          severity: u.severity,
          category: u.category,
          country: u.country,
          summary: u.summary,
          lat: u.lat,
          lon: u.lon,
          actors: u.actors,
          body: u.body,
        })
      }
    }

    setEnriching(false)
  }, [setEvents])

  return { enrichAll, enriching, progress, enrichedCount, error }
}
