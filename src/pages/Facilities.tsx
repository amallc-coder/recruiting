import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Download, Search, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { downloadCsv } from '../lib/export'
import {
  DIVISIONS,
  PORTFOLIO_SUGGESTIONS,
  REGION_SUGGESTIONS,
  type CoverageNeed,
  type Facility,
} from '../lib/types'
import { EmptyState, Modal, Spinner } from '../components/ui'
import { Combobox } from '../components/Combobox'
import { US_STATES, loadCities, searchCities } from '../lib/geo'

const EMPTY: Partial<Facility> = {
  name: '',
  division: '',
  region: '',
  portfolio: '',
  active: true,
}

export function Facilities() {
  const { isAdmin } = useAuth()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [needs, setNeeds] = useState<CoverageNeed[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [regionFilter, setRegionFilter] = useState('all')
  const [editing, setEditing] = useState<Partial<Facility> | null>(null)

  async function load() {
    setLoading(true)
    const [f, n] = await Promise.all([
      supabase.from('facilities').select('*').order('region').order('name'),
      supabase.from('coverage_needs').select('*'),
    ])
    setFacilities((f.data as Facility[]) ?? [])
    setNeeds((n.data as CoverageNeed[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const needByFacility = useMemo(() => {
    const map = new Map<string, { open: number; premium: number }>()
    for (const n of needs) {
      const cur = map.get(n.facility_id) ?? { open: 0, premium: 0 }
      cur.open += n.need_count
      if ((n.priority === 'premium' || n.priority === 'urgent') && n.need_count > 0) cur.premium += 1
      map.set(n.facility_id, cur)
    }
    return map
  }, [needs])

  const regions = useMemo(
    () => Array.from(new Set(facilities.map((f) => f.region).filter(Boolean))) as string[],
    [facilities],
  )

  const filtered = useMemo(() => {
    return facilities.filter((f) => {
      if (regionFilter !== 'all' && f.region !== regionFilter) return false
      if (query) {
        const q = query.toLowerCase()
        return [f.name, f.region, f.portfolio, f.city, f.state]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      }
      return true
    })
  }, [facilities, regionFilter, query])

  function exportCsv() {
    downloadCsv(
      `facilities-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((f) => ({
        name: f.name,
        division: f.division,
        region: f.region,
        portfolio: f.portfolio,
        city: f.city,
        state: f.state,
        census: f.census,
        open_needs: needByFacility.get(f.id)?.open ?? 0,
      })),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Facilities &amp; Needs</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'All facilities.' : 'Facilities in your territory.'} Open a facility to manage
            Have/Need coverage by role.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={16} /> Export
          </button>
          {isAdmin && (
            <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>
              <Plus size={16} /> New facility
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search facility, region, portfolio…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input max-w-[200px]"
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
        >
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner label="Loading facilities…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No facilities yet"
          hint={isAdmin ? 'Add facilities to start tracking coverage needs.' : 'No facilities assigned to your territory yet.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Facility</th>
                  <th className="px-4 py-3">Region</th>
                  <th className="px-4 py-3">Portfolio</th>
                  <th className="px-4 py-3 text-right">Census</th>
                  <th className="px-4 py-3 text-right">Open needs</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((f) => {
                  const need = needByFacility.get(f.id)
                  return (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link to={`/facilities/${f.id}`} className="font-medium text-brand-700 hover:underline">
                          {f.name}
                        </Link>
                        <div className="text-xs text-gray-400">
                          {[f.city, f.state].filter(Boolean).join(', ')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{f.region ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{f.portfolio ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{f.census ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {need && need.open > 0 ? (
                          <span className="font-semibold text-amber-600">
                            {need.open}
                            {need.premium > 0 && (
                              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                {need.premium} premium
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-green-600">Covered</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/facilities/${f.id}`} className="text-gray-400 hover:text-gray-700">
                          <ChevronRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <FacilityForm value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function FacilityForm({
  value,
  onClose,
  onSaved,
}: {
  value: Partial<Facility>
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Partial<Facility>>(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = !value.id

  function set<K extends keyof Facility>(key: K, v: Facility[K]) {
    setForm((f) => ({ ...f, [key]: v }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name,
      division: form.division || null,
      region: form.region || null,
      portfolio: form.portfolio || null,
      city: form.city || null,
      state: form.state || null,
      zip: form.zip || null,
      address: form.address || null,
      phone: form.phone || null,
      fax: form.fax || null,
      census: form.census != null && String(form.census) !== '' ? Number(form.census) : null,
      capacity: form.capacity != null && String(form.capacity) !== '' ? Number(form.capacity) : null,
      notes: form.notes || null,
    }
    const res = isNew
      ? await supabase.from('facilities').insert(payload)
      : await supabase.from('facilities').update(payload).eq('id', value.id!)
    setSaving(false)
    if (res.error) return setError(res.error.message)
    onSaved()
  }

  return (
    <Modal title={isNew ? 'New facility' : 'Edit facility'} onClose={onClose} wide>
      <datalist id="divisions">{DIVISIONS.map((d) => <option key={d} value={d} />)}</datalist>
      <datalist id="regions">{REGION_SUGGESTIONS.map((r) => <option key={r} value={r} />)}</datalist>
      <datalist id="portfolios">{PORTFOLIO_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Facility name *</label>
          <input className="input" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">Division</label>
          <input list="divisions" className="input" value={form.division ?? ''} onChange={(e) => set('division', e.target.value)} />
        </div>
        <div>
          <label className="label">Region</label>
          <input list="regions" className="input" value={form.region ?? ''} onChange={(e) => set('region', e.target.value)} />
        </div>
        <div>
          <label className="label">Portfolio / Entity</label>
          <input list="portfolios" className="input" value={form.portfolio ?? ''} onChange={(e) => set('portfolio', e.target.value)} />
        </div>
        <div>
          <label className="label">Census</label>
          <input type="number" className="input" value={form.census ?? ''} onChange={(e) => set('census', Number(e.target.value))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">State</label>
            <select className="input" value={form.state ?? ''} onChange={(e) => { set('state', e.target.value); loadCities() }}>
              <option value="">Select…</option>
              {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Zip</label>
            <input className="input" value={form.zip ?? ''} onChange={(e) => set('zip', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">City</label>
          <Combobox
            value={form.city ?? ''}
            onChange={(v) => set('city', v)}
            onFocusLoad={loadCities}
            placeholder={form.state ? 'Type a city…' : 'Pick a state first (or type any city)'}
            search={(q) => searchCities(q, form.state || null).map((r) => ({ value: r.city, label: r.label }))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Address</label>
          <input className="input" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="label">Fax</label>
          <input className="input" value={form.fax ?? ''} onChange={(e) => set('fax', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea className="input min-h-[70px]" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving || !form.name}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
