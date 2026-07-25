import { describe, it, expect, beforeEach } from 'vitest'
import { clearClientCaches } from './clientCache'
import { clearRelevanceCache } from './relevanceClient'
import { getNlqQueryCache, setNlqQueryCache, clearNlqQueryCache } from './nlqQueryCache'

describe('clientCache', () => {
  beforeEach(() => {
    clearNlqQueryCache()
    clearRelevanceCache()
  })

  it('clears NLQ and relevance caches', () => {
    setNlqQueryCache('test', 5, {
      matchingIds: ['a'],
      summary: 'ok',
      appliedFilters: 'all',
      flyTo: null,
    })
    expect(getNlqQueryCache('test', 5)).not.toBeNull()

    const result = clearClientCaches()
    expect(result.cleared).toContain('NLQ query cache')
    expect(result.cleared).toContain('relevance verdicts')
    expect(getNlqQueryCache('test', 5)).toBeNull()
  })
})

describe('nlqQueryCache', () => {
  it('invalidates when event count changes', () => {
    setNlqQueryCache('q', 10, { matchingIds: [], summary: 'x', appliedFilters: 'y', flyTo: null })
    expect(getNlqQueryCache('q', 10)).not.toBeNull()
    expect(getNlqQueryCache('q', 11)).toBeNull()
  })
})
