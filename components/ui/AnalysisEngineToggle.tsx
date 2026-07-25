'use client'

import { Sparkles } from 'lucide-react'
import type { AnalysisEngine } from '@/lib/aiMode'
import { SegControl } from '@/components/ui/SegControl'

interface AnalysisEngineToggleProps {
  value: AnalysisEngine
  onChange: (value: AnalysisEngine) => void
  /** Server has at least one AI key — used for hint only, never hides AI option. */
  aiAvailable?: boolean
  size?: 'sm' | 'md'
  className?: string
  compact?: boolean
}

export function AnalysisEngineToggle({
  value,
  onChange,
  aiAvailable = true,
  size = 'sm',
  className = '',
  compact = false,
}: AnalysisEngineToggleProps) {
  const showKeyHint = value === 'ai' && !aiAvailable

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 6, flexShrink: 0 }}
      title={showKeyHint ? 'AI selected — add API keys in Settings → API Keys' : 'Choose rule-based or AI-assisted analysis'}
    >
      <SegControl<AnalysisEngine>
        size={size}
        value={value}
        onChange={onChange}
        options={[
          { value: 'rules', label: 'Rules' },
          { value: 'ai', label: compact ? 'AI' : 'AI ✦' },
        ]}
      />
      {showKeyHint && (
        <span
          className="ui-chip ui-chip--xs"
          style={{
            color: 'var(--medium)',
            borderColor: 'color-mix(in srgb, var(--medium) 40%, var(--border))',
            whiteSpace: 'nowrap',
          }}
        >
          {compact ? 'No key' : 'Keys needed'}
        </span>
      )}
      {value === 'ai' && aiAvailable && !compact && (
        <Sparkles size={11} style={{ color: 'var(--accent)', flexShrink: 0, opacity: 0.85 }} aria-hidden />
      )}
    </div>
  )
}
