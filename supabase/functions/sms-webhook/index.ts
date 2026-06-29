// Supabase Edge Function: sms-webhook
// -----------------------------------------------------------------------------
// Inbound text-screening agent. Vapi forwards inbound SMS (from the project's
// Vapi number) to this endpoint; we continue a conversational knockout screening
// over text:
//
//   POST  (Vapi inbound-SMS server message)   verify_jwt OFF (public webhook)
//   GET   -> { ok: true }                      (health check)
//
// Flow: match the sender to a candidate by phone → log the inbound message →
// ask Claude for the next reply (one knockout question at a time, AI-disclosed,
// compliant) → send the reply via Vapi SMS → record answers/transcript on the
// screening → log to communications + ai_decisions. The agent escalates to a
// human when uncertain, and shares the self-scheduling link once screening is
// complete (human-in-the-loop preserved throughout).
//
// INERT until both VAPI_API_KEY and ANTHROPIC_API_KEY are set, and Vapi is
// configured to forward inbound SMS here. Without them we still log the inbound
// message and return 200 so Vapi doesn't retry.
//
// Secrets: ANTHROPIC_API_KEY, VAPI_API_KEY, VAPI_PHONE_NUMBER_ID (optional),
//   PUBLIC_APP_URL (optional). Auto: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// -----------------------------------------------------------------------------
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.70.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPI_KEY = Deno.env.get('VAPI_API_KEY')
const VAPI_PHONE_ID = Deno.env.get('VAPI_PHONE_NUMBER_ID')
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://amallc-coder.github.io/recruiting').replace(/\/+$/, '')

const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'complete', 'escalate', 'answers'],
  properties: {
    reply: { type: 'string' },
    complete: { type: 'boolean' },
    escalate: { type: 'boolean' },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question_id', 'answer'],
        properties: { question_id: { type: 'string' }, answer: { type: 'string' } },
      },
    },
  },
}

interface Q { id: string; question: string; competency?: string }
interface R { question_id: string; answer: string }

// Pull {from, text} out of the various shapes Vapi / SMS providers send.
function parseInbound(body: Record<string, unknown>): { from: string | null; text: string | null } {
  const m = (body.message ?? {}) as Record<string, unknown>
  const cust = ((m.customer ?? body.customer ?? {}) as Record<string, unknown>)
  const phoneObj = (m.phoneNumber ?? {}) as Record<string, unknown>
  const from =
    (m.from as string) || (cust.number as string) || (body.from as string) ||
    (body.From as string) || (phoneObj.number as string) || null
  const text =
    (m.content as string) ?? (m.text as string) ?? (m.message as string) ??
    (body.text as string) ?? (body.content as string) ?? (body.Body as string) ?? null
  return { from: from ?? null, text: text ?? null }
}

