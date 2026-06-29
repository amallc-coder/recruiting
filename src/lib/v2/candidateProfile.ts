// Unified candidate profile data layer for the v2 workspace. Aggregates a
// candidate's applications (with placement-readiness), credentials, documents,
// communications, scorecards, AI decisions, and audit history into the shapes
// the /candidates/:id profile page renders. v2 client only.
import { v2 } from './client'
import { extractResumeText } from './resumeParse'
import type { Candidate, CredentialType } from './types'

// ---- shapes ---------------------------------------------------------------

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired'
export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired'
export type CommChannel = 'email' | 'sms' | 'call'
export type CommDirection = 'inbound' | 'outbound'

export interface ProfileApplication {
  id: string
  requisition_id: string | null
  current_stage_id: string | null
  status: string
  applied_at: string | null
  requisitionTitle: string | null
  roleFamily: string | null
  stageName: string | null
  placement_ready: boolean
  missing: CredentialType[]
  checkr_status: string | null
  background_sent_date: string | null
  background_cleared_date: string | null
}

export interface Credential {
  id: string
  candidate_id: string
  type: CredentialType
  number: string | null
  issuing_state: string | null
  issue_date: string | null
  expiration_date: string | null
  verification_status: VerificationStatus
  primary_source_verified: boolean
}

export interface CandidateDocument {
  id: string
  candidate_id: string
  type: string | null
  storage_path: string | null
  file_name: string | null
  status: DocumentStatus
  created_at: string
}

export interface Communication {
  id: string
  candidate_id: string
  channel: CommChannel
  direction: CommDirection
  subject: string | null
  body: string | null
  transcript: string | null
  occurred_at: string | null
  ai_generated: boolean
}

export interface ScorecardResponse {
  scorecard_id: string
  criterion: string
  rating: number | null
  comment: string | null
}

export interface Scorecard {
  id: string
  application_id: string | null
  interview_id: string | null
  reviewer_id: string | null
  recommendation: string | null
  overall_rating: number | null
  submitted_at: string | null
  responses: ScorecardResponse[]
}

/** The base v2 Candidate plus profile-only columns not in the shared type. */
export interface ProfileCandidate extends Candidate {
  notes: string | null
  resume_text: string | null
  recruiter_id: string | null
  created_at: string | null
}

export interface ProfileData {
  candidate: ProfileCandidate
  applications: ProfileApplication[]
  credentials: Credential[]
  fitScore: number | null
}

export interface DuplicateCandidate {
  id: string
  full_name: string
  email: string | null
  phone: string | null
}

export type TimelineKind =
  | 'stage'
  | 'communication'
  | 'scorecard'
  | 'ai_decision'
  | 'credential'
  | 'audit'

export interface TimelineItem {
  kind: TimelineKind
  label: string
  detail: string
  at: string
}

// ---- credential expiry ----------------------------------------------------

const DAY_MS = 86_400_000

/** Expired if past today; amber within 30 days; else green. Null → green. */
export function expiryStatus(expiration_date: string | null): 'green' | 'amber' | 'expired' {
  if (!expiration_date) return 'green'
  const exp = new Date(expiration_date).getTime()
  if (Number.isNaN(exp)) return 'green'
  const now = Date.now()
  if (exp < now) return 'expired'
  if (exp - now <= 30 * DAY_MS) return 'amber'
  return 'green'
}

// ---- profile load ---------------------------------------------------------

const CANDIDATE_SELECT =
  'id,full_name,email,phone,source,status,tags,notes,resume_text,screening_summary,last_screened_at,recruiter_id,created_at'

const APP_SELECT =
  'id,candidate_id,requisition_id,current_stage_id,status,applied_at,checkr_status,background_sent_date,background_cleared_date, requisition:requisitions(id,title,role_family), stage:pipeline_stages(name)'

interface RawApp {
  id: string
  requisition_id: string | null
  current_stage_id: string | null
  status: string
  applied_at: string | null
  checkr_status: string | null
  background_sent_date: string | null
  background_cleared_date: string | null
  requisition: { id: string; title: string | null; role_family: string | null } | null
  stage: { name: string | null } | null
}

