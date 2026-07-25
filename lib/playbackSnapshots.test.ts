import { describe, it, expect } from 'vitest'
import { nearestSnapshot } from '@/lib/playbackSnapshots'

describe('nearestSnapshot', () => {
  const snaps = [
    { ts: '2026-06-20T10:00:00.000Z', vessels: [], aircraft: [] },
    { ts: '2026-06-20T12:00:00.000Z', vessels: [], aircraft: [] },
    { ts: '2026-06-20T18:00:00.000Z', vessels: [], aircraft: [] },
  ]

  it('returns null for empty buffer', () => {
    expect(nearestSnapshot([], '2026-06-20T12:00:00.000Z')).toBeNull()
  })

  it('picks closest timestamp', () => {
    expect(nearestSnapshot(snaps, '2026-06-20T11:30:00.000Z')?.ts).toBe('2026-06-20T12:00:00.000Z')
    expect(nearestSnapshot(snaps, '2026-06-20T10:15:00.000Z')?.ts).toBe('2026-06-20T10:00:00.000Z')
  })
})
