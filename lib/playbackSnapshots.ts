import type { AircraftPosition, VesselPosition } from '@/types'

export interface TrackSnapshot {
  ts: string
  vessels: VesselPosition[]
  aircraft: AircraftPosition[]
}

/** Pick the snapshot whose timestamp is closest to the scrubber cursor. */
export function nearestSnapshot(snapshots: TrackSnapshot[], targetIso: string): TrackSnapshot | null {
  if (snapshots.length === 0) return null
  const target = new Date(targetIso).getTime()
  return snapshots.reduce((best, s) =>
    Math.abs(new Date(s.ts).getTime() - target) <
    Math.abs(new Date(best.ts).getTime() - target) ? s : best,
  )
}
