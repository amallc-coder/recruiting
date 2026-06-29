// Supabase Edge Function: ai-match  (verify_jwt = true)
// -----------------------------------------------------------------------------
// The "AI recommends, humans decide" match engine. For ONE application, Claude
// reasons over the candidate's résumé + screening summary and the requisition's
// requirements and produces an explainable Match Card:
//   parsed (résumé parse) · score 1–5 (skills-first semantic fit) · rationale ·
//   checklist (tiered, per-item status + evidence) · knockouts (FLAGS) ·
//   recommendation (advance|hold|reject).
//
// Every run is logged to public.ai_decisions (entity_type 'application') so the
// decision trail is auditable — the AI never auto-acts on the pipeline.
//
//   POST { application_id }   Authorization: Bearer <jwt>
//     -> { parsed, score, rationale, checklist, knockouts, recommendation }
//
// All prompt text, the JSON schema, and the 1–5 scale live in ./rubric.ts.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai-match
// Auto-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// -----------------------------------------------------------------------------
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.70.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SYSTEM_PROMPT, MATCH_SCHEMA, buildUserPrompt } from './rubric.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  // Require an authenticated user (any signed-in recruiter/admin may score).
  // Then use the service-role client for the cross-table reads + the audit write.
  const authHeader = req.headers.get('Authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)

  let body: { application_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const applicationId = body.application_id
  if (!applicationId) return json({ error: 'application_id is required' }, 400)

  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1. Load the application → candidate + requisition.
  const { data: app, error: appErr } = await service
    .from('applications')
    .select(
      'id, org_id, candidate:candidates(full_name, resume_text, tags, screening_summary), ' +
        'requisition:requisitions(title, role_family, specialty, description, requirements)',
    )
    .eq('id', applicationId)
    .maybeSingle()

  if (appErr) return json({ error: `Failed to load application: ${appErr.message}` }, 500)
  if (!app) return json({ error: 'Application not found' }, 404)

  // PostgREST returns embedded to-one relations as an object (or array depending
  // on inference) — normalize either shape to a single row.
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  const candidate = one<{
    full_name?: string | null
    resume_text?: string | null
    tags?: string[] | null
    screening_summary?: string | null
  }>((app as Record<string, unknown>).candidate as never)
  const requisition = one<{
    title?: string | null
    role_family?: string | null
    specialty?: string | null
    description?: string | null
    requirements?: string | null
  }>((app as Record<string, unknown>).requisition as never)
  const orgId = (app as { org_id?: string }).org_id

  if (!candidate || !requisition) {
    return json({ error: 'Application is missing its candidate or requisition' }, 422)
  }

  // 2. Call Claude with the rubric + json_schema output.
  const anthropic = new Anthropic({ apiKey })
  let card: {
    parsed: { skills: string[]; experience: string; licenses: string[] }
    score: number
    rationale: string
    checklist: { requirement: string; tier: string; status: string; evidence: string }[]
    knockouts: { reason: string }[]
    recommendation: string
  }
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: MATCH_SCHEMA } },
      messages: [{ role: 'user', content: buildUserPrompt(candidate, requisition) }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    card = JSON.parse(text)
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }

  // 3. Audit log → public.ai_decisions. The full structured card lives in
  //    `checklist` jsonb so the Match Card can be rebuilt from the log alone.
  if (orgId) {
    const { error: logErr } = await service.from('ai_decisions').insert({
      org_id: orgId,
      entity_type: 'application',
      entity_id: applicationId,
      model: 'claude-opus-4-8',
      score: card.score,
      rationale: card.rationale,
      checklist: {
        parsed: card.parsed,
        checklist: card.checklist,
        knockouts: card.knockouts,
        recommendation: card.recommendation,
      },
      created_by_agent: 'ai-match',
    })
    // The audit write failing shouldn't deny the recruiter the result, but make
    // it visible so the gap is caught rather than silently swallowed.
    if (logErr) console.error('ai-match: ai_decisions insert failed', logErr.message)
  }

  // 4. Return the Match Card.
  return json(card)
})
