import { v2, fetchAll } from './client'
import type { PipelineStage, Application, Candidate, PipelineCard, ReadinessLevel, CredentialType } from './types'

export async function listStages(roleFamily: string): Promise<PipelineStage[]> {
  const { data } = await v2
    .from('pipeline_stages')
    .select('*')
    .eq('role_family', roleFamily)
    .order('sort_order')
  return (data as PipelineStage[]) ?? []
}

interface AppRow extends Application {
  candidate: Candidate | null
}

// Kept as a const so supabase-js doesn't infer the embedded shape (which would
// type `candidate` as an array); the runtime to-one embed is a single object.
const APP_SELECT =
  'id,org_id,candidate_id,requisition_id,current_stage_id,status,applied_at,reject_reason, candidate:candidates(id,full_name,email,phone,source,status,tags)'

/** All applications for a requisition, enriched for the kanban (readiness, days-in-stage). */
export async function listPipeline(requisitionId: string): Promise<PipelineCard[]> {
  const { data: appData } = await v2.from('applications').select(APP_SELECT).eq('requisition_id', requisitionId)
  const apps = (appData as unknown as AppRow[]) ?? []
  if (!apps.length) return []
  const appIds = apps.map((a) => a.id)
  const candIds = Array.from(new Set(apps.map((a) => a.candidate_id)))

  const { data: prData } = await v2
    .from('v_application_placement_ready')
    .select('application_id,placement_ready,missing_credential_types')
    .eq('requisition_id', requisitionId)
  const prByApp = new Map<string, { ready: boolean; missing: CredentialType[] }>()
  for (const r of (prData as { application_id: string; placement_ready: boolean; missing_credential_types: CredentialType[] }[]) ?? []) {
    prByApp.set(r.application_id, { ready: r.placement_ready, missing: r.missing_credential_types ?? [] })
  }

  // credential types the candidate has on file (any status) → amber vs red
  const { data: credData } = await v2.from('credentials').select('candidate_id,type').in('candidate_id', candIds)
  const credTypes = new Map<string, Set<string>>()
  for (const c of (credData as { candidate_id: string; type: string }[]) ?? []) {
    if (!credTypes.has(c.candidate_id)) credTypes.set(c.candidate_id, new Set())
    credTypes.get(c.candidate_id)!.add(c.type)
  }

  // open stage-history row → entered_at → days in stage
  const { data: histData } = await v2
    .from('application_stage_history')
    .select('application_id,entered_at')
    .in('application_id', appIds)
    .is('exited_at', null)
  const enteredByApp = new Map<string, string>()
  for (const h of (histData as { application_id: string; entered_at: string }[]) ?? []) {
    enteredByApp.set(h.application_id, h.entered_at)
  }

  return apps.map((a) => {
    const pr = prByApp.get(a.id)
    const ready = pr?.ready ?? false
    const missing = pr?.missing ?? []
    const present = credTypes.get(a.candidate_id) ?? new Set<string>()
    let readiness: ReadinessLevel = 'green'
    if (!ready) {
      // amber: every gap is a credential the candidate HAS (pending/expired);
      // red: at least one required credential is entirely absent.
      readiness = missing.length > 0 && missing.every((t) => present.has(t)) ? 'amber' : 'red'
    }
    const entered = enteredByApp.get(a.id) ?? a.applied_at
    const daysInStage = Math.max(0, Math.round((Date.now() - new Date(entered).getTime()) / 86_400_000))
    return {
      application: {
        id: a.id,
        org_id: a.org_id,
        candidate_id: a.candidate_id,
        requisition_id: a.requisition_id,
        current_stage_id: a.current_stage_id,
        status: a.status,
        applied_at: a.applied_at,
        reject_reason: a.reject_reason,
      },
      candidate: a.candidate as Candidate,
      stageId: a.current_stage_id,
      readiness,
      placementReady: ready,
      missingCredentials: missing,
      daysInStage,
      fitScore: null,
    }
  })
}

/** Move one application to a stage. The DB trigger writes application_stage_history. */
export async function moveStage(applicationId: string, toStageId: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('applications').update({ current_stage_id: toStageId }).eq('id', applicationId)
  return { error: error?.message ?? null }
}

export async function bulkMove(applicationIds: string[], toStageId: string): Promise<{ error: string | null }> {
  if (!applicationIds.length) return { error: null }
  const { error } = await v2.from('applications').update({ current_stage_id: toStageId }).in('id', applicationIds)
  return { error: error?.message ?? null }
}

export async function rejectApplications(
  applicationIds: string[],
  reason: string,
  rejectedStageId?: string | null,
): Promise<{ error: string | null }> {
  if (!applicationIds.length) return { error: null }
  const patch: Record<string, unknown> = { status: 'rejected', reject_reason: reason }
  if (rejectedStageId) patch.current_stage_id = rejectedStageId
  const { error } = await v2.from('applications').update(patch).in('id', applicationIds)
  return { error: error?.message ?? null }
}

export async function tagCandidates(candidateIds: string[], tag: string): Promise<{ error: string | null }> {
  if (!candidateIds.length || !tag.trim()) return { error: null }
  const { data } = await v2.from('candidates').select('id,tags').in('id', candidateIds)
  for (const r of (data as { id: string; tags: string[] }[]) ?? []) {
    const next = Array.from(new Set([...(r.tags ?? []), tag.trim()]))
    await v2.from('candidates').update({ tags: next }).eq('id', r.id)
  }
  return { error: null }
}

/** Candidates available to add to a requisition's pipeline. */
export async function listSelectableCandidates(): Promise<{ id: string; full_name: string }[]> {
  // Paginate past the 1000-row cap so every candidate is selectable, not just the first 1000.
  const rows = await fetchAll<{ id: string; full_name: string }>('candidates', 'id,full_name')
  return rows.sort((a, b) => a.full_name.localeCompare(b.full_name))
}

/** Add a candidate to a requisition (creates an application in the given stage). */
export async function addApplication(
  requisitionId: string,
  candidateId: string,
  stageId: string | null,
  orgId: string,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('applications').insert({
    org_id: orgId,
    requisition_id: requisitionId,
    candidate_id: candidateId,
    current_stage_id: stageId,
    status: 'active',
  })
  return { error: error?.message ?? null }
}

/** Stub email action: records an outbound communication per candidate (no send yet). */
export async function logEmails(
  candidateIds: string[],
  subject: string,
  body: string,
): Promise<{ error: string | null }> {
  if (!candidateIds.length) return { error: null }
  const rows = candidateIds.map((id) => ({
    candidate_id: id,
    channel: 'email',
    direction: 'outbound',
    subject,
    body,
  }))
  const { error } = await v2.from('communications').insert(rows)
  return { error: error?.message ?? null }
}
