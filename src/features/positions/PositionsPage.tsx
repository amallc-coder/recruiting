import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
  rateLabel,
  type PositionInput,
} from '../../lib/v2/positions'
import type { Position } from '../../lib/v2/types'

export function PositionsPage() {
  const { toast } = useToast()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<Position | null | undefined>(undefined)

  function load() {
    setLoading(true)
    listPositions().then((rows) => {
      setPositions(rows)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const stats = useMemo(
    () => ({
      total: positions.length,
      active: positions.filter((p) => p.active).length,
    }),
    [positions],
  )

  async function remove(p: Position) {
    const { error } = await deletePosition(p.id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Position removed' })
      load()
    }
  }

  if (loading) return <Spinner label="Loading positions…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Positions</h1>
          <p className="mt-1 text-sm text-muted">The catalog of roles you staff for, with pay rates and requirements.</p>
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={() => setEdit(null)}>
          New position
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Positions" value={stats.total} hint="in the catalog" />
        <StatCard label="Active" value={stats.active} tone={stats.active > 0 ? 'good' : 'default'} hint={`of ${stats.total}`} />
      </div>

      {positions.length === 0 ? (
        <EmptyState title="No positions yet" hint="Create a position to start building your catalog." />
      ) : (
        <div className="space-y-3">
          {positions.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{p.title}</span>
                  {p.active ? <Badge tone="sage">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {[p.code, p.category].filter(Boolean).join(' · ') || 'No code or category'}
                </p>
                <p className="mt-1 text-sm text-ink tnum">{rateLabel(p)}</p>
              </div>
              <div className="inline-flex gap-1">
                <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit(p)}>
                  <Pencil size={14} />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(p)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {edit !== undefined && (
        <PositionForm
          existing={edit}
          onClose={() => setEdit(undefined)}
          onSaved={() => {
            setEdit(undefined)
            load()
          }}
        />
      )}
    </div>
  )
}

const RATE_UNITS = [
  { value: 'year', label: 'Year' },
  { value: 'hour', label: 'Hour' },
  { value: 'visit', label: 'Visit' },
  { value: 'NA', label: 'N/A' },
]

function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

function PositionForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: Position | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState(existing?.title ?? '')
  const [code, setCode] = useState(existing?.code ?? '')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [rateMin, setRateMin] = useState(existing?.rate_min != null ? String(existing.rate_min) : '')
  const [rateMax, setRateMax] = useState(existing?.rate_max != null ? String(existing.rate_max) : '')
  const [rateUnit, setRateUnit] = useState(existing?.rate_unit ?? 'year')
  const [responsibilities, setResponsibilities] = useState((existing?.responsibilities ?? []).join('\n'))
  const [requirements, setRequirements] = useState((existing?.requirements ?? []).join('\n'))
  const [keywords, setKeywords] = useState((existing?.keywords ?? []).join('\n'))
  const [active, setActive] = useState(existing?.active ?? true)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) {
      toast({ tone: 'error', title: 'Title is required' })
      return
    }
    setSaving(true)
    const input: PositionInput = {
      title: title.trim(),
      code: code.trim() || null,
      category: category.trim() || null,
      rate_min: rateMin.trim() === '' ? null : Number(rateMin),
      rate_max: rateMax.trim() === '' ? null : Number(rateMax),
      rate_unit: rateUnit,
      responsibilities: linesToArray(responsibilities),
      requirements: linesToArray(requirements),
      keywords: linesToArray(keywords),
      active,
    }
    const { error } = existing ? await updatePosition(existing.id, input) : await createPosition(input)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: existing ? 'Position updated' : 'Position created' })
      onSaved()
    }
  }

  return (
    <Modal
      title={existing ? 'Edit position' : 'New position'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            {existing ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Registered Nurse" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. RN (optional)" />
          <Input label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Nursing (optional)" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Rate min" type="number" min={0} value={rateMin} onChange={(e) => setRateMin(e.target.value)} placeholder="—" />
          <Input label="Rate max" type="number" min={0} value={rateMax} onChange={(e) => setRateMax(e.target.value)} placeholder="—" />
          <Select label="Rate unit" value={rateUnit} onChange={(e) => setRateUnit(e.target.value)} options={RATE_UNITS} />
        </div>
        <div>
          <label className="label">Responsibilities</label>
          <textarea
            className="input min-h-[60px]"
            value={responsibilities}
            onChange={(e) => setResponsibilities(e.target.value)}
            placeholder="One per line"
          />
        </div>
        <div>
          <label className="label">Requirements</label>
          <textarea
            className="input min-h-[60px]"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder="One per line"
          />
        </div>
        <div>
          <label className="label">Keywords</label>
          <textarea
            className="input min-h-[60px]"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="One per line"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>
    </Modal>
  )
}
