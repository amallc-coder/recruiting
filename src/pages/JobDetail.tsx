import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Pencil, Plus, MapPin, Briefcase, Loader2, CalendarPlus, FileText } from 'lucide-react'
import { supabase, selectAll } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatSalary, submitApplication, setApplicationStage, scheduleInterview, createOffer } from '../lib/ats'
import {
  STAGES, STAGE_LABELS, PIPELINE_STAGES, EMPLOYMENT_LABELS, WORKPLACE_LABELS, ROLE_LABELS,
  type Job, type Application, type Profile, type Facility, type Stage,
} from '../lib/types'
import { EmptyState, Modal, Spinner, StageBadge } from '../components/ui'
import { JobModal, JobStatusBadge } from './Jobs'

function bullets(text: string | null) {
  return (text ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
}

export function JobDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin, profile } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [apps, setApps] = useState<Application[]>([])
  const [recruiters, setRecruiters] = useState<Profile[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [action, setAction] = useState<{ app: Application; mode: 'interview' | 'offer' } | null>(null)

  const canManage = isAdmin || profile?.role === 'recruiter'

  async function load() {
    setLoading(true)
    const [{ data: jobData }, { data: appData }, { data: profData }, { data: facData }] =
      await Promise.all([
        supabase.from('jobs').select('*').eq('id', id).single(),
        selectAll('applications', '*', (q) => q.eq('job_id', id).order('created_at', { ascending: false })),
        supabase.from('profiles').select('id,full_name,email,role'),
        supabase.from('facilities').select('id,name,city,state'),
      ])
    setJob((jobData as Job) ?? null)
    setApps((appData as Application[]) ?? [])
    setRecruiters((profData as Profile[]) ?? [])
    setFacilities((facData as Facility[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const nameOf = (uid: string | null) => recruiters.find((r) => r.id === uid)?.full_name || '—'
  const facilityName = useMemo(
    () => facilities.find((f) => f.id === job?.facility_id)?.name ?? null,
    [facilities, job],
  )

  // Per-job funnel + source mix, computed from this job's applications.
  const jobStats = useMemo(() => {
    const idx = (s: Stage) => (s === 'active' ? PIPELINE_STAGES.length - 1 : PIPELINE_STAGES.indexOf(s))
    const interviewIdx = PIPELINE_STAGES.indexOf('interview')
    const total = apps.length
    const interviewed = apps.filter((a) => idx(a.stage) >= interviewIdx && a.stage !== 'declined' && a.stage !== 'no_response').length
    const offers = apps.filter((a) => a.stage === 'offer' || a.stage === 'accepted').length
    const hires = apps.filter((a) => a.stage === 'active').length
    const srcMap: Record<string, number> = {}
    for (const a of apps) { const s = (a.source || 'Unknown').trim() || 'Unknown'; srcMap[s] = (srcMap[s] ?? 0) + 1 }
    const sources = Object.entries(srcMap).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)
    return { total, interviewed, offers, hires, sources }
  }, [apps])

  async function setStatus(status: Job['status']) {
    if (!job) return
    await supabase.from('jobs').update({ status, updated_by: profile?.id ?? null }).eq('id', job.id)
    load()
  }

  async function moveStage(app: Application, stage: Stage) {
    await setApplicationStage(app, stage)
    setApps((cur) => cur.map((a) => (a.id === app.id ? { ...a, stage } : a)))
  }

  if (loading) return <Spinner label="Loading job…" />
  if (!job) return <EmptyState title="Job not found" hint="It may have been deleted." />

  const isLive = job.status === 'published' && job.visibility === 'public'

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/jobs')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> All jobs
      </button>

      {/* Header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-ink">{job.title}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {job.department && <span className="inline-flex items-center gap-1"><Briefcase size={13} /> {job.department}</span>}
              {job.location && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {job.location}</span>}
              <span>{EMPLOYMENT_LABELS[job.employment_type]}</span>
              <span>· {WORKPLACE_LABELS[job.workplace]}</span>
              {job.role && <span>· {ROLE_LABELS[job.role]}</span>}
              {formatSalary(job) && <span>· {formatSalary(job)}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isLive && (
              <a className="btn-secondary" href={`#/careers/${job.slug ?? job.id}`} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> View posting
              </a>
            )}
            {canManage && (
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                <Pencil size={15} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* Status quick-actions */}
        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {job.status !== 'published' && (
              <button className="btn-primary py-1.5" onClick={() => setStatus('published')}>Publish</button>
            )}
            {job.status === 'published' && (
              <button className="btn-secondary py-1.5" onClick={() => setStatus('paused')}>Pause</button>
            )}
            {job.status !== 'closed' && job.status !== 'archived' && (
              <button className="btn-secondary py-1.5" onClick={() => setStatus('closed')}>Close</button>
            )}
            {(job.status === 'closed' || job.status === 'paused' || job.status === 'archived') && (
              <button className="btn-secondary py-1.5" onClick={() => setStatus('draft')}>Move to draft</button>
            )}
          </div>
        )}
      </div>

      {/* Overview details */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {job.description && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">About this role</h2>
              <p className="whitespace-pre-wrap text-sm text-ink">{job.description}</p>
            </section>
          )}
          {bullets(job.responsibilities).length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Responsibilities</h2>
              <ul className="space-y-1 text-sm text-ink">
                {bullets(job.responsibilities).map((r, i) => <li key={i} className="flex gap-2"><span className="text-muted">•</span>{r}</li>)}
              </ul>
            </section>
          )}
          {bullets(job.requirements).length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Requirements</h2>
              <ul className="space-y-1 text-sm text-ink">
                {bullets(job.requirements).map((r, i) => <li key={i} className="flex gap-2"><span className="text-muted">•</span>{r}</li>)}
              </ul>
            </section>
          )}
          {bullets(job.benefits).length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Benefits</h2>
              <ul className="space-y-1 text-sm text-ink">
                {bullets(job.benefits).map((r, i) => <li key={i} className="flex gap-2"><span className="text-muted">•</span>{r}</li>)}
              </ul>
            </section>
          )}
        </div>
        <aside className="card h-fit p-5 text-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Details</h2>
          <dl className="space-y-2.5">
            <Row label="Openings" value={job.openings_remaining != null && job.openings_remaining !== job.openings ? `${job.openings_remaining} of ${job.openings} open` : String(job.openings)} />
            <Row label="Recruiter" value={nameOf(job.assigned_recruiter_id)} />
            <Row label="Hiring manager" value={nameOf(job.hiring_manager_id)} />
            {facilityName && <Row label="Facility" value={facilityName} />}
            <Row label="Visibility" value={job.visibility === 'public' ? 'Public' : 'Internal'} />
            <Row label="Created" value={new Date(job.created_at).toLocaleDateString()} />
          </dl>
        </aside>
      </div>

      {/* Per-job dashboard */}
      {apps.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Job performance</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Applicants', value: jobStats.total },
              { label: 'Interviewed', value: jobStats.interviewed },
              { label: 'Offers', value: jobStats.offers },
              { label: 'Hires', value: jobStats.hires },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-paper px-3 py-2.5">
                <div className="text-2xl font-semibold tnum text-ink">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
          {jobStats.sources.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-muted">Sources</div>
              <div className="space-y-1.5">
                {jobStats.sources.map((s) => (
                  <div key={s.source} className="flex items-center gap-2">
                    <div className="w-28 shrink-0 truncate text-xs text-muted" title={s.source}>{s.source}</div>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-paper">
                      <div className="h-full rounded bg-sage-400" style={{ width: `${Math.max(4, (s.count / jobStats.total) * 100)}%` }} />
                    </div>
                    <div className="w-6 text-right text-xs tnum text-muted">{s.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Applicants */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Applicants <span className="text-muted">({apps.length})</span></h2>
        {canManage && (
          <button className="btn-secondary" onClick={() => setAdding(true)}>
            <Plus size={15} /> Add applicant
          </button>
        )}
      </div>

      {apps.length === 0 ? (
        <EmptyState
          title="No applicants yet"
          hint={isLive ? 'Share your career page to start receiving applications.' : 'Publish this job to start receiving applications.'}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="min-w-full text-sm">
            <thead className="bg-paper text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Contact</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Source</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Applied</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {apps.map((a) => (
                <tr key={a.id} className="hover:bg-paper">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{a.full_name}</div>
                    {(a.linkedin || a.portfolio) && (
                      <div className="mt-0.5 flex gap-2 text-xs">
                        {a.linkedin && <a className="text-sage-700 hover:underline" href={a.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
                        {a.portfolio && <a className="text-sage-700 hover:underline" href={a.portfolio} target="_blank" rel="noreferrer">Portfolio</a>}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">
                    <div>{a.email ?? '—'}</div>
                    {a.phone && <div className="text-xs">{a.phone}</div>}
                  </td>
                  <td className="hidden px-4 py-3 text-muted lg:table-cell">{a.source ?? '—'}</td>
                  <td className="hidden px-4 py-3 text-muted lg:table-cell">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <select
                          className="rounded-md border-0 bg-surface py-1 text-xs text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-sage-500"
                          value={a.stage}
                          onChange={(e) => moveStage(a, e.target.value as Stage)}
                        >
                          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                        </select>
                      ) : (
                        <StageBadge stage={a.stage} />
                      )}
                      {canManage && a.candidate_id && (
                        <>
                          <button title="Schedule interview" className="text-muted hover:text-ink" onClick={() => setAction({ app: a, mode: 'interview' })}><CalendarPlus size={15} /></button>
                          <button title="Extend offer" className="text-muted hover:text-ink" onClick={() => setAction({ app: a, mode: 'offer' })}><FileText size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <JobModal
          job={job}
          recruiters={recruiters}
          facilities={facilities}
          currentUserId={profile?.id ?? null}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load() }}
        />
      )}
      {adding && (
        <AddApplicantModal job={job} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />
      )}
      {action && (
        <ApplicantActionModal
          app={action.app}
          mode={action.mode}
          job={job}
          recruiters={recruiters}
          onClose={() => setAction(null)}
          onSaved={() => setAction(null)}
        />
      )}
    </div>
  )
}

function ApplicantActionModal({ app, mode, job, recruiters, onClose, onSaved }: {
  app: Application
  mode: 'interview' | 'offer'
  job: Job
  recruiters: Profile[]
  onClose: () => void
  onSaved: () => void
}) {
  const [when, setWhen] = useState('')
  const [interviewerId, setInterviewerId] = useState('')
  const [location, setLocation] = useState('Video call')
  const [salary, setSalary] = useState(job.salary_max?.toString() ?? job.salary_min?.toString() ?? '')
  const [startDate, setStartDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!app.candidate_id) { setError('This applicant has no linked candidate yet.'); return }
    setSaving(true); setError(null)
    const res = mode === 'interview'
      ? await scheduleInterview({ candidate_id: app.candidate_id, job_id: job.id, scheduled_at: when ? new Date(when).toISOString() : new Date().toISOString(), interviewer_id: interviewerId || null, location })
      : await createOffer({ candidate_id: app.candidate_id, job_id: job.id, salary: salary ? Number(salary) : null, start_date: startDate || null, status: 'sent' })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    onSaved()
  }

  return (
    <Modal title={mode === 'interview' ? `Schedule interview — ${app.full_name}` : `Extend offer — ${app.full_name}`} onClose={onClose}>
      <div className="space-y-3">
        {mode === 'interview' ? (
          <>
            <div>
              <label className="label">Date & time</label>
              <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div>
              <label className="label">Interviewer</label>
              <select className="input" value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)}>
                <option value="">— unassigned —</option>
                {recruiters.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Video call or room" />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">Salary</label>
              <input className="input" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="Annual salary" />
            </div>
            <div>
              <label className="label">Start date</label>
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </>
        )}
        {error && <div className="rounded-lg bg-rust-50 px-3 py-2 text-sm text-rust-500">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null} {mode === 'interview' ? 'Schedule' : 'Send offer'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}

function AddApplicantModal({ job, onClose, onSaved }: { job: Job; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [resume, setResume] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!fullName.trim()) return
    setSaving(true); setError(null)
    const { error } = await submitApplication({
      job, full_name: fullName, email, phone, resume_text: resume, source: 'Manual',
    })
    setSaving(false)
    if (error) { setError(error); return }
    onSaved()
  }

  return (
    <Modal title="Add applicant" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Resume / summary <span className="font-normal text-muted">(for AI matching)</span></label>
          <textarea className="input min-h-[80px]" value={resume} onChange={(e) => setResume(e.target.value)} />
        </div>
        {error && <div className="rounded-lg bg-rust-50 px-3 py-2 text-sm text-rust-500">{error}</div>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || !fullName.trim()}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null} Add to pipeline
          </button>
        </div>
      </div>
    </Modal>
  )
}
