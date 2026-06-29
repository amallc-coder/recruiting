// Onboarding handoff: on offer acceptance, generate a facility/role-specific
// onboarding checklist and carry the candidate's verified credentials forward
// (marked done — no re-entry). Tasks live in onboarding_tasks (org-scoped, RLS).
import { v2 } from './client'
import type { OfferRow } from './offers'

export interface OnboardingTask {
  id: string
  label: string
  category: string
  source: string
  required: boolean
  status: 'pending' | 'done' | 'na'
}

const TEMPLATE: { label: string; category: string }[] = [
  { label: 'Signed offer letter', category: 'paperwork' },
  { label: 'I-9 / employment eligibility verification', category: 'paperwork' },
  { label: 'Direct deposit & tax forms (W-4)', category: 'paperwork' },
  { label: 'Background check cleared', category: 'compliance' },
  { label: 'TB test / health screening', category: 'health' },
  { label: 'Required immunizations on file', category: 'health' },
  { label: 'BLS/ACLS certification verified', category: 'compliance' },
  { label: 'Facility orientation scheduled', category: 'logistics' },
  { label: 'Badge / system access provisioned', category: 'logistics' },
  { label: 'First-day schedule confirmed', category: 'logistics' },
]

/** Resolve the application a hire is tied to (offer → application). */
async function resolveApplication(offer: OfferRow): Promise<string | null> {
  if (offer.application_id) return offer.application_id
  let q = v2.from('applications').select('id').eq('candidate_id', offer.candidate_id)
  if (offer.requisition_id) q = q.eq('requisition_id', offer.requisition_id)
  const { data } = await q.order('applied_at', { ascending: false }).limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Generate the onboarding checklist for an accepted offer. Idempotent. */
export async function generateOnboarding(offer: OfferRow): Promise<{ applicationId: string | null; created: number; error: string | null }> {
  const applicationId = await resolveApplication(offer)
  if (!applicationId) return { applicationId: null, created: 0, error: 'No application found for this offer — add the candidate to a requisition pipeline first.' }

  const { count } = await v2
    .from('onboarding_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('application_id', applicationId)
  if ((count ?? 0) > 0) return { applicationId, created: 0, error: null } // already generated

  const rows: Record<string, unknown>[] = TEMPLATE.map((t) => ({
    org_id: offer.org_id, application_id: applicationId, label: t.label, category: t.category, source: 'template', required: true, status: 'pending',
  }))

  // Carry verified credentials forward — already on file, marked done.
  const { data: creds } = await v2
    .from('credentials')
    .select('type,issuing_state,verification_status')
    .eq('candidate_id', offer.candidate_id)
    .eq('verification_status', 'verified')
  for (const c of (creds as { type: string; issuing_state: string | null }[]) ?? []) {
    rows.push({
      org_id: offer.org_id, application_id: applicationId,
      label: `Credential verified: ${c.type}${c.issuing_state ? ` (${c.issuing_state})` : ''}`,
      category: 'credentials', source: 'credential', required: false, status: 'done',
    })
  }

  const { error } = await v2.from('onboarding_tasks').insert(rows)
  return { applicationId, created: error ? 0 : rows.length, error: error?.message ?? null }
}

/** Resolve an offer's application and list its onboarding tasks (for viewing). */
export async function onboardingForOffer(offer: OfferRow): Promise<OnboardingTask[]> {
  const applicationId = await resolveApplication(offer)
  if (!applicationId) return []
  return listOnboarding(applicationId)
}

export async function listOnboarding(applicationId: string): Promise<OnboardingTask[]> {
  const { data } = await v2
    .from('onboarding_tasks')
    .select('id,label,category,source,required,status')
    .eq('application_id', applicationId)
    .order('source', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as OnboardingTask[]) ?? []
}

export async function setTaskStatus(id: string, status: OnboardingTask['status']): Promise<{ error: string | null }> {
  const { error } = await v2.from('onboarding_tasks').update({ status }).eq('id', id)
  return { error: error?.message ?? null }
}
