import { describe, it, expect } from 'vitest'
import { looksBinary, extractBody, getCredibility } from './scrapeUtils'

describe('scrapeUtils', () => {
  describe('looksBinary', () => {
    it('flags raw PDF bytes', () => {
      expect(looksBinary('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n353 0 obj')).toBe(true)
    })
    it('flags content with embedded NUL / control noise', () => {
      expect(looksBinary('h\u0000\u0001\u0002\u0003\u0004bbd```b``:')).toBe(true)
    })
    it('flags empty/whitespace', () => {
      expect(looksBinary('')).toBe(true)
    })
    it('accepts clean article prose', () => {
      const prose = 'Army Chief Gen Dwivedi reviewed Fire and Fury Corps operational readiness at Leh on Saturday, urging troops to stay mission-focused along the Line of Actual Control.'
      expect(looksBinary(prose)).toBe(false)
    })
  })

  describe('extractBody', () => {
    it('returns empty string for binary/PDF input rather than garbage', () => {
      expect(extractBody('%PDF-1.7%\u00e2\u00e3 353 0 obj >endobj 370 0 obj')).toBe('')
    })
    it('extracts paragraph text from HTML', () => {
      const html = '<html><body><article><p>India deployed senior military leadership to Ladakh this week in a coordinated readiness review across the Line of Actual Control.</p><p>The Army Chief inspected forward positions and reviewed disengagement progress at friction points in the sector.</p></article></body></html>'
      const body = extractBody(html)
      expect(body).toContain('India deployed senior military leadership')
      expect(body).toContain('disengagement progress')
      expect(body).not.toContain('<p>')
    })
  })

  describe('getCredibility', () => {
    it('scores known outlets and defaults the rest', () => {
      expect(getCredibility('www.reuters.com')).toBe(92)
      expect(getCredibility('some-blog.example')).toBe(65)
    })
  })
})
