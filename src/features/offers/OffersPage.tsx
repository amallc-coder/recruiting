import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, TrendingUp, Sparkles, ExternalLink, ClipboardList, ChevronDown, ChevronUp, CheckCircle2, Circle, FileText, ShieldCheck, Copy, Download } from 'lucide-react'
import { Button, Card, Badge, Input, Select, Modal, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import {
  listOffers,
  createOffer,
  setOfferStatus,
  approveOffer,
  setSignedUrl,
  renderOfferLetter,
  deleteOffer,
  money,
  type OfferRow,
} from '../../lib/v2/offers'
import { generateOnboarding, onboardingForOffer, setTaskStatus, type OnboardingTask } from '../../lib/v2/onboarding'
import { listSelectableCandidates } from '../../lib/v2/pipeline'
import { listRequisitionOptions, type ReqOption } from '../../lib/v2/requisitions'
import { suggestComp, usd, annualRange, hourlyRange, type CompBenchmark } from '../../lib/v2/comp'
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
  // Onboarding checklist: which accepted offer is expanded, and its tasks.
  const [openOnb, setOpenOnb] = useState<string | null>(null)
  const [tasks, setTasks] = useState<OnboardingTask[]>([])
  const [letterFor, setLetterFor] = useState<OfferRow | null>(null)

  function load() {
    setLoading(true)
    listOffers().then((rows) => {
      setOffers(rows)
      setLoading(false)
    })
  }
  useEffect(load, [])

  async function toggleOnboarding(o: OfferRow) {
    if (openOnb === o.id) {
      setOpenOnb(null)
      return
    }
    setOpenOnb(o.id)
    setTasks(await onboardingForOffer(o))
  }
  async function toggleTask(t: OnboardingTask, o: OfferRow) {
    await setTaskStatus(t.id, t.status === 'done' ? 'pending' : 'done')
    setTasks(await onboardingForOffer(o))
  }

  const stats = useMemo(() => {
    const salaries = offers.map((o) => o.salary).filter((s): s is number => s != null)
    const avg = salaries.length ? Math.round(salaries.reduce((s, n) => s + n, 0) / salaries.length) : null
    return {
      total: offers.length,
      accepted: offers.filter((o) => o.status === 'accepted').length,
      avgSalary: money(avg),
    }
  }, [offers])

  async function changeStatus(o: OfferRow, status: OfferStatus) {
    let reason: string | undefined
    if (status === 'declined') {
      reason = window.prompt('Reason for declining (feeds offer-acceptance analytics):')?.trim() || undefined
    }
    const { error } = await setOfferStatus(o.id, status, reason)
    if (error) {
      toast({ tone: 'error', title: 'Update failed', description: error })
      return
    }
    toast({ tone: 'success', title: `Offer ${status}` })
    // On acceptance, generate the onboarding checklist (template + credentials carried forward).
    if (status === 'accepted') {
      const res = await generateOnboarding(o)
      if (res.error) toast({ title: 'Onboarding', description: res.error })
      else if (res.created > 0)
        toast({ tone: 'success', title: 'Onboarding checklist created', description: `${res.created} items · verified credentials carried forward` })
    }
    load()
  }

  async function approve(o: OfferRow) {
    const { error } = await approveOffer(o.id)
    if (error) toast({ tone: 'error', title: 'Approval failed', description: error })
    else {
      toast({ tone: 'success', title: 'Offer approved' })
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
                  {o.approved_at && (
                    <Badge tone="sage">
                      <ShieldCheck size={11} className="mr-0.5 inline" /> approved
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" leftIcon={<FileText size={14} />} onClick={() => setLetterFor(o)}>
                    Letter
                  </Button>
                  {o.status === 'pending' && !o.approved_at && (
                    <Button size="sm" variant="secondary" leftIcon={<ShieldCheck size={14} />} onClick={() => approve(o)}>
                      Approve
                    </Button>
                  )}
                  {o.status === 'pending' && (
                    <Button size="sm" variant="secondary" disabled={!o.approved_at} title={o.approved_at ? undefined : 'Approve the offer before sending'} onClick={() => changeStatus(o, 'sent')}>
                      Send
                    </Button>
                  )}
                  {o.status === 'sent' && (
                    <>
                      <Button size="sm" variant="primary" onClick={() => changeStatus(o, 'accepted')}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => changeStatus(o, 'declined')}>
                        Decline
                      </Button>
                    </>
                  )}
                  {o.status === 'accepted' && (
                    <Button size="sm" variant="secondary" leftIcon={<ClipboardList size={14} />} onClick={() => toggleOnboarding(o)}>
                      Onboarding {openOnb === o.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" aria-label="Delete offer" onClick={() => remove(o.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              {o.status === 'declined' && o.decline_reason && (
                <p className="mt-2 text-xs text-rust-700">Declined — reason: {o.decline_reason}</p>
              )}
              {o.status === 'accepted' && openOnb === o.id && (
                <OnboardingPanel tasks={tasks} onToggle={(t) => toggleTask(t, o)} />
              )}
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

      {letterFor && (
        <OfferLetterModal
          offer={letterFor}
          onClose={() => setLetterFor(null)}
          onSaved={() => {
            setLetterFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function OfferLetterModal({ offer, onClose, onSaved }: { offer: OfferRow; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const letter = renderOfferLetter(offer)
  const [signUrl, setSignUrl] = useState(offer.signed_url ?? '')
  const [saving, setSaving] = useState(false)

  function copy() {
    navigator.clipboard?.writeText(letter)
    toast({ tone: 'success', title: 'Letter copied' })
  }
  function download() {
    const blob = new Blob([letter], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `offer-${(offer.candidate?.full_name ?? 'candidate').replace(/\s+/g, '-').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }
  async function saveSignUrl() {
    setSaving(true)
    const { error } = await setSignedUrl(offer.id, signUrl)
    setSaving(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: 'E-signature link saved' })
      onSaved()
    }
  }

  return (
    <Modal
      title={`Offer letter — ${offer.candidate?.full_name ?? 'Candidate'}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" size="sm" leftIcon={<Copy size={14} />} onClick={copy}>
            Copy
          </Button>
          <Button size="sm" leftIcon={<Download size={14} />} onClick={download}>
            Download .txt
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-paper/60 p-4 font-mono text-xs text-ink">
          {letter}
        </pre>

        <div className="rounded-lg border border-line p-3">
          <div className="mb-1 text-sm font-semibold text-ink">E-signature</div>
          <p className="mb-2 text-xs text-muted">
            Send for signature through your e-sign provider (e.g. DocuSign), then paste the signing/return
            URL here to track it on the offer. Automated DocuSign send requires connecting DocuSign under
            Integrations (credentials pending).
          </p>
          <div className="flex items-end gap-2">
            <Input
              label="Signing URL"
              value={signUrl}
              onChange={(e) => setSignUrl(e.target.value)}
              placeholder="https://… (paste from your e-sign provider)"
            />
            <Button size="sm" loading={saving} onClick={saveSignUrl}>
              Save
            </Button>
          </div>
          {offer.signed_url && (
            <a href={offer.signed_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              <ExternalLink size={11} /> Open current signing link
            </a>
          )}
        </div>
      </div>
    </Modal>
  )
}

function OnboardingPanel({ tasks, onToggle }: { tasks: OnboardingTask[]; onToggle: (t: OnboardingTask) => void }) {
  if (!tasks.length) return <p className="mt-3 text-sm text-muted">No onboarding tasks yet for this hire.</p>
  const done = tasks.filter((t) => t.status === 'done').length
  return (
    <div className="mt-3 rounded-lg border border-line bg-paper/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Onboarding checklist</span>
        <span className="tnum text-xs text-muted">{done}/{tasks.length} complete</span>
      </div>
      <div className="space-y-0.5">
        {tasks.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onToggle(t)}
            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-surface"
          >
            {t.status === 'done' ? (
              <CheckCircle2 size={15} className="shrink-0 text-sage-600" />
            ) : (
              <Circle size={15} className="shrink-0 text-muted" />
            )}
            <span className={t.status === 'done' ? 'text-muted line-through' : 'text-ink'}>{t.label}</span>
            {t.source === 'credential' && <Badge tone="sage">carried forward</Badge>}
          </button>
        ))}
      </div>
    </div>
  )
}

function NewOfferModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [candidates, setCandidates] = useState<{ id: string; full_name: string }[]>([])
  const [reqs, setReqs] = useState<ReqOption[]>([])
  const [candidateId, setCandidateId] = useState('')
  const [requisitionId, setRequisitionId] = useState('')
  const [salary, setSalary] = useState('')
  const [bonus, setBonus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [saving, setSaving] = useState(false)
  // Fair-market-value suggestion (web-grounded; see lib/v2/comp.ts).
  const [benchmark, setBenchmark] = useState<CompBenchmark | null>(null)
  const [compLoading, setCompLoading] = useState(false)
  const [compError, setCompError] = useState<string | null>(null)

  useEffect(() => {
    listSelectableCandidates().then(setCandidates)
    listRequisitionOptions().then(setReqs)
  }, [])

  async function getRate(refresh: boolean) {
    if (!requisitionId) return
    setCompLoading(true)
    setCompError(null)
    const { benchmark: b, error } = await suggestComp(requisitionId, refresh)
    setCompLoading(false)
    if (error) setCompError(error)
    else setBenchmark(b)
  }

  function pickReq(id: string) {
    setRequisitionId(id)
    setBenchmark(null)
    setCompError(null)
  }

  async function save() {
    if (!candidateId) {
      toast({ tone: 'error', title: 'Pick a candidate' })
      return
    }
    setSaving(true)
    const { error } = await createOffer({
      candidate_id: candidateId,
      requisition_id: requisitionId || null,
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

  const confTone: BadgeTone = benchmark?.confidence === 'high' ? 'sage' : benchmark?.confidence === 'low' ? 'rust' : 'clay'

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
        <Select
          label="Requisition"
          value={requisitionId}
          onChange={(e) => pickReq(e.target.value)}
          options={reqs.map((r) => ({ value: r.id, label: `${r.title} · ${r.role_family}` }))}
          placeholder="Tie to a requisition for a market-rate suggestion"
        />

        {requisitionId && (
          <div className="rounded-lg border border-line bg-sage-50/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <TrendingUp size={14} className="text-muted" /> Suggested offer
                <span className="text-xs font-normal text-muted">fair market value</span>
              </div>
              <Button size="sm" variant="secondary" loading={compLoading} leftIcon={<Sparkles size={13} />} onClick={() => getRate(!!benchmark)}>
                {benchmark ? 'Refresh' : 'Get market rate'}
              </Button>
            </div>

            {compError && <p className="mt-2 text-xs text-rust-700">{compError}</p>}

            {benchmark ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="tnum text-2xl font-semibold tracking-tight text-ink">{usd(benchmark.annual_median)}</span>
                  <span className="text-xs text-muted">median / yr</span>
                  {annualRange(benchmark) && <span className="text-xs text-muted">· {annualRange(benchmark)}</span>}
                  {hourlyRange(benchmark) && <span className="text-xs text-muted">· {hourlyRange(benchmark)}</span>}
                  {benchmark.confidence && <Badge tone={confTone}>{benchmark.confidence} confidence</Badge>}
                </div>
                {benchmark.annual_median != null && (
                  <Button size="sm" variant="ghost" onClick={() => setSalary(String(Math.round(benchmark.annual_median!)))}>
                    Use median as salary
                  </Button>
                )}
                {benchmark.rationale && <p className="text-xs leading-relaxed text-muted">{benchmark.rationale}</p>}
                {benchmark.sources?.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {benchmark.sources.slice(0, 5).map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                        <ExternalLink size={11} /> {s.title}
                      </a>
                    ))}
                  </div>
                )}
                {benchmark.fetched_at && (
                  <p className="text-[11px] text-muted">Pulled {new Date(benchmark.fetched_at).toLocaleDateString()} from web sources.</p>
                )}
              </div>
            ) : (
              !compError && <p className="mt-1.5 text-xs text-muted">Pulls current pay for this role &amp; location from the web (Claude + live search).</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Salary" type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="e.g. 120000" />
          <Input label="Bonus" type="number" min={0} value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="optional" />
        </div>
        <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>
    </Modal>
  )
}
