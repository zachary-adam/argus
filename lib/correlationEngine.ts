import { IntelEvent, CorrelationAlert, VesselPosition, AircraftPosition, CorrelationSettings, DEFAULT_CORRELATION_SETTINGS } from '@/types'
import { haversineDistance } from './haversine'
import { CHOKEPOINTS, COUNTRY_NEIGHBORS } from './constants'
import { stripHtml } from './normalize'
import { dbscanGeo } from './geoCluster'
import { isRateElevated } from './correlationStats'

const BASELINE_HOURS = 14 * 24 // baseline window for rate-relative thresholds

const ISR_CALLSIGN = /^(RCH|REACH|RIVET|SENTRY|AWACS|JAKE|ARIES|DRAGN|EP3|POSDN|CNV|DUKE|GHOST)/

function makeId(pattern: string, country: string): string {
  return `${pattern}-${country}-${new Date().toDateString()}`.replace(/\s+/g, '-').toLowerCase()
}

function withinHours(event: IntelEvent, hours: number): boolean {
  return Date.now() - new Date(event.timestamp).getTime() < hours * 3600000
}

function eventsNearChokepoint(events: IntelEvent[], radiusKm: number, hoursBack: number) {
  return CHOKEPOINTS.map(cp => {
    const nearby = events.filter(e =>
      withinHours(e, hoursBack) &&
      haversineDistance(e.lat, e.lon, cp.lat, cp.lon) < radiusKm
    )
    return { chokepoint: cp, events: nearby }
  }).filter(c => c.events.length > 0)
}

