import { v2 } from './client'

// Public career-site data layer. Runs OUTSIDE auth against the v2 schema's
// anon-readable surface: a SELECT policy exposes open, public requisitions (and
// their facility + role_families), and a SECURITY DEFINER RPC takes applications.

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
  facility: { name: string; city: string | null; state: string | null } | null
}

/** Open, publicly-visible requisitions for the careers listing (newest first). */
export async function listPublicRequisitions(): Promise<PublicReq[]> {
  const { data } = await v2
    .from('requisitions')
    .select(
      'id,title,role_family,specialty,location,description,employment_type,workplace,salary_min,salary_max,salary_unit, facility:facilities(name,city,state)',
    )
    .eq('is_public', true)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as PublicReq[]
}

export interface ApplyInput {
  requisitionId: string
  full_name: string
  email: string
  phone?: string
  resume_text?: string
  intake?: Record<string, unknown>
}

/** Submit an application via the public-intake SECURITY DEFINER RPC. */
export async function applyToRequisition(input: ApplyInput): Promise<{ error: string | null }> {
  const { error } = await v2.rpc('apply_to_requisition', {
    p_requisition_id: input.requisitionId,
    p_full_name: input.full_name,
    p_email: input.email,
    p_phone: input.phone ?? null,
    p_resume_text: input.resume_text ?? null,
    p_source: 'Career Site',
    p_intake: input.intake ?? {},
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
