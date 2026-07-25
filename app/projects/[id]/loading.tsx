export default function ProjectLoading() {
  return (
    <div className="argus-route-loading" role="status" aria-live="polite" aria-label="Loading project">
      <div className="argus-route-loading__card">
        <div className="argus-route-loading__spinner" aria-hidden />
        <p className="argus-route-loading__title">Opening project…</p>
        <p className="argus-route-loading__hint">Loading the map and workspace</p>
      </div>
    </div>
  )
}
