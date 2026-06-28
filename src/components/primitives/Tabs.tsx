import { useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface TabItem {
  value: string
  label: ReactNode
  disabled?: boolean
}

export interface TabsProps {
  tabs: TabItem[]
  /** Controlled value. Omit for uncontrolled (use `defaultValue`). */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Optional render-prop panel; receives the active value. */
  children?: (value: string) => ReactNode
  className?: string
  label?: string
}

/**
 * WAI-ARIA tabs with roving tabindex + arrow/Home/End keyboard navigation.
 * Works controlled or uncontrolled.
 */
export function Tabs({ tabs, value, defaultValue, onValueChange, children, className = '', label }: TabsProps) {
  const baseId = useId()
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.value ?? '')
  const active = value ?? internal

  function select(next: string) {
    if (value === undefined) setInternal(next)
    onValueChange?.(next)
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const enabled = tabs.filter((t) => !t.disabled)
    if (!enabled.length) return
    const curr = enabled.findIndex((t) => t.value === active)
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (curr + 1) % enabled.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (curr - 1 + enabled.length) % enabled.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = enabled.length - 1
    if (next >= 0) {
      e.preventDefault()
      select(enabled[next].value)
    }
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className="flex items-center gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => {
          const selected = t.value === active
          return (
            <button
              key={t.value}
              role="tab"
              type="button"
              id={`${baseId}-tab-${t.value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.value}`}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => select(t.value)}
              onKeyDown={onKeyDown}
              className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {children && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active}`}
          aria-labelledby={`${baseId}-tab-${active}`}
          tabIndex={0}
          className="pt-4 focus-visible:outline-none"
        >
          {children(active)}
        </div>
      )}
    </div>
  )
}
