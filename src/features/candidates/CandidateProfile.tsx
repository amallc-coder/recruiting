import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Upload,
  RefreshCw,
  Send,
  CheckCircle2,
  ShieldCheck,
  FileText,
  MessageSquare,
  GitBranch,
  Sparkles,
  ClipboardList,
  History,
  AlertTriangle,
} from 'lucide-react'
import { Button, Card, Badge, Input, Select, Tabs, useToast } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import { MatchCard } from '../screening/MatchCard'
import {
  loadProfile,
  listDocuments,
  listCommunications,
  listScorecards,
  buildTimeline,
  expiryStatus,
  verifyCredential,
  requestDocument,
  uploadDocument,
  setDocStatus,
  sendCommunication,
  findDuplicates,
  mergeCandidates,
  type ProfileData,
  type CandidateDocument,
  type Communication,
  type Scorecard,
  type TimelineItem,
  type TimelineKind,
  type DocumentStatus,
  type CommChannel,
  type VerificationStatus,
  type DuplicateCandidate,
} from '../../lib/v2/candidateProfile'
import type { CandidateStatus, CredentialType } from '../../lib/v2/types'

const STATUS_LABELS: Record<CandidateStatus, string> = {
  new: 'New',
  active: 'Active',
  passive: 'Passive',
  placed: 'Placed',
  do_not_contact: 'Do not contact',
  archived: 'Archived',
}
const STATUS_TONE: Record<CandidateStatus, BadgeTone> = {
  new: 'neutral',
  active: 'sage',
  passive: 'clay',
  placed: 'sage',
  do_not_contact: 'rust',
  archived: 'neutral',
}

const VERIFY_TONE: Record<VerificationStatus, BadgeTone> = {
  unverified: 'neutral',
  pending: 'clay',
  verified: 'sage',
  rejected: 'rust',
  expired: 'rust',
}
const DOC_TONE: Record<DocumentStatus, BadgeTone> = {
  pending: 'clay',
  verified: 'sage',
  rejected: 'rust',
  expired: 'rust',
}

const CREDENTIAL_TYPES: CredentialType[] = ['license', 'board_cert', 'dea', 'immunization', 'bls']

