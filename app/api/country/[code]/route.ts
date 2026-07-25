import { NextRequest, NextResponse } from 'next/server'
import { CountryProfile, IntelEvent } from '@/types'
import { getCache, setCache } from '@/lib/cache'
import { fetchWorldBankData } from '@/lib/worldbank'
import { FREEDOM_SCORES, FRAGILITY_SCORES, SANCTIONED_COUNTRIES, CHOKEPOINTS } from '@/lib/constants'
import { haversineDistance } from '@/lib/haversine'

// Static fallback so the panel never shows a bare ISO code as the country name
const COUNTRY_NAMES: Record<string, { name: string; capital?: string; region?: string }> = {
  UA: { name: 'Ukraine',        capital: 'Kyiv',         region: 'Europe' },
  RU: { name: 'Russia',         capital: 'Moscow',       region: 'Europe' },
  IR: { name: 'Iran',           capital: 'Tehran',       region: 'Asia' },
  IL: { name: 'Israel',         capital: 'Jerusalem',    region: 'Asia' },
  PS: { name: 'Palestine',      capital: 'Ramallah',     region: 'Asia' },
  SY: { name: 'Syria',          capital: 'Damascus',     region: 'Asia' },
  IQ: { name: 'Iraq',           capital: 'Baghdad',      region: 'Asia' },
  YE: { name: 'Yemen',          capital: 'Sana\'a',      region: 'Asia' },
  LB: { name: 'Lebanon',        capital: 'Beirut',       region: 'Asia' },
  AF: { name: 'Afghanistan',    capital: 'Kabul',        region: 'Asia' },
  PK: { name: 'Pakistan',       capital: 'Islamabad',    region: 'Asia' },
  CN: { name: 'China',          capital: 'Beijing',      region: 'Asia' },
  IN: { name: 'India',          capital: 'New Delhi',    region: 'Asia' },
  US: { name: 'United States',  capital: 'Washington DC',region: 'Americas' },
  GB: { name: 'United Kingdom', capital: 'London',       region: 'Europe' },
  FR: { name: 'France',         capital: 'Paris',        region: 'Europe' },
  DE: { name: 'Germany',        capital: 'Berlin',       region: 'Europe' },
  SA: { name: 'Saudi Arabia',   capital: 'Riyadh',       region: 'Asia' },
  TR: { name: 'Turkey',         capital: 'Ankara',       region: 'Asia' },
  EG: { name: 'Egypt',          capital: 'Cairo',        region: 'Africa' },
  ET: { name: 'Ethiopia',       capital: 'Addis Ababa',  region: 'Africa' },
  SD: { name: 'Sudan',          capital: 'Khartoum',     region: 'Africa' },
  SO: { name: 'Somalia',        capital: 'Mogadishu',    region: 'Africa' },
  LY: { name: 'Libya',          capital: 'Tripoli',      region: 'Africa' },
  ML: { name: 'Mali',           capital: 'Bamako',       region: 'Africa' },
  MM: { name: 'Myanmar',        capital: 'Naypyidaw',    region: 'Asia' },
  KP: { name: 'North Korea',    capital: 'Pyongyang',    region: 'Asia' },
  VE: { name: 'Venezuela',      capital: 'Caracas',      region: 'Americas' },
  MX: { name: 'Mexico',         capital: 'Mexico City',  region: 'Americas' },
  BR: { name: 'Brazil',         capital: 'Brasília',     region: 'Americas' },
}

async function fetchCountryInfo(code: string) {
  try {
    const res = await fetch(`https://restcountries.com/v3.1/alpha/${code}`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const [country] = await res.json()
    return {
      name: country.name.common,
      capital: country.capital?.[0] || undefined,
      region: country.region,
      subregion: country.subregion,
      population: country.population,
      flag: '',
    }
  } catch { return null }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const upper = code.toUpperCase()
  const cacheKey = `country-${upper}`
  const cached = getCache<CountryProfile>(cacheKey)
  if (cached) return NextResponse.json(cached)

  const eventsUrl = new URL('/api/events', req.nextUrl.origin)
  const [countryInfo, wbData, eventsRes] = await Promise.all([
    fetchCountryInfo(upper),
    fetchWorldBankData(upper),
    fetch(eventsUrl.toString(), { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => []),
  ])

  const allEvents: IntelEvent[] = eventsRes || []
  const recentEvents = allEvents
    .filter(e => e.countryCode === upper || e.country.toLowerCase().includes((countryInfo?.name || upper).toLowerCase()))
    .slice(0, 15)

  const freedomScore = FREEDOM_SCORES[upper] ?? 50
  const fragilityScore = FRAGILITY_SCORES[upper] ?? 40
  const conflictCount = recentEvents.filter(e => e.category === 'conflict').length
  const inflation = wbData.inflation || 0
  const sanctioned = SANCTIONED_COUNTRIES.includes(upper)

  const nearChokepoint = CHOKEPOINTS.some(cp => {
    if (!recentEvents.length) return false
    return recentEvents.some(e => haversineDistance(e.lat, e.lon, cp.lat, cp.lon) < 500)
  })

  let riskScore = 30
  riskScore += (100 - freedomScore) * 0.2
  riskScore += fragilityScore * 0.2
  riskScore += Math.min(20, conflictCount * 3)
  riskScore += inflation > 20 ? 10 : inflation > 10 ? 5 : 0
  riskScore += nearChokepoint ? 5 : 0
  riskScore += sanctioned ? 15 : 0
  riskScore = Math.min(95, Math.round(riskScore))

  const profile: CountryProfile = {
    name: countryInfo?.name || COUNTRY_NAMES[upper]?.name || upper,
    code: upper,
    capital: countryInfo?.capital || COUNTRY_NAMES[upper]?.capital || 'Unknown',
    region: countryInfo?.region || COUNTRY_NAMES[upper]?.region || 'Unknown',
    subregion: countryInfo?.subregion || 'Unknown',
    population: countryInfo?.population || 0,
    flag: countryInfo?.flag || '',
    riskScore,
    gdp: wbData.gdp,
    gdpGrowth: wbData.gdpGrowth,
    inflation: wbData.inflation,
    militarySpending: wbData.militarySpending,
    debtToGdp: wbData.debtToGdp,
    freedomScore,
    fragilityScore,
    recentEvents,
    economicHistory: wbData.economicHistory,
  }

  setCache(cacheKey, profile, 3600)
  return NextResponse.json(profile)
}