export function runCorrelationEngine(
  events: IntelEvent[],
  vessels: VesselPosition[] = [],
  aircraft: AircraftPosition[] = [],
  settings: CorrelationSettings = DEFAULT_CORRELATION_SETTINGS,
): CorrelationAlert[] {
  const s = settings
  const alerts: CorrelationAlert[] = []

  // Proximity/clustering rules must use only precisely-located events. Events placed
  // at a country centroid (geoPrecision==='country') would otherwise land within
  // radius of a chokepoint and fire phantom maritime/infrastructure alerts.
  const preciseEvents = events.filter(e => e.geoPrecision !== 'country')

  // Count a country/category's events in the baseline window (older than the recent
  // window, up to BASELINE_HOURS back) — the denominator for rate-relative alerts.
  const ageHours = (e: IntelEvent) => (Date.now() - new Date(e.timestamp).getTime()) / 3_600_000
  const baselineCountFor = (evs: IntelEvent[], category: string, recentHours: number) =>
    evs.filter(e => e.category === category && ageHours(e) >= recentHours && ageHours(e) < BASELINE_HOURS).length

  // 1. MARITIME INTERDICTION
  if (s.maritime.enabled) {
    const chopkeventGroups = eventsNearChokepoint(preciseEvents, s.maritime.radiusKm, s.maritime.hoursBack)
    for (const { chokepoint, events: nearby } of chopkeventGroups) {
      if (nearby.length >= s.maritime.minEvents) {
        const sev: CorrelationAlert['severity'] = nearby.length >= s.maritime.minEvents + 2 ? 'critical' : 'high'
        alerts.push({
          id: makeId('maritime', chokepoint.name),
          title: `Maritime Threat — ${chokepoint.name}`,
          summary: `${nearby.length} incidents detected within ${s.maritime.radiusKm}km of ${chokepoint.name} in past ${s.maritime.hoursBack}h. ${chokepoint.description}`,
          severity: sev,
          pattern: 'Maritime Interdiction',
          signals: nearby.slice(0, 4).map(e => stripHtml(e.title)),
          countries: [...new Set(nearby.map(e => e.country))],
          lat: chokepoint.lat,
          lon: chokepoint.lon,
          timestamp: new Date().toISOString(),
          signalCount: nearby.length,
        })
      }
    }
  }

  // 2. CONFLICT ESCALATION
  // Group by country — skip unattributed events so "Unknown" never becomes an alert subject
  const byCountry = groupBy(events.filter(e => e.country && e.country !== 'Unknown'), e => e.country)
  if (s.conflictEscalation.enabled) {
    for (const [country, countryEvents] of Object.entries(byCountry)) {
      const recent = countryEvents.filter(e => e.category === 'conflict' && withinHours(e, s.conflictEscalation.hoursBack))
      const hasCritical = recent.some(e => e.severity === 'critical')
      const elevated = isRateElevated(
        recent.length, baselineCountFor(countryEvents, 'conflict', s.conflictEscalation.hoursBack),
        s.conflictEscalation.hoursBack, BASELINE_HOURS, s.conflictEscalation.minEvents,
      )
      if (elevated && hasCritical) {
        const sample = countryEvents.find(e => e.lat && e.lon)
        if (!sample) continue
        alerts.push({
          id: makeId('escalation', country),
          title: `Conflict Escalation — ${country}`,
          summary: `${recent.length} conflict events in ${country} over past ${s.conflictEscalation.hoursBack}h with at least one critical incident.`,
          severity: recent.length >= s.conflictEscalation.minEvents + 2 ? 'critical' : 'high',
          pattern: 'Conflict Escalation',
          signals: recent.slice(0, 4).map(e => stripHtml(e.title)),
          countries: [country],
          lat: sample?.lat || 0,
          lon: sample?.lon || 0,
          timestamp: new Date().toISOString(),
          signalCount: recent.length,
        })
      }
    }
  }

  // 3. COMPOUND CRISIS
  if (s.compoundCrisis.enabled) {
    for (const [country, countryEvents] of Object.entries(byCountry)) {
      const recent30 = countryEvents.filter(e => withinHours(e, s.compoundCrisis.hoursBack))
      const categoriesSet = new Set(recent30.map(e => e.category))
      const categoriesArr = Array.from(categoriesSet)
      const minCategories = s.compoundCrisis.minEvents // distinct crisis categories required
      if (categoriesSet.size >= minCategories) {
        const sample = countryEvents.find(e => e.lat)!
        alerts.push({
          id: makeId('compound', country),
          title: `Compound Crisis — ${country}`,
          summary: `${country} experiencing simultaneous crises across ${categoriesSet.size} domains (${minCategories}+ required): ${categoriesArr.join(', ')}.`,
          severity: 'high',
          pattern: 'Compound Crisis',
          signals: categoriesArr.map(c => `${c} crisis detected`),
          countries: [country],
          lat: sample?.lat || 0,
          lon: sample?.lon || 0,
          timestamp: new Date().toISOString(),
          signalCount: categoriesSet.size,
        })
      }
    }
  }

  // 4. REGIONAL INSTABILITY CLUSTER
  // DBSCAN over high/critical events — deterministic and finds EVERY dense cluster
  // (the old code picked the first qualifying event then broke, so results depended
  // on input order and only one cluster could ever surface).
  if (s.regionalInstability.enabled) {
    const highSevEvents = preciseEvents.filter(e =>
      (e.severity === 'high' || e.severity === 'critical') &&
      withinHours(e, s.regionalInstability.hoursBack) && e.lat && e.lon
    )
    const clusters = dbscanGeo(highSevEvents, s.regionalInstability.radiusKm, s.regionalInstability.minEvents)
    for (const cluster of clusters) {
      const countriesSet = new Set(cluster.map(e => e.country))
      if (countriesSet.size < 2) continue // cross-border only
      const countriesArr = Array.from(countriesSet)
      // Cluster centroid for the alert marker.
      const lat = cluster.reduce((s2, e) => s2 + e.lat, 0) / cluster.length
      const lon = cluster.reduce((s2, e) => s2 + e.lon, 0) / cluster.length
      alerts.push({
        id: makeId('regional', countriesArr.sort().join('-')),
        title: `Regional Instability Cluster — ${countriesArr[0]} region`,
        summary: `${cluster.length} high/critical events co-located within ${s.regionalInstability.radiusKm}km across ${countriesSet.size} countries.`,
        severity: 'high',
        pattern: 'Regional Instability',
        signals: cluster.slice(0, 3).map(e => stripHtml(e.title)),
        countries: countriesArr,
        lat,
        lon,
        timestamp: new Date().toISOString(),
        signalCount: cluster.length,
      })
    }
  }

  // 5. INFRASTRUCTURE THREAT
  if (s.infrastructureThreat.enabled) {
    for (const cp of CHOKEPOINTS) {
      const critical = preciseEvents.filter(e =>
        e.severity === 'critical' && haversineDistance(e.lat, e.lon, cp.lat, cp.lon) < s.infrastructureThreat.radiusKm
      )
      if (critical.length >= s.infrastructureThreat.minEvents) {
        alerts.push({
          id: makeId('infrastructure', cp.name),
          title: `Critical Infrastructure Threat — ${cp.name}`,
          summary: `${critical.length} critical event(s) within ${s.infrastructureThreat.radiusKm}km of ${cp.name}. ${cp.description}`,
          severity: 'critical',
          pattern: 'Infrastructure Threat',
          signals: critical.slice(0, 3).map(e => stripHtml(e.title)),
          countries: Array.from(new Set(critical.map(e => e.country))),
          lat: cp.lat,
          lon: cp.lon,
          timestamp: new Date().toISOString(),
          signalCount: critical.length,
        })
      }
    }
  }

  // 6. HUMANITARIAN CONVERGENCE
  if (s.humanitarianConvergence.enabled) {
    for (const [country, countryEvents] of Object.entries(byCountry)) {
      const humEvents = countryEvents.filter(e => e.category === 'humanitarian' && withinHours(e, s.humanitarianConvergence.hoursBack))
      if (isRateElevated(
        humEvents.length, baselineCountFor(countryEvents, 'humanitarian', s.humanitarianConvergence.hoursBack),
        s.humanitarianConvergence.hoursBack, BASELINE_HOURS, s.humanitarianConvergence.minEvents,
      )) {
        const sample = humEvents.find(e => e.lat)!
        alerts.push({
          id: makeId('humanitarian', country),
          title: `Humanitarian Convergence — ${country}`,
          summary: `${humEvents.length} concurrent humanitarian crises detected in ${country} within ${s.humanitarianConvergence.hoursBack}h window.`,
          severity: 'high',
          pattern: 'Humanitarian Convergence',
          signals: humEvents.slice(0, 3).map(e => stripHtml(e.title)),
          countries: [country],
          lat: sample?.lat || 0,
          lon: sample?.lon || 0,
          timestamp: new Date().toISOString(),
          signalCount: humEvents.length,
        })
      }
    }
  }

  // 7. POLITICAL DESTABILIZATION
  if (s.politicalDestabilization.enabled) {
    for (const [country, countryEvents] of Object.entries(byCountry)) {
      const polEvents = countryEvents.filter(e => e.category === 'political' && withinHours(e, s.politicalDestabilization.hoursBack))
      if (isRateElevated(
        polEvents.length, baselineCountFor(countryEvents, 'political', s.politicalDestabilization.hoursBack),
        s.politicalDestabilization.hoursBack, BASELINE_HOURS, s.politicalDestabilization.minEvents,
      )) {
        const sample = polEvents.find(e => e.lat)!
        alerts.push({
          id: makeId('political', country),
          title: `Political Destabilization — ${country}`,
          summary: `${polEvents.length} political events in ${country} in past ${s.politicalDestabilization.hoursBack}h, suggesting regime instability.`,
          severity: 'high',
          pattern: 'Political Destabilization',
          signals: polEvents.slice(0, 3).map(e => stripHtml(e.title)),
          countries: [country],
          lat: sample?.lat || 0,
          lon: sample?.lon || 0,
          timestamp: new Date().toISOString(),
          signalCount: polEvents.length,
        })
      }
    }
  }

  // 8. CASCADING FAILURE
  if (s.cascading.enabled) {
    const compoundCountries = alerts
      .filter(a => a.pattern === 'Compound Crisis')
      .map(a => a.countries[0])

    for (const country of compoundCountries) {
      const neighbors = COUNTRY_NEIGHBORS[country] || []
      const neighborsWithConflict = neighbors.filter(neighbor => {
        const neighborEvents = (byCountry[neighbor] || []).filter(
          e => e.category === 'conflict' && withinHours(e, 168)
        )
        return neighborEvents.length > 0
      })
      if (neighborsWithConflict.length >= s.cascading.minEvents) {
        const sample = (byCountry[country] || []).find(e => e.lat)
        alerts.push({
          id: makeId('cascading', country),
          title: `Cascading Failure Risk — ${country} + Neighbors`,
          summary: `${country} compound crisis co-occurring with active conflict in ${neighborsWithConflict.length} neighboring states (${neighborsWithConflict.join(', ')}). Possible signal of regional spillover — spatial/temporal co-occurrence, not confirmed causation.`,
          severity: 'critical',
          pattern: 'Cascading Failure',
          signals: [
            `Compound crisis active in ${country}`,
            ...neighborsWithConflict.map(n => `Conflict events in neighboring ${n}`),
          ],
          countries: [country, ...neighborsWithConflict],
          lat: sample?.lat || 0,
          lon: sample?.lon || 0,
          timestamp: new Date().toISOString(),
          signalCount: 1 + neighborsWithConflict.length,
        })
      }
    }
  }

  // 9. CROSS-BORDER SPILLOVER
  if (s.spillover.enabled) {
    for (const [countryA, eventsA] of Object.entries(byCountry)) {
      const conflictA = eventsA.filter(e => e.category === 'conflict' && withinHours(e, s.spillover.hoursBack))
      if (conflictA.length < s.spillover.minEvents) continue
      const neighbors = COUNTRY_NEIGHBORS[countryA] || []
      for (const countryB of neighbors) {
        const eventsB = byCountry[countryB] || []
        const humB = eventsB.filter(
          e => (e.category === 'humanitarian' || e.category === 'disaster') && withinHours(e, s.spillover.hoursBack)
        )
        if (humB.length >= 1) {
          const sampleA = conflictA.find(e => e.lat)
          const sampleB = humB.find(e => e.lat)
          alerts.push({
            id: makeId('spillover', `${countryA}-${countryB}`),
            title: `Cross-Border Spillover — ${countryA} → ${countryB}`,
            summary: `Possible cross-border association — ${conflictA.length} conflict events in ${countryA} co-occur with ${humB.length} humanitarian/disaster events in neighboring ${countryB} within the same window (co-occurrence, not a confirmed causal link).`,
            severity: 'high',
            pattern: 'Cross-Border Spillover',
            signals: [
              ...conflictA.slice(0, 2).map(e => `[${countryA}] ${stripHtml(e.title)}`),
              ...humB.slice(0, 2).map(e => `[${countryB}] ${stripHtml(e.title)}`),
            ],
            countries: [countryA, countryB],
            lat: sampleA?.lat || sampleB?.lat || 0,
            lon: sampleA?.lon || sampleB?.lon || 0,
            timestamp: new Date().toISOString(),
            signalCount: conflictA.length + humB.length,
          })
        }
      }
    }
  }

  // ── MARITIME & AVIATION INTELLIGENCE ──────────────────────────────────────

  // These signals are dormant unless live vessel/aircraft tracking is feeding data
  // (cut for the political-risk focus; restored automatically when the live layers
  // populate these arrays). Gate on data presence so the chokepoint scans below are
  // skipped entirely for the common case of an events-only project.
  const hasTracking = vessels.length > 0 || aircraft.length > 0
  const recentConflicts = hasTracking
    ? preciseEvents.filter(e =>
        (e.severity === 'critical' || e.severity === 'high') && withinHours(e, s.milAviation.hoursBack || 24))
    : []
  const milAircraft = aircraft.filter(a => a.type === 'military' && !a.on_ground)
  const isrAircraft = aircraft.filter(a => ISR_CALLSIGN.test((a.callsign || '').toUpperCase()) && !a.on_ground)

  // SIGNAL A: Sanctioned vessel inside a strategic chokepoint
  if (hasTracking && s.sanctionedVessel.enabled) {
    for (const cp of CHOKEPOINTS) {
      const sanctioned = vessels.filter(v =>
        v.sanctioned && haversineDistance(v.lat, v.lon, cp.lat, cp.lon) < s.sanctionedVessel.radiusKm
      )
      if (sanctioned.length >= s.sanctionedVessel.minEvents) {
        alerts.push({
          id: makeId('sanctioned-vessel', cp.name),
          title: `Sanctioned Vessel — ${cp.name}`,
          summary: `${sanctioned.length} OFAC/sanctioned vessel(s) detected within ${s.sanctionedVessel.radiusKm}km of ${cp.name}. Potential sanctions evasion or covert resupply operation.`,
          severity: 'critical',
          pattern: 'Sanctions Violation',
          signals: sanctioned.slice(0, 3).map(v => `${v.name || 'UNKNOWN'} (${v.flag}) — MMSI ${v.mmsi}`),
          countries: [...new Set(sanctioned.map(v => v.flag))],
          lat: cp.lat, lon: cp.lon,
          timestamp: new Date().toISOString(),
          signalCount: sanctioned.length,
        })
      }
    }
  }

  // SIGNAL B: Military aircraft over active conflict zone
  if (hasTracking && s.milAviation.enabled) {
    for (const ev of recentConflicts) {
      const overhead = milAircraft.filter(a =>
        haversineDistance(a.latitude, a.longitude, ev.lat, ev.lon) < s.milAviation.radiusKm
      )
      if (overhead.length >= s.milAviation.minEvents) {
        alerts.push({
          id: makeId('mil-aviation', ev.country),
          title: `Military Air Operations — ${ev.country}`,
          summary: `${overhead.length} military aircraft detected within ${s.milAviation.radiusKm}km of active ${ev.severity} event in ${ev.country}. Indicates air campaign activity or escalating posture.`,
          severity: ev.severity as 'critical' | 'high',
          pattern: 'Military Air Operations',
          signals: [ev.title, ...overhead.slice(0, 3).map(a => `${a.callsign || a.icao24} (${a.origin_country}) @ ${Math.round(a.baro_altitude)}m`)],
          countries: [ev.country],
          lat: ev.lat, lon: ev.lon,
          timestamp: new Date().toISOString(),
          signalCount: overhead.length + 1,
        })
      }
    }
  }

  // SIGNAL C: ISR/reconnaissance aircraft near conflict
  if (hasTracking && s.isrOps.enabled) {
    for (const isr of isrAircraft) {
      const nearbyConflicts = recentConflicts.filter(ev =>
        haversineDistance(isr.latitude, isr.longitude, ev.lat, ev.lon) < s.isrOps.radiusKm
      )
      if (nearbyConflicts.length >= s.isrOps.minEvents) {
        const cs = isr.callsign || isr.icao24
        alerts.push({
          id: makeId('isr', cs),
          title: `ISR Platform Active — ${nearbyConflicts[0].country}`,
          summary: `${cs} (${isr.origin_country}) intelligence/surveillance aircraft operating within ${s.isrOps.radiusKm}km of ${nearbyConflicts.length} active conflict event(s). Indicates intelligence collection or strike coordination.`,
          severity: 'high',
          pattern: 'ISR Operations',
          signals: [
            `${cs} — ${Math.round(isr.baro_altitude)}m alt, ${Math.round(isr.velocity)} km/h`,
            ...nearbyConflicts.slice(0, 2).map(e => stripHtml(e.title)),
          ],
          countries: [...new Set(nearbyConflicts.map(e => e.country))],
          lat: isr.latitude, lon: isr.longitude,
          timestamp: new Date().toISOString(),
          signalCount: isrAircraft.length + nearbyConflicts.length,
        })
      }
    }
  }

  // SIGNAL D: Combined arms — military vessel + aircraft at same chokepoint
  if (hasTracking && s.combinedArms.enabled) {
    for (const cp of CHOKEPOINTS) {
      const milVessels = vessels.filter(v =>
        v.ship_type === 'Military' && haversineDistance(v.lat, v.lon, cp.lat, cp.lon) < s.combinedArms.radiusKm
      )
      const milAir = milAircraft.filter(a =>
        haversineDistance(a.latitude, a.longitude, cp.lat, cp.lon) < s.combinedArms.radiusKm * 1.25
      )
      if (milVessels.length >= s.combinedArms.minEvents && milAir.length >= 1) {
        alerts.push({
          id: makeId('combined-arms', cp.name),
          title: `Combined Arms Posture — ${cp.name}`,
          summary: `${milVessels.length} military vessel(s) and ${milAir.length} military aircraft simultaneously present at ${cp.name}. Coordinated naval-air power projection detected.`,
          severity: 'critical',
          pattern: 'Combined Arms',
          signals: [
            ...milVessels.slice(0, 2).map(v => `Vessel: ${v.name || 'UNKNOWN'} (${v.flag})`),
            ...milAir.slice(0, 2).map(a => `Aircraft: ${a.callsign || a.icao24} (${a.origin_country})`),
          ],
          countries: [...new Set([...milVessels.map(v => v.flag), ...milAir.map(a => a.origin_country)])],
          lat: cp.lat, lon: cp.lon,
          timestamp: new Date().toISOString(),
          signalCount: milVessels.length + milAir.length,
        })
      }
    }
  }

  // SIGNAL E: Dark fleet — vessels with no AIS name loitering at chokepoint
  if (hasTracking && s.darkFleet.enabled) {
    for (const cp of CHOKEPOINTS) {
      const dark = vessels.filter(v =>
        (v.name === 'UNKNOWN' || v.name.length < 2) &&
        v.speed < 3 &&
        haversineDistance(v.lat, v.lon, cp.lat, cp.lon) < s.darkFleet.radiusKm
      )
      if (dark.length >= s.darkFleet.minEvents) {
        alerts.push({
          id: makeId('dark-fleet', cp.name),
          title: `Dark Fleet Activity — ${cp.name}`,
          summary: `${dark.length} vessels with suppressed AIS identity detected loitering within ${s.darkFleet.radiusKm}km of ${cp.name}. Pattern consistent with sanctions evasion or pre-positioning for interdiction.`,
          severity: 'high',
          pattern: 'Dark Fleet',
          signals: dark.slice(0, 3).map(v => `MMSI ${v.mmsi} — no name, flag: ${v.flag}, speed: ${v.speed.toFixed(1)} kn`),
          countries: [...new Set(dark.map(v => v.flag))],
          lat: cp.lat, lon: cp.lon,
          timestamp: new Date().toISOString(),
          signalCount: dark.length,
        })
      }
    }
  }

  // Deduplicate by id
  const seen = new Set<string>()
  return alerts.filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  }).sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2 }
    return order[a.severity] - order[b.severity]
  })
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const key = fn(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<string, T[]>)
}
