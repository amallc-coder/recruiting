// Supabase Edge Function: vapi-webhook  (PUBLIC — deploy with --no-verify-jwt)
// -----------------------------------------------------------------------------
// Receives Vapi server messages for AI screening calls/texts. On an
// end-of-call report it: stores the transcript on the screening, runs the
// Claude analysis (summary / fit score / flags), logs the inbound transcript in
// the communication log, and folds the result into candidates.screening_summary
// so it sharpens matching — exactly the recruiter readout + feedback loop.
//
// Inbound SMS replies are appended to the communication log too.
//
// Security: if VAPI_WEBHOOK_SECRET is set, the `x-vapi-secret` header must match
// (configure the same secret on the assistant's server object).
//
// Secrets: ANTHROPIC_API_KEY (reused), optional VAPI_WEBHOOK_SECRET.
//
// SCHEMA: v2 — reads screenings.requisition_id, derives role from the requisition
//   (v2 candidates have no role column), and writes communications without
//   job_id/recruiter_id. candidates.screening_summary/last_screened_at exist in
//   v2 (11_screening_context.sql). DEPLOY AT CUTOVER (Phase 4), after migration.
//
// Deploy:
//   supabase functions deploy vapi-webhook --no-verify-jwt
// -----------------------------------------------------------------------------
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.70.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const WEBHOOK_SECRET = Deno.env.get('VAPI_WEBHOOK_SECRET')

const ANALYZE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'score', 'flags', 'recommendation', 'strengths', 'concerns', 'answers'],
  properties: {
    summary: { type: 'string' }, score: { type: 'integer' },
    recommendation: { type: 'string', enum: ['advance', 'hold', 'reject'] },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    flags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'detail', 'severity'], properties: { type: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] } } } },
    // The candidate's answer to each question, pulled from the transcript.
    answers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question_id', 'answer'], properties: { question_id: { type: 'string' }, answer: { type: 'string' } } } },
  },
}

