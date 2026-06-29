// Supabase Edge Function: ai-autopilot
// -----------------------------------------------------------------------------
// Goal-driven planning for Autopilot mode. Given a recruiter's goal (e.g. "get
// the 3 oldest open RN reqs moving") plus a COMPACT, pre-fetched context snapshot
// (gathered client-side under RLS and passed in), it returns a prioritized plan
// of discrete actions. Each action is tagged with a governance tier:
//   auto       — safe to run unattended
//   approval   — needs a human's explicit OK
//   prohibited — the agent must NEVER do this; a human does it in the UI
//
// This function only PLANS. It never reads or writes business data and never
// executes anything — the client validates each step against the canonical
// policy and runs only what's allowed.
//
//   POST { goal, context }   Authorization: Bearer <jwt>
//   -> { ok, plan: { assessment, steps[], summary } }
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

// Mirrors src/lib/v2/agent/policy.ts. The client re-validates, but giving the
// model the policy keeps the plan honest from the start.
const ACTION_TYPES = [
  'kpi.snapshot', 'note.flag', 'match.refresh',
  'screening.draft', 'screening.dispatch', 'pipeline.advance', 'interview.schedule', 'candidate.reengage',
  'offer.send', 'offer.accept', 'candidate.reject', 'candidate.hire', 'comp.change', 'candidate.delete', 'comms.external',
]
const POLICY_DOC = `
AUTO (safe, agent may run unattended): kpi.snapshot, note.flag, match.refresh
APPROVAL (agent proposes; a human must approve before it runs): screening.draft, screening.dispatch, pipeline.advance, interview.schedule, candidate.reengage
PROHIBITED (a human must do this in the UI; the agent must NEVER mark these auto/approval-executable): offer.send, offer.accept, candidate.reject, candidate.hire, comp.change, candidate.delete, comms.external`

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assessment', 'steps', 'summary'],
  properties: {
    assessment: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action_type', 'title', 'rationale', 'target_kind', 'target_id', 'target_label', 'tier'],
        properties: {
          action_type: { type: 'string', enum: ACTION_TYPES },
          title: { type: 'string' },
          rationale: { type: 'string' },
          target_kind: { type: 'string', enum: ['requisition', 'candidate', 'application', 'offer', 'screening', 'none'] },
          // Must come from the provided context; empty string if not applicable.
          target_id: { type: 'string' },
          target_label: { type: 'string' },
          tier: { type: 'string', enum: ['auto', 'approval', 'prohibited'] },
        },
      },
    },
    summary: { type: 'string' },
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

  const { goal, context } = await req.json().catch(() => ({}))
  if (!goal || !String(goal).trim()) return json({ error: 'Missing goal' }, 400)

  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2500,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      messages: [
        {
          role: 'user',
          content:
            `You are Autopilot for a healthcare-staffing ATS. Turn the recruiter's GOAL into a concrete, ` +
            `prioritized plan of discrete steps that move toward it, using ONLY the action types below and ` +
            `ONLY the entities/ids present in CONTEXT (set target_id to an id from context, or "" if none). ` +
            `Order steps by impact. Assign each step the correct governance tier from the policy — and you ` +
            `MUST mark every prohibited action with tier="prohibited" (never auto/approval). Prefer auto and ` +
            `approval steps that genuinely advance the goal; include a prohibited step only when it's the ` +
            `honest next move, so the human knows to do it themselves. Keep rationales to one sentence. ` +
            `Give a brief assessment of the goal vs the current state, and a one-line summary.\n\n` +
            `ACTION TYPES + POLICY:${POLICY_DOC}\n\n` +
            `GOAL: ${String(goal).slice(0, 600)}\n\n` +
            `CONTEXT (JSON):\n${JSON.stringify(context ?? {}).slice(0, 12000)}`,
        },
      ],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    return json({ ok: true, plan: JSON.parse(text) })
  } catch (e) {
    console.error('ai-autopilot failed:', e instanceof Error ? e.message : e)
    return json({ ok: false, error: 'Could not plan that goal.' }, 200)
  }
})