async function firstVapiPhoneId(): Promise<string | null> {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method === 'GET') return json({ ok: true }) // health check
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { from, text } = parseInbound(body)
  if (!from || !text || !text.trim()) return json({ ok: true, ignored: 'no inbound text' })

  const admin = createClient(URL_, SERVICE)

  // Match the sender to a candidate by phone (last 10 digits).
  const { data: matches } = await admin.rpc('find_candidate_by_phone', { p_last10: from })
  const cand = (matches as { id: string; org_id: string; full_name: string }[] | null)?.[0]
  if (!cand) return json({ ok: true, ignored: 'no candidate for sender' })

  // Continue the most recent text-capable screening for this candidate.
  const { data: scr } = await admin
    .from('screenings')
    .select('*')
    .eq('candidate_id', cand.id)
    .in('channel', ['sms', 'phone'])
    .in('status', ['approved', 'sent', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const screening = scr as Record<string, unknown> | null

  // Always log the inbound message against the candidate / screening.
  await admin.from('communications').insert({
    candidate_id: cand.id,
    application_id: (screening?.application_id as string) ?? null,
    screening_id: (screening?.id as string) ?? null,
    channel: 'sms', direction: 'inbound', body: text, ai_generated: false,
  })

  if (!screening) return json({ ok: true, logged: true, ignored: 'no active screening' })
  if (!ANTHROPIC_KEY) return json({ ok: true, logged: true, ignored: 'ANTHROPIC_API_KEY not set' })

  // Resolve job title + self-scheduling link.
  const { data: job } = screening.requisition_id
    ? await admin.from('requisitions').select('title').eq('id', screening.requisition_id as string).single()
    : { data: null }
  const { data: app } = screening.application_id
    ? await admin.from('applications').select('schedule_token').eq('id', screening.application_id as string).single()
    : { data: null }
  const link = (app as { schedule_token?: string } | null)?.schedule_token
    ? `${PUBLIC_APP_URL}/#/schedule/${(app as { schedule_token: string }).schedule_token}`
    : null

  const questions = (Array.isArray(screening.questions) ? screening.questions : []) as Q[]
  const responses = (Array.isArray(screening.responses) ? screening.responses : []) as R[]
  const transcript = (screening.transcript as string) ?? ''

  const qaState = questions
    .map((q) => {
      const a = responses.find((r) => r.question_id === q.id)?.answer?.trim()
      return `[${q.id}] ${q.question}${q.competency ? ` (${q.competency})` : ''}\n   answered: ${a || '(not yet)'}`
    })
    .join('\n')

  const sys =
    `You are an AI-assisted text screening assistant for American Medical Administrators, a healthcare ` +
    `staffing company, screening ${cand.full_name || 'a candidate'} for a ${job?.title ?? 'clinical'} role over SMS.\n\n` +
    `Rules:\n` +
    `- You are texting. Keep every reply under ~300 characters, warm and plain.\n` +
    `- If this is the first time you're replying in this thread (no prior assistant messages in the transcript), ` +
    `briefly disclose: "I'm an AI assistant helping with a quick screening."\n` +
    `- Ask ONE screening question at a time, in order, skipping any already answered. Acknowledge their last message first.\n` +
    `- Extract any answers their latest message provides and return them in "answers" (question_id → answer).\n` +
    `- Do NOT ask about protected characteristics (age, marital/family status, health, religion, national origin).\n` +
    `- Set "complete" = true once every question has an answer. When complete, thank them and ` +
    (link ? `share this link so they can book an interview time: ${link}\n` : `tell them a recruiter will reach out to schedule.\n`) +
    `- Set "escalate" = true (and say a recruiter will follow up personally) if they ask for a human, seem upset/confused, ` +
    `go off-topic, or you are unsure how to proceed. When in doubt, escalate rather than guess.\n\n` +
    `Screening questions and current state:\n${qaState}\n\n` +
    `Conversation so far:\n${transcript || '(none yet)'}\n\n` +
    `The candidate just texted: "${text}"\n\n` +
    `Produce the next SMS reply and the structured fields.`

  let parsed: { reply: string; complete: boolean; escalate: boolean; answers: R[] }
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      output_config: { format: { type: 'json_schema', schema: REPLY_SCHEMA } },
      messages: [{ role: 'user', content: sys }],
    })
    const out = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    parsed = JSON.parse(out)
  } catch (e) {
    console.error('sms-webhook: Claude call failed:', e instanceof Error ? e.message : e)
    return json({ ok: true, logged: true, error: 'analysis failed' })
  }

  // Merge newly-extracted answers into the screening's responses.
  const merged = responses.slice()
  for (const a of parsed.answers ?? []) {
    const i = merged.findIndex((r) => r.question_id === a.question_id)
    if (i >= 0) merged[i] = { ...merged[i], answer: a.answer }
    else merged.push({ question_id: a.question_id, answer: a.answer })
  }
  const newTranscript = `${transcript}${transcript ? '\n' : ''}Candidate: ${text}\nAssistant: ${parsed.reply}`.slice(-12000)

  const flags = (Array.isArray(screening.ai_flags) ? screening.ai_flags : []) as unknown[]
  if (parsed.escalate) flags.push({ type: 'needs_human', detail: 'Text agent escalated to a recruiter.', severity: 'high' })

  await admin
    .from('screenings')
    .update({
      responses: merged,
      transcript: newTranscript,
      ai_flags: flags,
      status: parsed.complete ? 'completed' : 'sent',
    })
    .eq('id', screening.id as string)

  // Send the reply (append the scheduling link when wrapping up).
  const outText = parsed.complete && link && !parsed.reply.includes(link) ? `${parsed.reply}\n${link}` : parsed.reply
  const smsId = await sendSms(from, outText)

  await admin.from('communications').insert({
    candidate_id: cand.id,
    application_id: (screening.application_id as string) ?? null,
    screening_id: screening.id as string,
    channel: 'sms', direction: 'outbound', body: outText, ai_generated: true, external_ref: smsId,
  })

  await admin.from('ai_decisions').insert({
    org_id: cand.org_id,
    entity_type: 'application',
    entity_id: (screening.application_id as string) ?? (screening.id as string),
    rationale: parsed.escalate
      ? `Text screening escalated to a human recruiter. Last candidate message: "${text}".`
      : parsed.complete
        ? `Text screening completed via SMS agent.`
        : `Text screening in progress (SMS agent replied).`,
    checklist: [],
    created_by_agent: 'sms-screen',
  })

  return json({ ok: true, replied: !!smsId, complete: parsed.complete, escalate: parsed.escalate })
})