async function analyze(transcript: string, questions: { id?: string; question: string }[], cand: { full_name?: string; role?: string }) {
  if (!ANTHROPIC_KEY) return null
  const a = new Anthropic({ apiKey: ANTHROPIC_KEY })
  const qList = questions.map((q, i) => `${i + 1}. [id:${q.id ?? ''}] ${q.question}`).join('\n')
  const prompt =
    `You are an expert clinical-staffing recruiter analyzing a screening CALL transcript. ` +
    `Produce a recruiter-facing analysis: summary (2-4 sentences), score 0-100 fit, ` +
    `recommendation (advance|hold|reject), strengths, concerns, and flags ` +
    `(license_expired, availability_mismatch, comp_gap, location_conflict, inconsistent_answer) ` +
    `with severity. ALSO, for "answers", return the candidate's answer to EACH question — use the ` +
    `exact question id given, summarize what they actually said in 1-2 sentences, and use an empty ` +
    `string if a question wasn't answered. ` +
    `Base everything ONLY on what the candidate actually said; if incomplete, keep the score conservative.\n\n` +
    `CANDIDATE: ${cand.full_name ?? 'n/a'} (${cand.role ?? 'n/a'})\n` +
    `QUESTIONS (use the id shown for each answer):\n${qList}\n\n` +
    `TRANSCRIPT:\n${transcript}`
  try {
    const resp = await a.messages.create({
      model: 'claude-opus-4-8', max_tokens: 3000,
      output_config: { format: { type: 'json_schema', schema: ANALYZE_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Rebuild candidates.screening_summary from analyzed screenings + the comms log.
async function refreshContext(candidateId: string) {
  const { data: screenings } = await admin.from('screenings').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false })
  const { data: comms } = await admin.from('communications').select('*').eq('candidate_id', candidateId).order('occurred_at', { ascending: false })
  const parts: string[] = []
  const analyzed = (screenings ?? []).filter((s) => s.status === 'analyzed' && s.ai_summary)
  for (const s of analyzed.slice(0, 3)) {
    const flags = (s.ai_flags ?? []).map((f: { detail: string }) => f.detail).filter(Boolean)
    parts.push(`[Screening${s.ai_score != null ? ` · fit ${s.ai_score}/100` : ''}] ${s.ai_summary}` + (flags.length ? ` Flags: ${flags.join('; ')}.` : ''))
  }
  const recent = (comms ?? []).filter((c) => c.body?.trim()).slice(0, 8).map((c) => `[${c.direction === 'inbound' ? 'Candidate' : c.channel}] ${c.body.trim()}`)
  if (recent.length) parts.push('Recent communication:\n' + recent.join('\n'))
  await admin.from('candidates').update({
    screening_summary: parts.join('\n\n').slice(0, 6000) || null,
    last_screened_at: analyzed[0]?.completed_at ?? new Date().toISOString(),
  }).eq('id', candidateId)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: true })
  if (WEBHOOK_SECRET && req.headers.get('x-vapi-secret') !== WEBHOOK_SECRET) return json({ error: 'bad secret' }, 401)

  const payload = await req.json().catch(() => ({}))
  const msg = payload?.message ?? payload
  const type = msg?.type

  // ---- end of call: transcript + analysis -------------------------------
  if (type === 'end-of-call-report' || type === 'status-update' && msg?.status === 'ended') {
    const callId = msg?.call?.id ?? payload?.call?.id
    const transcript: string = msg?.artifact?.transcript ?? msg?.transcript ?? ''
    const metaScreening = msg?.call?.metadata?.screening_id ?? msg?.call?.assistant?.metadata?.screening_id

    // Find the screening by metadata or by the stored call id.
    let s: Record<string, unknown> | null = null
    if (metaScreening) s = (await admin.from('screenings').select('*').eq('id', metaScreening).single()).data
    if (!s && callId) s = (await admin.from('screenings').select('*').eq('external_ref', callId).single()).data
    if (!s) return json({ ok: true, note: 'no matching screening' })

    const { data: cand } = await admin.from('candidates').select('id,full_name').eq('id', s.candidate_id as string).single()
    // v2 candidates have no role column; derive it from the screening's requisition.
    const { data: reqRow } = s.requisition_id
      ? await admin.from('requisitions').select('role_family').eq('id', s.requisition_id as string).single()
      : { data: null }
    const questions = Array.isArray(s.questions) ? (s.questions as { question: string }[]) : []

    if (transcript) {
      await admin.from('communications').insert({
        candidate_id: s.candidate_id, application_id: s.application_id ?? null, screening_id: s.id,
        channel: 'call', direction: 'inbound', subject: 'AI screening call transcript', body: transcript,
        ai_generated: true, external_ref: callId,
      })
    }

    const a = transcript ? await analyze(transcript, questions, { full_name: cand?.full_name, role: reqRow?.role_family }) : null
    // Map the extracted answers back onto each question so the answer boxes fill.
    let responses: { question_id: string; answer: string }[] | undefined
    if (a?.answers) {
      const byId = new Map((a.answers as { question_id: string; answer: string }[]).map((x) => [x.question_id, x.answer]))
      responses = questions.map((q) => ({ question_id: (q as { id?: string }).id ?? '', answer: byId.get((q as { id?: string }).id ?? '') ?? '' }))
    }
    await admin.from('screenings').update({
      transcript: transcript || null,
      status: a ? 'analyzed' : 'completed',
      completed_at: new Date().toISOString(),
      ...(responses ? { responses } : {}),
      ...(a ? { ai_summary: a.summary, ai_score: a.score, ai_flags: a.flags } : {}),
    }).eq('id', s.id)

    if (cand?.id) await refreshContext(cand.id)
    return json({ ok: true, analyzed: !!a })
  }

  // ---- inbound SMS reply ------------------------------------------------
  if (type === 'message' || type === 'sms' || msg?.sms) {
    const from = msg?.from ?? msg?.customer?.number
    const text: string = msg?.message ?? msg?.text ?? msg?.sms?.message ?? ''
    if (from && text) {
      const { data: cand } = await admin.from('candidates').select('id').ilike('phone', `%${String(from).replace(/[^\d]/g, '').slice(-10)}%`).limit(1).maybeSingle()
      if (cand?.id) {
        await admin.from('communications').insert({ candidate_id: cand.id, channel: 'sms', direction: 'inbound', body: text, external_ref: msg?.id ?? null })
        await refreshContext(cand.id)
      }
    }
    return json({ ok: true })
  }

  return json({ ok: true })
})
