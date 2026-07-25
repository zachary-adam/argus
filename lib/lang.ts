/**
 * Lightweight language/script detection + news localisation.
 *
 * Most local reporting (a village election, a regional protest) is NOT in English,
 * so an English-only feed misses it. This (a) detects the script of an event title
 * so the UI can offer translation, and (b) maps a country to its Google-News
 * locale so the targeted feed pulls local-language results.
 *
 * Detection is script-based (Unicode ranges) — zero dependencies, good enough to
 * route translation; it is not a full language classifier.
 */

const SCRIPTS: { lang: string; re: RegExp }[] = [
  { lang: 'hi', re: /[ऀ-ॿ]/ }, // Devanagari
  { lang: 'bn', re: /[ঀ-৿]/ }, // Bengali
  { lang: 'ar', re: /[؀-ۿ]/ }, // Arabic
  { lang: 'fa', re: /[ݐ-ݿ]/ }, // Arabic supplement (Persian/Urdu extras)
  { lang: 'ru', re: /[Ѐ-ӿ]/ }, // Cyrillic
  { lang: 'he', re: /[֐-׿]/ }, // Hebrew
  { lang: 'el', re: /[Ͱ-Ͽ]/ }, // Greek
  { lang: 'th', re: /[฀-๿]/ }, // Thai
  { lang: 'ko', re: /[가-힯]/ }, // Hangul
  { lang: 'ja', re: /[぀-ヿ]/ }, // Hiragana/Katakana
  { lang: 'zh', re: /[一-鿿]/ }, // CJK Han
]

/** Best-guess ISO-639-1 language of a string by dominant script. 'en' if Latin. */
export function detectLang(text: string): string {
  if (!text) return 'en'
  // Kana / Hangul uniquely identify Japanese / Korean even when Han (Kanji) chars
  // outnumber them, so check those first before the dominant-count pass.
  if (/[぀-ヿ]/.test(text)) return 'ja'
  if (/[가-힯]/.test(text)) return 'ko'
  let best = 'en', bestCount = 0
  for (const { lang, re } of SCRIPTS) {
    const m = text.match(new RegExp(re, 'g'))
    const n = m ? m.length : 0
    if (n > bestCount) { bestCount = n; best = lang }
  }
  // Require a meaningful share of non-Latin chars before declaring non-English.
  return bestCount >= 2 ? best : 'en'
}

export function isLikelyEnglish(text: string): boolean {
  return detectLang(text) === 'en'
}

export interface NewsLocale { hl: string; gl: string; ceid: string }

