// Autopilot mode — client side. Turns a recruiter's goal into a governed action
// plan: gather a compact context snapshot (under RLS), ask ai-autopilot to plan,
// then re-validate every step against the canonical policy (the model's tier is
// advisory — policy.ts decides). The agent executes only `auto` steps and
// `approval` steps a human has OK'd, and NEVER a prohibited one. Proposals are
// logged to ai_decisions; executions to audit_logs.
import { v2 } from '../client'
import { demoMode } from '../../supabase'
import { currentOrgId } from '../org'
import { listRequisitions, daysOpen } from '../requisitions'
import { captureSnapshot } from '../kpis'
import { createScreening, getRequisitionQuestions, generateScreeningQuestions } from '../screenings'
import { matchCandidatesForRequisition } from '../matching'
import { logAudit } from './audit'
import {
  resolveTier,
  specFor,
  canExecute,
  deepLink,
  type ActionTier,
  type TargetKind,
} from './policy'

const MODEL = 'claude-opus-4-8'

export interface PlanStep {
  action_type: string
  title: string
  rationale: string
  target_kind: TargetKind
  target_id: string
  target_label: string
  // ---- authoritative, resolved from policy ----
  tier: ActionTier
  label: string
  description: string
  executable: boolean
  link: string
}

export interface AutopilotPlan {
  ok: boolean
  error?: string
  assessment: string
  summary: string
  steps: PlanStep[]
}

export interface StepResult {
  ok: boolean
  message: string
  link?: string
}

// ---------------------------------------------------------------------------
// Context snapshot — compact, id-bearing, RLS-scoped. Kept small so the planner
// can ground every step on a real entity without blowing the token budget.
// ---------------------------------------------------------------------------
async function gatherContext(): Promise<Record<string, unknown>> {
  const openReqs = await listRequisitions({ statuses: ['open'] }).catch(() => [])

  let unscreened: { id: string; full_name: string }[] = []
  try {
    const { data } = await v2
      .from('candidates')
      .select('id,full_name')
      .eq('status', 'active')
      .is('last_screened_at', null)
      .limit(15)
    unscreened = (data as { id: string; full_name: string }[]) ?? []
  } catch {
    /* leave empty */
  }

  let sentOffers = 0
  try {
    const { count } = await v2.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'sent')
    sentOffers = count ?? 0
  } catch {
    /* leave zero */
  }

  const reqs = openReqs
    .map((r) => ({
      id: r.id,
      title: r.title,
      role_family: r.role_family,
      days_open: daysOpen(r),
      applicants: r.applications?.[0]?.count ?? 0,
      facility: r.facility?.name ?? null,
    }))
    .sort((a, b) => b.days_open - a.days_open)
    .slice(0, 15)

  return {
    open_requisitions: reqs,
    candidates_never_screened: unscreened.map((c) => ({ id: c.id, full_name: c.full_name })),
    offers_awaiting_response: sentOffers,
    generated_at: new Date().toISOString(),
  }
}

/** Enrich a raw planner step with the authoritative policy tier + metadata. */
function resolveStep(raw: Partial<PlanStep>): PlanStep {
  const type = String(raw.action_type ?? '')
  const spec = specFor(type)
  const tier = resolveTier(type) // policy wins over the model's suggested tier
  const target = (spec?.target ?? raw.target_kind ?? 'none') as TargetKind
  const targetId = raw.target_id && String(raw.target_id).trim() ? String(raw.target_id) : ''
  return {
    action_type: type,
    title: raw.title ?? spec?.label ?? type,
    rationale: raw.rationale ?? '',
    target_kind: target,
    target_id: targetId,
    target_label: raw.target_label ?? '',
    tier,
    label: spec?.label ?? type,
    description: spec?.description ?? 'Unrecognized action — treated as human-only.',
    executable: Boolean(spec?.executable),
    link: deepLink(target, targetId || null),
  }
}

