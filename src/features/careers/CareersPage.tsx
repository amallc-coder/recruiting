import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapPin, Briefcase, Search, X, Link2, ArrowLeft } from 'lucide-react'
import { Button, Card, Badge, Input, Modal, useToast } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import {
  listPublicRequisitions,
  getPublicRequisition,
  applyToRequisition,
  salaryLabel,
  prescreenFor,
  careerMatchScore,
  otherMatchingRoles,
  jobSlug,
  jobUrl,
  reqIdFromSlug,
  CAREER_MATCH_THRESHOLD,
  type PublicReq,
  type RoleMatch,
} from '../../lib/v2/careers'
import { getOrgHierarchy, type OrgHierarchy } from '../../lib/v2/hierarchy'

/**
 * PUBLIC careers page (v2). Renders OUTSIDE the authenticated app shell. With a
 * `:slug` route param it shows a single shareable job page; otherwise the full
 * filterable listing.
 */
export function CareersPage() {
  const { slug } = useParams<{ slug: string }>()
  return slug ? <JobDetailPage slug={slug} /> : <CareersList />
}

function CareersList() {
  const [reqs, setReqs] = useState<PublicReq[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<PublicReq | null>(null)
  const [hier, setHier] = useState<OrgHierarchy | null>(null)
  const [divisionKey, setDivisionKey] = useState('') // index into hier.divisions
  const [stateFilter, setStateFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
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
  // Facilities that actually have open roles, enriched with state/city/division —
  // the hierarchy nodes don't carry location, so derive it from the postings.
  const facilityMeta = useMemo(() => {
    const m = new Map<string, { id: string; name: string; state: string | null; city: string | null; divKey: string }>()
    for (const r of reqs) {
      if (!r.facility_id || m.has(r.facility_id)) continue
      m.set(r.facility_id, {
        id: r.facility_id,
        name: r.facility?.name ?? 'Facility',
        state: r.facility?.state ?? null,
        city: r.facility?.city ?? null,
        divKey: facilityToDivKey.get(r.facility_id) ?? '',
      })
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [reqs, facilityToDivKey])

  const states = useMemo(
    () => [...new Set(facilityMeta.map((f) => f.state).filter(Boolean) as string[])].sort(),
    [facilityMeta],
  )
  // Cities are contextual to the selected state.
  const cities = useMemo(
    () =>
      [
        ...new Set(
          facilityMeta.filter((f) => !stateFilter || f.state === stateFilter).map((f) => f.city).filter(Boolean) as string[],
        ),
      ].sort(),
    [facilityMeta, stateFilter],
  )
  // Facility list is contextual to both the chosen division and state.
  const facilityOptions = useMemo(
    () => facilityMeta.filter((f) => (!divisionKey || f.divKey === divisionKey) && (!stateFilter || f.state === stateFilter)),
    [facilityMeta, divisionKey, stateFilter],
  )
  const departmentOptions = facilityId
    ? divisions.flatMap((d) => d.facilities).find((f) => f.id === facilityId)?.departments ?? []
    : []
  // Division quick-filter chips — only divisions that have open roles.
  const divisionChips = useMemo(() => {
    const present = new Set(facilityMeta.map((f) => f.divKey))
    return divisions.map((d, i) => ({ key: String(i), name: d.name })).filter((d) => present.has(d.key))
  }, [divisions, facilityMeta])

  const term = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    return reqs.filter((r) => {
      if (divisionKey && (r.facility_id == null || facilityToDivKey.get(r.facility_id) !== divisionKey)) return false
      if (stateFilter && r.facility?.state !== stateFilter) return false
      if (cityFilter && r.facility?.city !== cityFilter) return false
      if (facilityId && r.facility_id !== facilityId) return false
      if (departmentId && r.department_id !== departmentId) return false
      if (role && r.role_family !== role) return false
      if (term) {
        const hay = [r.title, r.specialty, r.location, r.facility?.name, r.facility?.city, r.facility?.state, r.description].join(' ').toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [reqs, divisionKey, stateFilter, cityFilter, facilityId, departmentId, role, term, facilityToDivKey])

  const anyFilter = !!(divisionKey || stateFilter || cityFilter || facilityId || departmentId || role || term)
  function clearFilters() {
    setDivisionKey(''); setStateFilter(''); setCityFilter(''); setFacilityId(''); setDepartmentId(''); setRole(''); setSearch('')
  }
  // Picking a division or state narrows what's below it, so reset the dependents.
  function selectDivision(key: string) {
    setDivisionKey(key); setFacilityId(''); setDepartmentId('')
  }
  function selectState(s: string) {
    setStateFilter(s); setCityFilter(''); setFacilityId(''); setDepartmentId('')
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
              {/* Division quick-filter chips */}
              {divisionChips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => selectDivision('')}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${divisionKey === '' ? 'bg-ink text-paper' : 'bg-brand-50 text-muted hover:text-ink'}`}
                  >
                    All
                  </button>
                  {divisionChips.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => selectDivision(d.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${divisionKey === d.key ? 'bg-ink text-paper' : 'bg-brand-50 text-muted hover:text-ink'}`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <select className="input" value={stateFilter} onChange={(e) => selectState(e.target.value)}>
                  <option value="">All states</option>
                  {states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select className="input" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
                  <option value="">All cities</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select className="input" value={facilityId} onChange={(e) => { setFacilityId(e.target.value); setDepartmentId('') }}>
                  <option value="">All facilities</option>
                  {facilityOptions.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!facilityId}>
                  <option value="">All departments</option>
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
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard?.writeText(jobUrl(req))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <Link to={`/careers/${jobSlug(req)}`} className="block text-lg font-semibold tracking-tight text-ink hover:text-sage-700 hover:underline">
          {req.title}
        </Link>
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
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={copy} title="Copy shareable link" className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-xs text-muted hover:border-ink hover:text-ink">
          <Link2 size={14} /> {copied ? 'Copied' : 'Link'}
        </button>
        <Button leftIcon={<Briefcase size={14} />} onClick={onApply}>
          Apply
        </Button>
      </div>
    </Card>
  )
}

/** Dedicated, shareable single-job page (#/careers/:slug). */
function JobDetailPage({ slug }: { slug: string }) {
  const { toast } = useToast()
  const [req, setReq] = useState<PublicReq | null | undefined>(undefined)
  const [allReqs, setAllReqs] = useState<PublicReq[]>([])
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let active = true
    getPublicRequisition(reqIdFromSlug(slug)).then((r) => active && setReq(r))
    listPublicRequisitions().then((d) => active && setAllReqs(d))
    return () => {
      active = false
    }
  }, [slug])

  const place = req ? [req.facility?.city, req.facility?.state].filter(Boolean).join(', ') : ''
  const salary = req ? salaryLabel(req) : null

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <Link to="/careers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft size={15} /> All openings
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {req === undefined ? (
          <Spinner label="Loading role…" />
        ) : req === null ? (
          <EmptyState title="This role isn't available" hint="It may have been filled or closed. Browse our other open roles." />
        ) : (
          <Card className="space-y-5 p-6">
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">{req.title}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="sage">{req.role_family}</Badge>
                {req.employment_type && <Badge tone="neutral">{req.employment_type}</Badge>}
                {req.workplace && <Badge tone="clay">{req.workplace}</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                {(req.facility?.name || place) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={14} /> {[req.facility?.name, place].filter(Boolean).join(' · ')}
                  </span>
                )}
                {salary && <span className="font-medium text-ink">{salary}</span>}
              </div>
            </div>

            {req.description && (
              <div>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">About this role</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{req.description}</p>
              </div>
            )}
            {req.requirements && (
              <div>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Requirements</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{req.requirements}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button leftIcon={<Briefcase size={15} />} onClick={() => setApplying(true)}>
                Apply for this role
              </Button>
              <button
                onClick={() => { navigator.clipboard?.writeText(jobUrl(req)); toast({ tone: 'success', title: 'Link copied', description: 'Share this role anywhere.' }) }}
                className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
              >
                <Link2 size={15} /> Copy shareable link
              </button>
            </div>
          </Card>
        )}
      </main>

      {applying && req && <ApplyModal req={req} allReqs={allReqs.length ? allReqs : [req]} onClose={() => setApplying(false)} />}
    </div>
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
