import { NextRequest, NextResponse } from 'next/server'

// Wikipedia article names for countries that differ from their plain name
const ARTICLE_MAP: Record<string, string> = {
  'Gaza':                              'Gaza_Strip',
  'Palestine':                         'Palestinian_territories',
  'Democratic Republic of the Congo':  'Democratic_Republic_of_the_Congo',
  'Republic of the Congo':             'Republic_of_the_Congo',
  'South Sudan':                       'South_Sudan',
  'North Korea':                       'North_Korea',
  'South Korea':                       'South_Korea',
  'Central African Republic':          'Central_African_Republic',
  'Burkina Faso':                      'Burkina_Faso',
  'Sierra Leone':                      'Sierra_Leone',
  'Ivory Coast':                       'Ivory_Coast',
  'Saudi Arabia':                      'Saudi_Arabia',
  'United Arab Emirates':              'United_Arab_Emirates',
  'Sri Lanka':                         'Sri_Lanka',
  'Papua New Guinea':                  'Papua_New_Guinea',
  'Bosnia and Herzegovina':            'Bosnia_and_Herzegovina',
  'North Macedonia':                   'North_Macedonia',
  'Trinidad and Tobago':               'Trinidad_and_Tobago',
  'Dominican Republic':                'Dominican_Republic',
}

function articleFor(country: string): string {
  return ARTICLE_MAP[country] ?? country.replace(/\s+/g, '_')
}

function fmtDate(d: Date): string {
  return d.toISOString().replace(/-/g, '').slice(0, 8) + '00'
}

interface WikiItem { timestamp: string; views: number }

interface VoidResult {
  country: string
  voidPct: number
  zScore: number
  recentMean: number
  baselineMean: number
  daysRunning: number
  sparkline: number[]          // last 30 days, normalized 0-100
  severity: 'critical' | 'high' | 'moderate'
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('countries') ?? ''
  const countries = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 12)

  if (countries.length === 0) return NextResponse.json({ voids: [] })

  const end   = new Date()
  const start = new Date(end.getTime() - 91 * 86_400_000)

  const settled = await Promise.allSettled(
    countries.map(async (country) => {
      const article = articleFor(country)
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(article)}/daily/${fmtDate(start)}/${fmtDate(end)}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ARGUS-OpenIntelligence/1.0 (hello@thezacharyadam.com)' },
        next: { revalidate: 3600 },
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      const items: WikiItem[] = (data.items ?? []).map((i: Record<string, unknown>) => ({
        timestamp: String(i.timestamp),
        views: Number(i.views) || 0,
      }))
      return { country, items }
    })
  )

  const voids: VoidResult[] = []

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const { country, items } = result.value
    if (items.length < 14) continue

    // Baseline = everything except the last 7 days
    const recent   = items.slice(-7)
    const baseline = items.slice(0, -7)

    const recentMean   = recent.reduce((s, i) => s + i.views, 0) / recent.length
    const baselineMean = baseline.reduce((s, i) => s + i.views, 0) / baseline.length
    if (baselineMean === 0) continue

    const baselineVariance = baseline.reduce((s, i) => s + Math.pow(i.views - baselineMean, 2), 0) / baseline.length
    const baselineStd      = Math.sqrt(baselineVariance)
    const zScore           = baselineStd > 0 ? (recentMean - baselineMean) / baselineStd : 0
    const voidPct          = Math.round(((baselineMean - recentMean) / baselineMean) * 100)

    if (voidPct < 15) continue  // Not significant

    // Count consecutive days below 60% of baseline
    const threshold  = baselineMean * 0.6
    let daysRunning  = 0
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].views < threshold) daysRunning++
      else break
    }

    // Sparkline: last 30 days, bar heights normalized 0-100
    const last30   = items.slice(-30)
    const maxViews = Math.max(...last30.map(i => i.views), 1)
    const sparkline = last30.map(i => Math.round((i.views / maxViews) * 100))

    const severity: VoidResult['severity'] =
      voidPct >= 60 ? 'critical' : voidPct >= 40 ? 'high' : 'moderate'

    voids.push({ country, voidPct, zScore: Math.round(zScore * 10) / 10, recentMean: Math.round(recentMean), baselineMean: Math.round(baselineMean), daysRunning, sparkline, severity })
  }

  voids.sort((a, b) => b.voidPct - a.voidPct)

  return NextResponse.json({ voids })
}