/** Best-effort proposal log to ai_decisions (one row per planned step). */
async function logProposals(orgId: string, steps: PlanStep[]): Promise<void> {
  try {
    const rows = steps.map((s) => ({
      org_id: orgId,
      entity_type: `autopilot.${s.action_type}`,
      entity_id: isUuid(s.target_id) ? s.target_id : null,
      model: MODEL,
      rationale: `[${s.tier}] ${s.title} — ${s.rationale}`.slice(0, 2000),
      checklist: { action_type: s.action_type, tier: s.tier, target_kind: s.target_kind, target_label: s.target_label },
      created_by_agent: 'autopilot',
      human_override: false,
    }))
    if (rows.length) await v2.from('ai_decisions').insert(rows)
  } catch {
    /* best-effort */
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

/** Plan a goal into a governed, prioritized action list. */
export async function planAutopilot(goal: string): Promise<AutopilotPlan> {
  if (demoMode) {
    return { ok: false, error: 'Autopilot needs the live backend (unavailable in local mode).', assessment: '', summary: '', steps: [] }
  }
  let context: Record<string, unknown> = {}
  try {
    context = await gatherContext()
  } catch {
    /* plan can still proceed with an empty context */
  }

  try {
    const { data, error } = await v2.functions.invoke('ai-autopilot', { body: { goal, context } })
    if (error || !data?.ok || !data.plan) {
      return { ok: false, error: data?.error ?? 'Autopilot could not plan that goal.', assessment: '', summary: '', steps: [] }
    }
    const rawSteps: Partial<PlanStep>[] = Array.isArray(data.plan.steps) ? data.plan.steps : []
    const steps: PlanStep[] = rawSteps.map((s) => resolveStep(s))

    const orgId = await currentOrgId()
    if (orgId) await logProposals(orgId, steps)
    void logAudit({
      action: 'autopilot.plan',
      detail: {
        goal: goal.slice(0, 500),
        steps: steps.length,
        auto: steps.filter((s) => s.tier === 'auto').length,
        approval: steps.filter((s) => s.tier === 'approval').length,
        prohibited: steps.filter((s) => s.tier === 'prohibited').length,
      },
    })

    return { ok: true, assessment: data.plan.assessment ?? '', summary: data.plan.summary ?? '', steps }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Autopilot failed.', assessment: '', summary: '', steps: [] }
  }
}

// ---------------------------------------------------------------------------
// Execution — gated by the policy. `approved` reflects an explicit human click on
// an approval-tier step. Prohibited steps can never reach a handler.
// ---------------------------------------------------------------------------
export async function executeStep(step: PlanStep, approved: boolean): Promise<StepResult> {
  if (!canExecute(step.action_type, approved)) {
    if (step.tier === 'prohibited') {
      return { ok: false, message: 'This is a human-only action — Autopilot will never do it. Open the page to do it yourself.', link: step.link }
    }
    if (!step.executable) {
      return { ok: false, message: 'No automated handler for this step — open the page to complete it.', link: step.link }
    }
    if (step.tier === 'approval' && !approved) {
      return { ok: false, message: 'This step needs your approval first.' }
    }
    return { ok: false, message: 'This step cannot be run automatically.', link: step.link }
  }

  let result: StepResult
  switch (step.action_type) {
    case 'kpi.snapshot':
      result = await execKpiSnapshot()
      break
    case 'screening.draft':
      result = await execScreeningDraft(step)
      break
    case 'match.refresh':
      result = await execMatchRefresh(step)
      break
    case 'note.flag':
      result = { ok: true, message: `Flagged for attention: ${step.target_label || step.title}.`, link: step.link }
      break
    default:
      result = { ok: false, message: 'No handler wired for this action.', link: step.link }
  }

  void logAudit({
    action: 'autopilot.execute',
    entityType: step.action_type,
    entityId: isUuid(step.target_id) ? step.target_id : null,
    detail: { title: step.title, tier: step.tier, approved, ok: result.ok, message: result.message.slice(0, 300) },
  })
  return result
}

async function execKpiSnapshot(): Promise<StepResult> {
  const { captured, error } = await captureSnapshot()
  if (error) return { ok: false, message: `Snapshot failed: ${error}` }
  return { ok: true, message: `Captured ${captured} KPI${captured === 1 ? '' : 's'}.`, link: '/analytics' }
}

async function execMatchRefresh(step: PlanStep): Promise<StepResult> {
  const reqId = step.target_id
  if (!reqId || !isUuid(reqId)) return { ok: false, message: 'No requisition specified for the match refresh.' }
  const { requisition, ranked } = await matchCandidatesForRequisition(reqId)
  if (!requisition) return { ok: false, message: 'Requisition not found.' }
  const top = ranked.slice(0, 5)
  const names = top.map((r) => `${r.full_name} (${r.score})`).join(', ')
  return {
    ok: true,
    message: top.length
      ? `Refreshed shortlist for ${requisition.title}: top ${top.length} — ${names}.`
      : `Refreshed shortlist for ${requisition.title}: no ranked candidates yet.`,
    link: `/requisitions/${reqId}`,
  }
}

async function execScreeningDraft(step: PlanStep): Promise<StepResult> {
  const candidateId = step.target_id
  if (!candidateId || !isUuid(candidateId)) return { ok: false, message: 'No candidate specified for the draft.' }

  // Tie the draft to the candidate's most recent application's requisition (for question seeding).
  const { data: app } = await v2
    .from('applications')
    .select('requisition_id')
    .eq('candidate_id', candidateId)
    .order('applied_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const reqId = (app as { requisition_id: string | null } | null)?.requisition_id ?? null

  let questions = reqId ? await getRequisitionQuestions(reqId) : []
  if (!questions.length) questions = await generateScreeningQuestions({ full_name: step.target_label || 'Candidate' })

  const { data: auth } = await v2.auth.getUser()
  const { id, error } = await createScreening({
    candidate_id: candidateId,
    requisition_id: reqId,
    channel: 'sms',
    questions,
    created_by: auth.user?.id ?? null,
  })
  if (error || !id) return { ok: false, message: error ?? 'Could not create the draft screening.' }
  return {
    ok: true,
    message: `Draft screening created (${questions.length} questions, not sent). Review on the Screening tab before it goes out.`,
    link: '/screening',
  }
}
