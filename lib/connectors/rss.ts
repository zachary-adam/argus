import { NormalizedEvent } from '@/lib/normalize'
import { makeEvent, extractLocation, inferCategories, inferSeverity, classifyDomain, extractActors } from '@/lib/normalize'

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim()
}

function extractTag(xml: string, tag: string): string {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  ]
  for (const p of patterns) { const m = xml.match(p); if (m) return stripHtml(m[1].trim()) }
  return ''
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'))
  return m ? m[1] : ''
}

export function parseRSSXML(xml: string, feedUrl: string): NormalizedEvent[] {
  const items: string[] = []
  let m: RegExpExecArray | null
  const itemPat = /<item[^>]*>([\s\S]*?)<\/item>/gi
  const entryPat = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
  while ((m = itemPat.exec(xml)) !== null) items.push(m[1])
  while ((m = entryPat.exec(xml)) !== null) items.push(m[1])
  const domain = new URL(feedUrl).hostname
  const sourceType = classifyDomain(domain)
  return items.slice(0, 50).map(item => {
    const title = extractTag(item, 'title') || 'Untitled'
    const description = extractTag(item, 'description') || extractTag(item, 'summary') || extractTag(item, 'content')
    const link = extractTag(item, 'link') || extractAttr(item, 'link', 'href')
    const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'published') || extractTag(item, 'updated')
    const text = `${title} ${description}`
    let timestamp = new Date().toISOString()
    try { timestamp = new Date(pubDate).toISOString() } catch {}
    return makeEvent({
      title: title.slice(0, 200), description: description.slice(0, 1000), timestamp,
      location: extractLocation(text), actors: extractActors(text),
      categories: inferCategories(text), severity: inferSeverity(text),
      source: { name: domain, type: sourceType, url: link || feedUrl, credibility: sourceType === 'official' ? 60 : 80 },
      raw: { url: link || feedUrl, body: description.slice(0, 2000) },
    })
  })
}
