import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LayoutGrid, Table as TableIcon, Save, Trash2, ArrowUpDown, UserCog } from 'lucide-react'
import { Button, Card, Input, Select, MultiSelect, Table, THead, TBody, Tr, Th, Td, Badge } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import { ReqStatusBadge } from './badges'
import { RequisitionForm } from './RequisitionForm'
import {
  listRequisitions,
  listFacilities,
  listOrgUsers,
  listRoleFamilies,
  daysOpen,
  appCount,
  type ReqFilters,
} from '../../lib/v2/requisitions'
import type { Facility, OrgUser, RoleFamily, RequisitionRow, RequisitionStatus } from '../../lib/v2/types'
import { listDivisions, listDepartments, type Division, type Department } from '../../lib/v2/hierarchy'

const STATUSES: RequisitionStatus[] = ['draft', 'pending_approval', 'open', 'on_hold', 'filled', 'closed', 'cancelled']
const SAVED_KEY = 'clinilytics.req.savedFilters'

interface SavedFilter {
  name: string
  filters: ReqFilters
}
function loadSaved(): SavedFilter[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
  } catch {
    return []
  }
}
function persistSaved(list: SavedFilter[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(list))
}

const EMPTY_FILTERS: ReqFilters = { statuses: [], facilityIds: [], divisionIds: [], departmentIds: [], roleFamilies: [], managerIds: [], hiringManagerIds: [], specialty: '', search: '', maxAgeDays: null }

type SortKey = 'title' | 'facility' | 'status' | 'age' | 'candidates'

