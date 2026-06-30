// Reference-check automation — structured reference requests per candidate,
// collected through a token-gated public form (reference_context /
// submit_reference SECURITY DEFINER RPCs), then summarized + flagged by Claude
// (ai-reference edge function). Org-scoped with RLS.
import { v2 } from './client'
import { currentOrgId } from './org'
import { demoMode } from '../supabase'

export type ReferenceStatus = 'pending' | 'completed' | 'declined'

export interface ReferenceQuestion {
  id: string
  prompt: string
}

export interface ReferenceFlag {
  severity: 'info' | 'concern' | 'red'
  note: string
}

export interface ReferenceRequest {
  id: string
  org_id: string
  candidate_id: string
  application_id: string | null
  referee_name: string
  referee_email: string | null
  referee_phone: string | null
  referee_title: string | null
  relationship: string | null
  token: string
  status: ReferenceStatus
  questions: ReferenceQuestion[]
  responses: Record<string, string> | null
  rating: number | null
  would_rehire: boolean | null
  ai_summary: string | null
  ai_flags: ReferenceFlag[] | null
  created_at: string
  completed_at: string | null
}

// Default structured reference questions (healthcare staffing flavored).
export const DEFAULT_REFERENCE_QUESTIONS: ReferenceQuestion[] = [
  { id: 'capacity', prompt: 'In what capacity, and for how long, did you work with this person?' },
  { id: 'clinical', prompt: 'How would you describe their clinical skills and judgment?' },
  { id: 'reliability', prompt: 'How dependable were they with attendance, punctuality, and follow-through?' },
  { id: 'teamwork', prompt: 'How did they work with patients/residents, families, and the care team?' },
  { id: 'concerns', prompt: 'Are there any concerns or areas for growth we should know about?' },
]

const SELECT =
  'id,org_id,candidate_id,application_id,referee_name,referee_email,referee_phone,referee_title,relationship,token,status,questions,responses,rating,would_rehire,ai_summary,ai_flags,created_at,completed_at'

export async function listReferenceRequests(candidateId: string): Promise<ReferenceRequest[]> {
  const { data } = await v2
    .from('reference_requests')
    .select(SELECT)
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
  return (data as ReferenceRequest[] | null) ?? []
}

export interface ReferenceInput {
  candidate_id: string
  application_id?: string | null
  referee_name: string
  referee_email?: string | null
  referee_phone?: string | null
  referee_title?: string | null
  relationship?: string | null
}

export async function createReferenceRequest(input: ReferenceInput): Promise<{ token: string | null; error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { token: null, error: 'No organization for current user.' }
  const { data: auth } = await v2.auth.getUser()
  const { data, error } = await v2
    .from('reference_requests')
    .insert({ ...input, org_id, questions: DEFAULT_REFERENCE_QUESTIONS, created_by: auth.user?.id ?? null })
    .select('token')
    .single()
  return { token: (data as { token: string } | null)?.token ?? null, error: error?.message ?? null }
}

export async function deleteReferenceRequest(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('reference_requests').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Public reference URL for a token (HashRouter route). */
export function referenceUrl(token: string): string {
  const base = import.meta.env.BASE_URL
  return `${window.location.origin}${base}#/reference/${token}`
}

// ---- public (anon) form RPCs ----
export interface ReferenceFormContext {
  ok: boolean
  error?: string
  status?: ReferenceStatus
  referee_name?: string
  relationship?: string | null
  candidate_name?: string
  org_name?: string
  questions?: ReferenceQuestion[]
}

export async function getReferenceForm(token: string): Promise<ReferenceFormContext> {
  const { data, error } = await v2.rpc('reference_context', { p_token: token })
  if (error) return { ok: false, error: error.message }
  return (data as ReferenceFormContext) ?? { ok: false, error: 'Not found' }
}

export async function submitReference(
  token: string,
  responses: Record<string, string>,
  rating: number | null,
  wouldRehire: boolean | null,
  declined = false,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await v2.rpc('submit_reference', {
    p_token: token,
    p_responses: responses,
    p_rating: rating,
    p_would_rehire: wouldRehire,
    p_declined: declined,
  })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; error?: string }
  return { ok: !!res?.ok, error: res?.error ?? null }
}

/** Recruiter-triggered AI summary + discrepancy/red-flag analysis of a completed reference. */
export async function analyzeReference(id: string): Promise<{ ok: boolean; error: string | null }> {
  if (demoMode) return { ok: false, error: 'AI analysis is unavailable in local mode.' }
  const { data, error } = await v2.functions.invoke('ai-reference', { body: { reference_request_id: id } })
  if (error) return { ok: false, error: error.message }
  const res = data as { ok: boolean; error?: string }
  return { ok: !!res?.ok, error: res?.error ?? null }
}
