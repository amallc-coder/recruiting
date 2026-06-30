import { useEffect, useMemo, useState } from 'react'
import { MapPin, Briefcase, Search, X } from 'lucide-react'
import { Button, Card, Badge, Input, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  listPublicRequisitions,
  applyToRequisition,
  salaryLabel,
  prescreenFor,
  careerMatchScore,
  otherMatchingRoles,
  CAREER_MATCH_THRESHOLD,
  type PublicReq,
  type RoleMatch,
} from '../../lib/v2/careers'
import { getOrgHierarchy, type OrgHierarchy } from '../../lib/v2/hierarchy'

/**
 * PUBLIC careers page (v2). Renders OUTSIDE the authenticated app shell —
 * anonymous visitors browse open postings and apply via the public-intake RPC.
 */
export function CareersPage() {
  const [reqs, setReqs] = useState<PublicReq[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<PublicReq | null>(null)
  const [hier, setHier] = useState<OrgHierarchy | null>(null)
  const [divisionKey, setDivisionKey] = useState('') // index into hier.divisions
  const [facilityId, setFacilityId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    listPublicRequisitions().then((data) => {
      if (!active) return
      setReqs(data)
      setLoading(false)
    })
    getOrgHierarchy().then((h) => active && setHier(h)).catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const divisions = hier?.divisions ?? []
  // facility_id → division index (string), for filtering postings by division.
  const facilityToDivKey = useMemo(() => {
    const m = new Map<string, string>()
    divisions.forEach((d, i) => d.facilities.forEach((f) => m.set(f.id, String(i))))
    return m
  }, [divisions])
  const facilityOptions = divisionKey ? divisions[Number(divisionKey)]?.facilities ?? [] : divisions.flatMap((d) => d.facilities)
  const departmentOptions = facilityId ? facilityOptions.find((f) => f.id === facilityId)?.departments ?? [] : []

  const term = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    return reqs.filter((r) => {
      if (divisionKey && (r.facility_id == null || facilityToDivKey.get(r.facility_id) !== divisionKey)) return false
      if (facilityId && r.facility_id !== facilityId) return false
      if (departmentId && r.department_id !== departmentId) return false
      if (role && r.role_family !== role) return false
      if (term) {
        const hay = [r.title, r.specialty, r.location, r.facility?.name, r.facility?.city, r.facility?.state, r.description].join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [reqs, divisionKey, facilityId, departmentId, role, term, facilityToDivKey])

  const anyFilter = !!(divisionKey || facilityId || departmentId || role || term)
  function clearFilters() {
    setDivisionKey(''); setFacilityId(''); setDepartmentId(''); setRole(''); setSearch('')
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-col gap-1 px-4 py-8 sm:px-6">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Careers at American Medical Administrators</h1>
          <p className="text-sm text-muted">
            Join our team supporting skilled nursing and long-term care facilities. Browse open roles below.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {loading ? (
          <Spinner label="Loading open roles…" />
        ) : reqs.length === 0 ? (
          <EmptyState title="No open roles right now" hint="Check back soon — new positions are posted regularly." />
        ) : (
          <>
            {/* Filters */}
            <Card className="mb-4 p-4">
              <div className="flex items-center gap-2 rounded-lg bg-paper px-2.5 py-2">
                <Search size={16} className="shrink-0 text-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search roles, titles, locations…"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <select className="input" value={divisionKey} onChange={(e) => { setDivisionKey(e.target.value); setFacilityId(''); setDepartmentId('') }}>
                  <option value="">All divisions</option>
                  {divisions.map((d, i) => (
                    <option key={d.id ?? `d${i}`} value={String(i)}>{d.name}</option>
                  ))}
                </select>
                <select className="input" value={facilityId} onChange={(e) => { setFacilityId(e.target.value); setDepartmentId('') }}>
                  <option value="">All facilities</option>
                  {facilityOptions.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!facilityId}>
                  <option value="">{facilityId ? 'All departments' : 'All departments'}</option>
                  {departmentOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">All roles</option>
                  {(hier?.role_families ?? []).map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>{filtered.length} of {reqs.length} open role{reqs.length === 1 ? '' : 's'}</span>
                {anyFilter && (
                  <button onClick={clearFilters} className="inline-flex items-center gap-1 underline-offset-2 hover:text-ink hover:underline">
                    <X size={12} /> Clear filters
                  </button>
                )}
              </div>
            </Card>

            {filtered.length === 0 ? (
              <EmptyState title="No roles match your filters" hint="Try clearing a filter or broadening your search." />
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <Posting key={r.id} req={r} onApply={() => setApplying(r)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-4xl px-4 py-5 font-mono text-[11px] tracking-wide text-muted sm:px-6">
          © 2026 American Medical Administrators — we are an equal opportunity employer.
        </div>
      </footer>

      {applying && <ApplyModal req={applying} allReqs={reqs} onClose={() => setApplying(null)} />}
    </div>
  )
}

function Posting({ req, onApply }: { req: PublicReq; onApply: () => void }) {
  const place = [req.facility?.city, req.facility?.state].filter(Boolean).join(', ')
  const salary = salaryLabel(req)
  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{req.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="sage">{req.role_family}</Badge>
          {req.employment_type && <Badge tone="neutral">{req.employment_type}</Badge>}
          {req.workplace && <Badge tone="clay">{req.workplace}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {(req.facility?.name || place) && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} />
              {[req.facility?.name, place].filter(Boolean).join(' · ')}
            </span>
          )}
          {!req.facility?.name && !place && req.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} />
              {req.location}
            </span>
          )}
          {salary && <span className="font-medium text-ink">{salary}</span>}
        </div>
        {req.description && <p className="line-clamp-2 max-w-xl text-sm text-muted">{req.description}</p>}
      </div>
      <div className="shrink-0">
        <Button leftIcon={<Briefcase size={14} />} onClick={onApply}>
          Apply
        </Button>
      </div>
    </Card>
  )
}

interface ApplyResult {
  score: number
  rejected: boolean
  others: RoleMatch[]
}

function ApplyModal({ req, allReqs, onClose }: { req: PublicReq; allReqs: PublicReq[]; onClose: () => void }) {
  const { toast } = useToast()
  const questions = prescreenFor(req)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [referredBy, setReferredBy] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const allAnswered = questions.every((q) => (answers[q.id] ?? '').trim().length > 0)
  const canSubmit = fullName.trim().length > 0 && email.trim().length > 0 && allAnswered

  function candidateText(): string {
    return [resumeText, fullName, linkedin, ...questions.map((q) => answers[q.id] ?? '')].join(' ')
  }
  function screeningPayload() {
    return questions.map((q) => ({ question_id: q.id, question: q.question, answer: (answers[q.id] ?? '').trim() }))
  }

  async function submit() {
    if (fullName.trim().length === 0 || email.trim().length === 0) {
      toast({ tone: 'error', title: 'Name and email are required' })
      return
    }
    if (!allAnswered) {
      toast({ tone: 'error', title: 'Please answer all screening questions' })
      return
    }
    setSubmitting(true)
    const text = candidateText()
    const score = careerMatchScore(text, req)
    const rejected = score < CAREER_MATCH_THRESHOLD
    const { error } = await applyToRequisition({
      requisitionId: req.id,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      resume_text: resumeText.trim() || undefined,
      intake: { linkedin: linkedin.trim(), referred_by: referredBy.trim() },
      screening: screeningPayload(),
      status: rejected ? 'rejected' : 'active',
      reject_reason: rejected ? `Auto-screened: ${score}% match to role requirements (below ${CAREER_MATCH_THRESHOLD}% threshold)` : undefined,
      match_score: score,
    })
    if (error) {
      setSubmitting(false)
      toast({ tone: 'error', title: 'Could not submit application', description: error })
      return
    }
    const others = otherMatchingRoles(text, allReqs, req.id)
    setSubmitting(false)
    setResult({ score, rejected, others })
  }

  async function oneClickApply(m: RoleMatch) {
    setApplyingId(m.req.id)
    const { error } = await applyToRequisition({
      requisitionId: m.req.id,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      resume_text: resumeText.trim() || undefined,
      intake: { linkedin: linkedin.trim(), referred_by: referredBy.trim(), one_click: true },
      screening: screeningPayload(),
      status: 'active',
      match_score: m.score,
    })
    setApplyingId(null)
    if (error) {
      toast({ tone: 'error', title: 'Could not apply', description: error })
      return
    }
    setAppliedIds((s) => new Set(s).add(m.req.id))
    toast({ tone: 'success', title: `Applied to ${m.req.title}` })
  }

  if (result) {
    return (
      <Modal title={result.rejected ? 'Thanks for applying' : 'Application received'} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <div className="space-y-4">
          {result.rejected ? (
            <p className="text-sm text-ink">
              Thanks for your interest in <strong>{req.title}</strong>. Based on your responses, this role isn't a
              strong match right now ({result.score}% match to the listed requirements), so we won't move it forward —
              but please see below.
            </p>
          ) : (
            <p className="text-sm text-ink">
              Thanks — we received your application for <strong>{req.title}</strong> ({result.score}% match). Our
              recruiting team will be in touch.
            </p>
          )}

          {result.others.length > 0 ? (
            <div className="rounded-lg border border-line bg-paper/60 p-3">
              <div className="text-sm font-semibold text-ink">You're a strong match for these openings</div>
              <p className="mb-2 text-[11px] text-muted">Apply in one click — we'll reuse the details you just entered.</p>
              <div className="space-y-2">
                {result.others.map((m) => {
                  const applied = appliedIds.has(m.req.id)
                  const place = [m.req.facility?.city, m.req.facility?.state].filter(Boolean).join(', ')
                  return (
                    <div key={m.req.id} className="flex items-center justify-between gap-3 rounded border border-line bg-surface px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{m.req.title}</div>
                        <div className="truncate text-xs text-muted">
                          {[m.req.facility?.name, place].filter(Boolean).join(' · ') || m.req.role_family} · {m.score}% match
                        </div>
                      </div>
                      <Button size="sm" variant={applied ? 'secondary' : 'primary'} disabled={applied} loading={applyingId === m.req.id} onClick={() => oneClickApply(m)}>
                        {applied ? 'Applied' : 'Apply'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">We'll keep your information on file and reach out if a better-matched role opens up.</p>
          )}
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={`Apply — ${req.title}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submitting} disabled={!canSubmit} onClick={submit}>
            Submit application
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
        />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        <Input label="LinkedIn" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="URL (optional)" />
        <Input label="Referred by" value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Who referred you? (optional)" />
        <div>
          <label className="label">Resume / summary</label>
          <textarea
            className="input min-h-[100px]"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            placeholder="Paste your resume or a short summary (optional)"
          />
        </div>

        {/* Pre-application screening — answered as part of the application. */}
        <div className="space-y-3 rounded-lg border border-line bg-paper/60 p-3">
          <div className="text-sm font-semibold text-ink">Pre-application screening</div>
          <p className="text-[11px] text-muted">A few quick questions so our recruiters can match you faster. All are required.</p>
          {questions.map((q, i) => (
            <div key={q.id}>
              <label className="label">
                {i + 1}. {q.question}
              </label>
              <textarea
                className="input min-h-[64px]"
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                placeholder="Your answer"
              />
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted">
          This application is assisted by AI screening and matching to help our recruiters review your
          responses. By applying you consent to us storing your information for recruiting.
        </p>
      </div>
    </Modal>
  )
}
