// v2 AI screening + Vapi voice screening data layer.
// Re-points the old `engage.ts` flow at the v2 `screenings` table (which uses
// requisition_id/org_id instead of job_id) and the v2 Supabase client. AI calls
// go through the `ai-screen` / `vapi-call` edge functions when available, with a
// transparent local fallback so the UI works on a branch / in demo.
import { v2, fetchAll } from './client'
import { demoMode } from '../supabase'
import type { Screening, ScreeningStatus, ScreeningChannel } from './types'

export interface ScreeningQuestion {
  id: string
  question: string
  rationale?: string
  competency?: string
}
export interface ScreeningResponse {
  question_id: string
  answer: string
}
export interface ScreeningFlag {
  type: string
  detail: string
  severity: 'low' | 'medium' | 'high'
}
export interface ScreeningAnalysis {
  summary: string
  score: number
  recommendation: 'advance' | 'hold' | 'reject'
  strengths: string[]
  concerns: string[]
  flags: ScreeningFlag[]
}

/** A screening enriched with the candidate's name, for list/management views. */
export interface ScreeningRow extends Screening {
  candidate: { id: string; full_name: string } | null
}

const SELECT =
  'id,org_id,candidate_id,requisition_id,application_id,recruiter_id,status,channel,questions,responses,ai_summary,ai_score,ai_flags,sentiment_score,sentiment_label,recording_url,transcript,external_ref,created_at, candidate:candidates(id,full_name)'

function qid() {
  return (crypto as { randomUUID?: () => string }).randomUUID?.() ?? 'q-' + Math.random().toString(36).slice(2)
}

