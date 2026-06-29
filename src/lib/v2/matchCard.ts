// Match Card data layer (frontend).
//
// The "AI recommends, humans decide" match engine surfaces a single
// application's fit as an explainable Match Card. Scoring runs in the `ai-match`
// edge function (Claude); every run is logged to public.ai_decisions, which is
// also where we reconstruct a previously-computed card from. Recruiter feedback
// (approve/skip on the recommendation) is logged as an analytics event — the
// raw signal for a future self-learning loop.
import { v2 } from './client'
import { currentOrgId } from './org'

export type ChecklistTier = 'must_have' | 'important' | 'nice_to_have'
export type ChecklistStatus = 'met' | 'partial' | 'missing'

export interface ChecklistItem {
  requirement: string
  tier: ChecklistTier
  status: ChecklistStatus
  evidence: string
}

export interface ParsedResume {
  skills: string[]
  experience: string
  licenses: string[]
}

export interface MatchCardData {
  score: number
  rationale: string
  parsed?: ParsedResume
  checklist: ChecklistItem[]
  knockouts: { reason: string }[]
  recommendation: string
}

export type ScoreResult = MatchCardData | { error: string }

/**
 * Run the AI match engine for an application via the `ai-match` edge function.
 * Returns the fresh Match Card, or `{ error }` if scoring failed / the function
 * isn't deployed. (No local fake score — a black-box guess would undermine the
 * "explainable, evidence-per-item" contract.)
 */
export async function scoreApplication(applicationId: string): Promise<ScoreResult> {
  try {
    const { data, error } = await v2.functions.invoke('ai-match', {
      body: { application_id: applicationId },
    })
    if (error) return { error: error.message || 'Scoring failed' }
    if (!data || typeof data.score !== 'number') {
      return { error: typeof data?.error === 'string' ? data.error : 'Scoring is unavailable.' }
    }
    return normalize(data)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Scoring failed' }
  }
}

/**
 * Reconstruct the latest Match Card for an application from its most recent
 * ai_decisions row. The full structured card (parsed/checklist/knockouts/
 * recommendation) lives in the `checklist` jsonb column; score + rationale are
 * their own columns. Returns null when the application has never been scored.
 */
export async function getMatchCard(applicationId: string): Promise<MatchCardData | null> {
  const { data, error } = await v2
    .from('ai_decisions')
    .select('score, rationale, checklist')
    .eq('entity_type', 'application')
    .eq('entity_id', applicationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null

  const row = data as { score: number | null; rationale: string | null; checklist: unknown }
  const blob = (row.checklist ?? {}) as {
    parsed?: ParsedResume
    checklist?: ChecklistItem[]
    knockouts?: { reason: string }[]
    recommendation?: string
  }
  return normalize({
    score: Number(row.score ?? 0),
    rationale: row.rationale ?? '',
    parsed: blob.parsed,
    checklist: blob.checklist,
    knockouts: blob.knockouts,
    recommendation: blob.recommendation,
  })
}

/**
 * Log a recruiter's reaction to the AI recommendation. This is the self-learning
 * signal log: approve = "the AI's recommendation was useful", skip = "not".
 *
 * NOTE: the learning loop itself is stubbed — we only persist the signal here.
 * A future job will aggregate these events to tune the rubric / calibrate scores;
 * nothing consumes them yet.
 */
export async function recordFeedback(
  applicationId: string,
  signal: 'approve' | 'skip',
): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  const { error } = await v2.from('analytics_events').insert({
    org_id,
    event_type: 'ai_match_feedback',
    application_id: applicationId,
    payload: { signal, at: new Date().toISOString() },
  })
  return { error: error?.message ?? null }
}

/** Coerce a raw payload (edge fn or ai_decisions blob) into a safe MatchCardData. */
function normalize(raw: Partial<MatchCardData> & { score: number }): MatchCardData {
  return {
    score: raw.score,
    rationale: raw.rationale ?? '',
    parsed: raw.parsed,
    checklist: Array.isArray(raw.checklist) ? raw.checklist : [],
    knockouts: Array.isArray(raw.knockouts) ? raw.knockouts : [],
    recommendation: raw.recommendation ?? 'hold',
  }
}