export async function loadProfile(candidateId: string): Promise<ProfileData> {
  const [{ data: cand }, { data: appData }, { data: credData }, { data: scrData }] = await Promise.all([
    v2.from('candidates').select(CANDIDATE_SELECT).eq('id', candidateId).maybeSingle(),
    v2.from('applications').select(APP_SELECT).eq('candidate_id', candidateId).order('applied_at', { ascending: false }),
    v2.from('credentials').select('*').eq('candidate_id', candidateId).order('expiration_date', { ascending: true }),
    v2.from('screenings').select('ai_score').eq('candidate_id', candidateId),
  ])

  const apps = (appData as unknown as RawApp[]) ?? []
  const appIds = apps.map((a) => a.id)

  const prByApp = new Map<string, { ready: boolean; missing: CredentialType[] }>()
  if (appIds.length) {
    const { data: prData } = await v2
      .from('v_application_placement_ready')
      .select('application_id,placement_ready,missing_credential_types')
      .in('application_id', appIds)
    for (const r of (prData as { application_id: string; placement_ready: boolean; missing_credential_types: CredentialType[] }[]) ?? []) {
      prByApp.set(r.application_id, { ready: r.placement_ready, missing: r.missing_credential_types ?? [] })
    }
  }

  const applications: ProfileApplication[] = apps.map((a) => {
    const pr = prByApp.get(a.id)
    return {
      id: a.id,
      requisition_id: a.requisition_id,
      current_stage_id: a.current_stage_id,
      status: a.status,
      applied_at: a.applied_at,
      requisitionTitle: a.requisition?.title ?? null,
      roleFamily: a.requisition?.role_family ?? null,
      stageName: a.stage?.name ?? null,
      placement_ready: pr?.ready ?? false,
      missing: pr?.missing ?? [],
      checkr_status: a.checkr_status,
      background_sent_date: a.background_sent_date,
      background_cleared_date: a.background_cleared_date,
    }
  })

  const scores = ((scrData as { ai_score: number | null }[]) ?? [])
    .map((s) => s.ai_score)
    .filter((s): s is number => typeof s === 'number')
  const fitScore = scores.length ? Math.max(...scores) : null

  return {
    candidate: (cand as unknown as ProfileCandidate) ?? ({ id: candidateId } as ProfileCandidate),
    applications,
    credentials: (credData as Credential[]) ?? [],
    fitScore,
  }
}

// ---- lists ----------------------------------------------------------------

export async function listDocuments(candidateId: string): Promise<CandidateDocument[]> {
  const { data } = await v2
    .from('candidate_documents')
    .select('id,candidate_id,type,storage_path,file_name,status,created_at')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
  return (data as CandidateDocument[]) ?? []
}

export async function listCommunications(candidateId: string): Promise<Communication[]> {
  const { data } = await v2
    .from('communications')
    .select('id,candidate_id,channel,direction,subject,body,transcript,occurred_at,ai_generated')
    .eq('candidate_id', candidateId)
    .order('occurred_at', { ascending: false })
  return (data as Communication[]) ?? []
}

async function candidateApplicationIds(candidateId: string): Promise<string[]> {
  const { data } = await v2.from('applications').select('id').eq('candidate_id', candidateId)
  return ((data as { id: string }[]) ?? []).map((a) => a.id)
}

export async function listScorecards(candidateId: string): Promise<Scorecard[]> {
  const appIds = await candidateApplicationIds(candidateId)
  if (!appIds.length) return []
  const { data: scData } = await v2
    .from('scorecards')
    .select('id,application_id,interview_id,reviewer_id,recommendation,overall_rating,submitted_at')
    .in('application_id', appIds)
    .order('submitted_at', { ascending: false })
  const cards = (scData as Omit<Scorecard, 'responses'>[]) ?? []
  if (!cards.length) return []
  const cardIds = cards.map((c) => c.id)
  const { data: respData } = await v2
    .from('scorecard_responses')
    .select('scorecard_id,criterion,rating,comment')
    .in('scorecard_id', cardIds)
  const byCard = new Map<string, ScorecardResponse[]>()
  for (const r of (respData as ScorecardResponse[]) ?? []) {
    if (!byCard.has(r.scorecard_id)) byCard.set(r.scorecard_id, [])
    byCard.get(r.scorecard_id)!.push(r)
  }
  return cards.map((c) => ({ ...c, responses: byCard.get(c.id) ?? [] }))
}

// ---- timeline -------------------------------------------------------------

/** Merge stage history, comms, submitted scorecards, AI decisions, credential
 *  events, and audit logs into one descending-by-time activity feed. */
