// Scheduled screening callbacks. When a candidate says it's not a good time and
// gives a callback time, the Vapi webhook records a row here; a pg_cron job pings
// screening-call-dispatch every 5 min to place due calls. This is the read/manage
// layer for the recruiter UI.
import { v2, fetchAll } from './client'

export type ScheduledCallStatus = 'pending' | 'placed' | 'failed' | 'cancelled'

export interface ScheduledCall {
  id: string
  screening_id: string | null
  candidate_id: string | null
  requisition_id: string | null
  scheduled_at: string
  status: ScheduledCallStatus
  source: string
  note: string | null
  attempts: number
  call_id: string | null
  placed_at: string | null
  candidate: { full_name: string } | null
}

const SELECT =
  'id,screening_id,candidate_id,requisition_id,scheduled_at,status,source,note,attempts,call_id,placed_at, candidate:candidates(full_name)'

/** All scheduled callbacks, soonest first. */
export async function listScheduledCalls(): Promise<ScheduledCall[]> {
  const rows = await fetchAll<ScheduledCall>('scheduled_screening_calls', SELECT)
  return rows.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
}

/** Pending callbacks for a single screening (badge on the screening row). */
export async function pendingCallbackFor(screeningId: string): Promise<ScheduledCall | null> {
  const { data } = await v2
    .from('scheduled_screening_calls')
    .select(SELECT)
    .eq('screening_id', screeningId)
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as unknown as ScheduledCall) ?? null
}

export async function cancelScheduledCall(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('scheduled_screening_calls').update({ status: 'cancelled' }).eq('id', id)
  return { error: error?.message ?? null }
}

/** Reschedule a callback to a new time (and re-arm it if it had failed). */
export async function rescheduleCall(id: string, whenIso: string): Promise<{ error: string | null }> {
  const { error } = await v2
    .from('scheduled_screening_calls')
    .update({ scheduled_at: whenIso, status: 'pending', attempts: 0 })
    .eq('id', id)
  return { error: error?.message ?? null }
}
