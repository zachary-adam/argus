/**
 * True when a lat/lon pair is a real, usable location.
 *
 * Events that fail geocoding fall back to 0,0 — which is "Null Island" in the
 * Gulf of Guinea. Flying the camera there or asking for satellite imagery there
 * is the "wrong coordinates" bug. Treat 0,0 (and any non-finite / out-of-range
 * pair) as "no location" so callers can skip the fly-to and show a clean state.
 */
export function hasValidGeo(lat?: number | null, lon?: number | null): boolean {
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    !(lat === 0 && lon === 0) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  )
}