export async function buildTimeline(candidateId: string): Promise<TimelineItem[]> {
  const appIds = await candidateApplicationIds(candidateId)
  const entityIds = [candidateId, ...appIds]

  const stageHistP = appIds.length
    ? v2
        .from('application_stage_history')
        .select('application_id,from_stage_id,stage_id,entered_at')
        .in('application_id', appIds)
    : Promise.resolve({ data: [] as unknown })
  const scorecardsP = appIds.length
    ? v2
        .from('scorecards')
        .select('id,recommendation,overall_rating,submitted_at')
        .in('application_id', appIds)
        .not('submitted_at', 'is', null)
    : Promise.resolve({ data: [] as unknown })

  const [
    { data: stageData },
    { data: commData },
    { data: cardData },
    { data: aiData },
    { data: credData },
    { data: auditData },
  ] = await Promise.all([
    stageHistP,
    v2
      .from('communications')
      .select('channel,direction,subject,occurred_at')
      .eq('candidate_id', candidateId),
    scorecardsP,
    v2
      .from('ai_decisions')
      .select('entity_id,model,score,rationale,created_at')
      .in('entity_id', entityIds),
    v2
      .from('credentials')
      .select('type,verification_status,created_at,verified_at')
      .eq('candidate_id', candidateId),
    v2
      .from('audit_logs')
      .select('action,entity_type,entity_id,detail,created_at')
      .eq('entity_id', candidateId),
  ])

  const items: TimelineItem[] = []

  // resolve stage names for stage-history rows
  const stageRows =
    (stageData as { application_id: string; from_stage_id: string | null; stage_id: string | null; entered_at: string }[]) ?? []
  const stageIds = Array.from(
    new Set(stageRows.flatMap((s) => [s.from_stage_id, s.stage_id]).filter((x): x is string => Boolean(x))),
  )
  const stageNames = new Map<string, string>()
  if (stageIds.length) {
    const { data: sn } = await v2.from('pipeline_stages').select('id,name').in('id', stageIds)
    for (const s of (sn as { id: string; name: string }[]) ?? []) stageNames.set(s.id, s.name)
  }
  for (const s of stageRows) {
    const from = s.from_stage_id ? stageNames.get(s.from_stage_id) ?? 'previous stage' : null
    const to = s.stage_id ? stageNames.get(s.stage_id) ?? 'a stage' : 'a stage'
    items.push({
      kind: 'stage',
      label: 'Stage change',
      detail: from ? `${from} → ${to}` : `Entered ${to}`,
      at: s.entered_at,
    })
  }

  for (const c of (commData as { channel: string; direction: string; subject: string | null; occurred_at: string | null }[]) ?? []) {
    items.push({
      kind: 'communication',
      label: `${c.direction === 'inbound' ? 'Inbound' : 'Outbound'} ${c.channel}`,
      detail: c.subject || '(no subject)',
      at: c.occurred_at ?? '',
    })
  }

  for (const sc of (cardData as { recommendation: string | null; overall_rating: number | null; submitted_at: string | null }[]) ?? []) {
    items.push({
      kind: 'scorecard',
      label: 'Scorecard submitted',
      detail: `${sc.recommendation ?? 'No recommendation'}${sc.overall_rating != null ? ` · ${sc.overall_rating}/5` : ''}`,
      at: sc.submitted_at ?? '',
    })
  }

  for (const ai of (aiData as { model: string | null; score: number | null; rationale: string | null; created_at: string }[]) ?? []) {
    items.push({
      kind: 'ai_decision',
      label: `AI decision${ai.model ? ` (${ai.model})` : ''}`,
      detail: `${ai.score != null ? `Score ${ai.score} · ` : ''}${ai.rationale ?? ''}`.trim(),
      at: ai.created_at,
    })
  }

  for (const cr of (credData as { type: string; verification_status: string; created_at: string; verified_at: string | null }[]) ?? []) {
    items.push({
      kind: 'credential',
      label: 'Credential added',
      detail: `${cr.type} (${cr.verification_status})`,
      at: cr.created_at,
    })
    if (cr.verified_at) {
      items.push({
        kind: 'credential',
        label: 'Credential verified',
        detail: cr.type,
        at: cr.verified_at,
      })
    }
  }

  for (const a of (auditData as { action: string; entity_type: string | null; detail: unknown; created_at: string }[]) ?? []) {
    items.push({
      kind: 'audit',
      label: a.action,
      detail: a.entity_type ? `${a.entity_type}${a.detail ? ` · ${typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail)}` : ''}` : '',
      at: a.created_at,
    })
  }

  return items
    .filter((i) => i.at)
    .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
}

// ---- credential actions ---------------------------------------------------

export async function verifyCredential(id: string): Promise<{ error: string | null }> {
  const { error } = await v2
    .from('credentials')
    .update({ verification_status: 'verified', verified_at: new Date().toISOString() })
    .eq('id', id)
  return { error: error?.message ?? null }
}

