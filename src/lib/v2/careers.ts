import { v2, fetchAll } from './client'

// Public career-site data layer. Runs OUTSIDE auth against the v2 schema's
// anon-readable surface: a SELECT policy exposes open, public requisitions (and
// their facility + role_families), and a SECURITY DEFINER RPC takes applications.

export interface PrescreenQuestion {
  id: string
  question: string
  rationale?: string
  competency?: string
}

export interface PublicReq {
  id: string
  title: string
  role_family: string
  specialty: string | null
  location: string | null
  description: string | null
  employment_type: string
  workplace: string
  salary_min: number | null
  salary_max: number | null
  salary_unit: string
  screening_questions: PrescreenQuestion[]
  facility: { name: string; city: string | null; state: string | null } | null
}

// Baseline pre-application screen used when a requisition hasn't configured its
// own questions — every healthcare applicant answers these as part of applying.
export const DEFAULT_PRESCREEN: PrescreenQuestion[] = [
  { id: 'lic', question: 'Do you hold an active license or certification for this role? If so, which one and in which state(s)?', competency: 'Licensure' },
  { id: 'exp', question: 'How many years of relevant hands-on experience do you have, and in what care settings?', competency: 'Experience' },
  { id: 'avail', question: 'What is your earliest available start date, and which shifts can you work (days/evenings/nights/weekends)?', competency: 'Availability' },
  { id: 'auth', question: 'Are you legally authorized to work in the United States?', competency: 'Eligibility' },
]

/** The pre-application questions to show for a requisition (its own, or the default set). */
export function prescreenFor(req: PublicReq): PrescreenQuestion[] {
  const qs = Array.isArray(req.screening_questions) ? req.screening_questions.filter((q) => q?.question) : []
  return qs.length ? qs.map((q, i) => ({ ...q, id: q.id || `q${i + 1}` })) : DEFAULT_PRESCREEN
}

/** Open, publicly-visible requisitions for the careers listing (newest first). */
export async function listPublicRequisitions(): Promise<PublicReq[]> {
  // Paginate past the 1000-row cap so every open public role is listed; re-sort newest-first.
  const rows = await fetchAll<PublicReq & { created_at?: string }>(
    'requisitions',
    'id,title,role_family,specialty,location,description,employment_type,workplace,salary_min,salary_max,salary_unit,screening_questions,created_at, facility:facilities(name,city,state)',
    (q) => q.eq('is_public', true).eq('status', 'open'),
  )
  return rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')) as PublicReq[]
}

export interface PrescreenAnswer {
  question_id: string
  question: string
  answer: string
}

export interface ApplyInput {
  requisitionId: string
  full_name: string
  email: string
  phone?: string
  resume_text?: string
  intake?: Record<string, unknown>
  screening?: PrescreenAnswer[]
}

/** Submit an application via the public-intake SECURITY DEFINER RPC. */
export async function applyToRequisition(input: ApplyInput): Promise<{ error: string | null }> {
  const screening = input.screening ?? []
  const { error } = await v2.rpc('apply_to_requisition', {
    p_requisition_id: input.requisitionId,
    p_full_name: input.full_name,
    p_email: input.email,
    p_phone: input.phone ?? null,
    p_resume_text: input.resume_text ?? null,
    p_source: 'Career Site',
    // Keep the answers on the application intake too, so they show in the timeline.
    p_intake: { ...(input.intake ?? {}), pre_application_screening: screening },
    p_screening: screening,
  })
  return { error: error?.message ?? null }
}

/** "$min–$max / unit", single-sided, or '' when no salary is set. */
export function salaryLabel(r: PublicReq): string {
  const fmt = (n: number) => `$${n.toLocaleString()}`
  const unit = r.salary_unit ? ` / ${r.salary_unit}` : ''
  if (r.salary_min != null && r.salary_max != null) {
    return `${fmt(r.salary_min)}–${fmt(r.salary_max)}${unit}`
  }
  if (r.salary_min != null) return `${fmt(r.salary_min)}${unit}`
  if (r.salary_max != null) return `${fmt(r.salary_max)}${unit}`
  return ''
}
