import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Loader2, Sparkles, ExternalLink, MapPin, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { generateRole } from '../lib/positions'
import { formatSalary, slugify } from '../lib/ats'
import {
  CLINICAL_ROLES, ROLE_LABELS, DEFAULT_COMPANY_ID,
  JOB_STATUSES, JOB_STATUS_LABELS, EMPLOYMENT_TYPES, EMPLOYMENT_LABELS,
  WORKPLACE_TYPES, WORKPLACE_LABELS,
  type Job, type JobStatus, type EmploymentType, type Workplace,
  type ClinicalRole, type Profile, type Facility,
} from '../lib/types'
import { EmptyState, Modal, Spinner } from '../components/ui'

const STATUS_STYLE: Record<JobStatus, string> = {
  draft: 'bg-brand-50 text-muted',
  published: 'bg-sage-100 text-sage-700',
  paused: 'bg-clay-50 text-clay-600',
  closed: 'bg-rust-50 text-rust-500',
  archived: 'bg-brand-50 text-muted',
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {JOB_STATUS_LABELS[status]}
    </span>
  )
}

export function Jobs() {
  const { isAdmin, profile } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [recruiters, setRecruiters] = useState<Profile[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<JobStatus | 'all'>('all')
  const [editing, setEditing] = useState<Job | 'new' | null>(null)

  // Recruiters can manage their own jobs; admins manage all.
  const canManage = isAdmin || profile?.role === 'recruiter'

  async function load() {
    setLoading(true)
    const [{ data: jobData }, { data: profData }, { data: facData }, { data: appData }] =
      await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id,full_name,email,role'),
        supabase.from('facilities').select('id,name,city,state'),
        supabase.from('applications').select('job_id'),
      ])
    setJobs((jobData as Job[]) ?? [])
    setRecruiters((profData as Profile[]) ?? [])
    setFacilities((facData as Facility[]) ?? [])
    const c: Record<string, number> = {}
    for (const a of (appData as { job_id: string }[]) ?? []) c[a.job_id] = (c[a.job_id] ?? 0) + 1
    setCounts(c)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const recruiterName = (id: string | null) =>
    recruiters.find((r) => r.id === id)?.full_name || null

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return jobs.filter((j) => {
      if (status !== 'all' && j.status !== status) return false
      if (!needle) return true
      return (
        j.title.toLowerCase().includes(needle) ||
        (j.department ?? '').toLowerCase().includes(needle) ||
        (j.location ?? '').toLowerCase().includes(needle)
      )
    })
  }, [jobs, q, status])

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: jobs.length }
    for (const s of JOB_STATUSES) c[s] = jobs.filter((j) => j.status === s).length
    return c
  }, [jobs])

  // "Open positions" = sum of remaining (or total) openings on published jobs.
  const openStats = useMemo(() => {
    const published = jobs.filter((j) => j.status === 'published')
    const openPositions = published.reduce((s, j) => s + (j.openings_remaining ?? j.openings ?? 1), 0)
    return { publishedReqs: published.length, openPositions }
  }, [jobs])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Jobs</h1>
          <p className="text-sm text-muted">
            <strong className="text-ink">{openStats.openPositions}</strong> open position{openStats.openPositions !== 1 ? 's' : ''} across{' '}
            {openStats.publishedReqs} published requisition{openStats.publishedReqs !== 1 ? 's' : ''} · {jobs.length} total.
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn-secondary" href="#/careers" target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Career page
          </a>
          {canManage && (
            <button className="btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> New job
            </button>
          )}
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {[{ key: 'all', label: 'All' }, ...JOB_STATUSES.map((s) => ({ key: s, label: JOB_STATUS_LABELS[s] }))].map((s) => (
          <button
            key={s.key}
            onClick={() => setStatus(s.key as JobStatus | 'all')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
              status === s.key ? 'bg-ink text-paper ring-ink' : 'bg-surface text-muted ring-line hover:bg-paper'
            }`}
          >
            {s.label} <span className="opacity-70">{statusCounts[s.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-muted" />
        <input
          className="input pl-9"
          placeholder="Search title, department, or location…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <Spinner label="Loading jobs…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={jobs.length === 0 ? 'No jobs yet' : 'No jobs match'}
          hint={jobs.length === 0 ? 'Create your first opening to start receiving applications.' : 'Try a different filter or search.'}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="min-w-full text-sm">
            <thead className="bg-paper text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Location</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Recruiter</th>
                <th className="px-4 py-2.5 text-right font-medium">Applicants</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((j) => (
                <tr
                  key={j.id}
                  onClick={() => navigate(`/jobs/${j.id}`)}
                  className="cursor-pointer hover:bg-paper"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{j.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      {j.department && <span>{j.department}</span>}
                      <span>· {EMPLOYMENT_LABELS[j.employment_type]}</span>
                      <span>· {WORKPLACE_LABELS[j.workplace]}</span>
                      {(j.openings > 1 || j.openings_remaining != null) && (
                        <span className="font-medium text-ink">
                          · {j.openings_remaining != null && j.openings_remaining !== j.openings
                            ? `${j.openings_remaining} of ${j.openings}`
                            : j.openings} open
                        </span>
                      )}
                      {formatSalary(j) && <span>· {formatSalary(j)}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><JobStatusBadge status={j.status} /></td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">
                    {j.location ? (
                      <span className="inline-flex items-center gap-1"><MapPin size={12} /> {j.location}</span>
                    ) : '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted lg:table-cell">{recruiterName(j.assigned_recruiter_id) ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 font-medium text-ink">
                      <Users size={13} className="text-muted" /> {counts[j.id] ?? 0}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <JobModal
          job={editing === 'new' ? null : editing}
          recruiters={recruiters}
          facilities={facilities}
          currentUserId={profile?.id ?? null}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

export function JobModal({
  job, recruiters, facilities, currentUserId, onClose, onSaved,
}: {
  job: Job | null
  recruiters: Profile[]
  facilities: Facility[]
  currentUserId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(job?.title ?? '')
  const [department, setDepartment] = useState(job?.department ?? '')
  const [location, setLocation] = useState(job?.location ?? '')
  const [employment, setEmployment] = useState<EmploymentType>(job?.employment_type ?? 'full_time')
  const [workplace, setWorkplace] = useState<Workplace>(job?.workplace ?? 'onsite')
  const [role, setRole] = useState<ClinicalRole | ''>(job?.role ?? '')
  const [facilityId, setFacilityId] = useState(job?.facility_id ?? '')
  const [recruiterId, setRecruiterId] = useState(job?.assigned_recruiter_id ?? currentUserId ?? '')
  const [hiringManagerId, setHiringManagerId] = useState(job?.hiring_manager_id ?? '')
  const [salaryMin, setSalaryMin] = useState(job?.salary_min?.toString() ?? '')
  const [salaryMax, setSalaryMax] = useState(job?.salary_max?.toString() ?? '')
  const [salaryUnit, setSalaryUnit] = useState<'year' | 'hour'>(job?.salary_unit ?? 'year')
  const [description, setDescription] = useState(job?.description ?? '')
  const [responsibilities, setResponsibilities] = useState(job?.responsibilities ?? '')
  const [requirements, setRequirements] = useState(job?.requirements ?? '')
  const [benefits, setBenefits] = useState(job?.benefits ?? '')
  const [status, setStatus] = useState<JobStatus>(job?.status ?? 'draft')
  const [visibility, setVisibility] = useState<'public' | 'internal'>(job?.visibility ?? 'public')
  const [openings, setOpenings] = useState(job?.openings?.toString() ?? '1')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function runAi() {
    if (!title.trim()) { setAiNote('Enter a title first.'); return }
    setAiBusy(true); setAiNote(null)
    const r = await generateRole(title.trim(), undefined, department || location || undefined)
    if (r.responsibilities.length) setResponsibilities(r.responsibilities.join('\n'))
    if (r.requirements.length) setRequirements(r.requirements.join('\n'))
    if (!description.trim() && r.responsibilities.length) {
      setDescription(`We're hiring a ${title.trim()}${location ? ` in ${location}` : ''}. ` +
        `Join our team and make an impact from day one.`)
    }
    if (r.rate_min != null) setSalaryMin(String(r.rate_min))
    if (r.rate_max != null) setSalaryMax(String(r.rate_max))
    if (r.rate_unit === 'Hourly') setSalaryUnit('hour')
    else if (r.rate_unit === 'Annual') setSalaryUnit('year')
    setAiNote(r.method === 'ai' ? 'Drafted with Claude.' : 'Drafted with the built-in template (deploy ai-role for Claude).')
    setAiBusy(false)
  }

  async function save() {
    setSaving(true)
    const patch: Record<string, unknown> = {
      title: title.trim(),
      department: department.trim() || null,
      location: location.trim() || null,
      employment_type: employment,
      workplace,
      role: role || null,
      facility_id: facilityId || null,
      assigned_recruiter_id: recruiterId || null,
      hiring_manager_id: hiringManagerId || null,
      salary_min: salaryMin ? Number(salaryMin) : null,
      salary_max: salaryMax ? Number(salaryMax) : null,
      salary_unit: salaryUnit,
      description: description.trim() || null,
      responsibilities: responsibilities.trim() || null,
      requirements: requirements.trim() || null,
      benefits: benefits.trim() || null,
      status,
      visibility,
      openings: openings ? Math.max(1, Number(openings)) : 1,
      slug: slugify(title) + '-' + (job?.id ?? '').slice(0, 4) || slugify(title),
      updated_by: currentUserId,
    }
    if (job) {
      await supabase.from('jobs').update(patch).eq('id', job.id)
    } else {
      await supabase.from('jobs').insert({
        ...patch,
        company_id: DEFAULT_COMPANY_ID,
        created_by: currentUserId,
        slug: slugify(title),
      })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <Modal title={job ? 'Edit job' : 'New job'} onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <div className="flex gap-2">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Licensed Practical Nurse (LPN)" />
            <button className="btn-secondary shrink-0" onClick={runAi} disabled={aiBusy}>
              {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} AI draft
            </button>
          </div>
          {aiNote && <p className="mt-1 text-xs text-muted">{aiNote}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Department</label>
            <input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Nursing" />
          </div>
          <div>
            <label className="label">Location</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Kansas City, MO" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Employment type</label>
            <select className="input" value={employment} onChange={(e) => setEmployment(e.target.value as EmploymentType)}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Workplace</label>
            <select className="input" value={workplace} onChange={(e) => setWorkplace(e.target.value as Workplace)}>
              {WORKPLACE_TYPES.map((t) => <option key={t} value={t}>{WORKPLACE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Role type</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as ClinicalRole | '')}>
              <option value="">— none —</option>
              {CLINICAL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Assigned recruiter</label>
            <select className="input" value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)}>
              <option value="">— unassigned —</option>
              {recruiters.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Hiring manager</label>
            <select className="input" value={hiringManagerId} onChange={(e) => setHiringManagerId(e.target.value)}>
              <option value="">— none —</option>
              {recruiters.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Facility <span className="font-normal text-muted">(optional)</span></label>
            <select className="input" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              <option value="">— none —</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Pay range</label>
            <div className="flex items-center gap-1">
              <input className="input" type="number" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} placeholder="min" />
              <span className="text-muted">–</span>
              <input className="input" type="number" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} placeholder="max" />
              <select className="input w-24" value={salaryUnit} onChange={(e) => setSalaryUnit(e.target.value as 'year' | 'hour')}>
                <option value="year">/yr</option>
                <option value="hour">/hr</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Responsibilities <span className="font-normal text-muted">(one per line)</span></label>
            <textarea className="input min-h-[100px]" value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} />
          </div>
          <div>
            <label className="label">Requirements <span className="font-normal text-muted">(one per line)</span></label>
            <textarea className="input min-h-[100px]" value={requirements} onChange={(e) => setRequirements(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Benefits <span className="font-normal text-muted">(one per line)</span></label>
          <textarea className="input min-h-[60px]" value={benefits} onChange={(e) => setBenefits(e.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Openings</label>
            <input className="input" type="number" min="1" value={openings} onChange={(e) => setOpenings(e.target.value)} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
              {JOB_STATUSES.map((s) => <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Visibility</label>
            <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'internal')}>
              <option value="public">Public (on career page)</option>
              <option value="internal">Internal only</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          <p className="text-xs text-muted">
            {status === 'published' && visibility === 'public'
              ? 'This job will be live on your public career page.'
              : 'Set status to Published + Public to list it on the career page.'}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !title.trim()}>
              {saving ? 'Saving…' : job ? 'Save changes' : 'Create job'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
