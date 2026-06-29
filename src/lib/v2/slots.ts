// Interview self-scheduling data layer. Recruiters publish open interview slots
// on a requisition; candidates pick one from a public, token-gated page that
// goes through SECURITY DEFINER RPCs (schedule_context / book_interview_slot).
import { v2 } from './client'
import { currentOrgId } from './org'

export type InterviewType = 'phone_screen' | 'video' | 'onsite' | 'panel' | 'clinical'

export const INTERVIEW_TYPES: { value: InterviewType; label: string }[] = [
  { value: 'phone_screen', label: 'Phone screen' },
  { value: 'video', label: 'Video' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'panel', label: 'Panel' },
  { value: 'clinical', label: 'Clinical' },
]

export interface InterviewSlot {
  id: string
  requisition_id: string | null
  facility_id: string | null
  starts_at: string
  duration_min: number
  location: string | null
  type: InterviewType
  booked_by_application: string | null
  booked_at: string | null
}

const SLOT_SELECT =
  'id,requisition_id,facility_id,starts_at,duration_min,location,type,booked_by_application,booked_at'

export async function listSlots(requisitionId: string): Promise<InterviewSlot[]> {
  const { data } = await v2
    .from('interview_slots')
    .select(SLOT_SELECT)
    .eq('requisition_id', requisitionId)
    .order('starts_at')
  return (data as InterviewSlot[]) ?? []
}

export interface NewSlot {
  requisition_id: string
  facility_id?: string | null
  starts_at: string // ISO timestamp
  duration_min: number
  location?: string | null
  type: InterviewType
}

export async function createSlot(input: NewSlot): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'Could not resolve organization' }
  const { error } = await v2.from('interview_slots').insert({ ...input, org_id })
  return { error: error?.message ?? null }
}

export async function deleteSlot(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('interview_slots').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Public self-scheduling link for an application token (HashRouter route). */
export function scheduleUrl(token: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${window.location.origin}${base}#/schedule/${token}`
}

// ---- public scheduling RPCs (candidate-facing SchedulePage) ----------------

export interface ScheduleSlotOption {
  id: string
  starts_at: string
  duration_min: number
  location: string | null
  type: string
}
export interface ScheduleContext {
  candidate_name: string | null
  requisition_title: string | null
  facility: string | null
  slots: ScheduleSlotOption[]
  booked: { starts_at: string; location: string | null; duration_min: number } | null
  error?: string
}

export async function scheduleContext(token: string): Promise<ScheduleContext> {
  const { data, error } = await v2.rpc('schedule_context', { p_token: token })
  if (error)
    return { candidate_name: null, requisition_title: null, facility: null, slots: [], booked: null, error: error.message }
  return data as ScheduleContext
}

export async function bookSlot(
  token: string,
  slotId: string,
): Promise<{ ok?: boolean; scheduled_at?: string; error?: string }> {
  const { data, error } = await v2.rpc('book_interview_slot', { p_token: token, p_slot_id: slotId })
  if (error) return { error: error.message }
  return data as { ok?: boolean; scheduled_at?: string; error?: string }
}
