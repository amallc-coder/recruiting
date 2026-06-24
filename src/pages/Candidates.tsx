import { useEffect, useMemo, useState } from 'react'
import { Plus, Download, Pencil, Trash2, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { useFacilities } from '../hooks/useFacilities'
import { downloadCsv } from '../lib/export'
import {
  CLINICAL_ROLES,
  ROLE_LABELS,
  SOURCE_SUGGESTIONS,
  STAGES,
  STAGE_LABELS,
  type Candidate,
  type ClinicalRole,
  type Stage,
} from '../lib/types'
import { EmptyState, Modal, RoleBadge, Spinner } from '../components/ui'

const EMPTY: Partial<Candidate> = {
  full_name: '',
  role: 'lpn',
  source: 'Indeed',
  current_stage: 'sourced',
  welcome_call_done: false,
}

export function Candidates() {
  const { profile, isAdmin } = useAuth()
  const { profiles, byId } = useProfiles()
  const { facilities, byId: facilityById } = useFacilities()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<Stage | 'all' | 'active_pipeline'>('all')
  const [roleFilter, setRoleFilter] = useState<ClinicalRole | 'all'>('all')
  const [editing, setEditing] = useState<Partial<Candidate> | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('candidates').select('*').order('created_at', { ascending: false })
    setCandidates((data as Candidate[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (roleFilter !== 'all' && c.role !== roleFilter) return false
      if (stageFilter === 'active_pipeline') {
        if (['active', 'declined', 'no_response'].includes(c.current_stage)) return false
      } else if (stageFilter !== 'all' && c.current_stage !== stageFilter) return false
      if (query) {
        const q = query.toLowerCase()
        return [c.full_name, c.email, c.source, c.region]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      }
      return true
    })
  }, [candidates, stageFilter, roleFilter, query])

  async function quickStage(c: Candidate, stage: Stage) {
    await supabase.from('candidates').update({ current_stage: stage }).eq('id', c.id)
    load()
  }

  async function handleDelete(c: Candidate) {
    if (!confirm(`Delete candidate "${c.full_name}"?`)) return
    await supabase.from('candidates').delete().eq('id', c.id)
    load()
  }

  function exportCsv() {
    downloadCsv(
      `candidates-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((c) => ({
        full_name: c.full_name,
        role: ROLE_LABELS[c.role],
        email: c.email,
        phone: c.phone,
        facility: facilityById(c.facility_id)?.name ?? '',
        region: c.region,
        stage: STAGE_LABELS[c.current_stage],
        source: c.source,
        recruiter: byId(c.recruiter_id)?.full_name ?? '',
        background_sent: c.background_sent_date,
        background_cleared: c.background_cleared_date,
        welcome_call_done: c.welcome_call_done ? 'Yes' : 'No',
        start_date: c.start_date,
      })),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'All candidates across the team.' : 'Candidates in your territory.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={16} /> Export
          </button>
          <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>
            <Plus size={16} /> New candidate
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search name, email, region…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input max-w-[150px]" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as ClinicalRole | 'all')}>
          <option value="all">All roles</option>
          {CLINICAL_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        <select className="input max-w-[190px]" value={stageFilter} onChange={(e) => setStageFilter(e.target.value as Stage | 'all' | 'active_pipeline')}>
          <option value="all">All stages</option>
          <option value="active_pipeline">In pipeline (active)</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading candidates…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No candidates yet" hint="Add candidates and move them through your pipeline." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Facility</th>
                  <th className="px-4 py-3">Stage</th>
                  {isAdmin && <th className="px-4 py-3">Recruiter</th>}
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.full_name}</div>
                      <div className="text-xs text-gray-400">{c.email || c.phone}</div>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={c.role} /></td>
                    <td className="px-4 py-3 text-gray-600">{facilityById(c.facility_id)?.name ?? c.region ?? '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={c.current_stage}
                        onChange={(e) => quickStage(c, e.target.value as Stage)}
                        className="rounded-md border-0 bg-transparent text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-brand-500"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    {isAdmin && <td className="px-4 py-3 text-gray-600">{byId(c.recruiter_id)?.full_name ?? '—'}</td>}
                    <td className="px-4 py-3 text-gray-500">{c.start_date ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" onClick={() => setEditing(c)} aria-label="Edit">
                          <Pencil size={16} />
                        </button>
                        <button className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => handleDelete(c)} aria-label="Delete">
                          <Trash2 size={16} />
                        </button>
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
        <CandidateForm
          value={editing}
          facilities={facilities}
          profiles={profiles}
          isAdmin={isAdmin}
          currentUserId={profile!.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function CandidateForm({
  value,
  facilities,
  profiles,
  isAdmin,
  currentUserId,
  onClose,
  onSaved,
}: {
  value: Partial<Candidate>
  facilities: { id: string; name: string; region: string | null }[]
  profiles: { id: string; full_name: string; email: string }[]
  isAdmin: boolean
  currentUserId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Partial<Candidate>>(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = !value.id

  function set<K extends keyof Candidate>(key: K, v: Candidate[K]) {
    setForm((f) => ({ ...f, [key]: v }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const payload = {
      full_name: form.full_name,
      role: form.role ?? 'lpn',
      email: form.email || null,
      phone: form.phone || null,
      source: form.source || null,
      facility_id: form.facility_id || null,
      current_stage: form.current_stage ?? 'sourced',
      background_sent_date: form.background_sent_date || null,
      background_cleared_date: form.background_cleared_date || null,
      welcome_call_done: !!form.welcome_call_done,
      start_date: form.start_date || null,
      rating: form.rating ? Number(form.rating) : null,
      notes: form.notes || null,
      recruiter_id: isAdmin ? form.recruiter_id ?? currentUserId : currentUserId,
    }
    const res = isNew
      ? await supabase.from('candidates').insert({ ...payload, created_by: currentUserId })
      : await supabase.from('candidates').update(payload).eq('id', value.id!)
    setSaving(false)
    if (res.error) return setError(res.error.message)
    onSaved()
  }

  return (
    <Modal title={isNew ? 'New candidate' : 'Edit candidate'} onClose={onClose} wide>
      <datalist id="sources">{SOURCE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Full name *</label>
          <input className="input" value={form.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role ?? 'lpn'} onChange={(e) => set('role', e.target.value as ClinicalRole)}>
            {CLINICAL_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label">Facility</label>
          <select className="input" value={form.facility_id ?? ''} onChange={(e) => set('facility_id', e.target.value)}>
            <option value="">— None —</option>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{f.name}{f.region ? ` (${f.region})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Stage</label>
          <select className="input" value={form.current_stage ?? 'sourced'} onChange={(e) => set('current_stage', e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Source</label>
          <input list="sources" className="input" value={form.source ?? ''} onChange={(e) => set('source', e.target.value)} />
        </div>
        <div>
          <label className="label">Rating (1–5)</label>
          <input type="number" min={1} max={5} className="input" value={form.rating ?? ''} onChange={(e) => set('rating', Number(e.target.value))} />
        </div>

        <div className="sm:col-span-2 mt-1 border-t border-gray-100 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Onboarding
        </div>
        <div>
          <label className="label">Background sent</label>
          <input type="date" className="input" value={form.background_sent_date ?? ''} onChange={(e) => set('background_sent_date', e.target.value)} />
        </div>
        <div>
          <label className="label">Background cleared</label>
          <input type="date" className="input" value={form.background_cleared_date ?? ''} onChange={(e) => set('background_cleared_date', e.target.value)} />
        </div>
        <div>
          <label className="label">Start date</label>
          <input type="date" className="input" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              checked={!!form.welcome_call_done}
              onChange={(e) => set('welcome_call_done', e.target.checked)}
            />
            Welcome call completed
          </label>
        </div>

        {isAdmin && (
          <div className="sm:col-span-2">
            <label className="label">Recruiter</label>
            <select className="input" value={form.recruiter_id ?? currentUserId} onChange={(e) => set('recruiter_id', e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input min-h-[70px]" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving || !form.full_name}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
