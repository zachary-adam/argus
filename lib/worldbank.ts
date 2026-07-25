import { getCache, setCache } from './cache'

interface WorldBankIndicator {
  value: number | null
  date: string
}

async function fetchIndicator(countryCode: string, indicator: string): Promise<WorldBankIndicator[]> {
  const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}?format=json&mrv=5&per_page=5`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data) || !data[1]) return []
    return data[1].map((d: Record<string, unknown>) => ({ value: d.value as number | null, date: d.date as string }))
  } catch {
    return []
  }
}

type WBData = { gdp: number; gdpGrowth: number; inflation: number; militarySpending: number; debtToGdp: number; economicHistory: { year: number; gdp: number; inflation: number }[] }

export async function fetchWorldBankData(countryCode: string): Promise<WBData> {
  const key = `wb-${countryCode}`
  const cached = getCache<WBData>(key)
  if (cached) return cached

  const [gdpData, gdpGrowthData, inflationData, militaryData, debtData] = await Promise.all([
    fetchIndicator(countryCode, 'NY.GDP.MKTP.CD'),
    fetchIndicator(countryCode, 'NY.GDP.MKTP.KD.ZG'),
    fetchIndicator(countryCode, 'FP.CPI.TOTL.ZG'),
    fetchIndicator(countryCode, 'MS.MIL.XPND.GD.ZS'),
    fetchIndicator(countryCode, 'GC.DOD.TOTL.GD.ZS'),
  ])

  const gdp = gdpData.find(d => d.value !== null)?.value || 0
  const gdpGrowth = gdpGrowthData.find(d => d.value !== null)?.value || 0
  const inflation = inflationData.find(d => d.value !== null)?.value || 0
  const militarySpending = militaryData.find(d => d.value !== null)?.value || 0
  const debtToGdp = debtData.find(d => d.value !== null)?.value || 0

  const economicHistory = gdpData
    .filter(d => d.value !== null)
    .map((d, i) => ({
      year: parseInt(d.date),
      gdp: (d.value || 0) / 1e9,
      inflation: inflationData[i]?.value || 0,
    }))
    .reverse()

  const result: WBData = { gdp: Number(gdp), gdpGrowth: Number(gdpGrowth), inflation: Number(inflation), militarySpending: Number(militarySpending), debtToGdp: Number(debtToGdp), economicHistory }
  setCache(key, result, 3600)
  return result
}