export function RequisitionsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [reqs, setReqs] = useState<RequisitionRow[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [users, setUsers] = useState<OrgUser[]>([])
  const [roleFamilies, setRoleFamilies] = useState<RoleFamily[]>([])
  const [divisions, setDivisions] = useState<Division[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [filters, setFilters] = useState<ReqFilters>(EMPTY_FILTERS)
  const [view, setView] = useState<'cards' | 'table' | 'byHM'>('cards')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'age', dir: -1 })
  const [creating, setCreating] = useState(false)
  const [saved, setSaved] = useState<SavedFilter[]>(loadSaved)

  useEffect(() => {
    Promise.all([listFacilities(), listOrgUsers(), listRoleFamilies(), listDivisions(), listDepartments()]).then(([f, u, r, dv, dp]) => {
      setFacilities(f)
      setUsers(u)
      setRoleFamilies(r)
      setDivisions(dv)
      setDepartments(dp)
    })
  }, [])

  function refresh() {
    setLoading(true)
    listRequisitions(filters).then((rows) => {
      setReqs(rows)
      setLoading(false)
    })
  }
  useEffect(refresh, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const facilityName = (id: string) => facilities.find((f) => f.id === id)?.name ?? '—'

  const sorted = useMemo(() => {
    const val = (r: RequisitionRow): string | number => {
      switch (sort.key) {
        case 'title': return r.title.toLowerCase()
        case 'facility': return (r.facility?.name ?? facilityName(r.facility_id)).toLowerCase()
        case 'status': return r.status
        case 'age': return daysOpen(r)
        case 'candidates': return appCount(r)
      }
    }
    return [...reqs].sort((a, b) => {
      const av = val(a), bv = val(b)
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir
    })
  }, [reqs, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hiring managers are a distinct population from recruiters; fall back to all
  // users only if no hiring_manager-role users exist yet.
  const hmOptions = useMemo(() => {
    const hm = users.filter((u) => u.role === 'hiring_manager')
    return hm.length ? hm : users
  }, [users])

  // "By manager" view: group requisitions under their hiring manager.
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; rows: RequisitionRow[] }>()
    for (const r of sorted) {
      const id = r.hiring_manager?.id ?? '__none__'
      const name = r.hiring_manager?.full_name ?? 'Unassigned'
      if (!map.has(id)) map.set(id, { name, rows: [] })
      map.get(id)!.rows.push(r)
    }
    return [...map.values()].sort((a, b) =>
      a.name === 'Unassigned' ? 1 : b.name === 'Unassigned' ? -1 : a.name.localeCompare(b.name),
    )
  }, [sorted])

  function setFilter<K extends keyof ReqFilters>(key: K, value: ReqFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }))
  }
  function renderCard(r: RequisitionRow) {
    return (
      <button key={r.id} onClick={() => navigate(`/requisitions/${r.id}`)} className="card p-4 text-left transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink">{r.title}</div>
            <div className="mt-0.5 truncate text-xs text-muted">
              {r.facility?.division?.name ? `${r.facility.division.name} · ` : ''}
              {r.facility?.name ?? facilityName(r.facility_id)}
              {r.department?.name ? ` · ${r.department.name}` : ''} · {r.role_family}
              {r.specialty ? ` · ${r.specialty}` : ''}
            </div>
          </div>
          <ReqStatusBadge status={r.status} />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          <span className="tnum">{appCount(r)} candidates</span>
          <span className="tnum">{daysOpen(r)}d open</span>
          <span className="tnum">{r.headcount} opening{r.headcount === 1 ? '' : 's'}</span>
        </div>
      </button>
    )
  }
  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))
  }
  function saveCurrent() {
    const name = window.prompt('Save this filter as…')?.trim()
    if (!name) return
    const next = [...saved.filter((s) => s.name !== name), { name, filters }]
    setSaved(next)
    persistSaved(next)
  }
  function applySaved(name: string) {
    const s = saved.find((x) => x.name === name)
    if (s) setFilters({ ...EMPTY_FILTERS, ...s.filters })
  }
  function deleteSaved(name: string) {
    const next = saved.filter((s) => s.name !== name)
    setSaved(next)
    persistSaved(next)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Requisitions</h1>
          <p className="text-sm text-muted">{loading ? 'Loading…' : `${reqs.length} requisition${reqs.length === 1 ? '' : 's'}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            <button
              onClick={() => setView('cards')}
              aria-pressed={view === 'cards'}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${view === 'cards' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
            >
              <LayoutGrid size={15} /> Cards
            </button>
            <button
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${view === 'table' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
            >
              <TableIcon size={15} /> Table
            </button>
            <button
              onClick={() => setView('byHM')}
              aria-pressed={view === 'byHM'}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${view === 'byHM' ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
            >
              <UserCog size={15} /> By manager
            </button>
          </div>
          <Button onClick={() => setCreating(true)} leftIcon={<Plus size={16} />}>
            New requisition
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Input label="Search" value={filters.search ?? ''} onChange={(e) => setFilter('search', e.target.value)} placeholder="Title or specialty" />
          <MultiSelect
            label="Status"
            placeholder="All statuses"
            value={filters.statuses ?? []}
            onChange={(v) => setFilter('statuses', v as RequisitionStatus[])}
            options={STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') }))}
          />
          <MultiSelect
            label="Division"
            placeholder="All divisions"
            value={filters.divisionIds ?? []}
            onChange={(v) => setFilter('divisionIds', v)}
            options={divisions.map((d) => ({ value: d.id, label: d.name }))}
          />
          <MultiSelect
            label="Facility"
            placeholder="All facilities"
            value={filters.facilityIds ?? []}
            onChange={(v) => setFilter('facilityIds', v)}
            options={facilities.map((f) => ({ value: f.id, label: f.name }))}
          />
          <MultiSelect
            label="Department"
            placeholder="All departments"
            value={filters.departmentIds ?? []}
            onChange={(v) => setFilter('departmentIds', v)}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <MultiSelect
            label="Role family"
            placeholder="All roles"
            value={filters.roleFamilies ?? []}
            onChange={(v) => setFilter('roleFamilies', v)}
            options={roleFamilies.map((rf) => ({ value: rf.code, label: rf.code }))}
          />
          <MultiSelect
            label="Recruiter"
            placeholder="Any recruiter"
            value={filters.managerIds ?? []}
            onChange={(v) => setFilter('managerIds', v)}
            options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <MultiSelect
            label="Hiring manager"
            placeholder="Any hiring manager"
            value={filters.hiringManagerIds ?? []}
            onChange={(v) => setFilter('hiringManagerIds', v)}
            options={hmOptions.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <Select label="Age" value={filters.maxAgeDays == null ? 'any' : String(filters.maxAgeDays)} onChange={(e) => setFilter('maxAgeDays', e.target.value === 'any' ? null : Number(e.target.value))}>
            <option value="any">Any age</option>
            <option value="7">≤ 7 days</option>
            <option value="30">≤ 30 days</option>
            <option value="60">≤ 60 days</option>
            <option value="90">≤ 90 days</option>
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="stat-label">Saved filters</span>
          {saved.length === 0 && <span className="text-xs text-muted">none yet</span>}
          {saved.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-ink">
              <button onClick={() => applySaved(s.name)} className="hover:underline">
                {s.name}
              </button>
              <button onClick={() => deleteSaved(s.name)} aria-label={`Delete ${s.name}`} className="rounded p-0.5 text-muted hover:text-rust-600">
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Reset
            </Button>
            <Button variant="secondary" size="sm" onClick={saveCurrent} leftIcon={<Save size={14} />}>
              Save filter
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Spinner label="Loading requisitions…" />
      ) : sorted.length === 0 ? (
        <EmptyState title="No requisitions match" hint="Adjust the filters, or create a new requisition." />
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sorted.map(renderCard)}</div>
      ) : view === 'byHM' ? (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={g.name}>
              <div className="mb-2 flex items-center gap-2 border-b border-line pb-1">
                <UserCog size={15} className="text-muted" />
                <h2 className="text-sm font-semibold tracking-tight text-ink">{g.name}</h2>
                <span className="text-xs text-muted tnum">
                  {g.rows.length} requisition{g.rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{g.rows.map(renderCard)}</div>
            </div>
          ))}
        </div>
      ) : (
        <Table caption="Requisitions">
          <THead>
            <Tr>
              <SortableTh label="Title" k="title" sort={sort} onSort={toggleSort} />
              <SortableTh label="Facility" k="facility" sort={sort} onSort={toggleSort} />
              <Th>Role</Th>
              <SortableTh label="Status" k="status" sort={sort} onSort={toggleSort} />
              <SortableTh label="Candidates" k="candidates" sort={sort} onSort={toggleSort} />
              <SortableTh label="Days open" k="age" sort={sort} onSort={toggleSort} />
            </Tr>
          </THead>
          <TBody>
            {sorted.map((r) => (
              <Tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/requisitions/${r.id}`)}>
                <Td className="font-medium">{r.title}</Td>
                <Td>{r.facility?.name ?? facilityName(r.facility_id)}</Td>
                <Td>
                  <Badge tone="neutral">{r.role_family}</Badge>
                </Td>
                <Td>
                  <ReqStatusBadge status={r.status} />
                </Td>
                <Td className="tnum">{appCount(r)}</Td>
                <Td className="tnum">{daysOpen(r)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      {creating && (
        <RequisitionForm
          facilities={facilities}
          users={users}
          roleFamilies={roleFamilies}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false)
            if (id) navigate(`/requisitions/${id}`)
            else refresh()
          }}
        />
      )}
    </div>
  )
}

function SortableTh({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void }) {
  return (
    <Th>
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        <ArrowUpDown size={11} className={sort.key === k ? 'text-ink' : 'text-muted/50'} />
      </button>
    </Th>
  )
}
