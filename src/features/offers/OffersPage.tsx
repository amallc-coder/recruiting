import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listOffers,
  createOffer,
  setOfferStatus,
  deleteOffer,
  money,
  type OfferRow,
} from '../../lib/v2/offers'
import { listSelectableCandidates } from '../../lib/v2/pipeline'
import type { OfferStatus } from '../../lib/v2/types'

const STATUS_TONE: Record<OfferStatus, BadgeTone> = {
  pending: 'neutral',
  sent: 'clay',
  accepted: 'sage',
  declined: 'rust',
  expired: 'neutral',
  negotiating: 'clay',
}

export function OffersPage() {
  const { toast } = useToast()
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  function load() {
    setLoading(true)
    listOffers().then((rows) => {
      setOffers(rows)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const stats = useMemo(() => {
    const salaries = offers.map((o) => o.salary).filter((s): s is number => s != null)
    const avg = salaries.length ? Math.round(salaries.reduce((s, n) => s + n, 0) / salaries.length) : null
    return {
      total: offers.length,
      accepted: offers.filter((o) => o.status === 'accepted').length,
      avgSalary: money(avg),
    }
  }, [offers])

  async function changeStatus(id: string, status: OfferStatus) {
    const { error } = await setOfferStatus(id, status)
    if (error) toast({ tone: 'error', title: 'Update failed', description: error })
    else {
      toast({ tone: 'success', title: `Offer ${status}` })
      load()
    }
  }

  async function remove(id: string) {
    const { error } = await deleteOffer(id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Offer removed' })
      load()
    }
  }

  if (loading) return <Spinner label="Loading offers…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Offers</h1>
          <p className="mt-1 text-sm text-muted">Compensation packages extended to candidates.</p>
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
          New offer
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total offers" value={stats.total} />
        <StatCard label="Accepted" value={stats.accepted} tone={stats.accepted > 0 ? 'good' : 'default'} />
        <StatCard label="Average salary" value={stats.avgSalary} hint="of offers with a salary" />
      </div>

      {offers.length === 0 ? (
        <EmptyState title="No offers yet" hint="Create an offer to start tracking compensation packages." />
      ) : (
        <div className="space-y-3">
          {offers.map((o) => (
            <Card key={o.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold tracking-tight text-ink">
                    {o.candidate?.full_name ?? 'Unknown'}
                  </h2>
                  <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                  <span className="tnum text-sm text-ink">{money(o.salary)}</span>
                  {o.start_date && <span className="text-xs text-muted">Starts {o.start_date}</span>}
                </div>
                <div className="inline-flex items-center gap-1">
                  {o.status === 'pending' && (
                    <Button size="sm" variant="secondary" onClick={() => changeStatus(o.id, 'sent')}>
                      Send
                    </Button>
                  )}
                  {o.status === 'sent' && (
                    <>
                      <Button size="sm" variant="primary" onClick={() => changeStatus(o.id, 'accepted')}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => changeStatus(o.id, 'declined')}>
                        Decline
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" aria-label="Delete offer" onClick={() => remove(o.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <NewOfferModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function NewOfferModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [candidates, setCandidates] = useState<{ id: string; full_name: string }[]>([])
  const [candidateId, setCandidateId] = useState('')
  const [salary, setSalary] = useState('')
  const [bonus, setBonus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listSelectableCandidates().then(setCandidates)
  }, [])

  async function save() {
    if (!candidateId) {
      toast({ tone: 'error', title: 'Pick a candidate' })
      return
    }
    setSaving(true)
    const { error } = await createOffer({
      candidate_id: candidateId,
      salary: salary ? Number(salary) : null,
      bonus: bonus ? Number(bonus) : null,
      start_date: startDate || null,
    })
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: 'Offer created' })
      onSaved()
    }
  }

  return (
    <Modal
      title="New offer"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} onClick={save}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="Candidate"
          value={candidateId}
          onChange={(e) => setCandidateId(e.target.value)}
          options={candidates.map((c) => ({ value: c.id, label: c.full_name }))}
          placeholder="Select a candidate"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Salary" type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 120000" />
          <Input label="Bonus" type="number" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="optional" />
        </div>
        <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>
    </Modal>
  )
}
