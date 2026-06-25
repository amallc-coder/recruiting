import { useEffect, useId, useMemo, useRef, useState } from 'react'

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  /** Static options, or a function for async/large datasets. */
  options?: string[]
  search?: (query: string) => { value: string; label: string }[]
  placeholder?: string
  /** Allow free-text values not in the option list (default true). */
  allowFreeText?: boolean
  disabled?: boolean
  className?: string
  onFocusLoad?: () => void
}

/**
 * Lightweight typeahead. Works with a static option list or a `search`
 * function (used for the ~30k-city dataset). Falls back to free text so any
 * value can be entered even if it's not in the list.
 */
export function Combobox({
  value,
  onChange,
  options,
  search,
  placeholder,
  allowFreeText = true,
  disabled,
  className,
  onFocusLoad,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (search) return search(query).slice(0, 12)
    const list = options ?? []
    const matched = q ? list.filter((o) => o.toLowerCase().includes(q)) : list
    return matched.slice(0, 12).map((o) => ({ value: o, label: o }))
  }, [query, options, search])

  function commit(v: string) {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <input
        className="input"
        disabled={disabled}
        value={open ? query : value}
        placeholder={placeholder}
        onFocus={() => {
          onFocusLoad?.()
          setQuery(value)
          setOpen(true)
          setActive(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(0)
          if (allowFreeText) onChange(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && open && results[active]) { e.preventDefault(); commit(results[active].value) }
          else if (e.key === 'Escape') setOpen(false)
        }}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul
          id={listId}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {results.map((r, i) => (
            <li
              key={r.value + i}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-paper'}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); commit(r.value) }}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
