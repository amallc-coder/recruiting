// Supabase Edge Function: auto-screen-dispatch
// -----------------------------------------------------------------------------
// Internal dispatch target for the `auto_screen_on_apply` DB trigger. When a
// candidate applies to a requisition that has auto-screen enabled, the trigger
// creates a ready screening (status 'approved') and POSTs here with:
//
//   POST { screening_id, channel: 'sms' | 'phone' | 'both' }
//
// We then place the agentic Vapi voice call and/or send the opening screening
// SMS (which includes a self-scheduling link). End-of-call / inbound-SMS
// processing is handled by `vapi-webhook` / `sms-webhook` exactly as for a
// recruiter-initiated screening.
//
// verify_jwt is OFF: this is an internal webhook called by the database trigger
// (which sends no JWT). It is idempotent and only ever acts on a real screening,
// so a stray call can at most re-place one screening that already exists. It is
// also INERT until VAPI_API_KEY is set — without it, the screening is simply
// left 'approved' for a recruiter to dispatch manually, and we return ok.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   VAPI_API_KEY          (required to actually dial/text; otherwise no-op)
//   VAPI_PHONE_NUMBER_ID  (optional caller-ID number id)
//   VAPI_VOICE_ID         (optional, defaults Elliot)
//   VAPI_VOICE_PROVIDER   (optional, defaults vapi)
//   PUBLIC_APP_URL        (optional, defaults the GitHub Pages site) — used to
//                         build the self-scheduling link in the SMS.
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
const VOICE_ID = Deno.env.get('VAPI_VOICE_ID') || 'Elliot'
const VOICE_PROVIDER = Deno.env.get('VAPI_VOICE_PROVIDER') || 'vapi'
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://amallc-coder.github.io/recruiting').replace(/\/+$/, '')

