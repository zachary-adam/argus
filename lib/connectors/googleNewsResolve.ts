/**
 * Resolve a Google News RSS redirect URL to the real publisher URL.
 *
 * Google News RSS items link to `news.google.com/rss/articles/CBMi…` redirect
 * pages, not the publisher. Modern (`AU_yqL…`) links resolve client-side via a
 * JS `batchexecute` call — there is no HTTP redirect and the payload no longer
 * embeds the target URL, so a plain fetch of the RSS link yields a Google app
 * shell with no article text. That silently starved full-text enrichment: every
 * Google-News-sourced event stayed a headline.
 *
 * This replays the two-step resolution the page itself performs:
 *   1. GET the article page → scrape the `data-n-a-sg` (signature) and
 *      `data-n-a-ts` (timestamp) tokens.
 *   2. POST those to the `DotsSplashUi` `batchexecute` endpoint → publisher URL.
 *
 * Best-effort: any failure returns the original URL so the caller falls back to
 * the headline. Brittle by nature (undocumented endpoint), hence fully guarded.
 */

const ARTICLE_PREFIX = '/rss/articles/'
const BATCH_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export function isGoogleNewsUrl(url: string | undefined): boolean {
  return !!url && /^https?:\/\/news\.google\.com\/rss\/articles\//i.test(url)
}

function articleId(url: string): string | null {
  const i = url.indexOf(ARTICLE_PREFIX)
  if (i === -1) return null
  return url.slice(i + ARTICLE_PREFIX.length).split('?')[0].split('/')[0] || null
}

/**
 * Returns the resolved publisher URL, or the original URL if resolution fails.
 * Never throws.
 */
export async function resolveGoogleNewsUrl(url: string, timeoutMs = 12000): Promise<string> {
  if (!isGoogleNewsUrl(url)) return url
  const id = articleId(url)
  if (!id) return url

  try {
    const pageRes = await fetch(`https://news.google.com${ARTICLE_PREFIX}${id}`, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!pageRes.ok) return url
    const html = await pageRes.text()
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
    if (!sg || !ts) return url

    const inner = JSON.stringify([
      'garturlreq',
      [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
        'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      id, ts, sg,
    ])
    const freq = JSON.stringify([[['Fbv4je', inner, null, 'generic']]])

    const batchRes = await fetch(BATCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({ 'f.req': freq }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!batchRes.ok) return url
    const text = await batchRes.text()
    const after = text.includes('garturlres') ? text.slice(text.indexOf('garturlres')) : text
    const resolved = after.match(/(https?:\/\/[^\\"]+)/)?.[1]
    if (resolved && !/news\.google\.com/.test(resolved)) return resolved
    return url
  } catch {
    return url
  }
}
