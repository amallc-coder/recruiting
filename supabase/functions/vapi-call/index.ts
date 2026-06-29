// Supabase Edge Function: vapi-call
// -----------------------------------------------------------------------------
// Places a fully-agentic AI screening *phone call* (or sends an SMS) to a
// candidate via Vapi, using the recruiter-approved screening questions.
//
//   POST { screening_id, mode?: 'call' | 'sms' }   Authorization: Bearer <jwt>
//   -> { ok, call_id }   (call_id stored on the screening as external_ref)
//
// The call is conducted by a Vapi voice agent that introduces itself, asks the
// approved questions one at a time, and hangs up. When the call ends, Vapi POSTs
// an end-of-call report to the `vapi-webhook` function, which records the
// transcript, runs the analysis, and feeds it back into matching.
//
// Secrets (set in Supabase → Edge Functions → Secrets):
//   VAPI_API_KEY            (required) — your Vapi private API key
//   VAPI_PHONE_NUMBER_ID    (optional) — caller-ID number id; if unset we use
//                                        the first number on the Vapi account
//
// SCHEMA: v2 — reads screenings.requisition_id (not job_id), users (not
//   profiles), and writes communications without job_id/recruiter_id. DEPLOY AT
//   CUTOVER (Phase 4), after the DB is migrated; deploying against the old schema
//   would break it.
//
// Deploy:
//   supabase functions deploy vapi-call
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const VAPI_KEY = Deno.env.get('VAPI_API_KEY')
const VAPI_PHONE_ID = Deno.env.get('VAPI_PHONE_NUMBER_ID')
// Voice is configurable without code changes. Set these in Supabase secrets:
//   VAPI_VOICE_ID        e.g. "Clara"   (defaults to Elliot)
//   VAPI_VOICE_PROVIDER  e.g. "vapi" | "11labs" | "playht"  (defaults to vapi)
const VOICE_ID = Deno.env.get('VAPI_VOICE_ID') || 'Elliot'
const VOICE_PROVIDER = Deno.env.get('VAPI_VOICE_PROVIDER') || 'vapi'
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://amallc-coder.github.io/recruiting').replace(/\/+$/, '')

