import { useEffect, useMemo, useState } from 'react'
import { Gift, Trophy, Plus, Trash2, Link2 } from 'lucide-react'
import { Button, Card, Input, Select, Modal, Tabs, useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listReferrals,
  createReferral,
  updateReferral,
  deleteReferral,
  leaderboard,
  REFERRAL_STATUSES,
  REWARD_STATUSES,
  DEFAULT_REFERRAL_REWARD,
  type Referral,
  type ReferralStatus,
  type RewardStatus,
} from '../../lib/v2/referrals'
import { listRequisitionOptions, type ReqOption } from '../../lib/v2/requisitions'

const STATUS_TONE: Record<ReferralStatus, string> = {
  submitted: 'bg-brand-50 text-muted',
  reviewing: 'bg-clay-50 text-clay-600',
  contacted: 'bg-clay-100 text-clay-600',
  hired: 'bg-sage-100 text-sage-700',
  rejected: 'bg-rust-50 text-rust-500',
  paid: 'bg-sage-500 text-white',
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString()

export function ReferralsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Referral[] | null>(null)
  const [reqs, setReqs] = useState<ReqOption[]>([])
  const [adding, setAdding] = useState(false)

  function refresh() {
    listReferrals().then(setRows)
  }
  useEffect(() => {
    refresh()
    listRequisitionOptions().then(setReqs)
  }, [])

  const board = useMemo(() => (rows ? leaderboard(rows) : []), [rows])
  const reqTitle = useMemo(() => new Map(reqs.map((r) => [r.id, r.title])), [reqs])

  const publicLink = `${window.location.origin}${import.meta.env.BASE_URL}#/refer`

  if (!rows) return <Spinner label="Loading referrals…" />

  const inProgress = rows.filter((r) => ['submitted', 'reviewing', 'contacted'].includes(r.status)).length
  const hired = rows.filter((r) => r.status === 'hired' || r.status === 'paid').length
  const rewardsOwed = rows
    .filter((r) => r.reward_status === 'pending' || r.reward_status === 'approved')
    .reduce((s, r) => s + (r.reward_amount ?? 0), 0)

  async function setStatus(r: Referral, status: ReferralStatus) {
    // Suggest a reward the first time a referral is marked hired.
    const patch: Partial<Referral> = { status }
    if (status === 'hired' && r.reward_amount == null) patch.reward_amount = DEFAULT_REFERRAL_REWARD
    setRows((prev) => prev!.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
    const { error } = await updateReferral(r.id, patch)
    if (error) {
      toast({ tone: 'error', title: 'Update failed', description: error })
      refresh()
    }
  }

  async function patchRow(r: Referral, patch: Partial<Referral>) {
    setRows((prev) => prev!.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
    const { error } = await updateReferral(r.id, patch)
    if (error) {
      toast({ tone: 'error', title: 'Update failed', description: error })
      refresh()
    }
  }

  async function remove(r: Referral) {
    if (!confirm(`Delete referral of ${r.candidate_name}?`)) return
    setRows((prev) => prev!.filter((x) => x.id !== r.id))
    await deleteReferral(r.id)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <Gift size={22} className="text-sage-600" /> Referrals
          </h1>
          <p className="mt-1 text-sm text-muted">
            Your highest-quality, lowest-cost channel. Track referred candidates through to hire and reward your referrers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              navigator.clipboard?.writeText(publicLink)
              toast({ tone: 'success', title: 'Referral link copied', description: publicLink })
            }}
          >
            <Link2 size={15} className="mr-1.5" /> Copy refer-a-friend link
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus size={15} className="mr-1.5" /> New referral
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total referrals" value={rows.length} />
        <StatCard label="In progress" value={inProgress} />
        <StatCard label="Hired" value={hired} tone={hired > 0 ? 'good' : 'default'} />
        <StatCard label="Rewards owed" value={usd(rewardsOwed)} tone={rewardsOwed > 0 ? 'warn' : 'default'} hint="approved + pending payouts" />
      </div>

      <Tabs tabs={[{ value: 'list', label: `Referrals (${rows.length})` }, { value: 'board', label: 'Leaderboard' }]} defaultValue="list">
        {(tab) =>
          tab === 'list' ? (
            rows.length === 0 ? (
              <EmptyState title="No referrals yet" hint="Share your refer-a-friend link or add one manually." />
            ) : (
              <Card className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-medium">Candidate</th>
                      <th className="px-4 py-3 font-medium">Referred by</th>
                      <th className="px-4 py-3 font-medium">Role / req</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Reward</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-line/60 last:border-0 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">{r.candidate_name}</div>
                          <div className="text-xs text-muted">{r.candidate_email || r.candidate_phone || '—'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-ink">{r.referrer_name}</div>
                          <div className="text-xs text-muted">
                            {r.relationship ? `${r.relationship} · ` : ''}
                            {r.source === 'public' ? 'via link' : 'staff'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {r.requisition_id ? reqTitle.get(r.requisition_id) ?? '—' : r.role_interest || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={r.status}
                            onChange={(e) => setStatus(r, e.target.value as ReferralStatus)}
                            className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${STATUS_TONE[r.status]}`}
                          >
                            {REFERRAL_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted">$</span>
                            <input
                              type="number"
                              min={0}
                              value={r.reward_amount ?? ''}
                              placeholder="0"
                              onChange={(e) => patchRow(r, { reward_amount: e.target.value === '' ? null : Number(e.target.value) })}
                              className="w-20 rounded border border-line bg-paper px-1.5 py-0.5 text-sm tnum"
                            />
                            <select
                              value={r.reward_status}
                              onChange={(e) => patchRow(r, { reward_status: e.target.value as RewardStatus })}
                              className="rounded border border-line bg-paper px-1 py-0.5 text-xs capitalize text-muted"
                            >
                              {REWARD_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => remove(r)} className="text-muted hover:text-rust-500" title="Delete">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )
          ) : board.length === 0 ? (
            <EmptyState title="No referrers yet" />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Referrer</th>
                    <th className="px-4 py-3 text-right font-medium">Referrals</th>
                    <th className="px-4 py-3 text-right font-medium">Hired</th>
                    <th className="px-4 py-3 text-right font-medium">Rewards paid</th>
                    <th className="px-4 py-3 text-right font-medium">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((b, i) => (
                    <tr key={b.referrer + i} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-3 text-muted tnum">
                        {i === 0 ? <Trophy size={15} className="text-clay-500" /> : i + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{b.referrer}</div>
                        {b.email && <div className="text-xs text-muted">{b.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-right tnum text-ink">{b.total}</td>
                      <td className="px-4 py-3 text-right tnum text-sage-600">{b.hired}</td>
                      <td className="px-4 py-3 text-right tnum text-ink">{usd(b.rewardPaid)}</td>
                      <td className="px-4 py-3 text-right tnum text-muted">{usd(b.rewardPending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )
        }
      </Tabs>

      {adding && <AddReferralModal reqs={reqs} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh() }} />}
    </div>
  )
}

function AddReferralModal({ reqs, onClose, onSaved }: { reqs: ReqOption[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [referrer, setReferrer] = useState('')
  const [referrerEmail, setReferrerEmail] = useState('')
  const [candidate, setCandidate] = useState('')
  const [candEmail, setCandEmail] = useState('')
  const [candPhone, setCandPhone] = useState('')
  const [relationship, setRelationship] = useState('')
  const [reqId, setReqId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!referrer.trim() || !candidate.trim()) {
      setError('Referrer and candidate names are required.')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await createReferral({
      referrer_name: referrer.trim(),
      referrer_email: referrerEmail.trim() || null,
      candidate_name: candidate.trim(),
      candidate_email: candEmail.trim() || null,
      candidate_phone: candPhone.trim() || null,
      relationship: relationship.trim() || null,
      requisition_id: reqId || null,
      note: note.trim() || null,
    })
    setSaving(false)
    if (error) {
      setError(error)
      return
    }
    toast({ tone: 'success', title: 'Referral added' })
    onSaved()
  }

  const openReqs = reqs.filter((r) => r.status === 'open' || r.status === 'pending_approval')

  return (
    <Modal
      title="New referral"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Add referral
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Referrer name" value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="Who referred them" />
          <Input label="Referrer email" value={referrerEmail} onChange={(e) => setReferrerEmail(e.target.value)} placeholder="referrer@email.com" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Candidate name" value={candidate} onChange={(e) => setCandidate(e.target.value)} placeholder="Who they referred" />
          <Input label="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Former coworker, friend…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Candidate email" value={candEmail} onChange={(e) => setCandEmail(e.target.value)} placeholder="candidate@email.com" />
          <Input label="Candidate phone" value={candPhone} onChange={(e) => setCandPhone(e.target.value)} placeholder="(555) 555-5555" />
        </div>
        <Select label="Requisition (optional)" value={reqId} onChange={(e) => setReqId(e.target.value)} placeholder="No specific role">
          {openReqs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </Select>
        <div>
          <label className="label">Note</label>
          <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why they'd be a great fit…" />
        </div>
        {error && <p className="text-sm text-rust-700">{error}</p>}
      </div>
    </Modal>
  )
}
