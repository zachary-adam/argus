'use client'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon, title, hint, action, compact }: EmptyStateProps) {
  return (
    <div className={`ui-empty-state${compact ? ' ui-empty-state--compact' : ''}`}>
      {icon && <div className="ui-empty-state__icon">{icon}</div>}
      <p className="ui-empty-state__title">{title}</p>
      {hint && <p className="ui-empty-state__hint">{hint}</p>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </div>
  )
}
