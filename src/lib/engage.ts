// Candidate engagement: AI screening + the two-way communication log.
// ---------------------------------------------------------------------------
// Flow:
//   1. generateScreeningQuestions() — Claude (ai-screen) drafts a questionnaire
//      from the candidate's résumé + the opening. Recruiter reviews/edits.
//   2. The recruiter approves -> 'approved', then sends (phone/sms/email or an
//      agentic call) -> 'sent'. Answers come back (typed, or a transcript from
//      a voice/SMS vendor) -> 'completed'.
//   3. analyzeScreening() — Claude reads the answers and returns a recruiter
//      readout (summary, score, flags, recommendation) -> 'analyzed'.
//   4. refreshCandidateContext() folds the analysis + the communication log
//      into candidates.screening_summary, which match.ts blends into ranking so
//      everything learned about a candidate sharpens their job matches.
//
// Everything degrades gracefully in local/demo mode (no Edge Functions): a
// transparent local generator/analyzer stands in for Claude so the UI works.

import { supabase, demoMode } from './supabase'
import { ROLE_LABELS } from './types'
import type {
  Candidate,
  Communication,
  Job,
  Screening,
  ScreeningFlag,
  ScreeningQuestion,
} from './types'

export interface ScreeningAnalysis {
  summary: string
  score: number
  recommendation: 'advance' | 'hold' | 'reject'
  strengths: string[]
  concerns: string[]
  flags: ScreeningFlag[]
}

function qid() {
  return (crypto as { randomUUID?: () => string }).randomUUID?.() ?? 'q-' + Math.random().toString(36).slice(2)
}

// The slim view of a candidate/job we send to the model.
function candidatePayload(c: Candidate) {
  return {
    full_name: c.full_name,
    role: c.role,
    region: c.region,
    resume_text: c.resume_text ?? '',
    rating: c.rating ?? undefined,
    notes: c.notes ?? undefined,
  }
}
function jobPayload(j: Job | null) {
  if (!j) return {}
  return {
    title: j.title,
    role: j.role,
    location: j.location,
    description: j.description,
    responsibilities: j.responsibilities,
    requirements: j.requirements,
    employment_type: j.employment_type,
  }
}

// ---- AI: generate questionnaire ------------------------------------------
export async function generateScreeningQuestions(
  candidate: Candidate,
  job: Job | null,
): Promise<ScreeningQuestion[]> {
  if (!demoMode) {
    try {
      const { data, error } = await supabase.functions.invoke('ai-screen', {
        body: { action: 'generate', candidate: candidatePayload(candidate), job: jobPayload(job) },
      })
      if (!error && Array.isArray(data?.questions) && data.questions.length) {
        return data.questions.map((q: ScreeningQuestion) => ({ ...q, id: q.id || qid() }))
      }
    } catch {
      /* fall through to local */
    }
  }
  return localQuestions(candidate, job)
}

// Transparent fallback so screening works offline / in demo.
function localQuestions(candidate: Candidate, job: Job | null): ScreeningQuestion[] {
  const roleLabel = ROLE_LABELS[candidate.role] ?? candidate.role
  const where = job?.location || candidate.region || 'the assigned territory'
  const title = job?.title || roleLabel
  const base: Array<[string, string, string]> = [
    [`Can you confirm your current ${roleLabel} license/certification and its expiration date?`, 'Verify active credentials', 'Licensure'],
    [`How many years of hands-on ${roleLabel} experience do you have, and in what settings?`, 'Gauge relevant experience', 'Experience'],
    [`What is your earliest available start date, and what shifts/hours can you commit to?`, 'Confirm availability', 'Availability'],
    [`This role is based at ${where}. Does the commute or location work for you?`, 'Confirm location fit', 'Location'],
    [`What are your compensation expectations for a ${title} role?`, 'Surface comp alignment early', 'Compensation'],
    [`What interests you about this ${title} opportunity specifically?`, 'Gauge motivation/fit', 'Motivation'],
    [`Are there any gaps or recent changes in your work history you'd like to explain?`, 'Clarify résumé gaps', 'History'],
  ]
  return base.map(([question, rationale, competency]) => ({ id: qid(), question, rationale, competency }))
}

