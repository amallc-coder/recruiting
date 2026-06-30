// Supabase Edge Function: ai-reference
// -----------------------------------------------------------------------------
// Summarize a completed reference check and surface concerns / red flags.
//
//   POST { reference_request_id }   Authorization: Bearer <jwt>
//   -> { ok, summary, flags: [{severity, note}], recommendation }
//
// Loads the reference's structured responses + overall rating + would-rehire,
// plus the candidate's name for context, and asks Claude to produce a concise
// recruiter-facing summary and a list of flags (info | concern | red). Writes
// ai_summary + ai_flags back to the row.
//
// Secrets: ANTHROPIC_API_KEY. Auto: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   SUPABASE_ANON_KEY.
// -----------------------------------------------------------------------------
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.70.0'
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
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'flags', 'recommendation'],
  properties: {
    summary: { type: 'string', description: 'A concise (2-4 sentence) recruiter-facing summary of this reference.' },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'note'],
        properties: {
          severity: { type: 'string', enum: ['info', 'concern', 'red'] },
          note: { type: 'string' },
        },
      },
    },
    recommendation: { type: 'string', enum: ['positive', 'mixed', 'negative'] },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!ANTHROPIC_KEY) return json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, 200)

  const authHeader = req.headers.get('Authorization') ?? ''
  const admin = createClient(URL_, SERVICE)
  const caller = createClient(URL_, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)
  const { data: prof } = await admin.from('users').select('active').eq('id', u.user.id).single()
  if (!prof || !prof.active) return json({ error: 'Inactive account' }, 403)

  const { reference_request_id } = await req.json().catch(() => ({}))
  if (!reference_request_id) return json({ error: 'Missing reference_request_id' }, 400)

  const { data: rr } = await admin
    .from('reference_requests')
    .select('id, status, referee_name, referee_title, relationship, questions, responses, rating, would_rehire, candidate:candidates(full_name)')
    .eq('id', reference_request_id)
    .single()
  if (!rr) return json({ error: 'Reference not found' }, 404)
  if (rr.status !== 'completed') return json({ ok: false, error: 'Reference is not completed yet.' }, 200)

  const candidate = (rr as { candidate?: { full_name?: string } | null }).candidate?.full_name ?? 'the candidate'
  const questions = (rr.questions as { id: string; prompt: string }[]) ?? []
  const responses = (rr.responses as Record<string, string>) ?? {}
  const qa = questions.map((q) => `Q: ${q.prompt}\nA: ${responses[q.id] ?? '(no answer)'}`).join('\n\n')
  const meta = [
    `Referee: ${rr.referee_name}${rr.referee_title ? `, ${rr.referee_title}` : ''}`,
    rr.relationship ? `Relationship: ${rr.relationship}` : '',
    rr.rating != null ? `Overall rating: ${rr.rating}/5` : '',
    rr.would_rehire != null ? `Would rehire: ${rr.would_rehire ? 'Yes' : 'No'}` : '',
  ].filter(Boolean).join('\n')

  let parsed: { summary?: string; flags?: unknown; recommendation?: string }
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1200,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content:
          `You are helping a healthcare-staffing recruiter evaluate a reference check for ${candidate}.\n\n` +
          `Reference details:\n${meta}\n\nResponses:\n${qa}\n\n` +
          `Write a concise recruiter-facing summary. Then list flags: use "red" for serious concerns ` +
          `(safety, dishonesty, "would not rehire", patient-care issues), "concern" for softer cautions, and ` +
          `"info" for neutral-but-notable points. If the reference is strong with nothing notable, return an ` +
          `empty flags array. Give an overall recommendation of positive, mixed, or negative based ONLY on what ` +
          `the referee said.`,
      }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    parsed = JSON.parse(text)
  } catch (e) {
    console.error('ai-reference failed:', e instanceof Error ? e.message : e)
    return json({ ok: false, error: 'Analysis failed. Try again.' }, 200)
  }

  const flags = Array.isArray(parsed.flags) ? parsed.flags : []
  await admin
    .from('reference_requests')
    .update({ ai_summary: parsed.summary ?? null, ai_flags: flags })
    .eq('id', reference_request_id)

  return json({ ok: true, summary: parsed.summary ?? null, flags, recommendation: parsed.recommendation ?? null })
})
