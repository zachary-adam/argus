export default function NewProjectLoading() {
  return (
    <div className="argus-route-loading" role="status" aria-live="polite" aria-label="Loading new project">
      <div className="argus-route-loading__card">
        <div className="argus-route-loading__spinner" aria-hidden />
        <p className="argus-route-loading__title">Opening new project…</p>
        <p className="argus-route-loading__hint">Getting the setup wizard ready</p>
      </div>
    </div>
  )
}
