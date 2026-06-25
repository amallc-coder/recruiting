// Supabase Edge Function: ai-match
// -----------------------------------------------------------------------------
// Scores how well each candidate fits an open position, using Claude to reason
// over the position's verbiage and the candidate's résumé text. Returns a
// 0–100 score plus strengths/gaps per candidate. The app falls back to a local
// heuristic when this function isn't deployed, so matching always works.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai-match
// Auto-provided: SUPABASE_URL, SUPABASE_ANON_KEY
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

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['candidateId', 'score', 'summary', 'strengths', 'gaps'],
        properties: {
          candidateId: { type: 'string' },
          score: { type: 'integer' },
          summary: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          gaps: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  // Require an authenticated user (any signed-in recruiter/admin may match).
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)

  let body: {
    position?: { role?: string; description?: string; region?: string }
    candidates?: { id: string; role: string; region?: string; resume_text?: string; rating?: number }[]
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const position = body.position ?? {}
  const candidates = body.candidates ?? []
  if (!candidates.length) return json({ results: [] })

  const anthropic = new Anthropic({ apiKey })
  const prompt =
    `You are a clinical-staffing recruiter assistant. Score how well each candidate ` +
    `fits the open position below, from 0 (no fit) to 100 (excellent fit). Weigh: role ` +
    `match (most important for clinical roles like LPN/NP/PA), how the candidate's résumé ` +
    `aligns with the position requirements, and territory/region fit. Be concise and ` +
    `concrete in strengths and gaps.\n\n` +
    `POSITION\nRole: ${position.role}\nRegion: ${position.region ?? 'n/a'}\n` +
    `Requirements/verbiage:\n${position.description ?? '(none provided)'}\n\n` +
    `CANDIDATES (JSON):\n${JSON.stringify(candidates)}\n\n` +
    `Return a score and brief strengths/gaps for every candidate by id.`

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    const parsed = JSON.parse(text)
    return json({ results: parsed.results ?? [] })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
