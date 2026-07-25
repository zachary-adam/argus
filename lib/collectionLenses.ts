import type { Targeting } from '@/types/project'
import { buildNewsQuery, placeQueryClause } from '@/lib/connectors/googleNews'
import { newsEditions, type NewsLocale } from '@/lib/lang'
import { codeToName } from '@/lib/countryNames'

/** One searchable perspective the aimed pull should try to cover. */
export interface CollectionLens {
  id: string
  label: string
  reason: string
  query: string
  /** ISO-3166 alpha-2 codes whose news editions this lens prioritises (optional). */
  countryCodes?: string[]
}

/** Tracked-actor shape the lens builder needs — name + aliases only. */
export interface LensActor { name: string; aliases?: string[] }

/**
 * Derive collection lenses from mission targeting — works for any region/question,
 * not hard-coded to one conflict. Bilateral projects get per-country + per-entity
 * lenses so the feed is less one-sided. When `trackedActors` is provided, entity
 * queries expand to alias OR-groups — including native-script aliases, so a
 * Bengali edition can be searched as ("Trinamool Congress" OR "TMC" OR "তৃণমূল").
 */
export function deriveCollectionLenses(
  targeting: Pick<Targeting, 'placeName' | 'keywords' | 'watchEntities'>,
  countryCodes: string[] = [],
  trackedActors: LensActor[] = [],
): CollectionLens[] {
  const lenses: CollectionLens[] = []
  const primary = buildNewsQuery(targeting)
  if (primary) {
    lenses.push({
      id: 'primary',
      label: 'Primary mission query',
      reason: 'Place + topic terms from project targeting',
      query: primary,
      countryCodes: countryCodes.length ? countryCodes : undefined,
    })
  }

  const placeClause = placeQueryClause(targeting.placeName)
  const keywords = (targeting.keywords ?? []).map(s => s.trim()).filter(Boolean).slice(0, 10)
  const topicTail = keywords.length ? keywords.join(' OR ') : ''

  // Per-country lenses — surfaces local-language reporting for each actor state.
  for (const code of [...new Set(countryCodes.map(c => c.toUpperCase()).filter(c => c && c !== 'XX'))].slice(0, 6)) {
    const name = codeToName(code)
    if (!name) continue
    const terms = [...keywords, ...(targeting.watchEntities ?? [])].slice(0, 8)
    const topic = terms.length ? `(${terms.map(t => (/\s/.test(t) ? `"${t}"` : t)).join(' OR ')})` : ''
    const q = placeClause ? `${placeClause} "${name}" ${topic}`.trim() : `"${name}" ${topic}`.trim()
    if (!q) continue
    lenses.push({
      id: `country-${code.toLowerCase()}`,
      label: `${name} reporting`,
      reason: `Country-scoped pull for ${code} — reduces single-side bias in bilateral missions`,
      query: q.replace(/\s+/g, ' '),
      countryCodes: [code],
    })
  }

  // Per-entity lenses — each watch actor gets its own high-recall query (max 3).
  // Tracked actors merge in (the Actors panel is the richer registry) and each
  // entity expands to its alias OR-group so local-script names are searched too.
  const aliasVariants = (entity: string): string[] => {
    const actor = trackedActors.find(a =>
      a.name.toLowerCase() === entity.toLowerCase() ||
      (a.aliases ?? []).some(al => al.toLowerCase() === entity.toLowerCase()),
    )
    return [...new Set(
      (actor ? [actor.name, ...(actor.aliases ?? [])] : [entity])
        .map(v => v.trim()).filter(v => v.length >= 2),
    )]
  }
  const groupOf = (variants: string[]): string =>
    variants.length > 1 ? `(${variants.map(v => `"${v}"`).join(' OR ')})` : `"${variants[0]}"`
  const hasNonLatin = (variants: string[]): boolean =>
    variants.some(v => /[^\u0000-\u024F]/.test(v))
  const entityNames = [...new Map(
    [...(targeting.watchEntities ?? []), ...trackedActors.map(a => a.name)]
      .map(s => s.trim()).filter(Boolean)
      .map(s => [s.toLowerCase(), s] as const),
  ).values()].slice(0, 6)

  for (const entity of entityNames) {
    const variants = aliasVariants(entity)
    const group = groupOf(variants)
    // Any Latin term AND-ed into the query (the place name OR English keyword
    // tail) kills recall in editions whose language doesn't cross-match it —
    // a Chinese article contains neither "Ladakh" nor "tensions". When the actor
    // has a non-Latin alias, query the alias group ALONE: the specific native
    // name carries precision and downstream relevance filters catch strays.
    // Generic across scripts, not tied to any one language.
    const nativeOnly = hasNonLatin(variants)
    const q = nativeOnly
      ? group
      : placeClause
      ? `${placeClause} ${group}${topicTail ? ` ${topicTail}` : ''}`
      : `${group}${topicTail ? ` ${topicTail}` : ''}`
    lenses.push({
      id: `entity-${entity.toLowerCase().replace(/\W+/g, '-').slice(0, 24)}`,
      label: entity,
      reason: 'Actor-specific reporting — catches side-specific military/diplomatic coverage',
      query: q.replace(/\s+/g, ' '),
      countryCodes: countryCodes.length ? countryCodes : undefined,
    })
  }

  // De-dupe identical queries, keep first label.
  const seen = new Set<string>()
  return lenses.filter(l => {
    const key = l.query.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Google News locales for all project countries (+ focus place country).
 *  `placeText` (focus place + topic terms) unlocks regional-language editions —
 *  e.g. "West Bengal" adds Bengali alongside Hindi + English for IN. */
export function newsLocalesForProject(countryCodes: string[], focusCountryCode?: string, placeText?: string): NewsLocale[] {
  const codes = [...new Set(
    [...countryCodes, focusCountryCode]
      .map(c => (c ?? '').toUpperCase())
      .filter(c => c && c !== 'XX'),
  )]
  const seen = new Set<string>()
  const out: NewsLocale[] = []
  for (const code of codes) {
    for (const loc of newsEditions(code, placeText)) {
      if (seen.has(loc.ceid)) continue
      seen.add(loc.ceid)
      out.push(loc)
    }
  }
  if (out.length === 0) out.push(...newsEditions(undefined))
  return out
}

/** Locales for a single lens — prefer its countryCodes, else project-wide. */
export function localesForLens(lens: CollectionLens, projectCountryCodes: string[], focusCountryCode?: string, placeText?: string): NewsLocale[] {
  if (lens.countryCodes?.length) {
    const seen = new Set<string>()
    const out: NewsLocale[] = []
    for (const code of lens.countryCodes) {
      for (const loc of newsEditions(code, placeText)) {
        if (seen.has(loc.ceid)) continue
        seen.add(loc.ceid)
        out.push(loc)
      }
    }
    return out.length ? out : newsLocalesForProject(projectCountryCodes, focusCountryCode, placeText)
  }
  return newsLocalesForProject(projectCountryCodes, focusCountryCode, placeText)
}