export async function listScreenings(candidateId?: string): Promise<ScreeningRow[]> {
  // Paginate past the 1000-row cap so every screening shows; re-sort newest-first in JS.
  const rows = await fetchAll<ScreeningRow>('screenings', SELECT, (q) =>
    candidateId ? q.eq('candidate_id', candidateId) : q,
  )
  return rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

export async function getScreening(id: string): Promise<ScreeningRow | null> {
  const { data } = await v2.from('screenings').select(SELECT).eq('id', id).maybeSingle()
  return (data as unknown as ScreeningRow) ?? null
}

export async function createScreening(input: {
  candidate_id: string
  requisition_id?: string | null
  recruiter_id?: string | null
  channel: ScreeningChannel
  questions: ScreeningQuestion[]
  created_by?: string | null
}): Promise<{ id: string | null; error: string | null }> {
  // The screening belongs to the candidate's org.
  const { data: cand } = await v2.from('candidates').select('org_id').eq('id', input.candidate_id).maybeSingle()
  const orgId = (cand as { org_id: string } | null)?.org_id
  if (!orgId) return { id: null, error: 'Candidate not found' }
  const { data, error } = await v2
    .from('screenings')
    .insert({
      org_id: orgId,
      candidate_id: input.candidate_id,
      requisition_id: input.requisition_id ?? null,
      recruiter_id: input.recruiter_id ?? null,
      channel: input.channel,
      status: 'draft',
      questions: input.questions,
      responses: input.questions.map((q) => ({ question_id: q.id, answer: '' })),
      created_by: input.created_by ?? null,
    })
    .select('id')
    .single()
  return { id: (data as { id: string } | null)?.id ?? null, error: error?.message ?? null }
}

export async function updateScreening(id: string, patch: Partial<Screening>): Promise<{ error: string | null }> {
  const { error } = await v2.from('screenings').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function setStatus(id: string, status: ScreeningStatus): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = { status }
  if (status === 'sent') patch.sent_at = new Date().toISOString()
  if (status === 'completed') patch.completed_at = new Date().toISOString()
  const { error } = await v2.from('screenings').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteScreening(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('screenings').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export interface ScreenContext {
  full_name: string
  resume_text?: string | null
  role_family?: string | null
  requisition_title?: string | null
}

// ---- AI: generate questionnaire (edge fn → local fallback) ----------------
export async function generateScreeningQuestions(ctx: ScreenContext): Promise<ScreeningQuestion[]> {
  if (!demoMode) {
    try {
      const { data, error } = await v2.functions.invoke('ai-screen', {
        body: { action: 'generate', candidate: ctx, job: { title: ctx.requisition_title, role: ctx.role_family } },
      })
      if (!error && Array.isArray(data?.questions) && data.questions.length) {
        return data.questions.map((q: ScreeningQuestion) => ({ ...q, id: q.id || qid() }))
      }
    } catch {
      /* fall through to local */
    }
  }
  return localQuestions(ctx)
}

function localQuestions(ctx: ScreenContext): ScreeningQuestion[] {
  const role = ctx.role_family || 'this role'
  const title = ctx.requisition_title || role
  const base: Array<[string, string, string]> = [
    [`Can you confirm your current ${role} license/certification and its expiration date?`, 'Verify active credentials', 'Licensure'],
    [`How many years of hands-on ${role} experience do you have, and in what settings?`, 'Gauge relevant experience', 'Experience'],
    [`What is your earliest available start date, and what shifts can you commit to?`, 'Confirm availability', 'Availability'],
    [`What are your compensation expectations for a ${title} role?`, 'Surface comp alignment early', 'Compensation'],
    [`What interests you about this ${title} opportunity specifically?`, 'Gauge motivation/fit', 'Motivation'],
    [`Are there any gaps or recent changes in your work history you'd like to explain?`, 'Clarify résumé gaps', 'History'],
  ]
  return base.map(([question, rationale, competency]) => ({ id: qid(), question, rationale, competency }))
}

// ---- AI: analyze responses (edge fn → local fallback) ---------------------
export async function analyzeScreening(
  screening: Pick<Screening, 'questions' | 'responses' | 'transcript'>,
  ctx: ScreenContext,
): Promise<ScreeningAnalysis> {
  if (!demoMode) {
    try {
      const { data, error } = await v2.functions.invoke('ai-screen', {
        body: {
          action: 'analyze',
          candidate: ctx,
          job: { title: ctx.requisition_title, role: ctx.role_family },
          questions: screening.questions,
          responses: screening.responses,
          transcript: screening.transcript ?? undefined,
        },
      })
      if (!error && data && typeof data.score === 'number') {
        return {
          summary: data.summary ?? '',
          score: data.score,
          recommendation: data.recommendation ?? 'hold',
          strengths: data.strengths ?? [],
          concerns: data.concerns ?? [],
          flags: data.flags ?? [],
        }
      }
    } catch {
      /* fall through to local */
    }
  }
  return localAnalysis(screening)
}

function localAnalysis(screening: Pick<Screening, 'questions' | 'responses'>): ScreeningAnalysis {
  const responses = (screening.responses as ScreeningResponse[]) ?? []
  const questions = (screening.questions as ScreeningQuestion[]) ?? []
  const answered = responses.filter((r) => r.answer && r.answer.trim()).length
  const total = Math.max(1, questions.length)
  const completeness = answered / total
  const score = Math.round(45 + completeness * 45)
  const recommendation: ScreeningAnalysis['recommendation'] = completeness < 0.5 ? 'hold' : score >= 70 ? 'advance' : 'hold'
  const flags: ScreeningFlag[] = []
  if (completeness < 1) {
    flags.push({ type: 'incomplete_screening', detail: `${answered}/${total} questions answered`, severity: completeness < 0.5 ? 'high' : 'low' })
  }
  return {
    summary:
      `Local screening readout: ${answered} of ${total} questions answered. ` +
      `Deploy the ai-screen edge function for a full clinical analysis.`,
    score: Math.max(0, Math.min(100, score)),
    recommendation,
    strengths: answered ? ['Candidate responded to the screening'] : [],
    concerns: completeness < 1 ? ['Screening not fully completed'] : [],
    flags,
  }
}

/** Persist the analysis on the screening (status → analyzed) + refresh matching context. */
export async function completeAndAnalyze(screening: ScreeningRow, ctx: ScreenContext): Promise<{ analysis: ScreeningAnalysis; error: string | null }> {
  const analysis = await analyzeScreening(screening, ctx)
  const { error } = await updateScreening(screening.id, {
    status: 'analyzed',
    ai_summary: analysis.summary,
    ai_score: analysis.score,
    ai_flags: analysis.flags as unknown[],
  })
  if (!error) await refreshCandidateContext(screening.candidate_id)
  return { analysis, error }
}

/**
 * Rebuild candidates.screening_summary from the candidate's analyzed screenings.
 * This is the single place AI-screening output is folded into matching context,
 * so everything learned in screening sharpens a candidate's job matches.
 */
export async function refreshCandidateContext(candidateId: string): Promise<void> {
  const { data } = await v2
    .from('screenings')
    .select('status,ai_summary,ai_score,completed_at,updated_at')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
  const rows = (data as { status: string; ai_summary: string | null; ai_score: number | null; completed_at: string | null; updated_at: string | null }[]) ?? []
  const analyzed = rows.filter((s) => s.status === 'analyzed' && s.ai_summary)
  const summary = analyzed
    .slice(0, 3)
    .map((s) => `[Screening${s.ai_score != null ? ` · fit ${s.ai_score}/100` : ''}] ${s.ai_summary}`)
    .join('\n\n')
    .slice(0, 6000)
  const lastAt = analyzed[0]?.completed_at ?? analyzed[0]?.updated_at ?? null
  await v2.from('candidates').update({ screening_summary: summary || null, last_screened_at: lastAt }).eq('id', candidateId)
}

/** Place an agentic voice/SMS screening call via the vapi-call edge function. */
export async function placeScreeningCall(screeningId: string, mode: 'call' | 'sms'): Promise<{ error: string | null }> {
  if (demoMode) return { error: 'Voice screening is unavailable in local mode.' }
  try {
    const { error } = await v2.functions.invoke('vapi-call', { body: { screening_id: screeningId, mode } })
    return { error: error?.message ?? null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Call failed' }
  }
}
