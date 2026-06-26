// ATS helpers: career-page application submission + small formatters shared by
// the Jobs, Job detail, and Careers pages.
//
// Application submission is dual-mode:
//   * Supabase mode — insert the application; a SECURITY DEFINER trigger
//     (application_after_insert) creates the linked candidate and logs the
//     analytics event, so an anonymous applicant needs no extra permissions.
//   * Local/demo mode — there are no triggers, so we perform all three writes
//     (candidate, application, event) here against the localStorage mock.
import { supabase, demoMode } from './supabase'
import { DEFAULT_COMPANY_ID, type Job, type Stage } from './types'

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function uid(): string {
  const c = crypto as Crypto & { randomUUID?: () => string }
  return c.randomUUID ? c.randomUUID() : 'id-' + Math.random().toString(36).slice(2)
}

/** "$45–60/yr" style label for a job's pay range (null-safe). */
export function formatSalary(job: Pick<Job, 'salary_min' | 'salary_max' | 'salary_unit'>): string | null {
  const { salary_min: lo, salary_max: hi, salary_unit } = job
  if (lo == null && hi == null) return null
  const unit = salary_unit === 'hour' ? '/hr' : '/yr'
  const fmt = (n: number) =>
    salary_unit === 'hour' ? `$${n}` : `$${Math.round(n / 1000)}k`
  if (lo != null && hi != null) return `${fmt(lo)}–${fmt(hi)}${unit}`
  return `${fmt((lo ?? hi)!)}${unit}`
}

export interface ApplyInput {
  job: Job
  full_name: string
  email?: string
  phone?: string
  linkedin?: string
  portfolio?: string
  cover_letter?: string
  resume_text?: string
  resume_url?: string
  source?: string
}

export async function submitApplication(input: ApplyInput): Promise<{ error: string | null }> {
  const source = input.source || 'Career Site'
  const base = {
    company_id: input.job.company_id || DEFAULT_COMPANY_ID,
    job_id: input.job.id,
    full_name: input.full_name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    linkedin: input.linkedin?.trim() || null,
    portfolio: input.portfolio?.trim() || null,
    cover_letter: input.cover_letter?.trim() || null,
    resume_text: input.resume_text?.trim() || null,
    resume_url: input.resume_url || null,
    source,
    stage: 'sourced' as Stage,
    assigned_recruiter_id: input.job.assigned_recruiter_id ?? null,
  }

  if (!demoMode) {
    const { error } = await supabase.from('applications').insert(base)
    return { error: error?.message ?? null }
  }

  // Local mode: emulate the trigger's work client-side.
  const candidateId = uid()
  const applicationId = uid()
  const { error: cErr } = await supabase.from('candidates').insert({
    id: candidateId,
    full_name: base.full_name,
    role: input.job.role || 'lpn',
    email: base.email,
    phone: base.phone,
    source,
    facility_id: input.job.facility_id ?? null,
    recruiter_id: base.assigned_recruiter_id,
    current_stage: 'sourced',
    resume_text: base.resume_text || base.full_name,
    checklist: {},
  })
  if (cErr) return { error: cErr.message }
  await supabase.from('applications').insert({ id: applicationId, candidate_id: candidateId, ...base })
  await supabase.from('analytics_events').insert({
    id: uid(),
    company_id: base.company_id,
    event_type: 'application_submitted',
    candidate_id: candidateId,
    job_id: base.job_id,
    application_id: applicationId,
    to_stage: 'sourced',
    payload: { source },
    created_at: new Date().toISOString(),
  })
  return { error: null }
}

export async function scheduleInterview(input: {
  candidate_id: string; job_id: string | null; scheduled_at: string
  interviewer_id?: string | null; location?: string; duration_min?: number
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('interviews').insert({
    company_id: DEFAULT_COMPANY_ID,
    candidate_id: input.candidate_id,
    job_id: input.job_id,
    interviewer_id: input.interviewer_id ?? null,
    scheduled_at: input.scheduled_at,
    duration_min: input.duration_min ?? 30,
    location: input.location ?? null,
    status: 'scheduled',
  })
  return { error: error?.message ?? null }
}

export async function createOffer(input: {
  candidate_id: string; job_id: string | null; salary?: number | null
  bonus?: number | null; start_date?: string | null; status?: string
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('offers').insert({
    company_id: DEFAULT_COMPANY_ID,
    candidate_id: input.candidate_id,
    job_id: input.job_id,
    salary: input.salary ?? null,
    bonus: input.bonus ?? null,
    start_date: input.start_date ?? null,
    status: input.status ?? 'sent',
    sent_at: new Date().toISOString(),
  })
  return { error: error?.message ?? null }
}

/** Move an application (and its linked candidate) to a new pipeline stage. */
export async function setApplicationStage(
  app: { id: string; candidate_id: string | null },
  stage: Stage,
): Promise<void> {
  await supabase.from('applications').update({ stage }).eq('id', app.id)
  if (app.candidate_id) {
    await supabase.from('candidates').update({ current_stage: stage }).eq('id', app.candidate_id)
  }
}
