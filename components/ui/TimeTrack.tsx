'use client'
import type { ReactNode, RefObject } from 'react'
import type { TimeTrackBucket } from '@/lib/timeTrackUtils'

export interface TimeTrackMarker {
  id: string
  frac: number
  color: string
  size?: number
  shape?: 'circle' | 'square'
  dimmed?: boolean
  hovered?: boolean
  onClick?: (e: React.MouseEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export interface TimeTrackTick {
  frac: number
  label: string
}

interface TimeTrackProps {
  ticks: TimeTrackTick[]
  buckets?: TimeTrackBucket[]
  maxBucket?: number
  markers: TimeTrackMarker[]
  scrubFrac?: number | null
  fillFrac?: number | null
  fillDimmed?: boolean
  onTrackClick?: (e: React.MouseEvent<HTMLDivElement>) => void
  onTrackMouseMove?: (e: React.MouseEvent<HTMLDivElement>) => void
  onTrackMouseLeave?: () => void
  tooltip?: ReactNode
  hint?: string
  legend?: ReactNode
  trackRef?: RefObject<HTMLDivElement>
  fadeBucketsAfterFrac?: number | null
}

export function TimeTrack({
  ticks,
  buckets,
  maxBucket = 1,
  markers,
  scrubFrac = null,
  fillFrac = null,
  fillDimmed = false,
  onTrackClick,
  onTrackMouseMove,
  onTrackMouseLeave,
  tooltip,
  hint,
  legend,
  trackRef,
  fadeBucketsAfterFrac = null,
}: TimeTrackProps) {
  const bucketCount = buckets?.length ?? 0

  return (
    <div className="ui-time-track-wrap">
      <div className="ui-time-track-ticks">
        {ticks.map((tick, i) => (
          <span
            key={i}
            className="ui-time-track-tick font-mono"
            style={{
              left: `${tick.frac * 100}%`,
              transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div
        ref={trackRef}
        className="ui-time-track"
        onClick={onTrackClick}
        onMouseMove={onTrackMouseMove}
        onMouseLeave={onTrackMouseLeave}
      >
        <div className="ui-time-track__bg" />

        {buckets?.map((bucket, i) => {
          const total = bucket.critical + bucket.high + bucket.medium + bucket.low
          if (total === 0) return null
          const heightPct = (total / maxBucket) * 100
          const critH = (bucket.critical / total) * heightPct
          const highH = (bucket.high / total) * heightPct
          const medH = (bucket.medium / total) * heightPct
          const lowH = (bucket.low / total) * heightPct
          const bucketFrac = i / bucketCount
          const isFaded = fadeBucketsAfterFrac != null && bucketFrac > fadeBucketsAfterFrac

          return (
            <div
              key={i}
              className={`ui-time-track__bucket${isFaded ? ' ui-time-track__bucket--dim' : ''}`}
              style={{ left: `${bucketFrac * 100}%`, width: `${(1 / bucketCount) * 100}%` }}
            >
              {critH > 0 && <div className="ui-time-track__bar ui-time-track__bar--critical" style={{ height: `${critH}%` }} />}
              {highH > 0 && <div className="ui-time-track__bar ui-time-track__bar--high" style={{ height: `${highH}%` }} />}
              {medH > 0 && <div className="ui-time-track__bar ui-time-track__bar--medium" style={{ height: `${medH}%` }} />}
              {lowH > 0 && <div className="ui-time-track__bar ui-time-track__bar--low" style={{ height: `${lowH}%` }} />}
            </div>
          )
        })}

        {fillFrac != null && (
          <div
            className={`ui-time-track__fill${fillDimmed ? ' ui-time-track__fill--dim' : ''}`}
            style={{ width: `${fillFrac * 100}%` }}
          />
        )}

        {markers.map(m => {
          const size = m.size ?? 7
          return (
            <button
              key={m.id}
              type="button"
              className={[
                'ui-time-track__marker',
                m.shape === 'square' ? 'ui-time-track__marker--square' : '',
                m.dimmed ? 'ui-time-track__marker--dim' : '',
                m.hovered ? 'ui-time-track__marker--hover' : '',
              ].filter(Boolean).join(' ')}
              style={{
                left: `${m.frac * 100}%`,
                width: size,
                height: size,
                background: m.color,
                ['--marker-color' as string]: m.color,
              }}
              onClick={e => { e.stopPropagation(); m.onClick?.(e) }}
              onMouseEnter={m.onMouseEnter}
              onMouseLeave={m.onMouseLeave}
              aria-label="Timeline marker"
            />
          )
        })}

        {scrubFrac != null && (
          <div className="ui-time-track__cursor" style={{ left: `${scrubFrac * 100}%` }}>
            <div className="ui-time-track__cursor-knob" />
          </div>
        )}

        {tooltip}
      </div>

      {(legend || hint) && (
        <div className="ui-time-track-footer">
          {legend && <div className="ui-time-track-legend">{legend}</div>}
          {hint && <span className="ui-time-track-hint">{hint}</span>}
        </div>
      )}
    </div>
  )
}
