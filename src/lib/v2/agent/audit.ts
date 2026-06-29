// Audit trail for agent activity. Every console query and every Autopilot
// proposal/execution writes an org-scoped row to public.audit_logs so there is a
// complete, reviewable record of what the AI did, suggested, or was asked.
import { v2 } from '../client'
import { currentOrgId } from '../org'

export interface AuditEntry {
  action: string
  entityType?: string | null
  entityId?: string | null
  detail?: Record<string, unknown>
}

/** Best-effort audit write — never throws, so it can never block the action it records. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const [orgId, { data: auth }] = await Promise.all([currentOrgId(), v2.auth.getUser()])
    if (!orgId) return
    await v2.from('audit_logs').insert({
      org_id: orgId,
      actor_id: auth.user?.id ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      detail: entry.detail ?? {},
    })
  } catch {
    /* audit is best-effort; swallow */
  }
}
