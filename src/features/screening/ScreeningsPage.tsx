import { useEffect, useMemo, useState } from 'react'
import { Plus, Phone, MessageSquare, Sparkles, CalendarClock } from 'lucide-react'
import { Button, Card, Badge, Select, MultiSelect, Modal, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import { demoMode } from '../../lib/supabase'
import { listSelectableCandidates } from '../../lib/v2/pipeline'
import { listRequisitionOptions, type ReqOption } from '../../lib/v2/requisitions'
import {
  listScreenings,
  createScreening,
  updateScreening,
  setStatus,
  deleteScreening,
  generateScreeningQuestions,
  getRequisitionQuestions,
  completeAndAnalyze,
  placeScreeningCall,
  type ScreeningRow,
  type ScreeningQuestion,
  type ScreeningResponse,
  type ScreeningFlag,
} from '../../lib/v2/screenings'
import type { ScreeningStatus, ScreeningChannel } from '../../lib/v2/types'
import { listScheduledCalls, cancelScheduledCall, type ScheduledCall } from '../../lib/v2/scheduledCalls'
import { PhoneForwarded, X } from 'lucide-react'

const STATUS_TONE: Record<ScreeningStatus, BadgeTone> = {
  draft: 'neutral',
  approved: 'clay',
  sent: 'clay',
  completed: 'sage',
  analyzed: 'sage',
  cancelled: 'rust',
}
const STATUSES: ScreeningStatus[] = ['draft', 'approved', 'sent', 'completed', 'analyzed', 'cancelled']

// Upcoming + recent screening callbacks the candidate asked us to place at a
// specific time. A pg_cron dispatcher places them automatically when due.
function ScheduledCallbacksPanel() {
  const { toast } = useToast()
  const [calls, setCalls] = useState<ScheduledCall[] | null>(null)
  function load() {
    listScheduledCalls().then(setCalls)
  }
  useEffect(load, [])
  if (!calls || calls.length === 0) return null

  const active = calls.filter((c) => c.status === 'pending' || c.status === 'failed')
  const recent = calls.filter((c) => c.status === 'placed').slice(-3)
  const shown = [...active, ...recent]
  if (shown.length === 0) return null

  const tone: Record<string, BadgeTone> = { pending: 'clay', placed: 'sage', failed: 'rust', cancelled: 'neutral' }
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  async function cancel(id: string) {
    const { error } = await cancelScheduledCall(id)
    if (error) toast({ tone: 'error', title: 'Could not cancel', description: error })
    else {
      toast({ tone: 'success', title: 'Callback cancelled' })
      load()
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <PhoneForwarded size={15} className="text-clay-500" /> Scheduled screening callbacks
      </div>
      <p className="mb-3 text-xs text-muted">
        When a candidate says it's not a good time, the AI agent captures a callback time and we place the
        call automatically when it's due.
      </p>
      <div className="space-y-1.5">
        {shown.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-paper/60 px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{c.candidate?.full_name ?? 'Candidate'}</span>
                <Badge tone={tone[c.status] ?? 'neutral'}>{c.status}</Badge>
              </div>
              <div className="text-xs text-muted">
                {fmt(c.scheduled_at)}
                {c.note ? ` · “${c.note}”` : ''}
                {c.status === 'failed' ? ` · ${c.attempts} attempt(s)` : ''}
              </div>
            </div>
            {(c.status === 'pending' || c.status === 'failed') && (
              <Button size="sm" variant="ghost" leftIcon={<X size={13} />} onClick={() => cancel(c.id)}>
                Cancel
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

export function ScreeningsPage() {
  const [rows, setRows] = useState<ScreeningRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statuses, setStatuses] = useState<ScreeningStatus[]>([])
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    listScreenings().then((r) => {
      setRows(r)
      setLoading(false)
    })
  }
  useEffect(load, [])

  const visible = useMemo(() => (statuses.length === 0 ? rows : rows.filter((r) => statuses.includes(r.status))), [rows, statuses])
  const counts = useMemo(() => {
    const analyzed = rows.filter((r) => r.status === 'analyzed')
    const avg = analyzed.length ? Math.round(analyzed.reduce((s, r) => s + (r.ai_score ?? 0), 0) / analyzed.length) : null
    return { total: rows.length, inFlight: rows.filter((r) => ['approved', 'sent', 'completed'].includes(r.status)).length, avgScore: avg }
  }, [rows])

  const open = rows.find((r) => r.id === openId) ?? null

  if (loading) return <Spinner label="Loading screenings…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">AI Screening</h1>
          <p className="mt-1 text-sm text-muted">Questionnaires, voice/SMS screening, and AI readouts.</p>
        </div>
        <Button leftIcon={<Plus size={15} />} onClick={() => setCreating(true)}>
          New screening
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Screenings" value={counts.total} />
        <StatCard label="In flight" value={counts.inFlight} hint="approved · sent · completed" />
        <StatCard label="Avg fit score" value={counts.avgScore ?? '—'} tone={counts.avgScore != null && counts.avgScore >= 70 ? 'good' : 'default'} hint="analyzed screenings" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted">Status</span>
        <div className="w-44">
          <MultiSelect
            value={statuses}
            onChange={(v) => setStatuses(v as ScreeningStatus[])}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            placeholder="All statuses"
          />
        </div>
      </div>

      <ScheduledCallbacksPanel />

      {visible.length === 0 ? (
        <EmptyState title="No screenings" hint="Create a screening to draft an AI questionnaire." />
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <button className="min-w-0 text-left" onClick={() => setOpenId(r.id)}>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{r.candidate?.full_name ?? 'Unknown candidate'}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  <span className="text-xs text-muted">{r.channel}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {r.ai_score != null ? `Fit ${r.ai_score}/100 · ` : ''}
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </button>
              <Button size="sm" variant="secondary" onClick={() => setOpenId(r.id)}>
                Open
              </Button>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <NewScreeningModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            load()
            setOpenId(id)
          }}
        />
      )}
      {open && (
        <ScreeningDetail
          row={open}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            load()
          }}
          onDeleted={() => {
            setOpenId(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function NewScreeningModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast()
  const [candidates, setCandidates] = useState<{ id: string; full_name: string }[]>([])
  const [reqs, setReqs] = useState<ReqOption[]>([])
  const [candidateId, setCandidateId] = useState('')
  const [requisitionId, setRequisitionId] = useState('')
  const [channel, setChannel] = useState<ScreeningChannel>('phone')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listSelectableCandidates().then(setCandidates)
    listRequisitionOptions().then(setReqs)
  }, [])

  async function create() {
    if (!candidateId) {
      toast({ tone: 'error', title: 'Pick a candidate' })
      return
    }
    setBusy(true)
    const cand = candidates.find((c) => c.id === candidateId)
    const req = reqs.find((r) => r.id === requisitionId)
    // Prefer the requisition's curated default question set; fall back to an
    // AI-drafted questionnaire (seeded with the role context when we have it).
    let questions = requisitionId ? await getRequisitionQuestions(requisitionId) : []
    let fromReq = questions.length > 0
    if (!questions.length) {
      questions = await generateScreeningQuestions({
        full_name: cand?.full_name ?? '',
        role_family: req?.role_family ?? null,
        requisition_title: req?.title ?? null,
      })
      fromReq = false
    }
    const { id, error } = await createScreening({
      candidate_id: candidateId,
      requisition_id: requisitionId || null,
      channel,
      questions,
    })
    setBusy(false)
    if (error || !id) toast({ tone: 'error', title: 'Could not create screening', description: error ?? undefined })
    else {
      toast({
        tone: 'success',
        title: 'Screening drafted',
        description: `${questions.length} questions ${fromReq ? 'from the requisition' : 'generated'}`,
      })
      onCreated(id)
    }
  }

  return (
    <Modal
      title="New screening"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={busy} leftIcon={<Sparkles size={14} />} onClick={create}>
            Generate &amp; create
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
          label="Requisition (optional)"
          value={requisitionId}
          onChange={(e) => setRequisitionId(e.target.value)}
          options={reqs.map((r) => ({ value: r.id, label: `${r.title} · ${r.role_family}` }))}
          placeholder="None — generate questions with AI"
        />
        <Select
          label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as ScreeningChannel)}
          options={[
            { value: 'phone', label: 'Phone (voice)' },
            { value: 'sms', label: 'SMS' },
            { value: 'email', label: 'Email' },
            { value: 'manual', label: 'Manual' },
          ]}
        />
        <p className="text-xs text-muted">
          If you pick a requisition with a saved question set, the screening uses those. Otherwise a Claude-drafted
          questionnaire is generated. Review and edit before sending.
        </p>
      </div>
    </Modal>
  )
}

function ScreeningDetail({ row, onClose, onChanged, onDeleted }: { row: ScreeningRow; onClose: () => void; onChanged: () => void; onDeleted: () => void }) {
  const { toast } = useToast()
  const questions = (row.questions as ScreeningQuestion[]) ?? []
  const [responses, setResponses] = useState<ScreeningResponse[]>(() => (row.responses as ScreeningResponse[]) ?? [])
  const [transcript, setTranscript] = useState(row.transcript ?? '')
  const [busy, setBusy] = useState(false)
  const flags = (row.ai_flags as ScreeningFlag[]) ?? []

  function answerFor(qid: string): string {
    return responses.find((r) => r.question_id === qid)?.answer ?? ''
  }
  function setAnswer(qid: string, val: string) {
    setResponses((prev) => {
      const next = prev.filter((r) => r.question_id !== qid)
      next.push({ question_id: qid, answer: val })
      return next
    })
  }

  async function saveResponses() {
    setBusy(true)
    const { error } = await updateScreening(row.id, { responses: responses as unknown[], transcript })
    setBusy(false)
    if (error) toast({ tone: 'error', title: 'Save failed', description: error })
    else {
      toast({ tone: 'success', title: 'Responses saved' })
      onChanged()
    }
  }

  async function transition(s: ScreeningStatus) {
    setBusy(true)
    const { error } = await setStatus(row.id, s)
    setBusy(false)
    if (error) toast({ tone: 'error', title: 'Update failed', description: error })
    else onChanged()
  }

  async function analyze() {
    setBusy(true)
    await updateScreening(row.id, { responses: responses as unknown[], transcript })
    const { error } = await completeAndAnalyze({ ...row, responses: responses as unknown[], transcript }, { full_name: row.candidate?.full_name ?? '' })
    setBusy(false)
    if (error) toast({ tone: 'error', title: 'Analysis failed', description: error })
    else {
      toast({ tone: 'success', title: 'Screening analyzed' })
      onChanged()
    }
  }

  async function call(mode: 'call' | 'sms' | 'schedule') {
    setBusy(true)
    const { error } = await placeScreeningCall(row.id, mode)
    setBusy(false)
    if (error) toast({ tone: 'error', title: 'Could not send', description: error })
    else {
      const title =
        mode === 'call' ? 'Voice screening started' : mode === 'schedule' ? 'Scheduling link sent' : 'SMS screening sent'
      toast({ tone: 'success', title })
      onChanged()
    }
  }

  async function remove() {
    const { error } = await deleteScreening(row.id)
    if (error) toast({ tone: 'error', title: 'Delete failed', description: error })
    else {
      toast({ tone: 'success', title: 'Screening deleted' })
      onDeleted()
    }
  }

  // Dispatch is allowed for any approved+ screening (so a call/SMS can be re-sent
  // if it didn't connect or needs another attempt). Re-labels after the first send.
  const canDispatch = !demoMode && row.status !== 'draft' && row.status !== 'cancelled'
  const resend = row.status !== 'approved'

  return (
    <Modal
      size="lg"
      title={`Screening — ${row.candidate?.full_name ?? 'Candidate'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={remove}>
            Delete
          </Button>
          <Button variant="secondary" size="sm" loading={busy} onClick={saveResponses}>
            Save
          </Button>
          {row.status === 'draft' && (
            <Button size="sm" loading={busy} onClick={() => transition('approved')}>
              Approve
            </Button>
          )}
          {row.status === 'sent' && (
            <Button size="sm" loading={busy} onClick={() => transition('completed')}>
              Mark completed
            </Button>
          )}
          {(row.status === 'completed' || row.status === 'sent') && (
            <Button size="sm" loading={busy} leftIcon={<Sparkles size={14} />} onClick={analyze}>
              Analyze
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
          <span className="text-xs text-muted">{row.channel}</span>
          {row.status === 'approved' && <Button size="sm" loading={busy} onClick={() => transition('sent')}>Mark sent</Button>}
          {canDispatch && (
            <Button size="sm" variant="secondary" leftIcon={<Phone size={14} />} loading={busy} onClick={() => call('call')}>
              {resend ? 'Re-send call' : 'Voice call'}
            </Button>
          )}
          {canDispatch && (
            <Button size="sm" variant="secondary" leftIcon={<MessageSquare size={14} />} loading={busy} onClick={() => call('sms')}>
              {resend ? 'Re-send SMS' : 'SMS'}
            </Button>
          )}
          {canDispatch && row.application_id && (
            <Button size="sm" variant="secondary" leftIcon={<CalendarClock size={14} />} loading={busy} onClick={() => call('schedule')}>
              Send scheduling link
            </Button>
          )}
        </div>

        {row.status === 'analyzed' && row.ai_summary && (
          <div className="rounded-lg border border-line bg-sage-50/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">AI readout</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {row.ai_score != null && <Badge tone="sage">Fit {row.ai_score}/100</Badge>}
                {row.sentiment_label && (
                  <Badge tone={row.sentiment_label === 'positive' ? 'sage' : row.sentiment_label === 'negative' ? 'rust' : 'clay'}>
                    {row.sentiment_label}
                    {row.sentiment_score != null ? ` ${row.sentiment_score}` : ''}
                  </Badge>
                )}
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink/90">{row.ai_summary}</p>
            {row.recording_url && (
              <a
                href={row.recording_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                ▶ Listen to recording
              </a>
            )}
            {flags.length > 0 && (
              <ul className="mt-2 space-y-1">
                {flags.map((f, i) => (
                  <li key={i} className="text-xs text-rust-700">
                    ⚑ {f.detail} {f.severity ? `(${f.severity})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id}>
              <label className="label">
                {i + 1}. {q.question}
                {q.competency && <span className="ml-2 text-xs font-normal text-muted">· {q.competency}</span>}
              </label>
              <textarea
                className="input min-h-[60px]"
                value={answerFor(q.id)}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder="Candidate's answer…"
              />
            </div>
          ))}
        </div>

        <div>
          <label className="label">Transcript (voice/SMS)</label>
          <textarea className="input min-h-[80px]" value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste or auto-filled from a voice/SMS screening." />
        </div>
      </div>
    </Modal>
  )
}
