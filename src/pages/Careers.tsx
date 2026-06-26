import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Search, MapPin, Briefcase, ArrowLeft, CheckCircle2, Loader2, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatSalary, submitApplication } from '../lib/ats'
import { EMPLOYMENT_LABELS, WORKPLACE_LABELS, type Job } from '../lib/types'

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-line">
        <svg width="20" height="17" viewBox="0 0 24 20" aria-hidden>
          <rect x="3" y="2.5" width="11" height="3.6" rx="1.8" fill="#d2774a" />
          <rect x="3" y="8.2" width="18" height="3.6" rx="1.8" fill="#26221f" />
          <rect x="3" y="13.9" width="14" height="3.6" rx="1.8" fill="#26221f" />
        </svg>
      </span>
      <span className="text-[18px] font-bold lowercase tracking-tight text-ink">clinilytics</span>
      <span className="rounded-full bg-sage-50 px-2.5 py-0.5 text-xs font-medium text-sage-700 ring-1 ring-inset ring-sage-100">
        Careers
      </span>
    </div>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-6">
          <a href="#/careers"><Brand /></a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-5 font-mono text-[11px] tracking-wide text-muted sm:px-6">
          © 2026 American Medical Administrators — we are an equal opportunity employer.
        </div>
      </footer>
    </div>
  )
}

