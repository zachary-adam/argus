import { vaultGet } from '@/lib/vault'
import { NormalizedEvent } from '@/lib/normalize'
import { getAcledAccessToken } from '@/lib/connectors/acledAuth'

// ISO 2-letter → ACLED country name (as expected by their API)
const CODE_TO_ACLED: Record<string, string> = {
  AF: 'Afghanistan', DZ: 'Algeria', AO: 'Angola', AR: 'Argentina',
  AM: 'Armenia', AZ: 'Azerbaijan', BD: 'Bangladesh', BY: 'Belarus',
  BJ: 'Benin', BF: 'Burkina Faso', BI: 'Burundi', CM: 'Cameroon',
  CF: 'Central African Republic', TD: 'Chad', CO: 'Colombia',
  CD: 'Democratic Republic of Congo', CG: 'Republic of Congo',
  CI: "Cote d'Ivoire", EG: 'Egypt', ER: 'Eritrea', ET: 'Ethiopia',
  GH: 'Ghana', GN: 'Guinea', GW: 'Guinea-Bissau', HT: 'Haiti',
  IN: 'India', ID: 'Indonesia', IQ: 'Iraq', IR: 'Iran',
  IL: 'Israel', JO: 'Jordan', KZ: 'Kazakhstan', KE: 'Kenya',
  KP: 'North Korea', KR: 'South Korea', KG: 'Kyrgyzstan',
  LB: 'Lebanon', LR: 'Liberia', LY: 'Libya',
  MW: 'Malawi', ML: 'Mali', MR: 'Mauritania', MX: 'Mexico',
  MD: 'Moldova', MA: 'Morocco', MZ: 'Mozambique', MM: 'Myanmar',
  NP: 'Nepal', NE: 'Niger', NG: 'Nigeria', PK: 'Pakistan',
  PS: 'Palestine', PE: 'Peru', PH: 'Philippines', RU: 'Russia',
  RW: 'Rwanda', SA: 'Saudi Arabia', SN: 'Senegal', SL: 'Sierra Leone',
  SO: 'Somalia', ZA: 'South Africa', SS: 'South Sudan', SD: 'Sudan',
  SY: 'Syria', TJ: 'Tajikistan', TZ: 'Tanzania', TH: 'Thailand',
  TL: 'Timor-Leste', TG: 'Togo', TN: 'Tunisia', TR: 'Turkey',
  TM: 'Turkmenistan', UG: 'Uganda', UA: 'Ukraine', AE: 'United Arab Emirates',
  UZ: 'Uzbekistan', VE: 'Venezuela', YE: 'Yemen', ZM: 'Zambia', ZW: 'Zimbabwe',
  MK: 'North Macedonia', LK: 'Sri Lanka', KW: 'Kuwait', CN: 'China',
}

const ACLED_SEVERITY: Record<string, NormalizedEvent['severity']> = {
  'Battles': 'critical',
  'Violence against civilians': 'critical',
  'Explosions/Remote violence': 'high',
  'Riots': 'high',
  'Protests': 'medium',
  'Strategic developments': 'low',
}

function acledCategory(eventType: string): NormalizedEvent['categories'][0] {
  const t = eventType.toLowerCase()
  if (t.includes('protest')) return 'social'
  if (t.includes('strategic')) return 'political'
  return 'conflict'
}

export class AcledNoCredsError extends Error {}
export class AcledAccessDeniedError extends Error {}

function acledCountryFilter(countryCodes: string[]): string | undefined {
  const names = [...new Set(countryCodes.map(c => CODE_TO_ACLED[c.toUpperCase()]).filter(Boolean))]
  if (names.length === 0) return undefined
  if (names.length === 1) return names[0]
  return names.map(n => `country=${n}`).join(':OR:')
}

function mapAcledRow(e: Record<string, unknown>, i: number): NormalizedEvent | null {
  const lat = Number(e.latitude)
  const lon = Number(e.longitude)
  if (!lat && !lon) return null
  return {
    id: `acled-${e.data_id ?? e.event_id_cnty ?? i}-${Date.now()}`,
    title: `${e.event_type} — ${e.country}: ${e.actor1}${e.actor2 ? ` vs ${e.actor2}` : ''}`,
    description: String(e.notes || `ACLED records ${e.event_type} event in ${e.location || e.country}.`).slice(0, 300),
    timestamp: new Date(String(e.event_date)).toISOString(),
    location: {
      name: String(e.location || e.country || 'Unknown'),
      lat,
      lng: lon,
      country: String(e.country || 'Unknown'),
      region: String(e.region || ''),
    },
    actors: [String(e.actor1 || ''), String(e.actor2 || '')].filter(Boolean),
    categories: [acledCategory(String(e.event_type || ''))],
    severity: ACLED_SEVERITY[String(e.event_type)] ?? 'medium',
    source: { name: 'acled', type: 'official' as const, url: 'https://acleddata.com', credibility: 0.92 },
    raw: { fatalities: Number(e.fatalities) || 0 },
  }
}

/**
 * ACLED — curated, geo-coded armed-conflict & protest events, scoped to the project's
 * countries. Uses OAuth2 (myACLED email + password). Throws AcledNoCredsError when
 * credentials are missing.
 */
export async function fetchACLEDConnector(countryCodes: string[] = []): Promise<NormalizedEvent[]> {
  const email = vaultGet('ACLED_EMAIL') ?? process.env.ACLED_EMAIL
  const password = vaultGet('ACLED_PASSWORD') ?? process.env.ACLED_PASSWORD
  if (!email || !password) {
    throw new AcledNoCredsError('ACLED credentials required. Add myACLED email + password in Settings → API Keys.')
  }

  const token = await getAcledAccessToken(email, password)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const until = new Date().toISOString().slice(0, 10)

  const params = new URLSearchParams({
    limit: '200',
    event_date: `${since}|${until}`,
    event_date_where: 'BETWEEN',
  })
  const countryFilter = acledCountryFilter(countryCodes)
  if (countryFilter) params.set('country', countryFilter)

  const res = await fetch(`https://acleddata.com/api/acled/read?_format=json&${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (res.status === 403) {
    throw new AcledAccessDeniedError(
      'ACLED API access denied — your myACLED account may be on Open tier (no API). Use an institutional email and request Research/Partner access at access@acleddata.com, or verify login at acleddata.com/myacled.',
    )
  }
  if (!res.ok) throw new Error(`ACLED API error ${res.status}: ${text.slice(0, 200)}`)

  const data = JSON.parse(text) as { status?: number; success?: boolean; data?: Record<string, unknown>[]; error?: string; message?: string }
  const rows = data.data ?? []
  if (data.status && data.status !== 200 && rows.length === 0) {
    throw new Error(data.error ?? data.message ?? `ACLED API status ${data.status}`)
  }
  if (data.success === false) throw new Error(data.error ?? 'ACLED API returned an error')

  return rows
    .slice(0, 200)
    .map((e, i) => mapAcledRow(e, i))
    .filter((e): e is NormalizedEvent => !!e)
}
