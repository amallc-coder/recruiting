import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Plus, Pencil, Search, Loader2, Briefcase } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { downloadCsv } from '../lib/export'
import {
  ORG_TYPES, ORG_LABEL, POSITION_CATEGORIES, formatRate, generateRole,
  type OrgType, type Position,
} from '../lib/positions'
import { EmptyState, Modal, Spinner } from '../components/ui'

export function Positions() {
  const { isAdmin } = useAuth()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [org, setOrg] = useState<OrgType | 'all'>('all')
  const [editing, setEditing] = useState<Position | 'new' | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('positions').select('*').order('title')
    setPositions((data as Position[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return positions.filter((p) => {
      if (org !== 'all' && !(p.org_types ?? []).includes(org)) return false
      if (!needle) return true
      return (
        p.title.toLowerCase().includes(needle) ||
        (p.category ?? '').toLowerCase().includes(needle) ||
        (p.keywords ?? []).some((k) => k.includes(needle))
      )
    })
  }, [positions, q, org])

  const byCategory = useMemo(() => {
    const m = new Map<string, Position[]>()
    for (const p of filtered) {
      const c = p.category || 'Other'
      ;(m.get(c) ?? m.set(c, []).get(c)!).push(p)
    }
    return [...m.entries()].sort((a, b) => {
      const ia = POSITION_CATEGORIES.indexOf(a[0] as never)
      const ib = POSITION_CATEGORIES.indexOf(b[0] as never)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [filtered])

  const orgCounts = useMemo(() => {
    const c: Record<string, number> = { all: positions.length }
    for (const o of ORG_TYPES) c[o.key] = positions.filter((p) => (p.org_types ?? []).includes(o.key)).length
    return c
  }, [positions])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Positions Repository</h1>
          <p className="text-sm text-muted">
            Every role a practice, LTC/SNF, management company, lab, or hospital may hire — with
            AI-generated responsibilities. {positions.length} positions.
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Add position
            </button>
          )}
          <button
            className="btn-secondary"
            disabled={positions.length === 0}
            onClick={() =>
              downloadCsv(
                'positions.csv',
                positions.map((p) => ({
                  code: p.code, title: p.title, category: p.category,
                  org_types: (p.org_types ?? []).map((o) => ORG_LABEL[o]).join('; '),
                  rate: formatRate(p),
                  responsibilities: (p.responsibilities ?? []).join(' | '),
                  requirements: (p.requirements ?? []).join(' | '),
                })),
              )
            }
          >
            Export
          </button>
        </div>
      </div>

      {/* Org-type filter chips */}
      <div className="flex flex-wrap gap-2">
        {[{ key: 'all', label: 'All' }, ...ORG_TYPES].map((o) => (
          <button
            key={o.key}
            onClick={() => setOrg(o.key as OrgType | 'all')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
              org === o.key
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-surface text-muted ring-line hover:bg-paper'
            }`}
          >
            {'label' in o ? o.label : ''} <span className="opacity-70">{orgCounts[o.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-muted" />
        <input
          className="input pl-9"
          placeholder="Search title, category, or keyword…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <Spinner label="Loading positions…" />
      ) : filtered.length === 0 ? (
        <EmptyState title="No positions match" hint="Try a different filter or add a new position." />
      ) : (
        <div className="space-y-6">
          {byCategory.map(([cat, list]) => (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                <Briefcase size={13} /> {cat} <span className="text-line">· {list.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setEditing(p)}
                    className="card group p-4 text-left transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-ink">{p.title}</div>
                      <span className="shrink-0 text-xs font-medium text-brand-600">{formatRate(p)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(p.org_types ?? []).map((o) => (
                        <span key={o} className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          {ORG_TYPES.find((x) => x.key === o)?.short}
                        </span>
                      ))}
                      {p.ai_generated && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
                          <Sparkles size={9} /> AI
                        </span>
                      )}
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted">
                      {(p.responsibilities ?? []).slice(0, 3).map((r, i) => (
                        <li key={i} className="line-clamp-1">• {r}</li>
                      ))}
                    </ul>
                    {isAdmin && (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted group-hover:text-brand-600">
                        <Pencil size={11} /> Edit
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <PositionModal
          position={editing === 'new' ? null : editing}
          canEdit={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function PositionModal({
  position, canEdit, onClose, onSaved,
}: {
  position: Position | null
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(position?.title ?? '')
  const [category, setCategory] = useState(position?.category ?? 'Other')
  const [orgTypes, setOrgTypes] = useState<OrgType[]>(position?.org_types ?? ['practice'])
  const [rateMin, setRateMin] = useState<string>(position?.rate_min?.toString() ?? '')
  const [rateMax, setRateMax] = useState<string>(position?.rate_max?.toString() ?? '')
  const [rateUnit, setRateUnit] = useState(position?.rate_unit ?? 'Hourly')
  const [resp, setResp] = useState((position?.responsibilities ?? []).join('\n'))
  const [reqs, setReqs] = useState((position?.requirements ?? []).join('\n'))
  const [keywords, setKeywords] = useState((position?.keywords ?? []).join(', '))
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleOrg(o: OrgType) {
    setOrgTypes((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]))
  }

  async function runAi() {
    if (!title.trim()) { setAiNote('Enter a title first.'); return }
    setAiBusy(true); setAiNote(null)
    const r = await generateRole(title.trim(), orgTypes)
    setCategory(r.category)
    if (r.org_types?.length) setOrgTypes(r.org_types)
    setRateMin(r.rate_min?.toString() ?? '')
    setRateMax(r.rate_max?.toString() ?? '')
    setRateUnit(r.rate_unit)
    setResp(r.responsibilities.join('\n'))
    setReqs(r.requirements.join('\n'))
    setKeywords(r.keywords.join(', '))
    setAiNote(r.method === 'ai' ? 'Generated with Claude.' : 'Generated with the built-in template (connect Supabase + deploy ai-role for Claude).')
    setAiBusy(false)
  }

  async function save() {
    setSaving(true)
    const patch = {
      title: title.trim(),
      category,
      org_types: orgTypes,
      rate_min: rateMin ? Number(rateMin) : null,
      rate_max: rateMax ? Number(rateMax) : null,
      rate_unit: rateUnit,
      responsibilities: resp.split('\n').map((s) => s.trim()).filter(Boolean),
      requirements: reqs.split('\n').map((s) => s.trim()).filter(Boolean),
      keywords: keywords.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      ai_generated: aiNote?.includes('Claude') ?? position?.ai_generated ?? false,
      active: true,
    }
    if (position) {
      await supabase.from('positions').update(patch).eq('id', position.id)
    } else {
      const code = 'POS-' + Math.random().toString(36).slice(2, 7).toUpperCase()
      await supabase.from('positions').insert({ code, ...patch })
    }
    setSaving(false)
    onSaved()
  }

  const readOnly = !canEdit

  return (
    <Modal title={position ? position.title : 'Add position'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <div className="flex gap-2">
            <input className="input" value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. NP - Wound Care" />
            {canEdit && (
              <button className="btn-primary shrink-0" onClick={runAi} disabled={aiBusy}>
                {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {position ? 'Regenerate' : 'AI generate'}
              </button>
            )}
          </div>
          {aiNote && <p className="mt-1 text-xs text-muted">{aiNote}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} disabled={readOnly} onChange={(e) => setCategory(e.target.value)}>
              {POSITION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Pay range</label>
            <div className="flex items-center gap-1">
              <input className="input" type="number" value={rateMin} disabled={readOnly} onChange={(e) => setRateMin(e.target.value)} placeholder="min" />
              <span className="text-muted">–</span>
              <input className="input" type="number" value={rateMax} disabled={readOnly} onChange={(e) => setRateMax(e.target.value)} placeholder="max" />
              <select className="input w-28" value={rateUnit} disabled={readOnly} onChange={(e) => setRateUnit(e.target.value as Position['rate_unit'])}>
                <option>Hourly</option><option>Annual</option><option value="NA">NA</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Applies to</label>
          <div className="flex flex-wrap gap-1.5">
            {ORG_TYPES.map((o) => (
              <button
                key={o.key}
                disabled={readOnly}
                onClick={() => toggleOrg(o.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                  orgTypes.includes(o.key) ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-surface text-muted ring-line'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Responsibilities <span className="font-normal text-muted">(one per line)</span></label>
          <textarea className="input min-h-[120px]" value={resp} disabled={readOnly} onChange={(e) => setResp(e.target.value)} />
        </div>
        <div>
          <label className="label">Requirements <span className="font-normal text-muted">(one per line)</span></label>
          <textarea className="input min-h-[80px]" value={reqs} disabled={readOnly} onChange={(e) => setReqs(e.target.value)} />
        </div>
        <div>
          <label className="label">Keywords <span className="font-normal text-muted">(comma-separated)</span></label>
          <input className="input" value={keywords} disabled={readOnly} onChange={(e) => setKeywords(e.target.value)} />
        </div>

        {canEdit && (
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !title.trim()}>
              {saving ? 'Saving…' : position ? 'Save changes' : 'Add position'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
