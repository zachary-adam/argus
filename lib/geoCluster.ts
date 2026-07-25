/**
 * DBSCAN spatial clustering on lat/lon points (great-circle distance).
 *
 * Replaces the old "pick the first event with ≥N neighbours, then break" logic in
 * the correlation engine, which was order-dependent (results changed with input
 * order) and found at most one cluster. DBSCAN is deterministic w.r.t. the set of
 * points and returns every dense cluster; sparse points are treated as noise.
 */
import { haversineDistance } from './haversine'

export interface GeoPoint { lat: number; lon: number }

/**
 * @param points    items with lat/lon
 * @param epsilonKm  neighbourhood radius in kilometres
 * @param minPts     minimum points (incl. the core) to form a cluster
 * @returns array of clusters; each cluster is the subset of input points in it
 */
export function dbscanGeo<T extends GeoPoint>(points: T[], epsilonKm: number, minPts: number): T[][] {
  const n = points.length
  const UNVISITED = 0, NOISE = -1
  const label = new Array(n).fill(UNVISITED) // 0 unvisited, -1 noise, >0 cluster id
  let clusterId = 0

  const neighbours = (i: number): number[] => {
    const out: number[] = []
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      if (haversineDistance(points[i].lat, points[i].lon, points[j].lat, points[j].lon) <= epsilonKm) out.push(j)
    }
    return out
  }

  for (let i = 0; i < n; i++) {
    if (label[i] !== UNVISITED) continue
    const nbrs = neighbours(i)
    if (nbrs.length + 1 < minPts) { label[i] = NOISE; continue } // +1 for the point itself

    clusterId++
    label[i] = clusterId
    const queue = [...nbrs]
    for (let q = 0; q < queue.length; q++) {
      const j = queue[q]
      if (label[j] === NOISE) label[j] = clusterId            // border point
      if (label[j] !== UNVISITED) continue
      label[j] = clusterId
      const jNbrs = neighbours(j)
      if (jNbrs.length + 1 >= minPts) {                       // j is also a core point
        for (const k of jNbrs) if (!queue.includes(k)) queue.push(k)
      }
    }
  }

  const clusters: T[][] = Array.from({ length: clusterId }, () => [])
  for (let i = 0; i < n; i++) if (label[i] > 0) clusters[label[i] - 1].push(points[i])
  return clusters
}
