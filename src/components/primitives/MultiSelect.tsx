import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import type { SelectOption } from './Select'

export interface MultiSelectProps {
  label?: ReactNode
  options: SelectOption[]
  /** Selected values. Empty array means "no filter" → all. */
  value: string[]
  onChange: (value: string[]) => void
  /** Shown when nothing is selected (i.e. "All"). */
  placeholder?: string
  className?: string
}

/**
 * Checkbox dropdown for multi-value filtering, styled to match `Select`.
 * Empty selection means "all" — the trigger shows the placeholder.
 */
export function MultiSelect({ label, options, value, onChange, placeholder = 'All', className = '' }: MultiSelectProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  const selected = options.filter((o) => value.includes(o.value))
  const summary = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0].label : `${selected.length} selected`

  return (
    <div className="w-full" ref={ref}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`input flex items-center justify-between gap-2 pr-9 text-left ${className}`}
        >
          <span className={`truncate ${selected.length === 0 ? 'text-muted' : 'text-ink'}`}>{summary}</span>
        </button>
        <ChevronDown size={15} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        {open && (
          <div
            role="listbox"
            aria-multiselectable
            className="absolute z-30 mt-1 max-h-64 w-full min-w-[12rem] overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
          >
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mb-0.5 block w-full rounded px-2 py-1 text-left text-xs text-muted hover:bg-paper"
              >
                Clear selection
              </button>
            )}
            {options.map((o) => {
              const checked = value.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={o.disabled}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-40"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-ink bg-ink text-paper' : 'border-line'}`}
                  >
                    {checked && <Check size={11} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
