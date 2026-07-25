import { describe, it, expect } from 'vitest'
import { executeFormula, getFormula, FORMULA_LIBRARY } from './formulas'
import type { Formula } from '@/types/project'

const twoVarFormula: Formula = {
  id: 'test',
  name: 'Test Formula',
  category: 'armed-conflict',
  description: '',
  academicBasis: '',
  outputLabel: 'Score',
  outputRange: [0, 100],
  variables: [
    { key: 'a', label: 'A', description: '', weight: 0.5, defaultWeight: 0.5, min: 0, max: 1 },
    { key: 'b', label: 'B', description: '', weight: 0.5, defaultWeight: 0.5, min: 0, max: 1 },
  ],
  assumptions: [],
}

describe('executeFormula', () => {
  it('computes weighted average scaled to 0-100', () => {
    expect(executeFormula(twoVarFormula, { a: 0.4, b: 0.6 })).toBe(50)
  })

  it('full value on single variable returns 100', () => {
    const single: Formula = {
      ...twoVarFormula,
      variables: [{ key: 'x', label: 'X', description: '', weight: 1, defaultWeight: 1, min: 0, max: 1 }],
    }
    expect(executeFormula(single, { x: 1 })).toBe(100)
    expect(executeFormula(single, { x: 0.5 })).toBe(50)
    expect(executeFormula(single, { x: 0 })).toBe(0)
  })

  it('treats missing variables as 0', () => {
    expect(executeFormula(twoVarFormula, { a: 0.5 })).toBe(25)  // (0.5*0.5 + 0*0.5) / 1.0 * 100
  })

  it('returns 0 when no variables are defined', () => {
    const empty: Formula = { ...twoVarFormula, variables: [] }
    expect(executeFormula(empty, {})).toBe(0)
  })

  it('applies weight overrides instead of default weights', () => {
    // a=1.0 at weight 0.8, b=0.0 at weight 0.2 → (0.8 + 0) / 1.0 * 100 = 80
    expect(executeFormula(twoVarFormula, { a: 1, b: 0 }, { a: 0.8, b: 0.2 })).toBe(80)
  })

  it('partial weight overrides: unoverridden keys use default weight', () => {
    // a uses override 0.9, b uses default 0.5 → (0.5*0.9 + 0.5*0.5) / 1.4 * 100
    const expected = Math.round(((0.5 * 0.9 + 0.5 * 0.5) / 1.4) * 100)
    expect(executeFormula(twoVarFormula, { a: 0.5, b: 0.5 }, { a: 0.9 })).toBe(expected)
  })

  it('returns a rounded integer', () => {
    const result = executeFormula(twoVarFormula, { a: 0.333, b: 0.667 })
    expect(Number.isInteger(result)).toBe(true)
  })
})

describe('FORMULA_LIBRARY', () => {
  it('contains all six formulas', () => {
    const ids = FORMULA_LIBRARY.map(f => f.id)
    expect(ids).toContain('conflict-intensity-score')
    expect(ids).toContain('electoral-violence-risk')
    expect(ids).toContain('fragility-index')
    expect(ids).toContain('gdelt-unrest-index')
    expect(ids).toContain('debt-distress-index')
    expect(ids).toContain('ipc-crisis-model')
  })

  it('every formula has at least one variable with weights summing close to 1.0', () => {
    for (const f of FORMULA_LIBRARY) {
      expect(f.variables.length).toBeGreaterThan(0)
      const total = f.variables.reduce((s, v) => s + v.defaultWeight, 0)
      expect(total).toBeCloseTo(1.0, 5)
    }
  })
})

describe('getFormula', () => {
  it('returns the formula by id', () => {
    const f = getFormula('conflict-intensity-score')
    expect(f).toBeDefined()
    expect(f!.id).toBe('conflict-intensity-score')
  })

  it('returns undefined for unknown id', () => {
    expect(getFormula('does-not-exist')).toBeUndefined()
  })
})
