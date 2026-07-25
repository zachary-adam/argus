'use client'
import { BarChart2, BookMarked, Sparkles, User, Zap } from 'lucide-react'
import type { Pattern } from '@/types/project'

export type OriginKind =
  | Pattern['source']
  | 'ai-filter'
  | 'keyword-filter'
  | 'curated'

const CONFIG: Record<OriginKind, { label: string; hint: string; Icon: typeof Sparkles; className: string }> = {
  rules: {
    label: 'Counted',
    hint: 'Rule-based — counts matches in your events, no AI',
    Icon: BarChart2,
    className: 'ui-origin--rules',
  },
  ai: {
    label: 'AI',
    hint: 'AI suggestion — verify before adding to brief',
    Icon: Sparkles,
    className: 'ui-origin--ai',
  },
  manual: {
    label: 'Your test',
    hint: 'Hypothesis you tested against the corpus',
    Icon: User,
    className: 'ui-origin--manual',
  },
  correlation: {
    label: 'Alert',
    hint: 'From live correlation engine',
    Icon: Zap,
    className: 'ui-origin--alert',
  },
  'ai-filter': {
    label: 'AI filter',
    hint: 'Feed filtered by AI relevance model',
    Icon: Sparkles,
    className: 'ui-origin--ai',
  },
  'keyword-filter': {
    label: 'Keywords',
    hint: 'Feed filtered by topic keywords only — no AI',
    Icon: BarChart2,
    className: 'ui-origin--rules',
  },
  curated: {
    label: 'Curated',
    hint: 'Only events you saved to the journal',
    Icon: BookMarked,
    className: 'ui-origin--curated',
  },
}

interface Props {
  kind: OriginKind
  size?: 'sm' | 'md'
  showHint?: boolean
}

export function OriginBadge({ kind, size = 'sm', showHint = false }: Props) {
  const cfg = CONFIG[kind]
  const { label, hint, Icon, className } = cfg
  return (
    <span
      className={`ui-origin ui-origin--${size} ${className}`}
      title={hint}
    >
      <Icon size={size === 'md' ? 13 : 11} aria-hidden />
      <span>{label}</span>
      {showHint && <span className="ui-origin__hint">{hint}</span>}
    </span>
  )
}

export function OriginLegend({ kinds }: { kinds: OriginKind[] }) {
  return (
    <div className="ui-origin-legend">
      {kinds.map(k => (
        <OriginBadge key={k} kind={k} size="sm" />
      ))}
    </div>
  )
}