// Country → primary local-language Google-News locale (for OSINT, the local language
// surfaces local reporting). Anything not listed defaults to English-US. `ceid`
// override for editions whose ceid isn't simply `GL:hl` (script-suffixed Chinese —
// the naive CN:zh ceid is invalid and silently returns an empty feed).
const COUNTRY_LOCALE: Record<string, { hl: string; gl: string; ceid?: string }> = {
  IN: { hl: 'hi', gl: 'IN' }, PK: { hl: 'ur', gl: 'PK' }, BD: { hl: 'bn', gl: 'BD' },
  CN: { hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-Hans' },
  TW: { hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant' },
  JP: { hl: 'ja', gl: 'JP' },
  KR: { hl: 'ko', gl: 'KR' }, RU: { hl: 'ru', gl: 'RU' }, UA: { hl: 'uk', gl: 'UA' },
  IR: { hl: 'fa', gl: 'IR' }, SA: { hl: 'ar', gl: 'SA' }, EG: { hl: 'ar', gl: 'EG' },
  IQ: { hl: 'ar', gl: 'IQ' }, SY: { hl: 'ar', gl: 'SY' }, YE: { hl: 'ar', gl: 'YE' },
  TR: { hl: 'tr', gl: 'TR' }, FR: { hl: 'fr', gl: 'FR' }, DE: { hl: 'de', gl: 'DE' },
  ES: { hl: 'es', gl: 'ES' }, MX: { hl: 'es', gl: 'MX' }, CO: { hl: 'es', gl: 'CO' },
  BR: { hl: 'pt', gl: 'BR' }, PT: { hl: 'pt', gl: 'PT' }, IT: { hl: 'it', gl: 'IT' },
  TH: { hl: 'th', gl: 'TH' }, VN: { hl: 'vi', gl: 'VN' }, ID: { hl: 'id', gl: 'ID' },
  IL: { hl: 'he', gl: 'IL' }, GR: { hl: 'el', gl: 'GR' }, ET: { hl: 'am', gl: 'ET' },
}

export function newsLocale(countryCode?: string): NewsLocale {
  const c = (countryCode || '').toUpperCase()
  const m = COUNTRY_LOCALE[c]
  if (!m) return { hl: 'en-US', gl: 'US', ceid: 'US:en' }
  return { hl: m.hl, gl: m.gl, ceid: m.ceid ?? `${m.gl}:${m.hl}` }
}

/**
 * Same-language editions published OUTSIDE a language's home country — for
 * languages whose home edition is censored or thin, the free-press editions in
 * that language carry the reporting (e.g. mainland China blocks Google News, so
 * Chinese-language coverage lives in the Taiwan/Hong Kong editions). Keyed by
 * base language, not country — generic and extensible, nothing region-specific.
 */
const FALLBACK_EDITIONS: Record<string, NewsLocale[]> = {
  zh: [
    { hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-Hant' },
    { hl: 'zh-HK', gl: 'HK', ceid: 'HK:zh-Hant' },
  ],
}

/** Fallback editions for a locale's base language (empty for most languages). */
export function fallbackEditions(local: NewsLocale): NewsLocale[] {
  const base = local.hl.split('-')[0]
  return (FALLBACK_EDITIONS[base] ?? []).filter(f => f.ceid !== local.ceid)
}

/**
 * Sub-national language regions that have a real Google News edition. When the
 * project's focus place names one of these regions, that language edition is
 * queried IN ADDITION to the country default — a West Bengal project pulls
 * Bengali reporting, not just Hindi + English. Only languages Google News
 * actually publishes as an edition (a valid ceid) belong here; a match adds
 * `{COUNTRY}:{hl}` so a bad guess would just return an empty feed, never junk.
 */
const REGIONAL_EDITIONS: Record<string, { hl: string; re: RegExp }[]> = {
  IN: [
    { hl: 'bn', re: /\b(west bengal|bengal|kolkata|calcutta|howrah|siliguri|tripura|agartala)\b/i },
    { hl: 'ta', re: /\b(tamil nadu|chennai|madras|coimbatore|madurai)\b/i },
    { hl: 'te', re: /\b(telangana|andhra pradesh|andhra|hyderabad|visakhapatnam|vijayawada)\b/i },
    { hl: 'ml', re: /\b(kerala|kochi|thiruvananthapuram|kozhikode)\b/i },
    { hl: 'mr', re: /\b(maharashtra|mumbai|bombay|pune|nagpur|nashik)\b/i },
    { hl: 'gu', re: /\b(gujarat|ahmedabad|surat|vadodara|rajkot)\b/i },
    { hl: 'kn', re: /\b(karnataka|bengaluru|bangalore|mysuru|mysore|mangaluru)\b/i },
    { hl: 'pa', re: /\b(punjab|amritsar|ludhiana|jalandhar|patiala|chandigarh)\b/i },
    // Delhi NCR / campus politics — Urdu edition often carries Jamia / north-Delhi beats
    { hl: 'ur', re: /\b(delhi|new delhi|noida|gurgaon|gurugram|jamia|okhla|shaheen bagh)\b/i },
  ],
  CA: [
    { hl: 'fr', re: /\b(quebec|québec|montreal|montréal|gatineau|laval|sherbrooke)\b/i },
  ],
  BE: [
    { hl: 'nl', re: /\b(flanders|vlaanderen|antwerp|antwerpen|ghent|gent|bruges|brugge|leuven|brussels|brussel)\b/i },
    { hl: 'fr', re: /\b(wallonia|wallonie|liège|liege|namur|charleroi|mons|brussels|bruxelles)\b/i },
  ],
  CH: [
    { hl: 'de', re: /\b(zurich|zürich|bern|basel|lucerne|luzern|st\.? ?gallen)\b/i },
    { hl: 'fr', re: /\b(geneva|genève|geneve|lausanne|fribourg|neuchâtel|neuchatel|valais)\b/i },
    { hl: 'it', re: /\b(ticino|lugano|bellinzona)\b/i },
  ],
  UA: [
    { hl: 'ru', re: /\b(donetsk|luhansk|lugansk|crimea|sevastopol|kharkiv|kharkov|mariupol|odesa|odessa|zaporizhzhia)\b/i },
  ],
}

/** Regional-language editions whose region is named in the free-text place/topic terms. */
export function regionalEditions(countryCode?: string, placeText?: string): NewsLocale[] {
  const c = (countryCode || '').toUpperCase()
  const text = (placeText || '').trim()
  if (!c || !text) return []
  return (REGIONAL_EDITIONS[c] ?? [])
    .filter(r => r.re.test(text))
    .map(r => ({ hl: r.hl, gl: c, ceid: `${c}:${r.hl}` }))
}

/**
 * Editions to query for a country: the local-language edition, any regional
 * editions named in `placeText` (state/city granularity — see REGIONAL_EDITIONS),
 * PLUS an English edition for the same region. Running all of them surfaces
 * local-language reporting — where the real local political news usually lives —
 * alongside English coverage, with no translation key required. De-dupes when
 * the local edition is English or a regional match repeats the country default.
 */
export function newsEditions(countryCode?: string, placeText?: string): NewsLocale[] {
  const local = newsLocale(countryCode)
  const c = (countryCode || '').toUpperCase()
  const editions: NewsLocale[] = [local]
  for (const fb of fallbackEditions(local)) {
    if (!editions.some(e => e.ceid === fb.ceid)) editions.push(fb)
  }
  for (const reg of regionalEditions(c, placeText)) {
    if (!editions.some(e => e.ceid === reg.ceid)) editions.push(reg)
  }
  if (c && local.hl.split('-')[0] !== 'en') {
    editions.push({ hl: 'en', gl: c, ceid: `${c}:en` })
  }
  return editions
}
