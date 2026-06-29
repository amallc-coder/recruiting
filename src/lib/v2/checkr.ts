// Client API for the Checkr background-check integration (admin/recruiter).
// Orders run through the `checkr-order` edge function; results arrive later via
// the public `checkr-webhook` and land on the application's checkr_status /
// background_cleared_date. The function stays dormant until CHECKR_API_KEY +
// CHECKR_PACKAGE are set — in that case it returns a clear "not configured"
// message we surface.
import { v2 } from './client'
import { demoMode } from '../supabase'

export type CheckrStatus = 'pending' | 'clear' | 'consider' | 'suspended' | 'dispute' | 'canceled'

export interface OrderResult {
  ok: boolean
  status?: string
  error?: string
}

export async function orderBackgroundCheck(applicationId: string): Promise<OrderResult> {
  if (demoMode) return { ok: false, error: 'Background checks are not available in demo mode.' }
  try {
    const { data, error } = await v2.functions.invoke('checkr-order', {
      body: { application_id: applicationId },
    })
    if (error) {
      const detail = (data as { error?: string } | null)?.error
      return { ok: false, error: detail || error.message || 'Could not order the check' }
    }
    const res = data as { ok?: boolean; status?: string; error?: string }
    if (res?.error) return { ok: false, error: res.error }
    return { ok: true, status: res?.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not order the check' }
  }
}
