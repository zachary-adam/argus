'use client'

/**
 * Shared loading skeletons — one primitive per layout shape, parametrized
 * variants instead of copy-pasted per-panel components.
 */

export function FloatPanelSkeleton({ variant, cards = 6, showSearch = false, label = 'Loading' }: {
  variant: 'feed' | 'journal'
  cards?: number
  showSearch?: boolean
  label?: string
}) {
  return (
    <div className={`ui-map-float-panel ui-map-float-panel--${variant} ui-map-float-panel--skeleton`} aria-busy="true" aria-label={label}>
      <div className="ui-map-float-panel__body">
        <div className="ui-feed-skeleton-header">
          <div className="ui-feed-skeleton__block ui-feed-skeleton__block--title" />
          <div className="ui-feed-skeleton__block ui-feed-skeleton__block--sub" />
          {showSearch && <div className="ui-feed-skeleton__block ui-feed-skeleton__block--search" />}
          <div className="ui-feed-skeleton__block ui-feed-skeleton__block--filters" />
        </div>
        <div className="ui-feed-skeleton">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="ui-feed-skeleton__card">
              <div className="ui-feed-skeleton__line ui-feed-skeleton__line--title" />
              <div className="ui-feed-skeleton__line ui-feed-skeleton__line--meta" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function FeedPanelSkeleton() {
  return <FloatPanelSkeleton variant="feed" cards={6} showSearch label="Loading events" />
}

export function ResearchPanelSkeleton() {
  return <FloatPanelSkeleton variant="journal" cards={5} label="Loading research" />
}

function Pill({ width, height, opacity }: { width: number; height?: number; opacity?: number }) {
  return <div className="ui-workspace-skeleton__pill" style={{ width, height, opacity }} />
}

export function CanvasPanelSkeleton() {
  return (
    <div className="ui-fullscreen-workspace ui-canvas-root ui-canvas-root--skeleton" aria-busy="true" aria-label="Loading canvas">
      <div className="ui-canvas-toolbar ui-canvas-toolbar--skeleton">
        <div className="ui-canvas-toolbar__strip">
          <div className="ui-canvas-toolbar__primary">
            <Pill width={64} />
            <Pill width={52} />
            <Pill width={56} />
            <Pill width={72} opacity={0.9} />
          </div>
          <div className="ui-canvas-toolbar__spacer" />
          <div className="ui-canvas-toolbar__tools">
            <Pill width={48} />
            <Pill width={32} height={30} />
            <Pill width={32} height={30} />
          </div>
        </div>
      </div>
      <div className="ui-canvas-viewport ui-canvas-viewport--skeleton" />
    </div>
  )
}

export function WorkspaceSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="ui-fullscreen-workspace ui-workspace-skeleton" aria-busy="true" aria-label={label}>
      <div className="ui-workspace-skeleton__toolbar">
        <Pill width={72} />
        <Pill width={96} />
        <Pill width={64} />
      </div>
      <div className="ui-workspace-skeleton__body">
        <div className="home-list-skeleton__row" style={{ height: 28, width: '40%', marginBottom: 16 }} />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="home-list-skeleton__row" style={{ marginBottom: 10 }} />
        ))}
      </div>
    </div>
  )
}
