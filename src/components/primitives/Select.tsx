import { forwardRef, useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode
  hint?: string
  error?: string
  /** Convenience: render options from data. Falls back to `children` if omitted. */
  options?: SelectOption[]
  placeholder?: string
}

/** Native, accessible select styled with the `.input` token + a chevron affordance. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, id, className = '', children, ...rest },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId
  const hintId = hint ? `${selectId}-hint` : undefined
  const errId = error ? `${selectId}-err` : undefined
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          className={`input appearance-none pr-9 ${error ? 'ring-rust-500 focus:ring-rust-500' : ''} ${className}`}
          {...rest}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options
            ? options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown
          size={15}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
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
