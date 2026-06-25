import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  CLINICAL_ROLES,
  PRIORITY_LABELS,
  type Candidate,
  type ClinicalRole,
  type CoverageNeed,
  type Facility,
  type Priority,
} from '../lib/types'
import { Spinner, StageBadge, RoleBadge } from '../components/ui'

type NeedRow = {
  role: ClinicalRole
  id?: string
  have_count: number
  need_count: number
  priority: Priority
  current_provider: string
  dirty?: boolean
}

export function FacilityDetail() {
  const { id } = useParams<{ id: string }>()
  const [facility, setFacility] = useState<Facility | null>(null)
  const [rows, setRows] = useState<NeedRow[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [savingRole, setSavingRole] = useState<ClinicalRole | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    const [f, n, c] = await Promise.all([
      supabase.from('facilities').select('*').eq('id', id).single(),
      supabase.from('coverage_needs').select('*').eq('facility_id', id),
      supabase.from('candidates').select('*').eq('facility_id', id).order('created_at', { ascending: false }),
    ])
    setFacility((f.data as Facility) ?? null)
    const existing = (n.data as CoverageNeed[]) ?? []
    setRows(
      CLINICAL_ROLES.map((role) => {
        const m = existing.find((e) => e.role === role)
        return {
          role,
          id: m?.id,
          have_count: m?.have_count ?? 0,
          need_count: m?.need_count ?? 0,
          priority: m?.priority ?? 'standard',
          current_provider: m?.current_provider ?? '',
        }
      }),
    )
    setCandidates((c.data as Candidate[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function update(role: ClinicalRole, patch: Partial<NeedRow>) {
    setRows((rs) => rs.map((r) => (r.role === role ? { ...r, ...patch, dirty: true } : r)))
  }

  async function saveRow(row: NeedRow) {
    if (!id) return
    setSavingRole(row.role)
    const payload = {
      facility_id: id,
      role: row.role,
      have_count: row.have_count,
      need_count: row.need_count,
      priority: row.priority,
      current_provider: row.current_provider || null,
    }
    // Upsert on the (facility_id, role) unique key.
    await supabase.from('coverage_needs').upsert(payload, { onConflict: 'facility_id,role' })
    setSavingRole(null)
    load()
  }

  if (loading) return <Spinner label="Loading facility…" />
  if (!facility)
    return (
      <div className="space-y-4">
        <Link to="/facilities" className="inline-flex items-center gap-1 text-sm text-brand-700">
          <ArrowLeft size={16} /> Back to facilities
        </Link>
        <div className="text-muted">Facility not found or not in your territory.</div>
      </div>
    )

  return (
    <div className="space-y-6">
      <Link to="/facilities" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
        <ArrowLeft size={16} /> Back to facilities
      </Link>

      <div className="card p-6">
        <h1 className="text-2xl font-semibold text-ink">{facility.name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {facility.region && <span><span className="text-muted">Region:</span> {facility.region}</span>}
          {facility.portfolio && <span><span className="text-muted">Portfolio:</span> {facility.portfolio}</span>}
          {facility.census != null && <span><span className="text-muted">Census:</span> {facility.census}</span>}
          {(facility.city || facility.state) && (
            <span><span className="text-muted">Location:</span> {[facility.city, facility.state].filter(Boolean).join(', ')}</span>
          )}
          {facility.phone && <span><span className="text-muted">Phone:</span> {facility.phone}</span>}
        </div>
        {facility.address && <div className="mt-1 text-sm text-muted">{facility.address}</div>}
      </div>

      {/* Coverage needs */}
      <div className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Coverage by role (Have / Need)</h2>
          <p className="text-xs text-muted">Edit a row and click save. Set Need &gt; 0 to flag an open gap.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 w-24">Have</th>
                <th className="px-4 py-3 w-24">Need</th>
                <th className="px-4 py-3 w-36">Priority</th>
                <th className="px-4 py-3">Current provider(s)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.role} className={r.need_count > 0 ? 'bg-clay-50/40' : ''}>
                  <td className="px-4 py-2"><RoleBadge role={r.role} /></td>
                  <td className="px-4 py-2">
                    <input
                      type="number" min={0}
                      className="input py-1"
                      value={r.have_count}
                      onChange={(e) => update(r.role, { have_count: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number" min={0}
                      className="input py-1"
                      value={r.need_count}
                      onChange={(e) => update(r.role, { need_count: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="input py-1"
                      value={r.priority}
                      onChange={(e) => update(r.role, { priority: e.target.value as Priority })}
                    >
                      {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                        <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      className="input py-1"
                      placeholder="e.g. Dr. Sutherland / Sara K"
                      value={r.current_provider}
                      onChange={(e) => update(r.role, { current_provider: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="btn-secondary py-1"
                      disabled={!r.dirty || savingRole === r.role}
                      onClick={() => saveRow(r)}
                    >
                      <Save size={14} /> {savingRole === r.role ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Candidates at this facility */}
      <div className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Candidates targeting this facility</h2>
        </div>
        {candidates.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">No candidates yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-paper text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Start date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {candidates.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-ink">{c.full_name}</td>
                    <td className="px-4 py-3"><RoleBadge role={c.role} /></td>
                    <td className="px-4 py-3"><StageBadge stage={c.current_stage} /></td>
                    <td className="px-4 py-3 text-muted">{c.start_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
