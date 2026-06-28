import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserRound, Briefcase, Building2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type ResultKind = 'candidate' | 'job' | 'facility'

interface Result {
  kind: ResultKind
  id: string
  title: string
  subtitle: string
  to: string
}

interface Dataset {
  candidates: { id: string; full_name: string; role: string | null; region: string | null; email: string | null }[]
  jobs: { id: string; title: string; department: string | null; location: string | null }[]
  facilities: { id: string; name: string; region: string | null; city: string | null; portfolio: string | null }[]
}

const KIND_META: Record<ResultKind, { label: string; icon: LucideIcon }> = {
  candidate: { label: 'Candidates', icon: UserRound },
  job: { label: 'Jobs', icon: Briefcase },
  facility: { label: 'Facilities', icon: Building2 },
}

const PER_GROUP = 5
const GROUP_ORDER: ResultKind[] = ['candidate', 'job', 'facility']

/**
 * Global command search. Lazily indexes candidates / jobs / facilities (via the
 * same Supabase client the rest of the app uses, so it works in live + demo
 * mode and respects RLS), live-filters in memory, and navigates on select:
 * jobs/facilities open their detail page; candidates open the filtered list
 * (no candidate detail route exists). ⌘K / Ctrl+K focuses; ↑/↓/Enter/Esc drive it.
 */
export function CommandSearch() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [data, setData] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(false)

  // ⌘K / Ctrl+K focuses the field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Close when clicking outside the widget.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Reset the highlighted row whenever the query changes.
  useEffect(() => setActive(0), [query])

  // Load the searchable index once, the first time the field is used.
  async function ensureLoaded() {
    if (data || loading) return
    setLoading(true)
    try {
      const [c, j, f] = await Promise.all([
        supabase.from('candidates').select('id,full_name,role,region,email'),
        supabase.from('jobs').select('id,title,department,location'),
        supabase.from('facilities').select('id,name,region,city,portfolio'),
      ])
      setData({
        candidates: (c.data as Dataset['candidates']) ?? [],
        jobs: (j.data as Dataset['jobs']) ?? [],
        facilities: (f.data as Dataset['facilities']) ?? [],
      })
    } finally {
      setLoading(false)
    }
  }

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q || !data) return []
    const hit = (...vals: (string | null | undefined)[]) => vals.some((v) => v != null && v.toLowerCase().includes(q))

    const candidates: Result[] = data.candidates
      .filter((c) => hit(c.full_name, c.email, c.region, c.role))
      .slice(0, PER_GROUP)
      .map((c) => ({
        kind: 'candidate',
        id: c.id,
        title: c.full_name,
        subtitle: [c.role?.toUpperCase(), c.region].filter(Boolean).join(' · ') || 'Candidate',
        to: `/candidates?q=${encodeURIComponent(c.full_name)}`,
      }))
    const jobs: Result[] = data.jobs
      .filter((j) => hit(j.title, j.department, j.location))
      .slice(0, PER_GROUP)
      .map((j) => ({
        kind: 'job',
        id: j.id,
        title: j.title,
        subtitle: [j.department, j.location].filter(Boolean).join(' · ') || 'Job',
        to: `/jobs/${j.id}`,
      }))
    const facilities: Result[] = data.facilities
      .filter((f) => hit(f.name, f.region, f.city, f.portfolio))
      .slice(0, PER_GROUP)
      .map((f) => ({
        kind: 'facility',
        id: f.id,
        title: f.name,
        subtitle: [f.city, f.region].filter(Boolean).join(' · ') || 'Facility',
        to: `/facilities/${f.id}`,
      }))
    return [...candidates, ...jobs, ...facilities]
  }, [query, data])

  function choose(r: Result | undefined) {
    if (!r) return
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    navigate(r.to)
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      inputRef.current?.blur()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (results.length ? Math.min(i + 1, results.length - 1) : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[active])
    }
  }

  const showPanel = open && query.trim().length > 0

  return (
    <div ref={rootRef} role="search" className="relative hidden min-w-0 flex-1 md:block md:max-w-md">
      <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && results[active] ? `${listId}-opt-${active}` : undefined}
        aria-keyshortcuts="Meta+K Control+K"
        aria-label="Search candidates, jobs, and facilities"
        value={query}
        placeholder="Search…  (⌘K)"
        className="input h-9 py-0 pl-9 pr-3"
        onFocus={() => {
          ensureLoaded()
          setOpen(true)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          ensureLoaded()
        }}
        onKeyDown={onKeyDown}
      />

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
        >
          {loading && !data ? (
            <div className="px-4 py-3 text-sm text-muted">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">No matches for “{query.trim()}”.</div>
          ) : (
            GROUP_ORDER.map((kind) => {
              const items = results.filter((r) => r.kind === kind)
              if (!items.length) return null
              const Icon = KIND_META[kind].icon
              return (
                <div key={kind} className="py-1">
                  <div className="px-3 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                    {KIND_META[kind].label}
                  </div>
                  {items.map((r) => {
                    const idx = results.indexOf(r)
                    const selected = idx === active
                    return (
                      <button
                        key={`${r.kind}-${r.id}`}
                        id={`${listId}-opt-${idx}`}
                        role="option"
                        aria-selected={selected}
                        type="button"
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => choose(r)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${selected ? 'bg-brand-50 text-ink' : 'text-ink hover:bg-brand-50'}`}
                      >
                        <Icon size={15} aria-hidden className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                        <span className="ml-2 shrink-0 truncate text-xs text-muted">{r.subtitle}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
