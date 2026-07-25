'use client'

export interface SegOption<T extends string | number = string> {
  label: string
  value: T
}

interface SegControlProps<T extends string | number = string> {
  options: SegOption<T>[]
  value: T | null
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  className?: string
}

export function SegControl<T extends string | number = string>({
  options,
  value,
  onChange,
  size = 'sm',
  className = '',
}: SegControlProps<T>) {
  return (
    <div className={`ui-seg-control ui-seg-control--${size} ${className}`.trim()} role="group">
      {options.map(opt => (
        <button
          key={String(opt.value)}
          type="button"
          className={`ui-seg-control__btn${value === opt.value ? ' ui-seg-control__btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