// ---- AI: analyze responses -----------------------------------------------
export async function analyzeScreening(
  screening: Pick<Screening, 'questions' | 'responses' | 'transcript'>,
  candidate: Candidate,
  job: Job | null,
): Promise<ScreeningAnalysis> {
  if (!demoMode) {
    try {
      const { data, error } = await supabase.functions.invoke('ai-screen', {
        body: {
          action: 'analyze',
          candidate: candidatePayload(candidate),
          job: jobPayload(job),
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
  return localAnalysis(screening, candidate)
}

function localAnalysis(
  screening: Pick<Screening, 'questions' | 'responses'>,
  candidate: Candidate,
): ScreeningAnalysis {
  const answered = screening.responses.filter((r) => r.answer && r.answer.trim()).length
  const total = Math.max(1, screening.questions.length)
  const completeness = answered / total
  // Conservative score until the screening is complete (skew-safe by design).
  const score = Math.round(40 + completeness * 45 + Math.min(15, (candidate.rating ?? 0) * 3))
  const recommendation: ScreeningAnalysis['recommendation'] =
    completeness < 0.5 ? 'hold' : score >= 70 ? 'advance' : 'hold'
  const flags: ScreeningFlag[] = []
  if (completeness < 1) {
    flags.push({ type: 'incomplete_screening', detail: `${answered}/${total} questions answered`, severity: completeness < 0.5 ? 'high' : 'low' })
  }
  return {
    summary:
      `Local screening readout: ${answered} of ${total} questions answered. ` +
      `Connect AI screening (deploy ai-screen) for a full clinical analysis.`,
    score: Math.max(0, Math.min(100, score)),
    recommendation,
    strengths: answered ? ['Candidate responded to the screening'] : [],
    concerns: completeness < 1 ? ['Screening not fully completed'] : [],
    flags,
  }
}

// ---- Screening persistence -----------------------------------------------
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null
  return (data as T) ?? null
}

export async function listScreenings(candidateId: string): Promise<Screening[]> {
  const { data, error } = await supabase
    .from('screenings')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Screening[]
}

export async function createScreening(input: {
  candidate_id: string
  job_id: string | null
  recruiter_id: string | null
  channel: Screening['channel']
  questions: ScreeningQuestion[]
  created_by: string | null
}): Promise<Screening> {
  const { data, error } = await supabase
    .from('screenings')
    .insert({
      candidate_id: input.candidate_id,
      job_id: input.job_id,
      recruiter_id: input.recruiter_id,
      channel: input.channel,
      status: 'draft',
      questions: input.questions,
      responses: input.questions.map((q) => ({ question_id: q.id, answer: '' })),
      created_by: input.created_by,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return firstRow<Screening>(data)!
}

export async function updateScreening(id: string, patch: Partial<Screening>): Promise<void> {
  const { error } = await supabase.from('screenings').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteScreening(id: string): Promise<void> {
  const { error } = await supabase.from('screenings').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Communication log ----------------------------------------------------
export async function listCommunications(candidateId: string): Promise<Communication[]> {
  const { data, error } = await supabase
    .from('communications')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('occurred_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Communication[]
}

export async function logCommunication(input: {
  candidate_id: string
  job_id?: string | null
  screening_id?: string | null
  recruiter_id: string | null
  channel: Communication['channel']
  direction: Communication['direction']
  subject?: string | null
  body: string
  ai_generated?: boolean
  created_by: string | null
  occurred_at?: string
}): Promise<Communication> {
  const { data, error } = await supabase
    .from('communications')
    .insert({
      candidate_id: input.candidate_id,
      job_id: input.job_id ?? null,
      screening_id: input.screening_id ?? null,
      recruiter_id: input.recruiter_id,
      channel: input.channel,
      direction: input.direction,
      subject: input.subject ?? null,
      body: input.body,
      ai_generated: input.ai_generated ?? false,
      created_by: input.created_by,
      ...(input.occurred_at ? { occurred_at: input.occurred_at } : {}),
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  await refreshCandidateContext(input.candidate_id)
  return firstRow<Communication>(data)!
}

// ---- Matching feedback loop ----------------------------------------------
// Rebuild candidates.screening_summary from analyzed screenings + the comms log.
// This is the single place "everything communicated" gets folded into matching.
export async function refreshCandidateContext(candidateId: string): Promise<string> {
  const [screenings, comms] = await Promise.all([
    listScreenings(candidateId).catch(() => [] as Screening[]),
    listCommunications(candidateId).catch(() => [] as Communication[]),
  ])

  const parts: string[] = []
  const analyzed = screenings.filter((s) => s.status === 'analyzed' && s.ai_summary)
  for (const s of analyzed.slice(0, 3)) {
    const flags = (s.ai_flags ?? []).map((f) => f.detail).filter(Boolean)
    parts.push(
      `[Screening${s.ai_score != null ? ` · fit ${s.ai_score}/100` : ''}] ${s.ai_summary}` +
        (flags.length ? ` Flags: ${flags.join('; ')}.` : ''),
    )
  }
  // Most recent substantive messages, candidate words first.
  const recent = comms
    .filter((c) => c.body && c.body.trim())
    .slice(0, 8)
    .map((c) => `[${c.direction === 'inbound' ? 'Candidate' : c.channel}] ${c.body.trim()}`)
  if (recent.length) parts.push('Recent communication:\n' + recent.join('\n'))

  const summary = parts.join('\n\n').slice(0, 6000)
  const lastAt = analyzed[0]?.completed_at ?? analyzed[0]?.updated_at ?? null
  const { error } = await supabase
    .from('candidates')
    .update({ screening_summary: summary || null, last_screened_at: lastAt })
    .eq('id', candidateId)
  if (error) throw new Error(error.message)
  return summary
}

// Run analysis, persist it on the screening, and refresh the matching context.
export async function completeAndAnalyze(
  screening: Screening,
  candidate: Candidate,
  job: Job | null,
): Promise<ScreeningAnalysis> {
  const analysis = await analyzeScreening(screening, candidate, job)
  await updateScreening(screening.id, {
    status: 'analyzed',
    ai_summary: analysis.summary,
    ai_score: analysis.score,
    ai_flags: analysis.flags,
    completed_at: screening.completed_at ?? new Date().toISOString(),
  })
  await refreshCandidateContext(candidate.id)
  return analysis
}
