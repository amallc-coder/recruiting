import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-brand-500',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line hover:bg-brand-50',
  danger: 'bg-rust-500 text-white hover:bg-rust-600',
  ghost: 'text-muted hover:bg-brand-50 hover:text-ink',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-2.5 py-1.5 text-xs',
  md: 'gap-2 px-3.5 py-2 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

/**
 * Accessible button built on the Clinilytics tokens. Real <button> semantics,
 * focus-visible ring, and a loading state that disables interaction + sets
 * aria-busy so assistive tech announces the pending action.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    type = 'button',
    className = '',
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
})