export function Careers() {
  const { slug } = useParams()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.from('jobs').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (!active) return
      const open = ((data as Job[]) ?? []).filter((j) => j.status === 'published' && j.visibility === 'public')
      setJobs(open)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  if (slug) {
    const job = jobs.find((j) => j.slug === slug || j.id === slug)
    return (
      <PublicShell>
        <JobPosting job={job} loading={loading} />
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <JobList jobs={jobs} loading={loading} />
    </PublicShell>
  )
}

function JobList({ jobs, loading }: { jobs: Job[]; loading: boolean }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('all')
  const [loc, setLoc] = useState('all')

  const departments = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.department).filter(Boolean) as string[])).sort(),
    [jobs],
  )
  const locations = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.location).filter(Boolean) as string[])).sort(),
    [jobs],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return jobs.filter((j) => {
      if (dept !== 'all' && j.department !== dept) return false
      if (loc !== 'all' && j.location !== loc) return false
      if (!needle) return true
      return (
        j.title.toLowerCase().includes(needle) ||
        (j.department ?? '').toLowerCase().includes(needle) ||
        (j.location ?? '').toLowerCase().includes(needle)
      )
    })
  }, [jobs, q, dept, loc])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Open positions</h1>
        <p className="mt-1 text-muted">Join our team. {jobs.length} role{jobs.length !== 1 ? 's' : ''} open.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-muted" />
          <input className="input pl-9" placeholder="Search roles…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input sm:w-48" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="input sm:w-48" value={loc} onChange={(e) => setLoc(e.target.value)}>
          <option value="all">All locations</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-muted"><Loader2 className="animate-spin" size={18} /> Loading roles…</div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <div className="text-base font-medium text-ink">No open roles right now</div>
          <div className="mt-1 text-sm text-muted">Check back soon — new positions are posted regularly.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((j) => (
            <button
              key={j.id}
              onClick={() => navigate(`/careers/${j.slug ?? j.id}`)}
              className="card group flex w-full items-center justify-between gap-4 p-5 text-left transition-shadow hover:shadow-md"
            >
              <div>
                <div className="text-lg font-medium text-ink group-hover:text-sage-700">{j.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  {j.department && <span className="inline-flex items-center gap-1"><Briefcase size={13} /> {j.department}</span>}
                  {j.location && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {j.location}</span>}
                  <span>{EMPLOYMENT_LABELS[j.employment_type]}</span>
                  <span>· {WORKPLACE_LABELS[j.workplace]}</span>
                  {formatSalary(j) && <span className="font-medium text-ink">· {formatSalary(j)}</span>}
                </div>
              </div>
              <span className="hidden shrink-0 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper group-hover:bg-ink/90 sm:inline-block">
                View & apply
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function bullets(text: string | null) {
  return (text ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
}

function JobPosting({ job, loading }: { job: Job | undefined; loading: boolean }) {
  const navigate = useNavigate()
  const [applied, setApplied] = useState(false)

  if (loading) return <div className="flex items-center gap-2 py-12 text-muted"><Loader2 className="animate-spin" size={18} /> Loading…</div>
  if (!job) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/careers')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} /> All openings
        </button>
        <div className="card py-16 text-center">
          <div className="text-base font-medium text-ink">This role is no longer open</div>
          <div className="mt-1 text-sm text-muted">Browse our other openings.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/careers')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} /> All openings
      </button>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{job.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {job.department && <span className="inline-flex items-center gap-1"><Briefcase size={13} /> {job.department}</span>}
          {job.location && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {job.location}</span>}
          <span>{EMPLOYMENT_LABELS[job.employment_type]}</span>
          <span>· {WORKPLACE_LABELS[job.workplace]}</span>
          {formatSalary(job) && <span className="font-medium text-ink">· {formatSalary(job)}</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          {job.description && <section><p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{job.description}</p></section>}
          {bullets(job.responsibilities).length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold text-ink">What you'll do</h2>
              <ul className="space-y-1 text-sm text-ink">
                {bullets(job.responsibilities).map((r, i) => <li key={i} className="flex gap-2"><span className="text-sage-600">•</span>{r}</li>)}
              </ul>
            </section>
          )}
          {bullets(job.requirements).length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold text-ink">What we're looking for</h2>
              <ul className="space-y-1 text-sm text-ink">
                {bullets(job.requirements).map((r, i) => <li key={i} className="flex gap-2"><span className="text-sage-600">•</span>{r}</li>)}
              </ul>
            </section>
          )}
          {bullets(job.benefits).length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold text-ink">Benefits</h2>
              <ul className="space-y-1 text-sm text-ink">
                {bullets(job.benefits).map((r, i) => <li key={i} className="flex gap-2"><span className="text-sage-600">•</span>{r}</li>)}
              </ul>
            </section>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="card sticky top-20 p-5">
            {applied ? (
              <div className="py-6 text-center">
                <CheckCircle2 size={36} className="mx-auto text-sage-600" />
                <div className="mt-3 text-lg font-semibold text-ink">Application received</div>
                <p className="mt-1 text-sm text-muted">Thanks for applying to <strong>{job.title}</strong>. Our recruiting team will be in touch.</p>
                <button className="btn-secondary mt-4" onClick={() => navigate('/careers')}>Browse more roles</button>
              </div>
            ) : (
              <ApplyForm job={job} onApplied={() => setApplied(true)} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ApplyForm({ job, onApplied }: { job: Job; onApplied: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [portfolio, setPortfolio] = useState('')
  const [cover, setCover] = useState('')
  const [resume, setResume] = useState('')
  const [resumeName, setResumeName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onResumeFile(file: File) {
    setResumeName(file.name)
    // Read text-based resumes inline so AI matching has content. Binary formats
    // (PDF/DOCX) are noted by filename; storage upload is a later enhancement.
    if (/\.(txt|md|csv)$/i.test(file.name) || file.type.startsWith('text/')) {
      try { setResume(await file.text()) } catch { /* ignore */ }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) return
    setSubmitting(true); setError(null)
    const resumeText = [resume, resumeName && !resume ? `Resume on file: ${resumeName}` : '']
      .filter(Boolean).join('\n') || undefined
    const { error } = await submitApplication({
      job, full_name: fullName, email, phone, linkedin, portfolio,
      cover_letter: cover, resume_text: resumeText,
    })
    setSubmitting(false)
    if (error) { setError(error); return }
    onApplied()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="text-lg font-semibold text-ink">Apply now</div>
      <div>
        <label className="label">Full name *</label>
        <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">LinkedIn</label>
          <input className="input" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="URL" />
        </div>
        <div>
          <label className="label">Portfolio</label>
          <input className="input" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="URL" />
        </div>
      </div>
      <div>
        <label className="label">Resume</label>
        <input
          type="file" accept=".pdf,.doc,.docx,.txt,.md"
          className="block w-full text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-paper file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-brand-50"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onResumeFile(f) }}
        />
        {resumeName && <p className="mt-1 text-xs text-muted">{resumeName}</p>}
        <textarea
          className="input mt-2 min-h-[70px]" placeholder="…or paste your resume / a short summary"
          value={resume} onChange={(e) => setResume(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Cover letter <span className="font-normal text-muted">(optional)</span></label>
        <textarea className="input min-h-[70px]" value={cover} onChange={(e) => setCover(e.target.value)} />
      </div>
      {error && <div className="rounded-lg bg-rust-50 px-3 py-2 text-sm text-rust-500">{error}</div>}
      <button type="submit" className="btn-primary w-full" disabled={submitting || !fullName.trim()}>
        {submitting ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />} Submit application
      </button>
      <p className="text-center text-[11px] text-muted">By applying you consent to us storing your information for recruiting.</p>
    </form>
  )
}
