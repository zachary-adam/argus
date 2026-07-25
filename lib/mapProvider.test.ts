import { describe, expect, it } from 'vitest'
import { resolveMapStyle, FREE_MAP_STYLE, MAPBOX_STYLE, FREE_MAP_STYLE_FALLBACK } from './mapProvider'

describe('mapProvider', () => {
  it('exposes a keyless free style and a fallback', () => {
    expect(FREE_MAP_STYLE).toMatch(/^https:\/\//)
    expect(FREE_MAP_STYLE_FALLBACK).toMatch(/^https:\/\//)
  })

  it('resolves Mapbox style when a token is passed', () => {
    expect(resolveMapStyle('pk.test')).toBe(MAPBOX_STYLE)
    expect(resolveMapStyle('')).toBe(FREE_MAP_STYLE)
  })
})
