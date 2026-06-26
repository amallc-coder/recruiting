import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Phone, PhoneCall, MessageSquare, Mail, FileText, Check, Trash2, Loader2,
  AlertTriangle, ArrowDownLeft, ArrowUpRight, StickyNote,
} from 'lucide-react'
import { supabase, demoMode } from '../lib/supabase'
import { Modal } from './ui'
import {
  completeAndAnalyze, createScreening, deleteScreening,
  generateScreeningQuestions, listCommunications, listScreenings, logCommunication,
  updateScreening, type ScreeningAnalysis,
} from '../lib/engage'
import { ROLE_LABELS } from '../lib/types'
import type {
  Candidate, Communication, Job, Screening, ScreeningQuestion, ScreeningResponse,
} from '../lib/types'

const STATUS_STYLES: Record<Screening['status'], string> = {
  draft: 'bg-brand-50 text-muted',
  approved: 'bg-clay-100 text-clay-600',
  sent: 'bg-clay-100 text-clay-600',
  completed: 'bg-sage-100 text-sage-700',
  analyzed: 'bg-sage-100 text-sage-700',
  cancelled: 'bg-rust-50 text-rust-500',
}

const CHANNEL_ICON = {
  phone: Phone, sms: MessageSquare, email: Mail, call: Phone, note: StickyNote, manual: FileText,
} as const

