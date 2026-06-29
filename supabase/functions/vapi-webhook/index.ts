// Supabase Edge Function: vapi-webhook  (PUBLIC — deploy with --no-verify-jwt)
// -----------------------------------------------------------------------------
// Receives Vapi server messages for AI screening calls/texts. On an
// end-of-call report it:
//   - stores the transcript + recording URL on the screening,
//   - runs the Claude analysis (summary / fit score / SENTIMENT / flags /
//     per-question answers / a structured scorecard),
//   - logs the inbound transcript (with sentiment) in the communication log,
//   - writes a structured SCORECARD to the candidate's application
//     (scorecards + scorecard_responses — shows on the profile Scorecards tab),
//   - logs the decision to ai_decisions (auditable; AI recommends, human decides),
//   - ADVANCES the application a stage on a confident "advance" (no high-severity
//     flags), otherwise leaves it for the recruiter (the scorecard recommendation
//     is the flag) — human-in-the-loop,
//   - folds the result into candidates.screening_summary so it sharpens matching.
//
// Inbound SMS replies are appended to the communication log too.
//
// Security: if VAPI_WEBHOOK_SECRET is set, the `x-vapi-secret` header must match.
// Secrets: ANTHROPIC_API_KEY (reused), optional VAPI_WEBHOOK_SECRET.
//
// Deploy: supabase functions deploy vapi-webhook --no-verify-jwt
// -----------------------------------------------------------------------------
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.70.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const WEBHOOK_SECRET = Deno.env.get('VAPI_WEBHOOK_SECRET')
const VAPI_KEY = Deno.env.get('VAPI_API_KEY')
const VAPI_PHONE_ID = Deno.env.get('VAPI_PHONE_NUMBER_ID')
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://amallc-coder.github.io/recruiting').replace(/\/+$/, '')

// End-of-call reasons that mean the call never reached a real conversation.
const NO_CONNECT = /no-answer|did-not-answer|voicemail|busy|customer-did-not-give|no-microphone|did-not-receive-customer-audio|failed|pipeline-error|twilio-failed|customer-ended-call-before|assistant-not-found|dial/i

function e164(raw: string | null): string | null {
  if (!raw) return null
  const d = raw.replace(/[^\d]/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  if (raw.trim().startsWith('+')) return raw.trim()
  return null
}
async function firstVapiPhoneId(): Promise<string | null> {
  if (!VAPI_KEY) return null
  try {
    const r = await fetch('https://api.vapi.ai/phone-number', { headers: { Authorization: `Bearer ${VAPI_KEY}` } })
    if (!r.ok) return null
    const arr = await r.json()
    return Array.isArray(arr) && arr[0]?.id ? arr[0].id : null
  } catch {
    return null
  }
}
async function sendSms(to: string, message: string): Promise<string | null> {
  if (!VAPI_KEY) return null
  const phoneId = VAPI_PHONE_ID || (await firstVapiPhoneId())
  if (!phoneId) return null
  try {
    const r = await fetch('https://api.vapi.ai/sms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumberId: phoneId, customer: { number: to }, message }),
    })
    const b = await r.json().catch(() => ({}))
    return r.ok ? (b?.id ?? null) : null
  } catch {
    return null
  }
}
async function scheduleLinkForApp(applicationId: string | null | undefined): Promise<string | null> {
  if (!applicationId) return null
  const { data } = await admin.from('applications').select('schedule_token').eq('id', applicationId).single()
  const tok = (data as { schedule_token?: string } | null)?.schedule_token
  return tok ? `${PUBLIC_APP_URL}/#/schedule/${tok}` : null
}

interface Analysis {
  summary: string
  score: number
  sentiment_score: number
  sentiment_label: string
  recommendation: 'advance' | 'hold' | 'reject'
  strengths: string[]
  concerns: string[]
  flags: { type: string; detail: string; severity: 'low' | 'medium' | 'high' }[]
  answers: { question_id: string; answer: string }[]
  scorecard: { criterion: string; rating: number; comment: string }[]
}

