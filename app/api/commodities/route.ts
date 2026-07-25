import { NextResponse } from 'next/server'
import { Commodity } from '@/types'
import { getCache, setCache } from '@/lib/cache'

const SYMBOLS = [
  { yahoo: 'CL=F',     name: 'WTI Crude',   symbol: 'WTI' },
  { yahoo: 'BZ=F',     name: 'Brent Crude',  symbol: 'BRENT' },
  { yahoo: 'GC=F',     name: 'Gold',         symbol: 'XAU' },
  { yahoo: 'SI=F',     name: 'Silver',       symbol: 'XAG' },
  { yahoo: 'NG=F',     name: 'Natural Gas',  symbol: 'NG' },
  { yahoo: 'ZW=F',     name: 'Wheat',        symbol: 'ZW' },
  { yahoo: 'HG=F',     name: 'Copper',       symbol: 'HG' },
  { yahoo: 'BTC-USD',  name: 'Bitcoin',      symbol: 'BTC' },
  { yahoo: '^GSPC',    name: 'S&P 500',      symbol: 'SPX' },
  { yahoo: 'DX-Y.NYB', name: 'USD Index',    symbol: 'DXY' },
]

async function fetchRealPrices(): Promise<Commodity[]> {
  const results: Commodity[] = []
  for (const s of SYMBOLS) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.yahoo)}?range=2d&interval=1d`
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'ARGUS/1.0' },
      })
      if (!res.ok) continue
      const data = await res.json()
      const meta = data.chart?.result?.[0]?.meta
      if (!meta) continue
      const price = meta.regularMarketPrice
      const prevClose = meta.previousClose || meta.chartPreviousClose
      if (!price || !prevClose) continue
      const change = price - prevClose
      const changePercent = (change / prevClose) * 100
      results.push({
        symbol: s.symbol,
        name: s.name,
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        trend: Math.abs(changePercent) < 0.05 ? 'flat' : changePercent > 0 ? 'up' : 'down',
      })
    } catch { continue }
  }
  return results
}

export async function GET() {
  const cached = getCache<Commodity[]>('commodities')
  if (cached) return NextResponse.json(cached)

  const commodities = await fetchRealPrices()
  // Only cache and return real data — never fake prices
  if (commodities.length > 0) setCache('commodities', commodities, 120)
  return NextResponse.json(commodities)
}
