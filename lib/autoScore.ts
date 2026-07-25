// Auto-scores formula variables from a set of canvas-connected events.
// Returns a Record<variableKey, 0-1> — analyst can treat these as overrideable defaults.

type ScoringEvent = {
  category?: string
  severity?: number | string
  actors?: Array<{ name: string }>
  sourceCount?: number
}

function normSeverity(s: number | string | undefined): number {
  if (typeof s === 'number') return Math.min(10, Math.max(0, s)) / 10
  if (s === 'critical') return 0.9
  if (s === 'high') return 0.7
  if (s === 'medium') return 0.5
  if (s === 'low') return 0.2
  return 0.5
}

function cap(v: number): number {
  return Math.min(1, Math.max(0, v))
}

export function autoScoreFromEvents(
  formulaId: string,
  events: ScoringEvent[]
): Record<string, number> {
  if (!events.length) return {}

  const total = events.length
  const avgSev = events.reduce((s, e) => s + normSeverity(e.severity), 0) / total

  const pct = (cats: string[]) =>
    cap(events.filter(e => cats.includes(e.category ?? '')).length / total)

  const conflictPct    = pct(['conflict'])
  const politicalPct   = pct(['political', 'elections'])
  const economicPct    = pct(['economic'])
  const socialPct      = pct(['social'])
  const humanPct       = pct(['humanitarian', 'health', 'disaster', 'environmental'])
  const highSevPct     = cap(events.filter(e => normSeverity(e.severity) >= 0.65).length / total)
  const uniqueActors   = new Set(events.flatMap(e => (e.actors ?? []).map(a => a.name))).size
  const avgSourceCount = events.reduce((s, e) => s + (e.sourceCount ?? 1), 0) / total

  switch (formulaId) {
    case 'conflict-intensity-score':
      return {
        event_freq:   cap(total / 20),            // 20 events = saturation
        fatality_rate: avgSev,
        actor_count:  cap(uniqueActors / 10),     // 10 distinct actors = saturation
        displacement: humanPct,
      }

    case 'electoral-violence-risk':
      return {
        hist_violence:      cap(conflictPct + politicalPct * 0.4),
        political_exclusion: politicalPct,
        incumbent_risk:     highSevPct,
        security_posture:   cap(conflictPct * avgSev * 1.5),
      }

    case 'fragility-index':
      return {
        security_apparatus:  conflictPct,
        political_legitimacy: cap(politicalPct + socialPct * 0.5),
        economic_decline:    economicPct,
        group_grievance:     cap(socialPct + humanPct * 0.5),
      }

    case 'gdelt-unrest-index':
      return {
        protest_freq:     cap(socialPct + politicalPct * 0.4),
        security_response: cap(conflictPct * avgSev * 1.5),
        grievance_signal:  economicPct,
        media_attention:   cap(avgSourceCount / 5),  // 5 sources = high coverage
      }

    case 'debt-distress-index':
      // Economic events are the best proxy; structural variables default to mid
      return {
        debt_to_gdp:            cap(economicPct * 0.7 + 0.2),
        reserve_coverage:       cap(0.5 - economicPct * 0.4),  // more econ events → lower reserves
        current_account:        economicPct,
        creditor_concentration: 0.5,  // not derivable from event data — analyst must set
      }

    case 'ipc-crisis-model':
      return {
        food_insecurity: humanPct,
        displacement:    cap(avgSev * humanPct * 1.5),
        aid_access:      cap(highSevPct * humanPct * 1.5),
        health_stress:   pct(['health']),
      }

    default:
      return {}
  }
}
