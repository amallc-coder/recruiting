// Candidate mobile portal data — token-gated status view via the portal_context
// SECURITY DEFINER RPC. The token is an application's schedule_token; the portal
// shows that candidate's full application picture (no other candidates' data).
import { v2 } from './client'

export interface PortalApplication {
  id: string
  title: string | null
  facility: string | null
  status: string
  stage: string | null
  schedule_token: string
  applied_at: string | null
}

export interface PortalContext {
  ok: boolean
  error?: string
  candidate_name?: string | null
  applications?: PortalApplication[]
}

export async function getPortalContext(token: string): Promise<PortalContext> {
  const { data, error } = await v2.rpc('portal_context', { p_token: token })
  if (error) return { ok: false, error: error.message }
  return (data as PortalContext) ?? { ok: false, error: 'Not found' }
}
