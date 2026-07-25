import { describe, it, expect } from 'vitest'
import { needsFullText, MIN_BODY_CHARS } from './enrichFullText'

describe('needsFullText', () => {
  it('selects http(s) events with a headline-only body', () => {
    expect(needsFullText({ url: 'https://example.com/a', body: 'short' })).toBe(true)
    expect(needsFullText({ url: 'http://example.com/a', body: undefined })).toBe(true)
  })

  it('skips events that already have full text', () => {
    expect(needsFullText({ url: 'https://example.com/a', body: 'x'.repeat(MIN_BODY_CHARS) })).toBe(false)
  })

  it('skips events without a fetchable URL', () => {
    expect(needsFullText({ url: '', body: 'short' })).toBe(false)
    expect(needsFullText({ url: 'mailto:x@y.com', body: 'short' })).toBe(false)
    expect(needsFullText({ url: 'javascript:alert(1)', body: '' })).toBe(false)
  })
})
