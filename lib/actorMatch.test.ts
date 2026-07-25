import { describe, it, expect } from 'vitest'
import { matchesWord, matchKnownActors } from './actorMatch'

describe('actor word-boundary matching', () => {
  it('does NOT collide on substrings (the includes() bug)', () => {
    expect(matchesWord('Violence erupts in Nigeria today', 'Niger')).toBe(false)
    expect(matchesWord('Clashes in Somaliland', 'Mali')).toBe(false)
    expect(matchesWord('UNICEF delivers aid', 'UN')).toBe(false)
    expect(matchesWord('Attack near Paris', 'IS')).toBe(false)
    expect(matchesWord('South Sudan crisis', 'Sudan')).toBe(true) // genuine whole-word
  })

  it('matches genuine whole-word mentions, case-insensitively', () => {
    expect(matchesWord('The UN said today', 'UN')).toBe(true)
    expect(matchesWord('isis claimed responsibility', 'ISIS')).toBe(true)
    expect(matchesWord('Niger coup unfolds', 'Niger')).toBe(true)
    expect(matchesWord('strike attributed to Hamas', 'Hamas')).toBe(true)
  })

  it('handles names with hyphens/special chars', () => {
    expect(matchesWord('Al-Qaeda affiliate', 'Al-Qaeda')).toBe(true)
    expect(matchesWord('reported by Hay\'at fighters', 'Hay\'at')).toBe(true)
  })

  it('matchKnownActors returns only whole-word hits', () => {
    const names = ['Niger', 'Nigeria', 'Mali', 'UN', 'Hamas']
    expect(matchKnownActors('Nigeria and Hamas in focus', names).sort()).toEqual(['Hamas', 'Nigeria'])
  })
})
