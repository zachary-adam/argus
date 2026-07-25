import { describe, it, expect } from 'vitest'
import { parseModelJson } from './parseModelJson'

describe('parseModelJson', () => {
  it('parses bare JSON', () => {
    expect(parseModelJson('{"headline":"test"}')).toEqual({ headline: 'test' })
  })
  it('parses fenced JSON', () => {
    expect(parseModelJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('extracts JSON from surrounding prose', () => {
    expect(parseModelJson('Analysis follows.\n{"riskLevel":"LOW"}\nDone.')).toEqual({ riskLevel: 'LOW' })
  })
  it('throws when no JSON present', () => {
    expect(() => parseModelJson('plain prose only')).toThrow('No JSON in response')
  })
})
