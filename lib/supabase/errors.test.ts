import { describe, expect, it } from 'vitest'
import { isMissingTableError, isNetworkFetchError, logSupabaseFailure } from './errors'

describe('supabase errors', () => {
  it('detects missing-table codes', () => {
    expect(isMissingTableError({ code: 'PGRST205', message: 'x' })).toBe(true)
    expect(isMissingTableError({ code: '42P01', message: 'x' })).toBe(true)
    expect(isMissingTableError({ code: '42501', message: 'permission' })).toBe(false)
  })

  it('detects network fetch failures', () => {
    expect(isNetworkFetchError('TypeError: Failed to fetch')).toBe(true)
    expect(isNetworkFetchError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true)
    expect(isNetworkFetchError({ message: 'JWT expired' })).toBe(false)
  })

  it('logSupabaseFailure does not throw', () => {
    expect(() => logSupabaseFailure('loadProjects', { message: 'TypeError: Failed to fetch' })).not.toThrow()
  })
})
