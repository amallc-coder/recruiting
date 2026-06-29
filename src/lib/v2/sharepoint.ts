// Client API for the `sync-sharepoint` edge function (admin-only). The function
// reads a SharePoint Excel worksheet via Microsoft Graph and enriches/creates
// candidates (incl. resume_text). It stays dormant until its Graph secrets are
// set — in that case it returns a clear "not configured" message we surface.
import { v2 } from './client'
import { demoMode } from '../supabase'

export interface SharePointSyncResult {
  ok: boolean
  added?: number
  updated?: number
  skipped?: number
  rows?: number
  note?: string
  error?: string
}

export async function syncSharePoint(): Promise<SharePointSyncResult> {
  if (demoMode) return { ok: false, error: 'SharePoint sync is not available in demo mode.' }
  try {
    const { data, error } = await v2.functions.invoke('sync-sharepoint', { body: {} })
    if (error) {
      // supabase-js masks the body as a generic non-2xx; surface the function's
      // own message when it sent one (e.g. the "not configured" guidance).
      const detail = (data as { error?: string } | null)?.error
      return { ok: false, error: detail || error.message || 'Sync failed' }
    }
    const res = (data as SharePointSyncResult) ?? { ok: false, error: 'No response.' }
    if (res.error) return { ok: false, error: res.error }
    return { ...res, ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Sync failed' }
  }
}
