import { useEffect, useMemo, useState } from 'react'
import { Plus, Download, Pencil, Trash2, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { downloadCsv } from '../lib/export'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type JobOpening,
  type OpeningStatus,
} from '../lib/types'
import {
  EmptyState,
  Modal,
  PriorityBadge,
  Spinner,
  StatusBadge,
} from '../components/ui'

const EMPTY: Partial<JobOpening> = {
  title: '',
  department: '',
  client: '',
  location: '',
  employment_type: 'Full-time',
  status: 'open',
  priority: 'medium',
  openings_count: 1,
  hiring_manager: '',
}

export function Openings() {
  const { profile, isAdmin } = useAuth()
  const { profiles, byId } = useProfiles()
  const [openings, setOpenings] = useState<JobOpening[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<OpeningStatus | 'all'>('all')
  const [editing, setEditing] = useState<Partial<JobOpening> | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('job_openings')
      .select('*')
      .order('created_at', { ascending: false })
    setOpenings((data as JobOpening[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    return openings.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (query) {
        const q = query.toLowerCase()
        return [o.title, o.department, o.client, o.location, o.hiring_manager]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      }
      return true
    })
  }, [openings, statusFilter, query])

  async function handleDelete(o: JobOpening) {
    if (!confirm(`Delete opening "${o.title}"? This cannot be undone.`)) return
    await supabase.from('job_openings').delete().eq('id', o.id)
    load()
  }

  function exportCsv() {
    downloadCsv(
      `openings-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((o) => ({
        title: o.title,
        department: o.department,
        client: o.client,
        location: o.location,
        employment_type: o.employment_type,
        status: STATUS_LABELS[o.status],
        priority: PRIORITY_LABELS[o.priority],
        openings_count: o.openings_count,
        hiring_manager: o.hiring_manager,
        recruiter: byId(o.assigned_recruiter_id)?.full_name ?? '',
        date_opened: o.date_opened,
        target_fill_date: o.target_fill_date,
      })),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Job Openings</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'All openings across the team.' : 'Openings assigned to you.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={16} /> Export
          </button>
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>
            <Plus size={16} /> New opening
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search title, client, location…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input max-w-[180px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OpeningStatus | 'all')}
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABELS) as OpeningStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading openings…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No openings yet"
          hint="Create your first job opening to start tracking candidates against it."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Client / Dept</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Seats</th>
                  {isAdmin && <th className="px-4 py-3">Recruiter</th>}
                  <th className="px-4 py-3">Opened</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{o.title}</div>
                      <div className="text-xs text-gray-400">{o.location}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{o.client || o.department || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={o.priority} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{o.openings_count}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-600">
                        {byId(o.assigned_recruiter_id)?.full_name ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-500">{o.date_opened}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          onClick={() => setEditing(o)}
                          aria-label="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        {isAdmin && (
                          <button
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleDelete(o)}
                            aria-label="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <OpeningForm
          value={editing}
          profiles={profiles}
          isAdmin={isAdmin}
          currentUserId={profile!.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function OpeningForm({
  value,
  profiles,
  isAdmin,
  currentUserId,
  onClose,
  onSaved,
}: {
  value: Partial<JobOpening>
  profiles: { id: string; full_name: string; email: string }[]
  isAdmin: boolean
  currentUserId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Partial<JobOpening>>(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = !value.id

  function set<K extends keyof JobOpening>(key: K, v: JobOpening[K]) {
    setForm((f) => ({ ...f, [key]: v }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const payload = {
      title: form.title,
      department: form.department || null,
      client: form.client || null,
      location: form.location || null,
      employment_type: form.employment_type || null,
      status: form.status,
      priority: form.priority,
      openings_count: Number(form.openings_count) || 1,
      hiring_manager: form.hiring_manager || null,
      salary_min: form.salary_min ? Number(form.salary_min) : null,
      salary_max: form.salary_max ? Number(form.salary_max) : null,
      description: form.description || null,
      notes: form.notes || null,
      target_fill_date: form.target_fill_date || null,
      assigned_recruiter_id: isAdmin
        ? form.assigned_recruiter_id ?? currentUserId
        : currentUserId,
    }
    const res = isNew
      ? await supabase.from('job_openings').insert({ ...payload, created_by: currentUserId })
      : await supabase.from('job_openings').update(payload).eq('id', value.id!)
    setSaving(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal title={isNew ? 'New opening' : 'Edit opening'} onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Title *</label>
          <input className="input" value={form.title ?? ''} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label className="label">Client</label>
          <input className="input" value={form.client ?? ''} onChange={(e) => set('client', e.target.value)} />
        </div>
        <div>
          <label className="label">Department</label>
          <input
            className="input"
            value={form.department ?? ''}
            onChange={(e) => set('department', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Location</label>
          <input
            className="input"
            value={form.location ?? ''}
            onChange={(e) => set('location', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Employment type</label>
          <select
            className="input"
            value={form.employment_type ?? ''}
            onChange={(e) => set('employment_type', e.target.value)}
          >
            {['Full-time', 'Part-time', 'Contract', 'Temp', 'Internship'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select
            className="input"
            value={form.status ?? 'open'}
            onChange={(e) => set('status', e.target.value as JobOpening['status'])}
          >
            {(Object.keys(STATUS_LABELS) as JobOpening['status'][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select
            className="input"
            value={form.priority ?? 'medium'}
            onChange={(e) => set('priority', e.target.value as JobOpening['priority'])}
          >
            {(Object.keys(PRIORITY_LABELS) as JobOpening['priority'][]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label"># of openings</label>
          <input
            type="number"
            min={1}
            className="input"
            value={form.openings_count ?? 1}
            onChange={(e) => set('openings_count', Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Hiring manager</label>
          <input
            className="input"
            value={form.hiring_manager ?? ''}
            onChange={(e) => set('hiring_manager', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Target fill date</label>
          <input
            type="date"
            className="input"
            value={form.target_fill_date ?? ''}
            onChange={(e) => set('target_fill_date', e.target.value)}
          />
        </div>
        {isAdmin && (
          <div>
            <label className="label">Assigned recruiter</label>
            <select
              className="input"
              value={form.assigned_recruiter_id ?? currentUserId}
              onChange={(e) => set('assigned_recruiter_id', e.target.value)}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea
            className="input min-h-[80px]"
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={saving || !form.title}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
