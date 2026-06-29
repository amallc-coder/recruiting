// Supabase Edge Function: ai-console
// -----------------------------------------------------------------------------
// Conversational command console — TRANSLATION ONLY. Turns a plain-language
// question about the ATS ("how many open RN reqs in Texas?", "candidates with an
// expiring DEA", "offers sent but not yet answered") into a STRUCTURED, read-only
// query plan that the frontend executes against the v2 schema under the caller's
// RLS. This function never touches business data and never proposes a write — the
// console is strictly read-only by construction.
//
//   POST { question }   Authorization: Bearer <jwt>
//   -> { ok, plan: { entity, intent, filters[], sort_field, sort_dir, limit,
//                    summary, answer } }
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

// The data model the console can query, with the fields the planner may filter on.
// Kept in sync with the client allowlist in src/lib/v2/agent/console.ts.
const SCHEMA_DOC = `
Entities and filterable fields (read-only):
- requisitions: title, role_family, status(draft|pending_approval|open|on_hold|filled|closed|cancelled), specialty, headcount, opened_at, created_at, facility_state, facility_name
- candidates: full_name, status(new|active|passive|placed|do_not_contact|archived), source, tags, last_screened_at
- applications: status(active|rejected|withdrawn|hired), applied_at, stage_type(applied|screen|interview|offer|hired|rejected), role_family, facility_state
- offers: status(pending|sent|accepted|declined|expired|negotiating), salary, start_date, created_at, sent_at
- screenings: status(draft|approved|sent|completed|analyzed|cancelled), channel(phone|sms|email|manual), ai_score, created_at
- interviews: status, type, scheduled_at
- facilities: name, state, city`

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['entity', 'intent', 'filters', 'sort_field', 'sort_dir', 'limit', 'summary', 'answer'],
  properties: {
    entity: {
      type: 'string',
      enum: ['requisitions', 'candidates', 'applications', 'offers', 'screenings', 'interviews', 'facilities'],
    },
    intent: { type: 'string', enum: ['list', 'count'] },
    filters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'op', 'value'],
        properties: {
          field: { type: 'string' },
          op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in', 'within_days'] },
          // Scalar value as a string (client coerces). For `in`, comma-separate.
          // For `within_days`, the number of days from now (date fields only).
          value: { type: 'string' },
        },
      },
    },
    sort_field: { type: 'string' },
    sort_dir: { type: 'string', enum: ['asc', 'desc', 'none'] },
    limit: { type: 'integer', enum: [10, 25, 50, 100, 200] },
    summary: { type: 'string' },
    answer: { type: 'string' },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method === 'GET') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!ANTHROPIC_KEY) return json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, 200)

  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)

  const { question } = await req.json().catch(() => ({}))
  if (!question || !String(question).trim()) return json({ error: 'Missing question' }, 400)

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1200,
      output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      messages: [
        {
          role: 'user',
          content:
            `You are the query planner for a healthcare-staffing ATS command console. Convert the user's ` +
            `plain-language question into a single read-only query plan over ONE entity. Choose the entity ` +
            `whose rows directly answer the question. Use only the fields listed below; map natural phrasing ` +
            `to them (e.g. "open" → status=open; "in Texas" → facility_state=TX or state=TX; "unanswered offers" ` +
            `→ offers status=sent; "expiring/aging within N days" → within_days on the relevant date field). ` +
            `Use intent="count" when the user asks how many; otherwise "list". Pick a sensible limit and sort ` +
            `(e.g. newest first → created_at desc). Restate your interpretation in summary, and give a short ` +
            `direct answer framing in answer (e.g. "Open RN requisitions in TX:"). Never invent fields.\n\n` +
            SCHEMA_DOC +
            `\n\nQUESTION: ${String(question).slice(0, 600)}`,
        },
      ],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    return json({ ok: true, plan: JSON.parse(text) })
  } catch (e) {
    console.error('ai-console failed:', e instanceof Error ? e.message : e)
    return json({ ok: false, error: 'Could not interpret that question.' }, 200)
  }
})
