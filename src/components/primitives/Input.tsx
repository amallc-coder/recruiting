import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  hint?: string
  error?: string
  leftIcon?: ReactNode
}

/**
 * Labeled text input on the `.input`/`.label` tokens. Auto-wires id ↔ label and
 * aria-describedby for hint/error so the field is announced correctly.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, id, className = '', ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errId = error ? `${inputId}-err` : undefined
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted" aria-hidden>
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          className={`input ${leftIcon ? 'pl-9' : ''} ${error ? 'ring-rust-500 focus:ring-rust-500' : ''} ${className}`}
          {...rest}
        />
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1 text-xs text-rust-700">
          {error}
        </p>
      )}
    </div>
  )
})
