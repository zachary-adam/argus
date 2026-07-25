'use client'

/** Minimal map-stage placeholder while the map chunk loads — not a full-workspace list skeleton. */
export default function MapLoadPlaceholder() {
  return (
    <div className="ui-map-load-placeholder" aria-busy="true" aria-label="Loading map">
      <div className="ui-map-load-placeholder__shimmer" />
    </div>
  )
}
