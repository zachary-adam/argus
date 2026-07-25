// Ramer–Douglas–Peucker polygon simplification.
// Reduces coordinate count while preserving the overall shape.
// tolerance is in degrees (0.05° ≈ 5 km — good for country/region level).

type Pt = [number, number]

function perpendicularDistance(pt: Pt, lineStart: Pt, lineEnd: Pt): number {
  const dx = lineEnd[0] - lineStart[0]
  const dy = lineEnd[1] - lineStart[1]
  if (dx === 0 && dy === 0) {
    return Math.hypot(pt[0] - lineStart[0], pt[1] - lineStart[1])
  }
  const t = ((pt[0] - lineStart[0]) * dx + (pt[1] - lineStart[1]) * dy) / (dx * dx + dy * dy)
  return Math.hypot(pt[0] - (lineStart[0] + t * dx), pt[1] - (lineStart[1] + t * dy))
}

function rdp(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points
  let maxDist = 0
  let maxIdx = 0
  const first = points[0]
  const last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > tolerance) {
    const left  = rdp(points.slice(0, maxIdx + 1), tolerance)
    const right = rdp(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

export function simplifyRing(ring: Pt[], tolerance: number): Pt[] {
  const simplified = rdp(ring, tolerance)
  // Re-close the polygon ring
  if (simplified.length > 0 && (simplified[0][0] !== simplified[simplified.length - 1][0] || simplified[0][1] !== simplified[simplified.length - 1][1])) {
    simplified.push(simplified[0])
  }
  return simplified
}

// Auto-picks tolerance based on bbox size so cities stay detailed, countries get simplified.
export function autoTolerance(bbox: [number, number, number, number] | undefined): number {
  if (!bbox) return 0.05
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1])
  if (span > 20) return 0.08  // country-level
  if (span > 5)  return 0.03  // state/region-level
  if (span > 1)  return 0.005 // city-level
  return 0.001                 // neighbourhood/street
}

// Extracts the outer ring from a Polygon or MultiPolygon and simplifies it.
// Returns null if geometry has no usable coordinates.
export function extractAndSimplify(
  geometry: GeoJSON.Geometry,
  bbox: [number, number, number, number] | undefined,
): Pt[] | null {
  const tol = autoTolerance(bbox)
  let ring: Pt[] | null = null

  if (geometry.type === 'Polygon') {
    ring = geometry.coordinates[0] as Pt[]
  } else if (geometry.type === 'MultiPolygon') {
    // Pick the largest ring by point count
    let best: Pt[] = []
    for (const poly of geometry.coordinates) {
      if (poly[0] && poly[0].length > best.length) best = poly[0] as Pt[]
    }
    ring = best.length ? best : null
  }

  if (!ring || ring.length < 3) return null
  const simplified = simplifyRing(ring, tol)
  // Minimum 4 points to form a valid polygon
  return simplified.length >= 4 ? simplified : null
}
