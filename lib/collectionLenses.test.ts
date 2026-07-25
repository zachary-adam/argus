import { describe, expect, it } from 'vitest'
import { deriveCollectionLenses } from './collectionLenses'

describe('deriveCollectionLenses', () => {
  it('builds primary + per-country + per-entity lenses for bilateral missions', () => {
    const lenses = deriveCollectionLenses(
      {
        placeName: 'Ladakh, India',
        keywords: ['border', 'standoff', 'LAC'],
        watchEntities: ['PLA', 'Indian Army'],
      },
      ['IN', 'CN'],
    )
    const ids = lenses.map(l => l.id)
    expect(ids).toContain('primary')
    expect(ids.some(id => id.startsWith('country-'))).toBe(true)
    expect(ids.some(id => id.startsWith('entity-'))).toBe(true)
    expect(lenses.find(l => l.id === 'country-cn')?.query.toLowerCase()).toContain('china')
  })

  it('de-dupes identical queries', () => {
    const lenses = deriveCollectionLenses({ keywords: ['election'], watchEntities: [] }, ['US'])
    const queries = lenses.map(l => l.query)
    expect(new Set(queries).size).toBe(queries.length)
  })

  it('expands entity lenses to alias OR-groups including native-script aliases', () => {
    const lenses = deriveCollectionLenses(
      { placeName: 'West Bengal, India', keywords: ['election'], watchEntities: ['Trinamool Congress'] },
      ['IN'],
      [{ name: 'Trinamool Congress', aliases: ['TMC', 'তৃণমূল'] }],
    )
    const entity = lenses.find(l => l.id.startsWith('entity-trinamool'))
    expect(entity?.query).toContain('("Trinamool Congress" OR "TMC" OR "তৃণমূল")')
    // Non-Latin alias present → place constraint dropped for cross-language recall.
    expect(entity?.query).not.toContain('"West Bengal"')
  })

  it('drops the Latin place constraint when an actor has a non-Latin alias', () => {
    const lenses = deriveCollectionLenses(
      { placeName: 'Ladakh, India', keywords: [], watchEntities: ["People's Liberation Army"] },
      ['IN', 'CN'],
      [{ name: "People's Liberation Army", aliases: ['PLA', '解放军'] }],
    )
    const entity = lenses.find(l => l.id.startsWith('entity-'))
    expect(entity?.query).toContain('解放军')
    expect(entity?.query).not.toContain('Ladakh') // Latin place would zero out Chinese recall
  })

  it('keeps the place constraint for Latin-only actor aliases', () => {
    const lenses = deriveCollectionLenses(
      { placeName: 'Ladakh, India', keywords: [], watchEntities: ['Indian Army'] },
      ['IN'],
      [{ name: 'Indian Army', aliases: ['IA'] }],
    )
    const entity = lenses.find(l => l.id.startsWith('entity-'))
    expect(entity?.query).toContain('"Ladakh"')
  })

  it('adds tracked actors as entity lenses even when not in watchEntities', () => {
    const lenses = deriveCollectionLenses(
      { placeName: 'West Bengal', keywords: [], watchEntities: [] },
      ['IN'],
      [{ name: 'BJP', aliases: [] }],
    )
    expect(lenses.some(l => l.id === 'entity-bjp')).toBe(true)
  })
})
