import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'ink' | 'sage' | 'clay' | 'rust'

// Every combination clears WCAG AA for normal text (dark token text on its
// matching 50 tint, or paper on ink).
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-brand-50 text-brand-700',
  ink: 'bg-ink text-paper',
  sage: 'bg-sage-50 text-sage-700',
  clay: 'bg-clay-50 text-clay-700',
  rust: 'bg-rust-50 text-rust-700',
}

/** Generic status pill. Domain badges (stage/priority/role) live in `ui.tsx`. */
export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
