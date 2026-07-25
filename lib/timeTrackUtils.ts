export interface TimeTrackBucket {
  critical: number
  high: number
  medium: number
  low: number
}

export interface TimeTrackItem {
  ts: number
  severity: string
}

const EMPTY_BUCKET = (): TimeTrackBucket => ({ critical: 0, high: 0, medium: 0, low: 0 })

/** Build density histogram buckets for a time window. */
export function buildDensityBuckets(
  items: TimeTrackItem[],
  windowStart: number,
  windowMs: number,
  bucketCount = 60,
): TimeTrackBucket[] {
  const buckets = Array.from({ length: bucketCount }, EMPTY_BUCKET)
  for (const item of items) {
    const frac = (item.ts - windowStart) / windowMs
    const idx = Math.min(Math.floor(frac * bucketCount), bucketCount - 1)
    if (idx < 0) continue
    const sev = item.severity as keyof TimeTrackBucket
    if (sev in buckets[idx]) buckets[idx][sev]++
  }
  return buckets
}

export function maxBucketTotal(buckets: TimeTrackBucket[]): number {
  return Math.max(1, ...buckets.map(b => b.critical + b.high + b.medium + b.low))
}

export const SEV_COLOR: Record<string, string> = {
  critical: 'var(--critical)',
  high: 'var(--high)',
  medium: 'var(--medium)',
  low: 'var(--low)',
}

export function sevColor(sev: string): string {
  return SEV_COLOR[sev] ?? 'var(--low)'
}