function fmtDate(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

function expiryClass(date: string | null): string {
  const s = expiryStatus(date)
  return s === 'expired' ? 'text-rust-600' : s === 'amber' ? 'text-clay-600' : 'text-sage-600'
}

export function CandidateProfile() {
  const { id } = useParams()
  const { toast } = useToast()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    loadProfile(id).then((p) => {
      setProfile(p)
      setLoading(false)
      findDuplicates(p.candidate).then(setDuplicates)
    })
  }, [id])
  useEffect(load, [load])

  async function merge(dup: DuplicateCandidate) {
    if (!id) return
    const { error } = await mergeCandidates(dup.id, id)
    if (error) toast({ tone: 'error', title: 'Merge failed', description: error })
    else {
      toast({ tone: 'success', title: 'Records merged', description: dup.full_name })
      load()
    }
  }

  if (loading) return <Spinner label="Loading profile…" />
  if (!profile || !id) return <EmptyState title="Candidate not found" hint="It may have been removed or merged." />

  const { candidate, applications, credentials, fitScore } = profile

  // Placement-ready summary across applications + soon-expiring credentials.
  const allReady = applications.length > 0 && applications.every((a) => a.placement_ready)
  const missingTypes = new Set<string>()
  for (const a of applications) for (const m of a.missing) missingTypes.add(m)
  const expiringTypes = new Set<string>()
  for (const c of credentials) {
    const s = expiryStatus(c.expiration_date)
    if (s === 'amber' || s === 'expired') expiringTypes.add(c.type)
  }
  const blockers = Array.from(new Set([...missingTypes, ...expiringTypes]))

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'credentials', label: 'Credentials' },
    { value: 'documents', label: 'Documents' },
    { value: 'communications', label: 'Communications' },
    { value: 'scorecards', label: 'Scorecards' },
    { value: 'activity', label: 'Activity' },
  ]

  return (
    <div className="space-y-5">
      <Link to="/candidates" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> Candidates
      </Link>

      {duplicates.length > 0 && (
        <Card className="border-l-4 border-clay-500 bg-clay-50/40 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-clay-700" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                Possible duplicate{duplicates.length > 1 ? 's' : ''}:
              </p>
              <ul className="mt-2 space-y-2">
                {duplicates.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-ink">
                      {d.full_name}
                      <span className="ml-2 text-xs text-muted">
                        {[d.email, d.phone].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => merge(d)}>
                      Merge into this record
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{candidate.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
              {candidate.email && <span>{candidate.email}</span>}
              {candidate.phone && <span>{candidate.phone}</span>}
              {candidate.source && <span>Source: {candidate.source}</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {applications.length === 0 ? (
                <span className="text-xs text-muted">No active applications</span>
              ) : (
                applications.map((a) => (
                  <Badge key={a.id} tone="neutral">
                    {a.requisitionTitle ?? 'Requisition'} · {a.stageName ?? 'No stage'}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-stretch gap-3">
            <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
              <div className="stat-label">Fit score</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight tnum text-ink">{fitScore ?? '—'}</div>
            </div>
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="stat-label">Placement</div>
              <div className="mt-1.5">
                {allReady ? (
                  <Badge tone="sage">Placement-ready</Badge>
                ) : (
                  <Badge tone={applications.length ? 'rust' : 'clay'}>Not placement-ready</Badge>
                )}
              </div>
              {!allReady && blockers.length > 0 && (
                <div className="mt-2 max-w-[14rem] text-xs text-muted">
                  Blockers: {blockers.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Tabs tabs={tabs} defaultValue="overview" label="Candidate sections">
        {(active) => {
          if (active === 'overview') return <OverviewTab profile={profile} />
          if (active === 'credentials') return <CredentialsTab profile={profile} onChanged={load} />
          if (active === 'documents') return <DocumentsTab candidateId={id} />
          if (active === 'communications') return <CommunicationsTab candidateId={id} />
          if (active === 'scorecards') return <ScorecardsTab candidateId={id} />
          if (active === 'activity') return <ActivityTab candidateId={id} />
          return null
        }}
      </Tabs>
    </div>
  )
}

// ---- Overview -------------------------------------------------------------

function OverviewTab({ profile }: { profile: ProfileData }) {
  const { candidate, applications } = profile
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">Status</span>
          <Badge tone={STATUS_TONE[candidate.status]}>{STATUS_LABELS[candidate.status]}</Badge>
          {(candidate.tags ?? []).map((t) => (
            <Badge key={t} tone="neutral">
              {t}
            </Badge>
          ))}
        </div>

        {candidate.screening_summary && (
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Sparkles size={14} className="text-sage-600" /> Screening summary
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink/90">{candidate.screening_summary}</p>
          </div>
        )}

        {candidate.notes && (
          <div className="mt-4">
            <div className="mb-1 text-sm font-semibold text-ink">Notes</div>
            <p className="whitespace-pre-wrap text-sm text-ink/90">{candidate.notes}</p>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink">Applications</h3>
        {applications.length === 0 ? (
          <EmptyState title="No applications" hint="This candidate isn't in any pipeline yet." />
        ) : (
          <div className="space-y-4">
            {applications.map((a) => (
              <div key={a.id} className="border-b border-line/60 pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-ink">{a.requisitionTitle ?? 'Requisition'}</span>
                    <span className="ml-2 text-xs text-muted">
                      {a.stageName ?? 'No stage'} · {a.status}
                    </span>
                  </div>
                  {a.placement_ready ? (
                    <Badge tone="sage">Placement-ready</Badge>
                  ) : (
                    <Badge tone="rust">Not ready</Badge>
                  )}
                </div>
                {/* AI Match Card for this application — score is one click from its evidence. */}
                <div className="mt-2.5">
                  <MatchCard applicationId={a.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ---- Credentials ----------------------------------------------------------

function CredentialsTab({ profile, onChanged }: { profile: ProfileData; onChanged: () => void }) {
  const { toast } = useToast()
  const { credentials } = profile
  const [busyId, setBusyId] = useState<string | null>(null)

  async function verify(credId: string) {
    setBusyId(credId)
    const { error } = await verifyCredential(credId)
    setBusyId(null)
    if (error) toast({ tone: 'error', title: 'Verify failed', description: error })
    else {
      toast({ tone: 'success', title: 'Credential verified' })
      onChanged()
    }
  }

  async function reqDoc(type: string) {
    const { error } = await requestDocument(profile.candidate.id, type)
    if (error) toast({ tone: 'error', title: 'Request failed', description: error })
    else toast({ tone: 'success', title: 'Document requested', description: type })
  }

  if (credentials.length === 0) return <EmptyState title="No credentials on file" hint="Add credentials to track licensure and placement readiness." />

  return (
    <Card className="overflow-x-auto p-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-1.5 pr-3 font-medium">Type</th>
            <th className="py-1.5 pr-3 font-medium">Number</th>
            <th className="py-1.5 pr-3 font-medium">State</th>
            <th className="py-1.5 pr-3 font-medium">Issued</th>
            <th className="py-1.5 pr-3 font-medium">Expires</th>
            <th className="py-1.5 pr-3 font-medium">Status</th>
            <th className="py-1.5 pr-3 font-medium">PSV</th>
            <th className="py-1.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          {credentials.map((c) => (
            <tr key={c.id} className="border-b border-line/60">
              <td className="py-2 pr-3 font-medium text-ink">{c.type}</td>
              <td className="py-2 pr-3 text-muted">{c.number || '—'}</td>
              <td className="py-2 pr-3 text-muted">{c.issuing_state || '—'}</td>
              <td className="py-2 pr-3 text-muted">{fmtDate(c.issue_date)}</td>
              <td className={`py-2 pr-3 font-medium ${expiryClass(c.expiration_date)}`}>{fmtDate(c.expiration_date)}</td>
              <td className="py-2 pr-3">
                <Badge tone={VERIFY_TONE[c.verification_status]}>{c.verification_status}</Badge>
              </td>
              <td className="py-2 pr-3 text-muted">{c.primary_source_verified ? '✓' : '—'}</td>
              <td className="py-2">
                <div className="inline-flex flex-wrap justify-end gap-1">
                  {c.verification_status !== 'verified' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === c.id}
                      leftIcon={<CheckCircle2 size={13} />}
                      onClick={() => verify(c.id)}
                    >
                      Mark verified
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => reqDoc(c.type)}>
                    Request doc
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

// ---- Documents ------------------------------------------------------------

function DocumentsTab({ candidateId }: { candidateId: string }) {
  const { toast } = useToast()
  const [docs, setDocs] = useState<CandidateDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState<string>(CREDENTIAL_TYPES[0])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    listDocuments(candidateId).then((d) => {
      setDocs(d)
      setLoading(false)
    })
  }, [candidateId])
  useEffect(load, [load])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const { error } = await uploadDocument(candidateId, file, type)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (error) toast({ tone: 'error', title: 'Upload failed', description: error })
    else {
      toast({ tone: 'success', title: 'Document uploaded', description: file.name })
      load()
    }
  }

  async function setStatus(docId: string, status: DocumentStatus) {
    const { error } = await setDocStatus(docId, status)
    if (error) toast({ tone: 'error', title: 'Update failed', description: error })
    else {
      toast({ tone: 'success', title: `Marked ${status}` })
      load()
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink">Upload document</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Select
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={CREDENTIAL_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div className="flex-1">
            <label className="label">File</label>
            <input
              ref={fileRef}
              type="file"
              onChange={onFile}
              disabled={uploading}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-paper hover:file:bg-brand-500 disabled:opacity-50"
            />
          </div>
          {uploading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Upload size={13} /> Uploading…
            </span>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-ink">Documents</h3>
          <Button size="sm" variant="ghost" leftIcon={<RefreshCw size={13} />} onClick={load}>
            Refresh
          </Button>
        </div>
        {loading ? (
          <Spinner label="Loading documents…" />
        ) : docs.length === 0 ? (
          <EmptyState title="No documents" hint="Upload or request a document to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">File</th>
                  <th className="py-1.5 pr-3 font-medium">Type</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 pr-3 font-medium">Added</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText size={13} className="text-muted" />
                        {d.file_name || '—'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted">{d.type || '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={DOC_TONE[d.status]}>{d.status}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-muted">{fmtDate(d.created_at)}</td>
                    <td className="py-2">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        {d.status !== 'verified' && (
                          <Button size="sm" variant="secondary" onClick={() => setStatus(d.id, 'verified')}>
                            Set verified
                          </Button>
                        )}
                        {d.status !== 'rejected' && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(d.id, 'rejected')}>
                            Reject
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// ---- Communications -------------------------------------------------------

function CommunicationsTab({ candidateId }: { candidateId: string }) {
  const { toast } = useToast()
  const [comms, setComms] = useState<Communication[]>([])
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<CommChannel>('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [openTranscript, setOpenTranscript] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    listCommunications(candidateId).then((c) => {
      setComms(c)
      setLoading(false)
    })
  }, [candidateId])
  useEffect(load, [load])

  async function send() {
    if (!body.trim()) {
      toast({ tone: 'error', title: 'Message body is required' })
      return
    }
    setSending(true)
    const { error } = await sendCommunication(candidateId, { channel, subject: subject.trim(), body: body.trim() })
    setSending(false)
    if (error) toast({ tone: 'error', title: 'Send failed', description: error })
    else {
      toast({ tone: 'success', title: 'Message logged' })
      setSubject('')
      setBody('')
      load()
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink">Compose</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="Channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as CommChannel)}
              options={[
                { value: 'email', label: 'Email' },
                { value: 'sms', label: 'SMS' },
                { value: 'call', label: 'Call' },
              ]}
            />
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="(optional)" />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea
              className="input min-h-[80px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a message…"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" loading={sending} leftIcon={<Send size={13} />} onClick={send}>
              Send
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold tracking-tight text-ink">History</h3>
        {loading ? (
          <Spinner label="Loading communications…" />
        ) : comms.length === 0 ? (
          <EmptyState title="No communications" hint="Sent and received messages appear here." />
        ) : (
          <div className="space-y-3">
            {comms.map((c) => (
              <div key={c.id} className="border-b border-line/60 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={c.direction === 'inbound' ? 'clay' : 'sage'}>{c.direction}</Badge>
                  <span className="text-xs uppercase tracking-wide text-muted">{c.channel}</span>
                  {c.ai_generated && <Badge tone="neutral">AI</Badge>}
                  <span className="ml-auto text-xs text-muted">{fmtDate(c.occurred_at)}</span>
                </div>
                {c.subject && <div className="mt-1 text-sm font-medium text-ink">{c.subject}</div>}
                {c.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink/90">{c.body}</p>}
                {c.transcript && (
                  <div className="mt-1">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted hover:text-ink"
                      onClick={() => setOpenTranscript(openTranscript === c.id ? null : c.id)}
                    >
                      {openTranscript === c.id ? 'Hide transcript' : 'Show transcript'}
                    </button>
                    {openTranscript === c.id && (
                      <p className="mt-1 whitespace-pre-wrap rounded-lg bg-brand-50 p-3 text-xs text-ink/80">{c.transcript}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ---- Scorecards -----------------------------------------------------------

function ScorecardsTab({ candidateId }: { candidateId: string }) {
  const [cards, setCards] = useState<Scorecard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listScorecards(candidateId).then((c) => {
      setCards(c)
      setLoading(false)
    })
  }, [candidateId])

  if (loading) return <Spinner label="Loading scorecards…" />
  if (cards.length === 0) return <EmptyState title="No scorecards" hint="Interview scorecards appear here once submitted." />

  return (
    <div className="space-y-3">
      {cards.map((c) => (
        <Card key={c.id} className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardList size={15} className="text-muted" />
            {c.recommendation && <Badge tone="neutral">{c.recommendation}</Badge>}
            {c.overall_rating != null && <span className="text-sm font-medium text-ink">{c.overall_rating}/5</span>}
            <span className="ml-auto text-xs text-muted">{fmtDate(c.submitted_at)}</span>
          </div>
          {c.responses.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {c.responses.map((r, i) => (
                <li key={i} className="text-sm text-ink/90">
                  <span className="font-medium text-ink">{r.criterion}</span>
                  {r.rating != null && <span className="ml-2 text-muted">· {r.rating}</span>}
                  {r.comment && <span className="ml-2 text-muted">· {r.comment}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  )
}

// ---- Activity -------------------------------------------------------------

const KIND_META: Record<TimelineKind, { icon: typeof History; tone: BadgeTone; label: string }> = {
  stage: { icon: GitBranch, tone: 'clay', label: 'Stage' },
  communication: { icon: MessageSquare, tone: 'sage', label: 'Comms' },
  scorecard: { icon: ClipboardList, tone: 'neutral', label: 'Scorecard' },
  ai_decision: { icon: Sparkles, tone: 'ink', label: 'AI' },
  credential: { icon: ShieldCheck, tone: 'sage', label: 'Credential' },
  audit: { icon: History, tone: 'neutral', label: 'Audit' },
}

function ActivityTab({ candidateId }: { candidateId: string }) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    buildTimeline(candidateId).then((t) => {
      setItems(t)
      setLoading(false)
    })
  }, [candidateId])

  const rendered = useMemo(() => items, [items])

  if (loading) return <Spinner label="Loading activity…" />
  if (rendered.length === 0) return <EmptyState title="No activity yet" hint="Stage moves, messages, and decisions show up here." />

  return (
    <Card className="p-5">
      <ol className="relative space-y-5 border-l border-line pl-6">
        {rendered.map((it, i) => {
          const meta = KIND_META[it.kind]
          const Icon = meta.icon
          return (
            <li key={i} className="relative">
              <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-surface ring-1 ring-line">
                <Icon size={13} className="text-muted" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <span className="text-sm font-medium text-ink">{it.label}</span>
                <span className="ml-auto text-xs text-muted">{fmtDate(it.at)}</span>
              </div>
              {it.detail && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{it.detail}</p>}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