// Normalize a US phone to E.164 (+1XXXXXXXXXX). Returns null if it can't.
function e164(raw: string | null): string | null {
  if (!raw) return null
  const d = raw.replace(/[^\d]/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  if (raw.trim().startsWith('+')) return raw.trim()
  return null
}

function systemPrompt(candidateName: string, jobTitle: string, questions: { question: string }[]) {
  const list = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')
  return (
    `You are Jordan, a friendly, professional recruiting assistant for American Medical Administrators, ` +
    `calling ${candidateName || 'the candidate'} about a ${jobTitle || 'clinical'} opportunity. ` +
    `Your job is to conduct a brief phone screening.\n\n` +
    `Identity:\n` +
    `- Introduce yourself by name as "Jordan, calling on behalf of American Medical Administrators."\n` +
    `- NEVER say placeholder text such as "[your name]", "your name", or "[company]". Use the real names above.\n\n` +
    `Conversation style — VERY IMPORTANT:\n` +
    `- Let the candidate FULLY finish speaking. Wait for a clear pause before you respond.\n` +
    `- Never talk over them or interrupt mid-sentence. Do not use filler like "thank you for sharing that" ` +
    `until they have completely finished their answer.\n` +
    `- Ask exactly ONE question, then stop talking and wait for their full answer.\n` +
    `- Keep your own turns short (1-2 sentences).\n\n` +
    `Opening disclosure (say this near the start, right after confirming who you are speaking with):\n` +
    `- "Before we start, I want to let you know this is an AI-assisted call and it's being recorded ` +
    `for quality and accuracy. Is that okay with you?" Wait for their consent. If they decline recording, ` +
    `let them know a human recruiter will follow up instead, thank them, and end the call.\n` +
    `- Because this is AI-assisted, if anything is unclear or you mishear, briefly apologize and ask them ` +
    `to repeat — be gracious and patient.\n\n` +
    `Guidelines:\n` +
    `- Greet them warmly, confirm you're speaking with the right person, give the disclosure above, and ask if it's a good time.\n` +
    `- Ask the questions below ONE AT A TIME, conversationally. Briefly acknowledge each answer before moving on.\n` +
    `- Do NOT ask about protected characteristics (age, marital/family status, health, religion, national origin).\n` +
    `- Keep it under ~8 minutes. If they're busy, offer to call back.\n` +
    `Language:\n` +
    `- If the candidate responds in another language (for example Spanish), switch to that language and ` +
    `conduct the rest of the screening in their language, including the disclosure if you haven't given it yet. ` +
    `Match the language they're most comfortable in.\n\n` +
    `Closing (do this before ending the call):\n` +
    `- Once you've gone through the questions, ASK: "Is there anything else you'd like me to pass along to ` +
    `the recruiter before I let you go?" and listen to their full answer.\n` +
    `- Then briefly recap any key follow-ups, thank them sincerely for their time, let them know a recruiter ` +
    `will be in touch with next steps, and end the call warmly.\n\n` +
    `Screening questions:\n${list}`
  )
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!VAPI_KEY) return json({ error: 'VAPI_API_KEY not set' }, 500)

  // Authenticate the caller and confirm they own the screening (or are admin).
  const authHeader = req.headers.get('Authorization') ?? ''
  const admin = createClient(URL_, SERVICE)
  const caller = createClient(URL_, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)
  const { data: prof } = await admin.from('users').select('role,active').eq('id', u.user.id).single()
  if (!prof || !prof.active) return json({ error: 'Inactive account' }, 403)

  const { screening_id, mode = 'call' } = await req.json().catch(() => ({}))
  if (!screening_id) return json({ error: 'Missing screening_id' }, 400)

  const { data: s } = await admin.from('screenings').select('*').eq('id', screening_id).single()
  if (!s) return json({ error: 'Screening not found' }, 404)
  const isOwner = prof.role === 'admin' || s.recruiter_id === u.user.id || s.created_by === u.user.id
  if (!isOwner) return json({ error: 'Not your screening' }, 403)

  const { data: cand } = await admin.from('candidates').select('*').eq('id', s.candidate_id).single()
  if (!cand) return json({ error: 'Candidate not found' }, 404)
  const phone = e164(cand.phone)
  if (!phone) return json({ error: 'Candidate has no valid US phone number on file.' }, 400)

  const { data: job } = s.requisition_id ? await admin.from('requisitions').select('title').eq('id', s.requisition_id).single() : { data: null }

  if (mode === 'schedule') {
    // Send the candidate their self-scheduling link (no questions needed).
    const { data: app } = s.application_id
      ? await admin.from('applications').select('schedule_token').eq('id', s.application_id).single()
      : { data: null }
    const tok = (app as { schedule_token?: string } | null)?.schedule_token
    if (!tok) return json({ error: 'This screening has no linked application to schedule against.' }, 400)
    const phoneId = VAPI_PHONE_ID || (await firstVapiPhoneId())
    if (!phoneId) return json({ error: 'No Vapi phone number found. Add one in your Vapi dashboard.' }, 400)
    const link = `${PUBLIC_APP_URL}/#/schedule/${tok}`
    const first = cand.full_name?.split(' ')[0] || 'there'
    const text =
      `Hi ${first}, this is American Medical Administrators — we'd love to set up an interview for the ` +
      `${job?.title ?? 'role'}. Pick a time that works for you here: ${link}`
    const r = await fetch('https://api.vapi.ai/sms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumberId: phoneId, customer: { number: phone }, message: text }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return json({ error: `Vapi SMS failed: ${body?.message ?? r.status}` }, 502)
    await admin.from('communications').insert({
      candidate_id: cand.id, application_id: s.application_id ?? null, screening_id: s.id,
      channel: 'sms', direction: 'outbound', body: text, ai_generated: true, created_by: u.user.id,
      external_ref: body?.id ?? null,
    })
    return json({ ok: true, sms_id: body?.id ?? null })
  }

  const questions = Array.isArray(s.questions) ? s.questions : []
  if (!questions.length) return json({ error: 'Screening has no questions.' }, 400)

  const prompt = systemPrompt(cand.full_name, job?.title ?? '', questions)

  if (mode === 'sms') {
    // Outbound SMS: send the first question as an opener; replies arrive via webhook.
    const phoneId = VAPI_PHONE_ID || (await firstVapiPhoneId())
    if (!phoneId) return json({ error: 'No Vapi phone number found. Add one in your Vapi dashboard.' }, 400)
    const text =
      `Hi ${cand.full_name?.split(' ')[0] || 'there'}, this is American Medical Administrators about a ` +
      `${job?.title ?? 'clinical'} role. Do you have a few minutes for a quick screening? ` +
      `First: ${questions[0].question}`
    const r = await fetch('https://api.vapi.ai/sms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumberId: phoneId, customer: { number: phone }, message: text }),
    })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return json({ error: `Vapi SMS failed: ${body?.message ?? r.status}` }, 502)
    await admin.from('screenings').update({ status: 'sent', channel: 'sms', sent_at: new Date().toISOString(), external_ref: body?.id ?? null }).eq('id', s.id)
    await admin.from('communications').insert({
      candidate_id: cand.id, application_id: s.application_id ?? null, screening_id: s.id,
      channel: 'sms', direction: 'outbound', body: text, ai_generated: true, created_by: u.user.id,
      external_ref: body?.id ?? null,
    })
    return json({ ok: true, sms_id: body?.id ?? null })
  }

  // Outbound phone call with a transient (inline) assistant.
  const phoneId = VAPI_PHONE_ID || (await firstVapiPhoneId())
  if (!phoneId) return json({ error: 'No Vapi phone number found. Add one in your Vapi dashboard.' }, 400)

  const payload = {
    phoneNumberId: phoneId,
    customer: { number: phone, name: cand.full_name ?? undefined },
    assistant: {
      // Wait for the person to actually answer and speak before the agent talks,
      // so it doesn't start mid-ring or talk over their "hello".
      firstMessageMode: 'assistant-waits-for-user',
      firstMessage: `Hi, this is Jordan with American Medical Administrators. May I speak with ${cand.full_name?.split(' ')[0] || 'you'}?`,
      model: { provider: 'openai', model: 'gpt-4o', messages: [{ role: 'system', content: prompt }] },
      voice: { provider: VOICE_PROVIDER, voiceId: VOICE_ID },
      // Multilingual transcription so the candidate can switch languages mid-call
      // (Deepgram nova-2 'multi' auto-detects per utterance).
      transcriber: { provider: 'deepgram', model: 'nova-2', language: 'multi' },
      // Record the call so the recruiter can review it; the recording URL comes
      // back on the end-of-call report and is stored on the screening.
      artifactPlan: { recordingEnabled: true },
      endCallFunctionEnabled: true,
      // Wait for the candidate to fully finish before the agent speaks, and don't
      // let it barge in mid-sentence (fixes the "thank you for sharing" interrupts).
      startSpeakingPlan: { waitSeconds: 1.5, smartEndpointingEnabled: true },
      stopSpeakingPlan: { numWords: 3, voiceSeconds: 0.3, backoffSeconds: 2 },
      // Vapi posts the end-of-call report (with transcript) to this URL. Send the
      // anon key so the request authenticates whether or not the webhook has
      // "Verify JWT" enabled (the anon key satisfies the JWT gate either way).
      server: { url: `${URL_}/functions/v1/vapi-webhook`, headers: { Authorization: `Bearer ${ANON}`, apikey: ANON } },
      metadata: { screening_id: s.id, candidate_id: cand.id },
    },
  }
  const r = await fetch('https://api.vapi.ai/call', {
    method: 'POST',
    headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) return json({ error: `Vapi call failed: ${body?.message ?? r.status}` }, 502)

  await admin.from('screenings').update({
    status: 'sent', channel: 'phone', sent_at: new Date().toISOString(), external_ref: body?.id ?? null,
  }).eq('id', s.id)
  await admin.from('communications').insert({
    candidate_id: cand.id, application_id: s.application_id ?? null, screening_id: s.id,
    channel: 'call', direction: 'outbound', body: `AI screening call placed (${questions.length} questions).`,
    ai_generated: true, created_by: u.user.id, external_ref: body?.id ?? null,
  })
  return json({ ok: true, call_id: body?.id ?? null })
})
