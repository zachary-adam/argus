const CREDIBILITY: Record<string, number> = {
  'reuters.com': 92, 'apnews.com': 92, 'ap.org': 92,
  'theguardian.com': 90, 'nytimes.com': 90, 'bbc.com': 90, 'bbc.co.uk': 90,
  'washingtonpost.com': 88, 'wikipedia.org': 88, 'wsj.com': 88,
  'ft.com': 89, 'economist.com': 89, 'bloomberg.com': 87,
  'axios.com': 85, 'aljazeera.com': 84, 'france24.com': 84, 'dw.com': 84,
  'foreignpolicy.com': 83, 'thediplomat.com': 83,
  'reliefweb.int': 88, 'who.int': 92, 'un.org': 90, 'state.gov': 85,
  'defense.gov': 85, 'usgs.gov': 92, 'nasa.gov': 92,
  'twitter.com': 35, 'x.com': 35, 'facebook.com': 30, 't.me': 30, 'reddit.com': 40,
}

export function getCredibility(domain: string): number {
  const d = domain.toLowerCase().replace('www.', '')
  for (const [key, score] of Object.entries(CREDIBILITY)) {
    if (d.includes(key)) return score
  }
  return 65
}

/**
 * True if `s` is not human-readable text — a PDF/Office/binary blob decoded as
 * UTF-8, or mostly control/replacement characters. Guards against storing raw
 * `%PDF-…` bytes as an event body (which then poison the brief and the source
 * panel). PDFs are common in OSINT (gov reports, NGO casualty tallies).
 */
export function looksBinary(s: string): boolean {
  if (!s) return true
  const head = s.slice(0, 2048)
  if (head.includes('%PDF-') || head.includes('\u0000')) return true
  if (/^(PK\u0003\u0004|\u0025PDF|GIF8|\u00FF\u00D8\u00FF)/.test(head)) return true
  let bad = 0
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i)
    // replacement char, or control chars outside tab/newline/CR
    if (c === 0xfffd || (c < 32 && c !== 9 && c !== 10 && c !== 13)) bad++
  }
  return head.length > 0 && bad / head.length > 0.03
}

export function extractBody(html: string): string {
  if (looksBinary(html)) return ''
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  const block = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? cleaned

  const paras = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(t => t.length > 60)

  if (paras.length >= 2) return paras.slice(0, 12).join(' ').slice(0, 4000)

  return block.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 4000)
}

export async function fetchWithJinaFallback(url: string): Promise<{ html: string; body: string }> {
  const { safeFetch } = await import('@/lib/validateUrl')
  const res = await safeFetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ARGUS/1.0)', 'Accept': 'text/html' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`Page returned ${res.status}`)

  // PDFs / non-HTML docs can't be tag-stripped — decoding the bytes as text
  // yields `%PDF-…` garbage. Detect them and send straight to the Jina reader,
  // which renders PDFs (and other docs) to clean markdown text.
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
  const isDoc = /(pdf|octet-stream|msword|officedocument)/.test(contentType) || /\.pdf(\?|$)/i.test(url)

  const html = isDoc ? '' : await res.text()
  let body = isDoc ? '' : extractBody(html)

  if (body.length < 200) {
    try {
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: { 'Accept': 'text/plain', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (jinaRes.ok) {
        const jinaText = await jinaRes.text()
        // Never let binary/garbage through, even from the reader.
        if (!looksBinary(jinaText) && jinaText.length > body.length) body = jinaText.slice(0, 4000)
      }
    } catch {}
  }
  return { html, body }
}
