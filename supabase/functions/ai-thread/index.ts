// Supabase Edge Function: ai-thread
// -----------------------------------------------------------------------------
// Summarize a candidate's full conversation thread for fast team handoff.
//
//   POST { candidate_id }   Authorization: Bearer <jwt>
//   -> { ok, summary, next_step, sentiment }
//
// Pulls every communication (SMS / email / voice transcript) for the candidate
// and asks Claude for a tight summary, a suggested next step, and an overall
// sentiment read.
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
  required: ['summary', 'next_step', 'sentiment'],
  properties: {
    summary: { type: 'string', description: 'A tight 2-3 sentence summary of the conversation so far.' },
    next_step: { type: 'string', description: 'The single most useful next action for the recruiter.' },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative', 'unknown'] },
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

  const { candidate_id } = await req.json().catch(() => ({}))
  if (!candidate_id) return json({ error: 'Missing candidate_id' }, 400)

  const { data: msgs } = await admin
    .from('communications')
    .select('channel, direction, subject, body, transcript, occurred_at')
    .eq('candidate_id', candidate_id)
    .order('occurred_at', { ascending: true })
    .limit(200)
  const list = (msgs as { channel: string; direction: string; subject: string | null; body: string | null; transcript: string | null; occurred_at: string }[]) ?? []
  if (list.length === 0) return json({ ok: false, error: 'No messages to summarize yet.' }, 200)

  const transcript = list
    .map((m) => `[${m.occurred_at?.slice(0, 16) ?? ''} ${m.channel} ${m.direction}] ${(m.body || m.transcript || m.subject || '').trim()}`)
    .join('\n')

  let parsed: { summary?: string; next_step?: string; sentiment?: string }
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 800,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content:
          `Summarize this recruiter↔candidate conversation for a colleague picking it up. Give a tight summary, the ` +
          `single best next step, and an overall sentiment read. Base it ONLY on the messages.\n\n${transcript}`,
      }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    parsed = JSON.parse(text)
  } catch (e) {
    console.error('ai-thread failed:', e instanceof Error ? e.message : e)
    return json({ ok: false, error: 'Summary failed. Try again.' }, 200)
  }

  return json({ ok: true, summary: parsed.summary ?? '', next_step: parsed.next_step ?? null, sentiment: parsed.sentiment ?? null })
})
