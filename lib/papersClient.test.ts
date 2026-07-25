import { describe, expect, it } from 'vitest'
import { looksLikeDoi, normalizeDoi } from './papersClient'

describe('normalizeDoi', () => {
  it('parses bare DOI', () => {
    expect(normalizeDoi('10.1038/nature12373')).toBe('10.1038/nature12373')
  })

  it('parses doi.org URL', () => {
    expect(normalizeDoi('https://doi.org/10.1038/nature12373')).toBe('10.1038/nature12373')
  })

  it('rejects non-DOI', () => {
    expect(normalizeDoi('ukraine conflict')).toBeNull()
    expect(looksLikeDoi('ukraine conflict')).toBe(false)
  })
})
