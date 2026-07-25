/**
 * ARGUS eye mark — from logo 4 assets.
 * onDark: Praxeti ink on navy surfaces · onLight: Midnight ink on light surfaces.
 * Spring focal node + halo on both.
 */
export function ArgusMark({
  size = 24,
  variant = 'onDark',
  className,
  style,
}: {
  size?: number
  variant?: 'onDark' | 'onLight'
  className?: string
  style?: React.CSSProperties
}) {
  const ink = variant === 'onLight' ? '#001F3F' : '#F6F7ED'
  const haloStroke = variant === 'onLight' ? '#001F3F' : '#DBE64C'

  return (
    <svg
      width={size} height={size} viewBox="-150 -150 300 300"
      fill="none" strokeLinejoin="round" strokeLinecap="round"
      className={className} style={style} aria-hidden="true"
    >
      <path
        d="M -134 0 Q 0 -116 134 0 Q 0 116 -134 0 Z"
        stroke={ink} strokeWidth="2.4" opacity="0.9"
      />
      <circle cx="0" cy="0" r="62" stroke={ink} strokeWidth="1" opacity="0.16" />
      <g stroke={ink} strokeWidth="0.9" opacity="0.28">
        <line x1="62" y1="0" x2="31" y2="53.69" />
        <line x1="31" y1="53.69" x2="-31" y2="53.69" />
        <line x1="-31" y1="53.69" x2="-62" y2="0" />
        <line x1="-62" y1="0" x2="-31" y2="-53.69" />
        <line x1="-31" y1="-53.69" x2="31" y2="-53.69" />
        <line x1="31" y1="-53.69" x2="62" y2="0" />
      </g>
      <g stroke={ink} strokeWidth="1.3" opacity="0.55">
        <line x1="62" y1="0" x2="0" y2="0" />
        <line x1="53.69" y1="31" x2="0" y2="0" />
        <line x1="31" y1="53.69" x2="0" y2="0" />
        <line x1="0" y1="62" x2="0" y2="0" />
        <line x1="-31" y1="53.69" x2="0" y2="0" />
        <line x1="-53.69" y1="31" x2="0" y2="0" />
        <line x1="-62" y1="0" x2="0" y2="0" />
        <line x1="-53.69" y1="-31" x2="0" y2="0" />
        <line x1="-31" y1="-53.69" x2="0" y2="0" />
        <line x1="0" y1="-62" x2="0" y2="0" />
        <line x1="31" y1="-53.69" x2="0" y2="0" />
        <line x1="53.69" y1="-31" x2="0" y2="0" />
      </g>
      <g fill={ink}>
        <circle cx="62" cy="0" r="3.4" />
        <circle cx="53.69" cy="31" r="3" />
        <circle cx="31" cy="53.69" r="3.4" />
        <circle cx="0" cy="62" r="3" />
        <circle cx="-31" cy="53.69" r="3.4" />
        <circle cx="-53.69" cy="31" r="3" />
        <circle cx="-62" cy="0" r="3.4" />
        <circle cx="-53.69" cy="-31" r="3" />
        <circle cx="-31" cy="-53.69" r="3.4" />
        <circle cx="0" cy="-62" r="3" />
        <circle cx="31" cy="-53.69" r="3.4" />
        <circle cx="53.69" cy="-31" r="3" />
      </g>
      <circle cx="0" cy="0" r="18" stroke={haloStroke} strokeWidth="1.2" opacity="0.4" />
      <circle cx="0" cy="0" r="9" fill="#DBE64C" />
    </svg>
  )
}
