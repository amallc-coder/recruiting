import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserRound, Briefcase, Building2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase, demoMode } from '../../lib/supabase'

type ResultKind = 'candidate' | 'job' | 'facility'

interface Result {
  kind: ResultKind
  id: string
  title: string
  subtitle: string
  to: string
}

const KIND_META: Record<ResultKind, { label: string; icon: LucideIcon }> = {
  candidate: { label: 'Candidates', icon: UserRound },
  job: { label: 'Jobs', icon: Briefcase },
  facility: { label: 'Facilities', icon: Building2 },
}

const PER_GROUP = 6
const GROUP_ORDER: ResultKind[] = ['candidate', 'job', 'facility']

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Lower score = better match: prefix > word-start > substring > matched-elsewhere.
function rank(text: string, q: string): number {
  const t = text.toLowerCase()
  const needle = q.toLowerCase().trim()
  if (!needle) return 3
  if (t.startsWith(needle)) return 0
  if (new RegExp(`\\b${escapeRegExp(needle)}`).test(t)) return 1
  if (t.includes(needle)) return 2
  return 3 // matched via a non-title field (email/region/city…)
}

function rankAndSlice(items: Result[], q: string): Result[] {
  return items
    .map((r) => ({ r, score: rank(r.title, q) }))
    .sort((a, b) => a.score - b.score || a.r.title.length - b.r.title.length || a.r.title.localeCompare(b.r.title))
    .slice(0, PER_GROUP)
    .map((x) => x.r)
}

// Build a safe PostgREST `.or()` ilike pattern: strip filter-breaking characters
// and turn spaces into wildcards so "nish patel" matches "Nish ... Patel".
function ilikePattern(raw: string): string {
  const cleaned = raw
    .replace(/[%_,()*.\\"']/g, ' ')
    .trim()
    .replace(/\s+/g, '*')
  return cleaned ? `*${cleaned}*` : ''
}

type CandidateRow = { id: string; full_name: string; role: string | null; region: string | null; email: string | null }
type JobRow = { id: string; title: string; department: string | null; location: string | null }
type FacilityRow = { id: string; name: string; region: string | null; city: string | null; portfolio: string | null }

function toCandidate(c: CandidateRow): Result {
  return {
    kind: 'candidate',
    id: c.id,
    title: c.full_name,
    subtitle: [c.role?.toUpperCase(), c.region].filter(Boolean).join(' · ') || 'Candidate',
    to: `/candidates?q=${encodeURIComponent(c.full_name)}`,
  }
}
function toJob(j: JobRow): Result {
  return {
    kind: 'job',
    id: j.id,
    title: j.title,
    subtitle: [j.department, j.location].filter(Boolean).join(' · ') || 'Job',
    to: `/jobs/${j.id}`,
  }
}
function toFacility(f: FacilityRow): Result {
  return {
    kind: 'facility',
    id: f.id,
    title: f.name,
    subtitle: [f.city, f.region].filter(Boolean).join(' · ') || 'Facility',
    to: `/facilities/${f.id}`,
  }
}

/**
 * Global command search across candidates / jobs / facilities. In live mode it
 * filters server-side (so it never hits the 1000-row response cap and scales to
 * the full dataset); in demo mode it loads the small local dataset once and
 * filters in memory. Results are ranked (prefix > word-start > substring).
 * ⌘K / Ctrl+K focuses; ↑/↓/Enter/Esc drive it.
 */
export function CommandSearch() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)

  // demo-mode dataset cache (live mode queries the server each search)
  const demoCache = useRef<{ candidates: CandidateRow[]; jobs: JobRow[]; facilities: FacilityRow[] } | null>(null)
  // guards against out-of-order responses from rapid typing
  const reqId = useRef(0)

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

  async function loadDemo() {
    if (demoCache.current) return demoCache.current
    const [c, j, f] = await Promise.all([
      supabase.from('candidates').select('id,full_name,role,region,email'),
      supabase.from('jobs').select('id,title,department,location'),
      supabase.from('facilities').select('id,name,region,city,portfolio'),
    ])
    demoCache.current = {
      candidates: (c.data as CandidateRow[]) ?? [],
      jobs: (j.data as JobRow[]) ?? [],
      facilities: (f.data as FacilityRow[]) ?? [],
    }
    return demoCache.current
  }

  async function runSearch(q: string): Promise<Result[]> {
    let cands: CandidateRow[] = []
    let jobs: JobRow[] = []
    let facs: FacilityRow[] = []

    if (demoMode) {
      const all = await loadDemo()
      const needle = q.toLowerCase()
      const inc = (...vals: (string | null | undefined)[]) =>
        vals.some((v) => v != null && String(v).toLowerCase().includes(needle))
      cands = all.candidates.filter((c) => inc(c.full_name, c.email, c.region, c.role))
      jobs = all.jobs.filter((j) => inc(j.title, j.department, j.location))
      facs = all.facilities.filter((f) => inc(f.name, f.region, f.city, f.portfolio))
    } else {
      const pat = ilikePattern(q)
      if (!pat) return []
      const [c, j, f] = await Promise.all([
        supabase
          .from('candidates')
          .select('id,full_name,role,region,email')
          .or(`full_name.ilike.${pat},email.ilike.${pat},region.ilike.${pat}`)
          .limit(12),
        supabase
          .from('jobs')
          .select('id,title,department,location')
          .or(`title.ilike.${pat},department.ilike.${pat},location.ilike.${pat}`)
          .limit(12),
        supabase
          .from('facilities')
          .select('id,name,region,city,portfolio')
          .or(`name.ilike.${pat},region.ilike.${pat},city.ilike.${pat},portfolio.ilike.${pat}`)
          .limit(12),
      ])
      cands = (c.data as CandidateRow[]) ?? []
      jobs = (j.data as JobRow[]) ?? []
      facs = (f.data as FacilityRow[]) ?? []
    }

    return [
      ...rankAndSlice(cands.map(toCandidate), q),
      ...rankAndSlice(jobs.map(toJob), q),
      ...rankAndSlice(facs.map(toFacility), q),
    ]
  }

  // Debounced search on every keystroke; stale responses are dropped.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }
    const id = ++reqId.current
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const found = await runSearch(q)
        if (reqId.current === id) {
          setResults(found)
          setActive(0)
        }
      } finally {
        if (reqId.current === id) setLoading(false)
      }
    }, 180)
    return () => clearTimeout(handle)
    // runSearch closes over stable module/refs; intentionally keyed on query only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

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
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
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
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">{loading ? 'Searching…' : `No matches for “${query.trim()}”.`}</div>
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
