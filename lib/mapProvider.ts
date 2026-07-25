/**
 * Map basemap provider — Mapbox when a public token exists (env or Settings),
 * otherwise keyless MapLibre + OpenFreeMap (with MapLibre demo fallback).
 */

export const FREE_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
/** Last-resort style if OpenFreeMap is unreachable. */
export const FREE_MAP_STYLE_FALLBACK = 'https://demotiles.maplibre.org/style.json'

export const MAPBOX_STYLE = 'mapbox://styles/mapbox/light-v11'

const LS_MAPBOX = 'argus-mapbox-token'

/** Runtime Mapbox token: .env first, then browser copy from Settings. */
export function getMapboxToken(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim()
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') {
    try { return (localStorage.getItem(LS_MAPBOX) ?? '').trim() } catch { return '' }
  }
  return ''
}

export function setClientMapboxToken(token: string): void {
  if (typeof window === 'undefined') return
  const t = token.trim()
  try {
    if (t) localStorage.setItem(LS_MAPBOX, t)
    else localStorage.removeItem(LS_MAPBOX)
    window.dispatchEvent(new Event('argus-mapbox-changed'))
  } catch { /* ignore */ }
}

/** Build-time env token (SSR / first paint). */
export const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '').trim()

/** True when env Mapbox token exists at build time. Prefer getMapboxToken() on client. */
export const USE_MAPBOX = MAPBOX_TOKEN.length > 0

export function resolveMapStyle(token?: string): string {
  const t = token ?? (typeof window !== 'undefined' ? getMapboxToken() : MAPBOX_TOKEN)
  return t ? MAPBOX_STYLE : FREE_MAP_STYLE
}