const ANALYZE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'score', 'sentiment_score', 'sentiment_label', 'flags', 'recommendation', 'strengths', 'concerns', 'answers', 'scorecard'],
  properties: {
    summary: { type: 'string' },
    score: { type: 'integer' },
    sentiment_score: { type: 'integer' },
    sentiment_label: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
    recommendation: { type: 'string', enum: ['advance', 'hold', 'reject'] },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    flags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'detail', 'severity'], properties: { type: { type: 'string' }, detail: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high'] } } } },
    answers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question_id', 'answer'], properties: { question_id: { type: 'string' }, answer: { type: 'string' } } } },
    // Structured scorecard: one row per screening criterion, rated 1-5.
    scorecard: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['criterion', 'rating', 'comment'], properties: { criterion: { type: 'string' }, rating: { type: 'integer' }, comment: { type: 'string' } } } },
  },
}

async function analyze(transcript: string, questions: { id?: string; question: string }[], cand: { full_name?: string; role?: string }): Promise<Analysis | null> {
  if (!ANTHROPIC_KEY) return null
  const a = new Anthropic({ apiKey: ANTHROPIC_KEY })
  const qList = questions.map((q, i) => `${i + 1}. [id:${q.id ?? ''}] ${q.question}`).join('\n')
  const prompt =
    `You are an expert clinical-staffing recruiter analyzing a screening CALL transcript. Produce a recruiter-facing analysis:\n` +
    `- summary (2-4 sentences),\n` +
    `- score: 0-100 overall fit,\n` +
    `- sentiment_score: 0-100 for the candidate's sentiment/engagement during the call (0 = negative/disengaged, 100 = positive/enthusiastic), and sentiment_label (positive|neutral|negative),\n` +
    `- recommendation (advance|hold|reject),\n` +
    `- strengths, concerns,\n` +
    `- flags (license_expired, availability_mismatch, comp_gap, location_conflict, inconsistent_answer) with severity,\n` +
    `- answers: the candidate's answer to EACH question (use the exact question id; 1-2 sentences; empty string if unanswered),\n` +
    `- scorecard: a structured per-criterion scorecard. Include one entry per screening question (criterion = a short label for the question) PLUS criteria for "Licensure", "Availability", and "Communication", each rated 1-5 (5 best) with a one-line comment grounded in the transcript.\n` +
    `Base everything ONLY on what the candidate actually said; if incomplete, keep scores conservative.\n\n` +
    `CANDIDATE: ${cand.full_name ?? 'n/a'} (${cand.role ?? 'n/a'})\n` +
    `QUESTIONS (use the id shown for each answer):\n${qList}\n\n` +
    `TRANSCRIPT:\n${transcript}`
  try {
    const resp = await a.messages.create({
      model: 'claude-opus-4-8', max_tokens: 4000,
      output_config: { format: { type: 'json_schema', schema: ANALYZE_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    return JSON.parse(text) as Analysis
  } catch {
    return null
  }
}

// advance|hold|reject + score → the scorecard_rec enum (strong_yes|yes|no|strong_no).
function scorecardRec(recommendation: string, score: number): string {
  if (recommendation === 'advance') return score >= 80 ? 'strong_yes' : 'yes'
  if (recommendation === 'reject') return 'strong_no'
  return 'no'
}
const overallRating = (score: number) => Math.max(1, Math.min(5, Math.round((score || 0) / 20)))
function sentimentEnum(label: string | undefined, score: number | undefined): 'positive' | 'neutral' | 'negative' {
  const l = (label || '').toLowerCase()
  if (l.startsWith('pos')) return 'positive'
  if (l.startsWith('neg')) return 'negative'
  if (l) return 'neutral'
  if (typeof score === 'number') return score >= 66 ? 'positive' : score <= 33 ? 'negative' : 'neutral'
  return 'neutral'
}
const hasHighFlag = (flags: { severity?: string }[] | undefined) => (flags ?? []).some((f) => f.severity === 'high')

/** Write a structured scorecard (scorecards + scorecard_responses) for the application. */
async function writeScorecard(s: Record<string, unknown>, a: Analysis): Promise<void> {
  if (!s.application_id) return
  const { data: sc } = await admin
    .from('scorecards')
    .insert({
      application_id: s.application_id,
      recommendation: scorecardRec(a.recommendation, a.score),
      overall_rating: overallRating(a.score),
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (!sc) return
  const rows = (Array.isArray(a.scorecard) ? a.scorecard : [])
    .map((c) => ({
      scorecard_id: (sc as { id: string }).id,
      criterion: String(c.criterion ?? '').slice(0, 200),
      rating: typeof c.rating === 'number' ? Math.max(1, Math.min(5, Math.round(c.rating))) : null,
      comment: c.comment ? String(c.comment).slice(0, 2000) : null,
    }))
    .filter((r) => r.criterion)
  if (rows.length) await admin.from('scorecard_responses').insert(rows)
}

/** Log the screening decision to ai_decisions (audit trail). */
async function writeAiDecision(s: Record<string, unknown>, a: Analysis, sentLabel: string): Promise<void> {
  if (!s.org_id) return
  const entity_type = s.application_id ? 'application' : 'candidate'
  const entity_id = (s.application_id ?? s.candidate_id) as string
  await admin.from('ai_decisions').insert({
    org_id: s.org_id,
    entity_type,
    entity_id,
    model: 'claude-opus-4-8',
    score: a.score,
    rationale: a.summary,
    checklist: {
      source: 'vapi-screen',
      recommendation: a.recommendation,
      sentiment_score: a.sentiment_score,
      sentiment_label: sentLabel,
      strengths: a.strengths,
      concerns: a.concerns,
      flags: a.flags,
      answers: a.answers,
      scorecard: a.scorecard,
    },
    created_by_agent: 'vapi-screen',
  })
}

/** Best-effort: advance the application to the next non-terminal pipeline stage. */
async function advanceApplication(applicationId: string): Promise<void> {
  const { data: app } = await admin
    .from('applications')
    .select('current_stage_id, requisition:requisitions(role_family)')
    .eq('id', applicationId)
    .single()
  if (!app) return
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))
  const rf = one<{ role_family?: string }>((app as Record<string, unknown>).requisition as never)?.role_family
  if (!rf) return
  const { data: stages } = await admin
    .from('pipeline_stages')
    .select('id, sort_order, is_terminal, stage_type')
    .eq('role_family', rf)
    .order('sort_order', { ascending: true })
  const list = (stages as { id: string; sort_order: number; is_terminal: boolean; stage_type: string }[]) ?? []
  const cur = list.find((x) => x.id === (app as { current_stage_id?: string }).current_stage_id)
  const curSort = cur?.sort_order ?? -1
  const next = list.find((x) => x.sort_order > curSort && !x.is_terminal && x.stage_type !== 'rejected')
  if (next && next.id !== (app as { current_stage_id?: string }).current_stage_id) {
    await admin.from('applications').update({ current_stage_id: next.id }).eq('id', applicationId)
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
    parts.push(`[Screening${s.ai_score != null ? ` · fit ${s.ai_score}/100` : ''}${s.sentiment_label ? ` · ${s.sentiment_label}` : ''}] ${s.ai_summary}` + (flags.length ? ` Flags: ${flags.join('; ')}.` : ''))
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
  if (type === 'end-of-call-report' || (type === 'status-update' && msg?.status === 'ended')) {
    const callId = msg?.call?.id ?? payload?.call?.id
    const transcript: string = msg?.artifact?.transcript ?? msg?.transcript ?? ''
    const endedReason: string = msg?.endedReason ?? msg?.call?.endedReason ?? msg?.artifact?.endedReason ?? ''
    const recordingUrl: string | null =
      msg?.artifact?.recordingUrl ?? msg?.artifact?.recording?.url ?? msg?.recordingUrl ?? msg?.recording?.url ?? null
    const metaScreening = msg?.call?.metadata?.screening_id ?? msg?.call?.assistant?.metadata?.screening_id

    let s: Record<string, unknown> | null = null
    if (metaScreening) s = (await admin.from('screenings').select('*').eq('id', metaScreening).single()).data
    if (!s && callId) s = (await admin.from('screenings').select('*').eq('external_ref', callId).single()).data
    if (!s) return json({ ok: true, note: 'no matching screening' })

    const { data: cand } = await admin.from('candidates').select('id,full_name,phone').eq('id', s.candidate_id as string).single()
    const { data: reqRow } = s.requisition_id
      ? await admin.from('requisitions').select('role_family').eq('id', s.requisition_id as string).single()
      : { data: null }
    const questions = Array.isArray(s.questions) ? (s.questions as { id?: string; question: string }[]) : []

    // ---- call did not connect (no answer / voicemail / busy / failed) -----
    // Text the candidate that we'll try again, and leave the screening 'approved'
    // so it can be re-sent (manually or by another auto-dispatch). No analysis.
    const noConnect = transcript.trim().length === 0 || NO_CONNECT.test(endedReason)
    if (noConnect) {
      const phone = e164(cand?.phone ?? null)
      const first = cand?.full_name?.split(' ')[0] || 'there'
      const text =
        `Hi ${first}, this is American Medical Administrators — we just tried to reach you for a quick screening ` +
        `but couldn't connect. We'll try again soon, or reply here and our AI assistant can do it by text. Thank you!`
      const smsId = phone ? await sendSms(phone, text) : null
      const flags = (Array.isArray(s.ai_flags) ? s.ai_flags : []) as unknown[]
      flags.push({ type: 'call_no_connect', detail: `Call did not connect${endedReason ? ` (${endedReason})` : ''}.`, severity: 'low' })
      await admin.from('screenings').update({
        status: 'approved', ai_flags: flags,
        ...(transcript ? { transcript } : {}), ...(recordingUrl ? { recording_url: recordingUrl } : {}),
      }).eq('id', s.id)
      await admin.from('communications').insert({
        candidate_id: s.candidate_id, application_id: s.application_id ?? null, screening_id: s.id,
        channel: 'call', direction: 'outbound',
        body: `Screening call did not connect${endedReason ? ` (${endedReason})` : ''}.${smsId ? ' Sent a follow-up text.' : ''}`,
        ai_generated: true, external_ref: callId,
      })
      if (smsId) {
        await admin.from('communications').insert({
          candidate_id: s.candidate_id, application_id: s.application_id ?? null, screening_id: s.id,
          channel: 'sms', direction: 'outbound', body: text, ai_generated: true, external_ref: smsId,
        })
      }
      return json({ ok: true, no_connect: true, reason: endedReason, texted: !!smsId })
    }

    const a = transcript ? await analyze(transcript, questions, { full_name: cand?.full_name, role: reqRow?.role_family }) : null
    const sentLabel = a ? sentimentEnum(a.sentiment_label, a.sentiment_score) : null

    // Transcript → communication log (with sentiment when analyzed).
    if (transcript) {
      await admin.from('communications').insert({
        candidate_id: s.candidate_id, application_id: s.application_id ?? null, screening_id: s.id,
        channel: 'call', direction: 'inbound', subject: 'AI screening call transcript', body: transcript,
        ai_generated: true, external_ref: callId, ...(sentLabel ? { sentiment: sentLabel } : {}),
      })
    }

    // Map extracted answers back onto each question so the answer boxes fill.
    let responses: { question_id: string; answer: string }[] | undefined
    if (a?.answers) {
      const byId = new Map(a.answers.map((x) => [x.question_id, x.answer]))
      responses = questions.map((q) => ({ question_id: q.id ?? '', answer: byId.get(q.id ?? '') ?? '' }))
    }
    await admin.from('screenings').update({
      transcript: transcript || null,
      recording_url: recordingUrl,
      status: a ? 'analyzed' : 'completed',
      completed_at: new Date().toISOString(),
      ...(responses ? { responses } : {}),
      ...(a ? { ai_summary: a.summary, ai_score: a.score, ai_flags: a.flags, sentiment_score: a.sentiment_score, sentiment_label: sentLabel } : {}),
    }).eq('id', s.id)

    // Structured scorecard + audit + advance/flag (human-in-the-loop).
    if (a) {
      await writeScorecard(s, a)
      await writeAiDecision(s, a, sentLabel as string)
      if (s.application_id && a.recommendation === 'advance' && !hasHighFlag(a.flags)) {
        await advanceApplication(s.application_id as string)
        // Invite the candidate to self-schedule an interview now that they passed screening.
        const link = await scheduleLinkForApp(s.application_id as string)
        const phone = e164(cand?.phone ?? null)
        if (link && phone) {
          const first = cand?.full_name?.split(' ')[0] || 'there'
          const text = `Great news ${first} — based on our screening we'd love to set up an interview. Pick a time that works for you here: ${link}`
          const smsId = await sendSms(phone, text)
          if (smsId) {
            await admin.from('communications').insert({
              candidate_id: s.candidate_id, application_id: s.application_id ?? null, screening_id: s.id,
              channel: 'sms', direction: 'outbound', body: text, ai_generated: true, external_ref: smsId,
            })
          }
        }
      }
    }

    if (cand?.id) await refreshContext(cand.id)
    return json({ ok: true, analyzed: !!a, sentiment: sentLabel })
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
