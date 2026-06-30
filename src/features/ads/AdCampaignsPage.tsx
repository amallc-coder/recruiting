import { useEffect, useMemo, useState } from 'react'
import { Megaphone, Plus, TrendingUp, Scissors, Eye, Trash2, Pencil } from 'lucide-react'
import { Button, Card, Input, Select, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  metricsFor,
  totals,
  recommendations,
  AD_CHANNELS,
  AD_CHANNEL_LABELS,
  CAMPAIGN_STATUSES,
  type AdCampaign,
  type AdChannel,
  type CampaignStatus,
  type CampaignInput,
} from '../../lib/v2/adCampaigns'
import { listRequisitionOptions, type ReqOption } from '../../lib/v2/requisitions'

const usd = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString())
const STATUS_TONE: Record<CampaignStatus, string> = {
  active: 'bg-sage-50 text-sage-700',
  paused: 'bg-clay-50 text-clay-600',
  ended: 'bg-brand-50 text-muted',
}
const REC_ICON = { scale: TrendingUp, cut: Scissors, watch: Eye } as const
const REC_TONE = { scale: 'text-sage-700', cut: 'text-rust-600', watch: 'text-clay-600' } as const

export function AdCampaignsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<AdCampaign[] | null>(null)
  const [reqs, setReqs] = useState<ReqOption[]>([])
  const [editing, setEditing] = useState<AdCampaign | 'new' | null>(null)

  function refresh() {
    listCampaigns().then(setRows)
  }
  useEffect(() => {
    refresh()
    listRequisitionOptions().then(setReqs)
  }, [])

  const t = useMemo(() => (rows ? totals(rows) : null), [rows])
  const recs = useMemo(() => (rows ? recommendations(rows) : []), [rows])

  if (!rows || !t) return <Spinner label="Loading campaigns…" />

  async function setStatus(c: AdCampaign, status: CampaignStatus) {
    setRows((p) => p!.map((x) => (x.id === c.id ? { ...x, status } : x)))
    const { error } = await updateCampaign(c.id, { status })
    if (error) {
      toast({ tone: 'error', title: 'Update failed', description: error })
      refresh()
    }
  }
  async function remove(c: AdCampaign) {
    if (!confirm(`Delete campaign "${c.name}"?`)) return
    setRows((p) => p!.filter((x) => x.id !== c.id))
    await deleteCampaign(c.id)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
            <Megaphone size={22} className="text-sage-600" /> Job-ad campaigns
          </h1>
          <p className="mt-1 text-sm text-muted">Track spend and conversion per channel, and let the optimizer tell you where to move budget.</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus size={15} className="mr-1.5" /> New campaign
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total spend" value={usd(t.spend)} hint={t.budget > 0 ? `of ${usd(t.budget)} budget` : undefined} />
        <StatCard label="Applies" value={t.applies.toLocaleString()} />
        <StatCard label="Blended cost / applicant" value={usd(t.costPerApply)} />
        <StatCard label="Blended cost / hire" value={usd(t.costPerHire)} tone={t.costPerHire != null && t.costPerHire > 4700 ? 'warn' : 'default'} />
      </div>

      {recs.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-ink">Optimizer recommendations</h2>
          <ul className="space-y-2">
            {recs.map((r, i) => {
              const Icon = REC_ICON[r.type]
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Icon size={15} className={`mt-0.5 shrink-0 ${REC_TONE[r.type]}`} />
                  <span className="text-ink"><span className="font-medium">{r.campaignName}:</span> {r.note}</span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState title="No campaigns yet" hint="Add a campaign per channel/req and enter spend + applies to see cost-per-hire and optimizer tips." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Spend / budget</th>
                <th className="px-4 py-3 text-right font-medium">Applies</th>
                <th className="px-4 py-3 text-right font-medium">Hires</th>
                <th className="px-4 py-3 text-right font-medium">Cost / apply</th>
                <th className="px-4 py-3 text-right font-medium">Cost / hire</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const m = metricsFor(c)
                return (
                  <tr key={c.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                    <td className="px-4 py-3 text-muted">{AD_CHANNEL_LABELS[c.channel]}</td>
                    <td className="px-4 py-3">
                      <select
                        value={c.status}
                        onChange={(e) => setStatus(c, e.target.value as CampaignStatus)}
                        className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${STATUS_TONE[c.status]}`}
                      >
                        {CAMPAIGN_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right tnum text-ink">
                      {usd(c.spend)}
                      {c.budget != null && <span className="text-muted"> / {usd(c.budget)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tnum text-ink">{c.applies.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tnum text-ink">{c.hires.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tnum text-ink">{usd(m.costPerApply)}</td>
                    <td className="px-4 py-3 text-right tnum text-ink">{usd(m.costPerHire)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditing(c)} className="text-muted hover:text-ink" title="Edit"><Pencil size={15} /></button>
                        <button onClick={() => remove(c)} className="text-muted hover:text-rust-500" title="Delete"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2 text-xs text-muted">
            Enter spend + applies + hires per campaign (or sync them once an ad-network connector is configured). Live auto-posting to channels is inert until per-channel credentials are added.
          </p>
        </Card>
      )}

      {editing && (
        <CampaignModal
          campaign={editing === 'new' ? null : editing}
          reqs={reqs}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
    </div>
  )
}

function CampaignModal({ campaign, reqs, onClose, onSaved }: { campaign: AdCampaign | null; reqs: ReqOption[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState(campaign?.name ?? '')
  const [channel, setChannel] = useState<AdChannel>(campaign?.channel ?? 'indeed')
  const [reqId, setReqId] = useState(campaign?.requisition_id ?? '')
  const [budget, setBudget] = useState(campaign?.budget != null ? String(campaign.budget) : '')
  const [spend, setSpend] = useState(String(campaign?.spend ?? 0))
  const [clicks, setClicks] = useState(String(campaign?.clicks ?? 0))
  const [applies, setApplies] = useState(String(campaign?.applies ?? 0))
  const [hires, setHires] = useState(String(campaign?.hires ?? 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) {
      setError('A campaign name is required.')
      return
    }
    setSaving(true)
    setError(null)
    const num = (s: string) => (s.trim() === '' ? 0 : Number(s))
    const input: CampaignInput = {
      name: name.trim(),
      channel,
      requisition_id: reqId || null,
      budget: budget.trim() === '' ? null : Number(budget),
      spend: num(spend),
      clicks: num(clicks),
      applies: num(applies),
      hires: num(hires),
    }
    const { error } = campaign ? await updateCampaign(campaign.id, input) : await createCampaign(input)
    setSaving(false)
    if (error) {
      setError(error)
      return
    }
    toast({ tone: 'success', title: campaign ? 'Campaign updated' : 'Campaign created' })
    onSaved()
  }

  return (
    <Modal
      title={campaign ? 'Edit campaign' : 'New campaign'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>{campaign ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} placeholder="RN — Indeed sponsored, Q3" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value as AdChannel)}>
            {AD_CHANNELS.map((c) => (<option key={c} value={c}>{AD_CHANNEL_LABELS[c]}</option>))}
          </Select>
          <Select label="Requisition (optional)" value={reqId} onChange={(e) => setReqId(e.target.value)} placeholder="Not tied to one">
            {reqs.map((r) => (<option key={r.id} value={r.id}>{r.title}</option>))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Budget ($)" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="2000" />
          <Input label="Spend to date ($)" type="number" min={0} value={spend} onChange={(e) => setSpend(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Clicks" type="number" min={0} value={clicks} onChange={(e) => setClicks(e.target.value)} />
          <Input label="Applies" type="number" min={0} value={applies} onChange={(e) => setApplies(e.target.value)} />
          <Input label="Hires" type="number" min={0} value={hires} onChange={(e) => setHires(e.target.value)} />
        </div>
        {error && <p className="text-sm text-rust-700">{error}</p>}
      </div>
    </Modal>
  )
}
