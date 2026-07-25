import type { Targeting } from '@/types/project'
import { COUNTRY_CODE_TO_NAME } from '@/lib/countryNames'

/** Terms worth a topic watch rule — entities, place, and country-specific keywords only. */
export function topicWatchTerms(
  targeting: Targeting | undefined,
  countryCodes: string[] = [],
): string[] {
  if (!targeting) return []
  const out: string[] = []
  for (const e of targeting.watchEntities ?? []) {
    const s = e.trim()
    if (s) out.push(s)
  }
  if (targeting.placeName?.trim()) {
    out.push(targeting.placeName.split(',')[0].trim())
  }
  const names = countryCodes
    .map(c => COUNTRY_CODE_TO_NAME[c.toUpperCase()]?.toLowerCase())
    .filter(Boolean) as string[]
  for (const kw of targeting.keywords ?? []) {
    const k = kw.trim()
    if (!k) continue
    const kl = k.toLowerCase()
    if (names.some(n => kl.includes(n) || n.includes(kl))) out.push(k)
  }
  return [...new Set(out)].slice(0, 8)
}
