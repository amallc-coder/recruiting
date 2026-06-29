import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listCosts,
  createCost,
  updateCost,
  deleteCost,
  countHires,
  money,
  type CostInput,
} from '../../lib/v2/finance'
import type { RecruitingCost, CostCategory } from '../../lib/v2/types'

const CATEGORY_OPTIONS: { value: CostCategory; label: string }[] = [
  { value: 'job_board', label: 'Job board' },
  { value: 'agency', label: 'Agency' },
  { value: 'referral', label: 'Referral' },
  { value: 'software', label: 'Software' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_LABEL: Record<CostCategory, string> = {
  job_board: 'Job board',
  agency: 'Agency',
  referral: 'Referral',
  software: 'Software',
  recruiter: 'Recruiter',
  other: 'Other',
}

const CATEGORY_TONE: Record<CostCategory, BadgeTone> = {
  job_board: 'neutral',
  agency: 'clay',
  referral: 'sage',
  software: 'ink',
  recruiter: 'rust',
  other: 'neutral',
}

export function FinancePage() {
  const { toast } = useToast()
  const [costs, setCosts] = useState<RecruitingCost[]>([])
  const [hires, setHires] = useState(0)
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<RecruitingCost | null | undefined>(undefined)

  function load() {
    setLoading(true)
    Promise.all([listCosts(), countHires()]).then(([cs, h]) => {
      setCosts(cs)
      setHires(h)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const totalSpend = useMemo(() => costs.reduce((s, c) => s + (c.amount || 0), 0), [costs])
  const costPerHire = hires > 0 ? money(Math.round(totalSpend / hires)) : '—'

  const byCategory = useMemo(() => {
    const sums = new Map<CostCategory, number>()
    for (const c of costs) sums.set(c.category, (sums.get(c.category) ?? 0) + (c.amount || 0))
    return CATEGORY_OPTIONS.map((o) => ({ category: o.value, total: sums.get(o.value) ?? 0 })).filter(
      (r) => r.total > 0,
    )
  }, [costs])

  async function remove(c: RecruitingCost) {
    const { error } = await deleteCost(c.id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Cost removed' })
      load()
    }
  }

  if (loading) return <Spinner label="Loading finance…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Recruiting Finance</h1>
          <p className="mt-1 text-sm text-muted">Spend by source and cost per hire.</p>
        </div>
        <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setEdit(null)}>
          Add cost
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total spend" value={money(totalSpend)} hint="sum of all cost line items" />
        <StatCard label="Hires" value={hires} hint="applications with status = hired" />
        <StatCard
          label="Cost per hire"
          value={costPerHire}
          tone={hires > 0 ? 'default' : 'warn'}
          hint={hires > 0 ? 'total spend ÷ hires' : 'no hires yet'}
        />
      </div>

      {byCategory.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">By category</div>
          <div className="flex flex-wrap gap-2">
            {byCategory.map((r) => (
              <Badge key={r.category} tone={CATEGORY_TONE[r.category]}>
                {CATEGORY_LABEL[r.category]} {money(r.total)}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {costs.length === 0 ? (
        <EmptyState title="No costs recorded" hint="Add recruiting cost line items to track spend and cost per hire." />
      ) : (
        <Card className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Category</th>
                  <th className="py-1.5 pr-3 font-medium">Vendor</th>
                  <th className="py-1.5 pr-3 text-right font-medium tnum">Amount</th>
                  <th className="py-1.5 pr-3 font-medium">Period</th>
                  <th className="py-1.5 pr-3 font-medium">Notes</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="py-2 pr-3">
                      <Badge tone={CATEGORY_TONE[c.category]}>{CATEGORY_LABEL[c.category]}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-ink">{c.vendor || '—'}</td>
                    <td className="py-2 pr-3 text-right tnum font-semibold text-ink">{money(c.amount)}</td>
                    <td className="py-2 pr-3 text-muted">
                      {c.period ? new Date(c.period).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 pr-3 text-muted">{c.notes || '—'}</td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEdit(c)}>
                          <Pencil size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" aria-label="Remove" onClick={() => remove(c)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {edit !== undefined && (
        <CostForm
          cost={edit}
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

function CostForm({
  cost,
  onClose,
  onSaved,
}: {
  cost: RecruitingCost | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [category, setCategory] = useState<CostCategory>(cost?.category ?? 'job_board')
  const [vendor, setVendor] = useState(cost?.vendor ?? '')
  const [amount, setAmount] = useState(cost?.amount ?? 0)
  const [period, setPeriod] = useState(cost?.period ? cost.period.slice(0, 10) : '')
  const [notes, setNotes] = useState(cost?.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const input: CostInput = {
      category,
      vendor: vendor || null,
      amount: Math.max(0, amount || 0),
      period: period || null,
      notes: notes || null,
    }
    const { error } = cost ? await updateCost(cost.id, input) : await createCost(input)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: cost ? 'Cost updated' : 'Cost added' })
      onSaved()
    }
  }

  return (
    <Modal
      title={`${cost ? 'Edit' : 'Add'} cost`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            {cost ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as CostCategory)}
          options={CATEGORY_OPTIONS}
        />
        <Input label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Indeed (optional)" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Amount" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <Input label="Period" type="date" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </div>
    </Modal>
  )
}
