import { NextRequest, NextResponse } from 'next/server'
import { vaultGet } from '@/lib/vault'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

async function searchBrave(query: string, apiKey: string, count: number) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&search_lang=en&result_filter=web`
  const res = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`Brave Search returned ${res.status}`)
  const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string; meta_url?: { netloc?: string } }> } }
  return (data.web?.results ?? []).map(r => ({
    title: r.title, url: r.url, snippet: r.description ?? '',
    domain: r.meta_url?.netloc ?? new URL(r.url).hostname.replace('www.', ''),
  }))
}

async function searchSerper(query: string, apiKey: string, count: number) {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST', headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, num: count }), signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Serper returned ${res.status}`)
  const data = await res.json() as { organic?: Array<{ title: string; link: string; snippet: string }> }
  return (data.organic ?? []).map(r => ({
    title: r.title, url: r.link, snippet: r.snippet ?? '',
    domain: new URL(r.link).hostname.replace('www.', ''),
  }))
}

export async function GET() {
  const hasSerper = !!(vaultGet('SERPER_API_KEY') ?? process.env.SERPER_API_KEY)
  const hasBrave  = !!(vaultGet('BRAVE_API_KEY')  ?? process.env.BRAVE_API_KEY)
  return NextResponse.json({ serper: hasSerper, brave: hasBrave })
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`websearch:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    // apiKey in body is accepted as fallback for backward-compat; vault always wins
    const { query, engine, apiKey: clientKey, count = 20 } = await req.json() as {
      query: string; engine: 'brave' | 'serper'; apiKey?: string; count?: number
    }
    if (!query?.trim()) return NextResponse.json({ error: 'query required' }, { status: 400 })

    const apiKey = engine === 'serper'
      ? (process.env.SERPER_API_KEY || vaultGet('SERPER_API_KEY') || clientKey || '')
      : (process.env.BRAVE_API_KEY || vaultGet('BRAVE_API_KEY') || clientKey || '')

    if (!apiKey) {
      return NextResponse.json(
        { error: `No ${engine === 'serper' ? 'SERPER_API_KEY' : 'BRAVE_API_KEY'} found. Save it in the Vault.` },
        { status: 400 }
      )
    }

    const results = engine === 'serper'
      ? await searchSerper(query, apiKey, Math.min(count, 30))
      : await searchBrave(query, apiKey, Math.min(count, 20))
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
