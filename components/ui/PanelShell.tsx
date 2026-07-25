'use client'
import type { ReactNode } from 'react'

interface PanelShellProps {
  kicker?: string
  title: string
  subtitle?: string
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  headerClassName?: string
}

export function PanelShell({
  kicker,
  title,
  subtitle,
  actions,
  footer,
  children,
  className = '',
  bodyClassName = '',
  headerClassName = '',
}: PanelShellProps) {
  return (
    <div className={`ui-panel-shell ${className}`.trim()}>
      <header className={`ui-panel-shell__header ${headerClassName}`.trim()}>
        <div className="ui-panel-shell__titles">
          {kicker && <div className="ui-kicker ui-panel-shell__kicker">{kicker}</div>}
          <div className="ui-title ui-panel-shell__title">{title}</div>
          {subtitle && <p className="ui-subtitle ui-panel-shell__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="ui-panel-shell__actions">{actions}</div>}
      </header>
      <div className={`ui-panel-shell__body ${bodyClassName}`.trim()}>{children}</div>
      {footer && <footer className="ui-panel-shell__footer">{footer}</footer>}
    </div>
  )
}