function e164(raw: string | null): string | null {
  if (!raw) return null
  const d = raw.replace(/[^\d]/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  if (raw.trim().startsWith('+')) return raw.trim()
  return null
}

function scheduleLink(token: string | null): string | null {
  return token ? `${PUBLIC_APP_URL}/#/schedule/${token}` : null
}

function systemPrompt(candidateName: string, jobTitle: string, questions: { question: string }[]) {
  const list = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')
  return (
    `You are Jordan, a friendly, professional recruiting assistant for American Medical Administrators, ` +
    `calling ${candidateName || 'the candidate'} about a ${jobTitle || 'clinical'} opportunity. ` +
    `Your job is to conduct a brief phone screening.\n\n` +
    `Identity:\n` +
    `- Introduce yourself by name as "Jordan, calling on behalf of American Medical Administrators."\n` +
    `- NEVER say placeholder text such as "[your name]" or "[company]". Use the real names above.\n\n` +
    `Conversation style — VERY IMPORTANT:\n` +
    `- Let the candidate FULLY finish speaking. Wait for a clear pause before you respond.\n` +
    `- Never talk over them or interrupt mid-sentence.\n` +
    `- Ask exactly ONE question, then stop talking and wait for their full answer.\n` +
    `- Keep your own turns short (1-2 sentences).\n\n` +
    `Opening disclosure (say this near the start, right after confirming who you are speaking with):\n` +
    `- "Before we start, I want to let you know this is an AI-assisted call and it's being recorded ` +
    `for quality and accuracy. Is that okay with you?" Wait for consent. If they decline recording, ` +
    `let them know a human recruiter will follow up instead, thank them, and end the call.\n\n` +
    `Guidelines:\n` +
    `- Greet them warmly, confirm you're speaking with the right person, give the disclosure above, and ask if it's a good time.\n` +
    `- Ask the questions below ONE AT A TIME, conversationally. Briefly acknowledge each answer before moving on.\n` +
    `- Do NOT ask about protected characteristics (age, marital/family status, health, religion, national origin).\n` +
    `- Keep it under ~8 minutes. If they're busy, offer to call back.\n` +
    `Language:\n` +
    `- If the candidate responds in another language (for example Spanish), switch to that language and ` +
    `conduct the rest of the screening in their language, including the disclosure if not yet given.\n\n` +
    `Closing:\n` +
    `- Once you've gone through the questions, ASK: "Is there anything else you'd like me to pass along to ` +
    `the recruiter before I let you go?" and listen to their full answer.\n` +
    `- Then thank them sincerely, let them know a recruiter will be in touch with next steps, and end warmly.\n\n` +
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

  const { screening_id, channel = 'both' } = await req.json().catch(() => ({}))
  if (!screening_id) return json({ error: 'Missing screening_id' }, 400)

  const admin = createClient(URL_, SERVICE)
  const { data: s } = await admin.from('screenings').select('*').eq('id', screening_id).single()
  if (!s) return json({ error: 'Screening not found' }, 404)

  // Idempotency: only dispatch a screening that is still 'approved' (not yet sent).
  if (s.status !== 'approved') return json({ ok: true, dispatched: false, reason: `status is ${s.status}` })

  const { data: cand } = await admin.from('candidates').select('*').eq('id', s.candidate_id).single()
  if (!cand) return json({ error: 'Candidate not found' }, 404)

  const { data: job } = s.requisition_id
    ? await admin.from('requisitions').select('title').eq('id', s.requisition_id).single()
    : { data: null }
  const { data: app } = s.application_id
    ? await admin.from('applications').select('schedule_token').eq('id', s.application_id).single()
    : { data: null }
  const link = scheduleLink((app as { schedule_token?: string } | null)?.schedule_token ?? null)

  const questions = Array.isArray(s.questions) ? s.questions : []
  const phone = e164(cand.phone)

  // Inert path: nothing configured / no phone → leave the screening for manual dispatch.
  if (!VAPI_KEY) return json({ ok: true, dispatched: false, reason: 'VAPI_API_KEY not set; screening left for manual dispatch' })
  if (!phone) return json({ ok: true, dispatched: false, reason: 'candidate has no valid US phone' })
  if (!questions.length) return json({ ok: true, dispatched: false, reason: 'screening has no questions' })

  const wantCall = channel === 'phone' || channel === 'both'
  const wantSms = channel === 'sms' || channel === 'both'
  const phoneId = VAPI_PHONE_ID || (await firstVapiPhoneId())
  if (!phoneId) return json({ ok: true, dispatched: false, reason: 'no Vapi phone number on the account' })

  const results: Record<string, unknown> = {}
  const first = cand.full_name?.split(' ')[0] || 'there'

  // ---- SMS opener (with AI disclosure + self-scheduling link) ----
  if (wantSms) {
    const text =
      `Hi ${first}, this is American Medical Administrators about a ${job?.title ?? 'clinical'} role. ` +
      `I'm an AI-assisted assistant — reply here and I'll ask a couple of quick screening questions. ` +
      (link ? `You can also book an interview time here: ${link} ` : '') +
      `First: ${questions[0].question}`
    try {
      const r = await fetch('https://api.vapi.ai/sms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: phoneId, customer: { number: phone }, message: text }),
      })
      const body = await r.json().catch(() => ({}))
      results.sms = r.ok ? { id: body?.id ?? null } : { error: body?.message ?? r.status }
      if (r.ok) {
        await admin.from('communications').insert({
          candidate_id: cand.id, application_id: s.application_id ?? null, screening_id: s.id,
          channel: 'sms', direction: 'outbound', body: text, ai_generated: true, external_ref: body?.id ?? null,
        })
      }
    } catch (e) {
      results.sms = { error: e instanceof Error ? e.message : 'sms failed' }
    }
  }

  // ---- Voice call (transient assistant; end-of-call report → vapi-webhook) ----
  if (wantCall) {
    const prompt = systemPrompt(cand.full_name, job?.title ?? '', questions)
    const payload = {
      phoneNumberId: phoneId,
      customer: { number: phone, name: cand.full_name ?? undefined },
      assistant: {
        firstMessageMode: 'assistant-waits-for-user',
        firstMessage: `Hi, this is Jordan with American Medical Administrators. May I speak with ${first}?`,
        model: { provider: 'openai', model: 'gpt-4o', messages: [{ role: 'system', content: prompt }] },
        voice: { provider: VOICE_PROVIDER, voiceId: VOICE_ID },
        transcriber: { provider: 'deepgram', model: 'nova-2', language: 'multi' },
        artifactPlan: { recordingEnabled: true },
        endCallFunctionEnabled: true,
        startSpeakingPlan: { waitSeconds: 1.5, smartEndpointingEnabled: true },
        stopSpeakingPlan: { numWords: 3, voiceSeconds: 0.3, backoffSeconds: 2 },
        server: { url: `${URL_}/functions/v1/vapi-webhook`, headers: { Authorization: `Bearer ${ANON}`, apikey: ANON } },
        metadata: { screening_id: s.id, candidate_id: cand.id },
      },
    }
    try {
      const r = await fetch('https://api.vapi.ai/call', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VAPI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await r.json().catch(() => ({}))
      results.call = r.ok ? { id: body?.id ?? null } : { error: body?.message ?? r.status }
      if (r.ok) {
        await admin.from('communications').insert({
          candidate_id: cand.id, application_id: s.application_id ?? null, screening_id: s.id,
          channel: 'call', direction: 'outbound',
          body: `Auto-screen voice call placed (${questions.length} questions).`,
          ai_generated: true, external_ref: body?.id ?? null,
        })
      }
    } catch (e) {
      results.call = { error: e instanceof Error ? e.message : 'call failed' }
    }
  }

  const dispatched = !!((results.sms as { id?: string })?.id || (results.call as { id?: string })?.id)
  if (dispatched) {
    await admin.from('screenings').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', s.id)
    await admin.from('ai_decisions').insert({
      org_id: s.org_id, entity_type: 'application', entity_id: s.application_id ?? s.id,
      rationale: `Auto-screen dispatched on apply (channel: ${channel}).`,
      checklist: [], created_by_agent: 'auto-screen',
    })
  }
  return json({ ok: true, dispatched, results })
})
