// Hiring-manager / facility portal — "request to fill" lifecycle. A manager
// submits a request (facility + role + headcount + urgency); staff review and
// convert it into a draft requisition (convert_requisition_request RPC, which
// credits the requester as hiring manager). Org-scoped with RLS.
import { v2, fetchAll } from './client'
import { currentOrgId } from './org'

export type RequestStatus = 'requested' | 'approved' | 'declined' | 'converted'
export type Urgency = 'low' | 'normal' | 'high' | 'urgent'

export const REQUEST_URGENCIES: Urgency[] = ['low', 'normal', 'high', 'urgent']

export interface RequisitionRequest {
  id: string
  org_id: string
  facility_id: string | null
  title: string
  role_family: string | null
  headcount: number
  urgency: Urgency
  reason: string | null
  target_start: string | null
  status: RequestStatus
  requisition_id: string | null
  review_note: string | null
  requested_by: string | null
  reviewed_by: string | null
  /** External submitter (public link) — these come in without a users row. */
  requester_name: string | null
  requester_email: string | null
  facility_name: string | null
  source: 'internal' | 'public'
  created_at: string
}

const SELECT =
  'id,org_id,facility_id,title,role_family,headcount,urgency,reason,target_start,status,requisition_id,review_note,requested_by,reviewed_by,requester_name,requester_email,facility_name,source,created_at'

export async function listRequisitionRequests(): Promise<RequisitionRequest[]> {
  const rows = await fetchAll<RequisitionRequest>('requisition_requests', SELECT)
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export interface RequestInput {
  title: string
  facility_id: string | null
  role_family: string | null
  headcount: number
  urgency: Urgency
  reason?: string | null
  target_start?: string | null
}

export async function createRequisitionRequest(input: RequestInput): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization for current user.' }
  const { data: auth } = await v2.auth.getUser()
  const { error } = await v2.from('requisition_requests').insert({ ...input, org_id, requested_by: auth.user?.id ?? null })
  return { error: error?.message ?? null }
}

export async function reviewRequest(
  id: string,
  status: Extract<RequestStatus, 'approved' | 'declined'>,
  reviewNote?: string | null,
): Promise<{ error: string | null }> {
  const { data: auth } = await v2.auth.getUser()
  const { error } = await v2
    .from('requisition_requests')
    .update({ status, review_note: reviewNote ?? null, reviewed_by: auth.user?.id ?? null })
    .eq('id', id)
  return { error: error?.message ?? null }
}

/** Staff triage: set facility / role family on a request (e.g. a public one) so it can convert. */
export async function patchRequest(
  id: string,
  patch: Partial<Pick<RequisitionRequest, 'facility_id' | 'role_family'>>,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('requisition_requests').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteRequest(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('requisition_requests').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export interface PublicStaffingInput {
  requester_name: string
  requester_email?: string | null
  facility_name?: string | null
  title: string
  role_family?: string | null
  headcount: number
  urgency: Urgency
  reason?: string | null
  target_start?: string | null
}

/** Public (anon) staffing request via the submit_staffing_request RPC — no login. */
export async function submitPublicStaffingRequest(input: PublicStaffingInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await v2.rpc('submit_staffing_request', {
    p_requester_name: input.requester_name,
    p_requester_email: input.requester_email ?? null,
    p_facility_name: input.facility_name ?? null,
    p_title: input.title,
    p_role_family: input.role_family ?? null,
    p_headcount: input.headcount,
    p_urgency: input.urgency,
    p_reason: input.reason ?? null,
    p_target_start: input.target_start ?? null,
  })
  return { id: (data as string | null) ?? null, error: error?.message ?? null }
}

/** Staff-only: convert into a draft requisition; returns the new requisition id. */
export async function convertRequest(id: string): Promise<{ requisitionId: string | null; error: string | null }> {
  const { data, error } = await v2.rpc('convert_requisition_request', { p_id: id })
  return { requisitionId: (data as string | null) ?? null, error: error?.message ?? null }
}
