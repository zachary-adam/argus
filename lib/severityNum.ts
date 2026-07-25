const SEV_MAP: Record<string, number> = { critical: 9, high: 7, medium: 5, low: 2 }

/** Normalize IntelEvent string severity or UniversalEvent numeric severity for AI routes. */
export function severityToNumber(sev: string | number | undefined): number {
  if (typeof sev === 'number') return sev
  if (!sev) return 5
  return SEV_MAP[sev] ?? 5
}
