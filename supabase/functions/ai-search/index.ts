// Supabase Edge Function: ai-search
// -----------------------------------------------------------------------------
// Natural-language talent search. Translates a plain-language query like
//   "NPs in Texas with an active DEA available within 30 days"
// into a STRUCTURED filter the frontend runs over candidates + credentials
// (under the caller's RLS — this function does NOT touch candidate data, it only
// interprets the query). Boolean syntax is never required of the user.
//
//   POST { query }   Authorization: Bearer <jwt>
//   -> { ok, filter: { role_keywords[], states[], credential_types[],
//        require_active_credentials, available_within_days, keywords[], summary } }
//
// Secrets: ANTHROPIC_API_KEY. Auto: SUPABASE_URL, SUPABASE_ANON_KEY.
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

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')

const SEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['role_keywords', 'states', 'credential_types', 'require_active_credentials', 'available_within_days', 'keywords', 'summary'],
  properties: {
    // Role/title words to match against candidate tags + résumé (e.g. ["nurse practitioner","np"]).
    role_keywords: { type: 'array', items: { type: 'string' } },
    // 2-letter US state codes implied by the query (e.g. ["TX"]). Match on credential issuing_state.
    states: { type: 'array', items: { type: 'string' } },
    // Credential types the candidate must hold.
    credential_types: { type: 'array', items: { type: 'string', enum: ['license', 'board_cert', 'dea', 'immunization', 'bls'] } },
    // "active"/"current" credential language → only verified, non-expired credentials count.
    require_active_credentials: { type: 'boolean' },
    // Availability window in days (e.g. "within 30 days" → 30). 0 if not specified.
    available_within_days: { type: 'integer' },
    // Any remaining free-text keywords to match against the candidate's text.
    keywords: { type: 'array', items: { type: 'string' } },
    // One-line restatement of how the query was interpreted (shown to the recruiter).
    summary: { type: 'string' },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!ANTHROPIC_KEY) return json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, 200)

  // Require an authenticated caller (interpretation only; no data access here).
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)

  const { query } = await req.json().catch(() => ({}))
  if (!query || !String(query).trim()) return json({ error: 'Missing query' }, 400)

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1000,
      output_config: { format: { type: 'json_schema', schema: SEARCH_SCHEMA } },
      messages: [{
        role: 'user',
        content:
          `You translate a recruiter's plain-language candidate search into a structured filter for a ` +
          `healthcare-staffing ATS. Credentials in this system are typed: license, board_cert, dea, ` +
          `immunization, bls. "Active"/"current"/"valid" credential phrasing means require_active_credentials=true. ` +
          `Map role/title words (RN, LPN, CNA, NP, nurse practitioner, physician, etc.) into role_keywords ` +
          `(include common abbreviations and the expanded form). Map US states/cities to 2-letter state codes. ` +
          `Map an availability window to available_within_days (0 if none). Put anything else useful in keywords. ` +
          `Restate the interpretation in summary.\n\nQUERY: ${String(query).slice(0, 500)}`,
      }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    return json({ ok: true, filter: JSON.parse(text) })
  } catch (e) {
    console.error('ai-search failed:', e instanceof Error ? e.message : e)
    return json({ ok: false, error: 'Could not interpret that search.' }, 200)
  }
})
