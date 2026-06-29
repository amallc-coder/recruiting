import { v2 } from './client'

// Resolves the caller's organization id for inserts (v2 tables are org-scoped and
// org_id is NOT NULL with no default). Cached per session. Single-tenant today,
// so it falls back to the sole organizations row if the user lookup misses.
let cached: string | null = null

export async function currentOrgId(): Promise<string | null> {
  if (cached) return cached
  const { data: auth } = await v2.auth.getUser()
  const uid = auth.user?.id
  if (uid) {
    const { data } = await v2.from('users').select('org_id').eq('id', uid).maybeSingle()
    const org = (data as { org_id: string } | null)?.org_id
    if (org) {
      cached = org
      return cached
    }
  }
  const { data: only } = await v2.from('organizations').select('id').limit(1).maybeSingle()
  cached = (only as { id: string } | null)?.id ?? null
  return cached
}