export function CandidateEngage({
  candidate, jobs, recruiterId, onClose, onUpdated,
}: {
  candidate: Candidate
  jobs: Job[]
  recruiterId: string
  onClose: () => void
  onUpdated?: () => void
}) {
  const [tab, setTab] = useState<'screening' | 'comms'>('screening')
  return (
    <Modal title={`Engage · ${candidate.full_name}`} onClose={onClose} wide>
      <div className="mb-4 flex gap-1 rounded-lg bg-paper p-1 text-sm">
        <TabBtn active={tab === 'screening'} onClick={() => setTab('screening')}>
          <Sparkles size={15} /> AI Screening
        </TabBtn>
        <TabBtn active={tab === 'comms'} onClick={() => setTab('comms')}>
          <MessageSquare size={15} /> Communication
        </TabBtn>
      </div>
      {tab === 'screening' ? (
        <ScreeningTab candidate={candidate} jobs={jobs} recruiterId={recruiterId} onUpdated={onUpdated} />
      ) : (
        <CommsTab candidate={candidate} recruiterId={recruiterId} onUpdated={onUpdated} />
      )}
    </Modal>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
        active ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

// ---- Screening ------------------------------------------------------------
function ScreeningTab({
  candidate, jobs, recruiterId, onUpdated,
}: { candidate: Candidate; jobs: Job[]; recruiterId: string; onUpdated?: () => void }) {
  const [items, setItems] = useState<Screening[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [jobId, setJobId] = useState<string>('')
  const [channel, setChannel] = useState<Screening['channel']>('phone')
  const [draftQs, setDraftQs] = useState<ScreeningQuestion[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs])

  async function load() {
    try { setItems(await listScreenings(candidate.id)) }
    catch (e) { setError(String(e instanceof Error ? e.message : e)) }
  }
  useEffect(() => { load() }, [candidate.id])

  async function generate() {
    setError(null); setBusy('generate')
    try {
      const job = jobId ? jobById.get(jobId) ?? null : null
      setDraftQs(await generateScreeningQuestions(candidate, job))
      setCreating(true)
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    finally { setBusy(null) }
  }

  async function saveDraft() {
    if (!draftQs?.length) return
    setBusy('save')
    try {
      await createScreening({
        candidate_id: candidate.id,
        job_id: jobId || null,
        recruiter_id: candidate.recruiter_id ?? recruiterId,
        channel,
        questions: draftQs,
        created_by: recruiterId,
      })
      setCreating(false); setDraftQs(null); setJobId('')
      await load()
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      {error && <Banner kind="error">{error}</Banner>}

      {/* New screening builder */}
      {creating && draftQs ? (
        <div className="card space-y-3 p-4">
          <div className="text-sm font-semibold text-ink">Review questionnaire</div>
          <p className="text-xs text-muted">
            AI-drafted from the résumé{jobId ? ' + the selected opening' : ''}. Edit anything before saving, then
            approve to send.
          </p>
          {draftQs.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-line p-3">
              <textarea
                className="input min-h-[48px] text-sm"
                value={q.question}
                onChange={(e) => setDraftQs((qs) => qs!.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
              />
              {(q.competency || q.rationale) && (
                <div className="mt-1 text-xs text-muted">
                  {q.competency && <span className="font-medium">{q.competency}</span>}
                  {q.competency && q.rationale ? ' · ' : ''}{q.rationale}
                </div>
              )}
              <button
                className="mt-1 text-xs text-rust-500 hover:underline"
                onClick={() => setDraftQs((qs) => qs!.filter((_, j) => j !== i))}
              >Remove</button>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setCreating(false); setDraftQs(null) }}>Cancel</button>
            <button className="btn-primary" onClick={saveDraft} disabled={busy === 'save' || !draftQs.length}>
              {busy === 'save' ? 'Saving…' : 'Save screening'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <label className="flex-1 text-xs font-medium text-muted">
            Opening (optional)
            <select className="input mt-1" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No specific opening — general screen</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}{j.location ? ` — ${j.location}` : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Channel
            <select className="input mt-1" value={channel} onChange={(e) => setChannel(e.target.value as Screening['channel'])}>
              <option value="phone">AI phone call</option>
              <option value="sms">Text (SMS)</option>
              <option value="email">Email</option>
              <option value="manual">Manual / recruiter</option>
            </select>
          </label>
          <button className="btn-primary" onClick={generate} disabled={busy === 'generate'}>
            {busy === 'generate' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {busy === 'generate' ? 'Generating…' : 'Generate questions'}
          </button>
        </div>
      )}

      {/* Existing screenings */}
      {items === null ? (
        <div className="py-6 text-center text-sm text-muted">Loading…</div>
      ) : items.length === 0 && !creating ? (
        <div className="py-6 text-center text-sm text-muted">No screenings yet. Generate one above.</div>
      ) : (
        items.map((s) => (
          <ScreeningCard
            key={s.id} screening={s} candidate={candidate}
            job={s.job_id ? jobById.get(s.job_id) ?? null : null}
            onChanged={() => { load(); onUpdated?.() }}
          />
        ))
      )}

      <VendorNote />
    </div>
  )
}

function ScreeningCard({
  screening, candidate, job, onChanged,
}: { screening: Screening; candidate: Candidate; job: Job | null; onChanged: () => void }) {
  const [open, setOpen] = useState(screening.status !== 'analyzed')
  const [responses, setResponses] = useState<ScreeningResponse[]>(
    screening.questions.map((q) => screening.responses.find((r) => r.question_id === q.id) ?? { question_id: q.id, answer: '' }),
  )
  const [transcript, setTranscript] = useState(screening.transcript ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ScreeningAnalysis | null>(
    screening.status === 'analyzed' && screening.ai_summary
      ? { summary: screening.ai_summary, score: screening.ai_score ?? 0, recommendation: 'hold', strengths: [], concerns: [], flags: screening.ai_flags ?? [] }
      : null,
  )
  const Icon = CHANNEL_ICON[screening.channel] ?? FileText

  async function persist(patch: Partial<Screening>) {
    await updateScreening(screening.id, patch)
    onChanged()
  }

  async function saveResponses() {
    setBusy('save')
    try { await persist({ responses, transcript: transcript || null, status: screening.status === 'draft' ? 'completed' : screening.status }) }
    finally { setBusy(null) }
  }

  async function analyze() {
    setBusy('analyze')
    try {
      const a = await completeAndAnalyze({ ...screening, responses, transcript: transcript || null }, candidate, job)
      setAnalysis(a)
      onChanged()
    } finally { setBusy(null) }
  }

  // Place a fully-agentic Vapi call / text. Server-side; needs VAPI_API_KEY set.
  async function dispatch(mode: 'call' | 'sms') {
    setBusy(mode)
    try {
      const { data, error } = await supabase.functions.invoke('vapi-call', { body: { screening_id: screening.id, mode } })
      const errMsg = (error as { context?: { error?: string } } | null)?.context?.error || (data as { error?: string })?.error || (error?.message)
      if (errMsg) { alert(`Could not start ${mode === 'sms' ? 'text' : 'call'}: ${errMsg}`); return }
      onChanged()
    } catch (e) {
      alert(`Could not start ${mode === 'sms' ? 'text' : 'call'}: ${String(e instanceof Error ? e.message : e)}`)
    } finally { setBusy(null) }
  }

  return (
    <div className="card p-4">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-muted" />
          <span className="text-sm font-medium text-ink">
            {job?.title ?? 'General screen'} · {ROLE_LABELS[candidate.role] ?? candidate.role}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[screening.status]}`}>
            {screening.status}
          </span>
        </div>
        {screening.ai_score != null && (
          <span className="text-sm font-semibold text-ink">{screening.ai_score}<span className="text-xs text-muted">/100</span></span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {screening.questions.map((q, i) => (
            <div key={q.id}>
              <div className="text-sm font-medium text-ink">{i + 1}. {q.question}</div>
              <textarea
                className="input mt-1 min-h-[44px] text-sm"
                placeholder="Candidate's answer…"
                value={responses[i]?.answer ?? ''}
                onChange={(e) => setResponses((rs) => rs.map((r, j) => (j === i ? { ...r, answer: e.target.value } : r)))}
              />
            </div>
          ))}
          <label className="block text-xs font-medium text-muted">
            Call / SMS transcript (optional — paste from the voice vendor)
            <textarea className="input mt-1 min-h-[60px] text-sm" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </label>

          <div className="flex flex-wrap justify-end gap-2">
            {screening.status === 'draft' && (
              <button className="btn-secondary" onClick={() => persist({ status: 'approved', approved_at: new Date().toISOString() })}>
                <Check size={15} /> Approve
              </button>
            )}
            {!demoMode && screening.status !== 'draft' && (
              <>
                <button
                  className="btn-secondary"
                  title={candidate.phone ? 'Place an AI screening call via Vapi' : 'Candidate has no phone number'}
                  disabled={!candidate.phone || busy === 'call'}
                  onClick={() => dispatch('call')}
                >
                  {busy === 'call' ? <Loader2 size={15} className="animate-spin" /> : <PhoneCall size={15} />} AI call
                </button>
                <button
                  className="btn-secondary"
                  title={candidate.phone ? 'Send the screening by text via Vapi' : 'Candidate has no phone number'}
                  disabled={!candidate.phone || busy === 'sms'}
                  onClick={() => dispatch('sms')}
                >
                  {busy === 'sms' ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />} Text
                </button>
              </>
            )}
            <button className="btn-secondary" onClick={() => { if (confirm('Delete this screening?')) deleteScreening(screening.id).then(onChanged) }}>
              <Trash2 size={15} />
            </button>
            <button className="btn-secondary" onClick={saveResponses} disabled={busy === 'save'}>
              {busy === 'save' ? 'Saving…' : 'Save answers'}
            </button>
            <button className="btn-primary" onClick={analyze} disabled={busy === 'analyze'}>
              {busy === 'analyze' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {busy === 'analyze' ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>

          {analysis && (
            <div className="rounded-lg bg-paper p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles size={14} /> Analysis · {analysis.score}/100
                {analysis.recommendation && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs capitalize text-muted">{analysis.recommendation}</span>
                )}
              </div>
              <p className="text-sm text-ink">{analysis.summary}</p>
              {analysis.strengths.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs text-sage-700">
                  {analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
              {analysis.concerns.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs text-clay-600">
                  {analysis.concerns.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
              {analysis.flags.length > 0 && (
                <div className="mt-2 space-y-1">
                  {analysis.flags.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-rust-500">
                      <AlertTriangle size={13} /> <span className="font-medium">{f.type}</span> · {f.detail} ({f.severity})
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted">Folded into this candidate's match context automatically.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Communications -------------------------------------------------------
function CommsTab({
  candidate, recruiterId, onUpdated,
}: { candidate: Candidate; recruiterId: string; onUpdated?: () => void }) {
  const [items, setItems] = useState<Communication[] | null>(null)
  const [channel, setChannel] = useState<Communication['channel']>('email')
  const [direction, setDirection] = useState<Communication['direction']>('outbound')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try { setItems(await listCommunications(candidate.id)) }
    catch (e) { setError(String(e instanceof Error ? e.message : e)) }
  }
  useEffect(() => { load() }, [candidate.id])

  async function log() {
    if (!body.trim()) return
    setBusy(true); setError(null)
    try {
      await logCommunication({
        candidate_id: candidate.id,
        recruiter_id: candidate.recruiter_id ?? recruiterId,
        channel, direction,
        subject: channel === 'email' ? subject || null : null,
        body,
        created_by: recruiterId,
      })
      setBody(''); setSubject('')
      await load(); onUpdated?.()
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {error && <Banner kind="error">{error}</Banner>}

      <div className="card space-y-2 p-4">
        <div className="flex gap-2">
          <select className="input max-w-[140px]" value={channel} onChange={(e) => setChannel(e.target.value as Communication['channel'])}>
            <option value="email">Email</option>
            <option value="sms">Text (SMS)</option>
            <option value="call">Call</option>
            <option value="note">Note</option>
          </select>
          <select className="input max-w-[150px]" value={direction} onChange={(e) => setDirection(e.target.value as Communication['direction'])}>
            <option value="outbound">Outbound → candidate</option>
            <option value="inbound">Inbound ← candidate</option>
            <option value="internal">Internal note</option>
          </select>
        </div>
        {channel === 'email' && (
          <input className="input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        )}
        <textarea className="input min-h-[70px]" placeholder="Message / what was said…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex justify-end">
          <button className="btn-primary" onClick={log} disabled={busy || !body.trim()}>
            {busy ? 'Logging…' : 'Log message'}
          </button>
        </div>
      </div>

      {items === null ? (
        <div className="py-6 text-center text-sm text-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted">No communication logged yet.</div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const Icon = CHANNEL_ICON[c.channel] ?? StickyNote
            const Dir = c.direction === 'inbound' ? ArrowDownLeft : c.direction === 'outbound' ? ArrowUpRight : StickyNote
            return (
              <div key={c.id} className="card flex gap-3 p-3">
                <Icon size={16} className="mt-0.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Dir size={12} />
                    <span className="capitalize">{c.channel}</span> · <span className="capitalize">{c.direction}</span>
                    {c.ai_generated && <span className="rounded bg-brand-50 px-1 text-[10px]">AI</span>}
                    <span className="ml-auto">{new Date(c.occurred_at).toLocaleString()}</span>
                  </div>
                  {c.subject && <div className="text-sm font-medium text-ink">{c.subject}</div>}
                  <div className="whitespace-pre-wrap text-sm text-ink">{c.body}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <VendorNote />
    </div>
  )
}

function Banner({ kind, children }: { kind: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg px-3 py-2 text-sm ${kind === 'error' ? 'bg-rust-50 text-rust-500' : 'bg-brand-50 text-muted'}`}>
      {children}
    </div>
  )
}

function VendorNote() {
  return (
    <p className="text-xs text-muted">
      <strong>AI call</strong> / <strong>Text</strong> place a fully-agentic Vapi screening (needs a Vapi
      number + <code>VAPI_API_KEY</code> set on the project). The transcript returns automatically, gets
      analyzed, and feeds matching. No Vapi yet? Run the screening manually and paste the transcript above —
      analysis and the matching loop work either way.
    </p>
  )
}
