// Supabase Edge Function: vapi-inbound-webhook  (PUBLIC — deploy with --no-verify-jwt)
// -----------------------------------------------------------------------------
// Inbound AI voice recruiter. A candidate calls the org's Vapi number; an
// inbound assistant (female voice + AI/recording disclosure + your screening
// questions) talks to them, and Vapi posts the end-of-call report here. We:
//   1) identify the caller by phone (or create a new candidate),
//   2) analyze the transcript with Claude (name, role interest, fit, sentiment),
//   3) log the call as an inbound communication (so it shows in the Inbox +
//      candidate profile) and write an audit entry.
//
//   GET  -> { ok: true }                              (health check)
//   POST { message: { type:'end-of-call-report', ... } }   from Vapi
//
// Optional gate: set VAPI_WEBHOOK_SECRET and configure the assistant to send a
// matching `x-vapi-secret` header.
//
// Secrets: ANTHROPIC_API_KEY (optional), VAPI_WEBHOOK_SECRET (optional).
// Auto: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// SETUP: see supabase/functions/VAPI_INBOUND_SETUP.md. Pending deploy until the
// Supabase edge-function deploy path is available; this file stages the logic.
// -----------------------------------------------------------------------------
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.70.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const WEBHOOK_SECRET = Deno.env.get('VAPI_WEBHOOK_SECRET')

function digits(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = String(raw).replace(/[^\d]/g, '')
  return d.length >= 10 ? d.slice(-10) : null
}

async function soleOrgId(): Promise<string | null> {
  const { data } = await admin.from('organizations').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

interface Analysis {
  caller_name: string | null
  role_interest: string | null
  summary: string
  sentiment: 'positive' | 'neutral' | 'negative'
}

async function analyze(transcript: string): Promise<Analysis | null> {
  if (!ANTHROPIC_KEY || !transcript.trim()) return null
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['caller_name', 'role_interest', 'summary', 'sentiment'],
    properties: {
      caller_name: { type: ['string', 'null'] },
      role_interest: { type: ['string', 'null'] },
      summary: { type: 'string' },
      sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
    },
  }
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 700,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{
        role: 'user',
        content:
          `This is a transcript of an inbound phone call to a healthcare-staffing recruiter's AI line. Extract the ` +
          `caller's name if stated, the role/shift they're interested in, a 1-2 sentence summary of what they want ` +
          `and any next step, and the overall sentiment.\n\nTRANSCRIPT:\n${transcript}`,
      }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    return JSON.parse(text) as Analysis
  } catch (e) {
    console.error('inbound analyze failed:', e instanceof Error ? e.message : e)
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (WEBHOOK_SECRET && req.headers.get('x-vapi-secret') !== WEBHOOK_SECRET) return json({ error: 'Unauthorized' }, 401)

  const payload = await req.json().catch(() => ({}))
  const message = payload?.message ?? payload
  const type = message?.type
  if (type !== 'end-of-call-report' && type !== 'end-of-call') return json({ ok: true, ignored: type ?? 'unknown' })

  // Caller number + transcript (Vapi shapes vary slightly across versions).
  const callerRaw = message?.customer?.number ?? message?.call?.customer?.number ?? payload?.customer?.number ?? null
  const transcript: string =
    message?.artifact?.transcript ?? message?.transcript ?? message?.call?.transcript ?? ''
  const callId: string | null = message?.call?.id ?? message?.callId ?? null
  const last10 = digits(callerRaw)

  const orgId = await soleOrgId()
  if (!orgId) return json({ ok: false, error: 'No organization' })

  // Find-or-create the candidate by phone.
  let candidateId: string | null = null
  if (last10) {
    const { data: existing } = await admin.from('candidates').select('id').ilike('phone', `%${last10}%`).eq('org_id', orgId).limit(1).maybeSingle()
    candidateId = (existing as { id: string } | null)?.id ?? null
  }

  const a = await analyze(transcript)

  if (!candidateId) {
    const name = a?.caller_name?.trim() || (last10 ? `Inbound caller ${last10.slice(-4)}` : 'Inbound caller')
    const { data: created } = await admin
      .from('candidates')
      .insert({ org_id: orgId, full_name: name, phone: callerRaw ?? null })
      .select('id')
      .single()
    candidateId = (created as { id: string } | null)?.id ?? null
  }
  if (!candidateId) return json({ ok: false, error: 'Could not resolve candidate' })

  // Log the call as an inbound communication (surfaces in the Inbox + profile).
  await admin.from('communications').insert({
    candidate_id: candidateId,
    channel: 'call',
    direction: 'inbound',
    subject: a?.role_interest ? `Inbound call — interested in ${a.role_interest}` : 'Inbound call',
    body: a?.summary ?? null,
    transcript: transcript || null,
    sentiment: a?.sentiment ?? null,
    ai_generated: false,
    external_ref: callId,
  })

  await admin.from('audit_logs').insert({
    org_id: orgId,
    actor_id: null,
    action: 'screening.inbound_call',
    entity_type: 'candidate',
    entity_id: candidateId,
    detail: { role_interest: a?.role_interest ?? null, sentiment: a?.sentiment ?? null, call_id: callId },
  })

  return json({ ok: true, candidate_id: candidateId })
})
