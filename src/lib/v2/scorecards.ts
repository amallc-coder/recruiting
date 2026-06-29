// Structured interview evaluation: scorecards + the "completed scorecard
// required before advancing" gate. Writes to scorecards + scorecard_responses
// (the same tables the AI screening fills), so AI-generated and human scorecards
// live together. An AI interview kit (criteria to score) is drafted from the
// role via the ai-screen edge function.
import { v2 } from './client'
import { demoMode } from '../supabase'

export type ScorecardRec = 'strong_yes' | 'yes' | 'no' | 'strong_no'

export const RECOMMENDATIONS: { value: ScorecardRec; label: string }[] = [
  { value: 'strong_yes', label: 'Strong yes' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'strong_no', label: 'Strong no' },
]

export interface ScorecardCriterion {
  criterion: string
  rating: number | null
  comment: string
}

/** True if the application already has at least one submitted scorecard. */
export async function hasSubmittedScorecard(applicationId: string): Promise<boolean> {
  const { count } = await v2
    .from('scorecards')
    .select('id', { count: 'exact', head: true })
    .eq('application_id', applicationId)
    .not('submitted_at', 'is', null)
  return (count ?? 0) > 0
}

export async function submitScorecard(
  applicationId: string,
  input: { recommendation: ScorecardRec; overall_rating: number; criteria: ScorecardCriterion[] },
): Promise<{ error: string | null }> {
  const { data: sc, error } = await v2
    .from('scorecards')
    .insert({
      application_id: applicationId,
      recommendation: input.recommendation,
      overall_rating: input.overall_rating,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !sc) return { error: error?.message ?? 'Could not save scorecard.' }
  const rows = input.criteria
    .filter((c) => c.criterion.trim())
    .map((c) => ({
      scorecard_id: (sc as { id: string }).id,
      criterion: c.criterion.trim().slice(0, 200),
      rating: c.rating,
      comment: c.comment.trim() ? c.comment.trim().slice(0, 2000) : null,
    }))
  if (rows.length) {
    const { error: e2 } = await v2.from('scorecard_responses').insert(rows)
    if (e2) return { error: e2.message }
  }
  return { error: null }
}

const DEFAULT_KIT = [
  'Clinical competency',
  'Relevant experience',
  'Communication',
  'Licensure & compliance',
  'Team / culture fit',
  'Availability & logistics',
]

/** Draft a structured interview kit (criteria to score) for a role. Uses the
 *  ai-screen generator when available; falls back to a sensible clinical kit. */
export async function generateInterviewKit(ctx: {
  title?: string | null
  role_family?: string | null
  specialty?: string | null
}): Promise<ScorecardCriterion[]> {
  if (!demoMode) {
    try {
      const { data, error } = await v2.functions.invoke('ai-screen', {
        body: { action: 'generate', candidate: {}, job: { title: ctx.title, role: ctx.role_family } },
      })
      if (!error && Array.isArray(data?.questions) && data.questions.length) {
        return data.questions
          .map((q: { competency?: string; question?: string }) => (q.competency || q.question || '').trim())
          .filter(Boolean)
          .slice(0, 10)
          .map((criterion: string) => ({ criterion, rating: null, comment: '' }))
      }
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_KIT.map((criterion) => ({ criterion, rating: null, comment: '' }))
}
