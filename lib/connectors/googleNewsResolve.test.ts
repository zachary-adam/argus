import { describe, it, expect } from 'vitest'
import { isGoogleNewsUrl, resolveGoogleNewsUrl } from './googleNewsResolve'

describe('googleNewsResolve', () => {
  describe('isGoogleNewsUrl', () => {
    it('detects Google News RSS redirect links', () => {
      expect(isGoogleNewsUrl('https://news.google.com/rss/articles/CBMiabc123?oc=5')).toBe(true)
      expect(isGoogleNewsUrl('http://news.google.com/rss/articles/AU_yqL')).toBe(true)
    })
    it('rejects publisher and non-article Google URLs', () => {
      expect(isGoogleNewsUrl('https://www.reuters.com/world/india/story')).toBe(false)
      expect(isGoogleNewsUrl('https://news.google.com/search?q=x')).toBe(false)
      expect(isGoogleNewsUrl(undefined)).toBe(false)
      expect(isGoogleNewsUrl('')).toBe(false)
    })
  })

  describe('resolveGoogleNewsUrl', () => {
    it('returns non-Google URLs unchanged without any network call', async () => {
      const u = 'https://www.tribuneindia.com/news/india/story-123'
      await expect(resolveGoogleNewsUrl(u)).resolves.toBe(u)
    })
  })
})