export interface NewCredential {
  type: CredentialType
  number?: string | null
  issuing_state?: string | null
  issue_date?: string | null
  expiration_date?: string | null
  verification_status?: VerificationStatus
  primary_source_verified?: boolean
}

export async function createCredential(
  candidateId: string,
  input: NewCredential,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('credentials').insert({
    candidate_id: candidateId,
    type: input.type,
    number: input.number?.trim() || null,
    issuing_state: input.issuing_state?.trim() || null,
    issue_date: input.issue_date || null,
    expiration_date: input.expiration_date || null,
    verification_status: input.verification_status ?? 'unverified',
    primary_source_verified: input.primary_source_verified ?? false,
  })
  return { error: error?.message ?? null }
}

// ---- document actions -----------------------------------------------------

export async function requestDocument(candidateId: string, type: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('candidate_documents').insert({
    candidate_id: candidateId,
    type,
    status: 'pending',
    file_name: '(requested)',
  })
  return { error: error?.message ?? null }
}

export async function uploadDocument(
  candidateId: string,
  file: File,
  type: string,
): Promise<{ error: string | null }> {
  const path = `${candidateId}/${Date.now()}-${file.name}`
  const { error: upErr } = await v2.storage.from('candidate-documents').upload(path, file)
  if (upErr) return { error: upErr.message }
  const { error } = await v2.from('candidate_documents').insert({
    candidate_id: candidateId,
    type,
    storage_path: path,
    file_name: file.name,
    status: 'pending',
  })
  return { error: error?.message ?? null }
}

export async function setDocStatus(id: string, status: DocumentStatus): Promise<{ error: string | null }> {
  const { error } = await v2.from('candidate_documents').update({ status }).eq('id', id)
  return { error: error?.message ?? null }
}

/**
 * Parse a résumé file (PDF/DOCX/text) and write its text to candidates.resume_text
 * — the field the AI match engine reads. The original file is also stored as a
 * `resume` document (best-effort); failing to store it does not block setting the
 * text, which is the part that matters for matching.
 */
export async function uploadResume(
  candidateId: string,
  file: File,
): Promise<{ error: string | null; chars: number }> {
  let text: string
  try {
    text = await extractResumeText(file)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not read that file.', chars: 0 }
  }
  if (!text.trim()) {
    return { error: 'No text could be extracted — the file may be a scanned image.', chars: 0 }
  }

  // Store the original file as a document (best-effort).
  const path = `${candidateId}/${Date.now()}-${file.name}`
  const { error: upErr } = await v2.storage.from('candidate-documents').upload(path, file)
  if (!upErr) {
    await v2.from('candidate_documents').insert({
      candidate_id: candidateId,
      type: 'resume',
      storage_path: path,
      file_name: file.name,
      status: 'pending',
    })
  }

  // Set the résumé text the match engine reads.
  const { error } = await v2.from('candidates').update({ resume_text: text }).eq('id', candidateId)
  return { error: error?.message ?? null, chars: text.length }
}

// ---- communications -------------------------------------------------------

export async function sendCommunication(
  candidateId: string,
  input: { channel: CommChannel; subject: string; body: string },
): Promise<{ error: string | null }> {
  const { error } = await v2.from('communications').insert({
    candidate_id: candidateId,
    channel: input.channel,
    direction: 'outbound',
    subject: input.subject,
    body: input.body,
  })
  return { error: error?.message ?? null }
}

// ---- duplicates / merge ---------------------------------------------------

/** Strip characters that would break a PostgREST `.or(...)` filter. */
function sanitize(term: string): string {
  return term.replace(/[%,()]/g, '').trim()
}

export async function findDuplicates(candidate: Candidate): Promise<DuplicateCandidate[]> {
  const filters: string[] = []
  const email = sanitize(candidate.email ?? '')
  const phone = sanitize(candidate.phone ?? '')
  const name = sanitize(candidate.full_name ?? '')
  if (email) filters.push(`email.ilike.${email}`)
  if (phone) filters.push(`phone.eq.${phone}`)
  if (name) filters.push(`full_name.ilike.${name}`)
  if (!filters.length) return []
  const { data } = await v2
    .from('candidates')
    .select('id,full_name,email,phone')
    .or(filters.join(','))
    .neq('id', candidate.id)
  return (data as DuplicateCandidate[]) ?? []
}

export async function mergeCandidates(sourceId: string, targetId: string): Promise<{ error: string | null }> {
  const { error } = await v2.rpc('merge_candidates', { p_source: sourceId, p_target: targetId })
  return { error: error?.message ?? null }
}
