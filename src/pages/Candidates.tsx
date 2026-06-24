import { useEffect, useMemo, useState } from 'react'
import { Plus, Download, Pencil, Trash2, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { downloadCsv } from '../lib/export'
import {
  STAGES,
  STAGE_LABELS,
  type Candidate,
  type JobOpening,
  type Stage,
} from '../lib/types'
import { EmptyState, Modal, Spinner } from '../components/ui'

const EMPTY: Partial<Candidate> = {
  full_name: '',
  email: '',
  phone: '',
  source: 'LinkedIn',
  current_stage: 'applied',
  status: 'active',
}

export function Candidates() {
  const { profile, isAdmin } = useAuth()
  const { profiles, byId } = useProfiles()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [openings, setOpenings] = useState<JobOpening[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all')
  const [editing, setEditing] = useState<Partial<Candidate> | null>(null)

  async function load() {
    setLoading(true)
    const [c, o] = await Promise.all([
      supabase.from('candidates').select('*').order('created_at', { ascending: false }),
      supabase.from('job_openings').select('*').order('title'),
    ])
    setCandidates((c.data as Candidate[]) ?? [])
    setOpenings((o.data as JobOpening[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const openingById = (id: string | null) => openings.find((o) => o.id === id)

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (stageFilter !== 'all' && c.current_stage !== stageFilter) return false
      if (query) {
        const q = query.toLowerCase()
        return [c.full_name, c.email, c.source, c.location]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      }
      return true
    })
  }, [candidates, stageFilter, query])

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
        email: c.email,
        phone: c.phone,
        opening: openingById(c.opening_id)?.title ?? '',
        stage: STAGE_LABELS[c.current_stage],
        source: c.source,
        rating: c.rating,
        recruiter: byId(c.recruiter_id)?.full_name ?? '',
        applied_date: c.applied_date,
      })),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'All candidates across the team.' : 'Candidates you are working.'}
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
            placeholder="Search name, email, source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input max-w-[180px]"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as Stage | 'all')}
        >
          <option value="all">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
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
                  <th className="px-4 py-3">Opening</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Source</th>
                  {isAdmin && <th className="px-4 py-3">Recruiter</th>}
                  <th className="px-4 py-3">Applied</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{c.full_name}</div>
                      <div className="text-xs text-gray-400">{c.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{openingById(c.opening_id)?.title ?? '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={c.current_stage}
                        onChange={(e) => quickStage(c, e.target.value as Stage)}
                        className="rounded-md border-0 bg-transparent text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-brand-500"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.source ?? '—'}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-600">{byId(c.recruiter_id)?.full_name ?? '—'}</td>
                    )}
                    <td className="px-4 py-3 text-gray-500">{c.applied_date}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          onClick={() => setEditing(c)}
                          aria-label="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => handleDelete(c)}
                          aria-label="Delete"
                        >
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
          openings={openings}
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

function CandidateForm({
  value,
  openings,
  profiles,
  isAdmin,
  currentUserId,
  onClose,
  onSaved,
}: {
  value: Partial<Candidate>
  openings: JobOpening[]
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
      email: form.email || null,
      phone: form.phone || null,
      location: form.location || null,
      source: form.source || null,
      current_stage: form.current_stage ?? 'applied',
      status: form.status ?? 'active',
      opening_id: form.opening_id || null,
      linkedin_url: form.linkedin_url || null,
      resume_url: form.resume_url || null,
      expected_salary: form.expected_salary ? Number(form.expected_salary) : null,
      rating: form.rating ? Number(form.rating) : null,
      notes: form.notes || null,
      recruiter_id: isAdmin ? form.recruiter_id ?? currentUserId : currentUserId,
    }
    const res = isNew
      ? await supabase.from('candidates').insert({ ...payload, created_by: currentUserId })
      : await supabase.from('candidates').update(payload).eq('id', value.id!)
    setSaving(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal title={isNew ? 'New candidate' : 'Edit candidate'} onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Full name *</label>
          <input
            className="input"
            value={form.full_name ?? ''}
            onChange={(e) => set('full_name', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Opening</label>
          <select
            className="input"
            value={form.opening_id ?? ''}
            onChange={(e) => set('opening_id', e.target.value)}
          >
            <option value="">— None —</option>
            {openings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
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
          <label className="label">Stage</label>
          <select
            className="input"
            value={form.current_stage ?? 'applied'}
            onChange={(e) => set('current_stage', e.target.value as Stage)}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Source</label>
          <select className="input" value={form.source ?? ''} onChange={(e) => set('source', e.target.value)}>
            {['LinkedIn', 'Referral', 'Job Board', 'Indeed', 'Career Site', 'Agency', 'Other'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
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
          <label className="label">Rating (1–5)</label>
          <input
            type="number"
            min={1}
            max={5}
            className="input"
            value={form.rating ?? ''}
            onChange={(e) => set('rating', Number(e.target.value))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">LinkedIn / Resume URL</label>
          <input
            className="input"
            value={form.linkedin_url ?? ''}
            onChange={(e) => set('linkedin_url', e.target.value)}
          />
        </div>
        {isAdmin && (
          <div>
            <label className="label">Recruiter</label>
            <select
              className="input"
              value={form.recruiter_id ?? currentUserId}
              onChange={(e) => set('recruiter_id', e.target.value)}
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
        <button className="btn-primary" onClick={save} disabled={saving || !form.full_name}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
