// Supabase Edge Function: ai-role
// -----------------------------------------------------------------------------
// Generates a structured job/role definition — responsibilities, requirements,
// keywords, category, and a typical pay range — from a position title and the
// org types it applies to (medical practice, SNF/LTC, management company,
// laboratory, hospital). Powers the "AI generate" buttons in the Positions
// repository, for both brand-new roles and refreshing existing ones.
//
// The app falls back to a local heuristic when this function isn't deployed,
// so adding positions always works; this upgrades the quality.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai-role
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
  required: ['title', 'category', 'org_types', 'rate_unit', 'responsibilities', 'requirements', 'keywords'],
  properties: {
    title: { type: 'string' },
    category: { type: 'string', description: 'High-level group, e.g. "Provider - Advanced Practice", "Clinical - Nursing", "Laboratory", "Operations - Leadership", "Admin - Front Office", "Clinical - Tech"' },
    org_types: { type: 'array', items: { type: 'string', enum: ['practice', 'snf', 'mgmt', 'lab', 'hospital'] } },
    rate_min: { type: ['number', 'null'] },
    rate_max: { type: ['number', 'null'] },
    rate_unit: { type: 'string', enum: ['Hourly', 'Annual', 'NA'] },
    responsibilities: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 8 },
    requirements: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
    keywords: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 12 },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)

  let body: { title?: string; org_types?: string[]; context?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const title = (body.title ?? '').trim()
  if (!title) return json({ error: 'title is required' }, 400)
  const orgTypes = body.org_types?.length ? body.org_types : ['practice', 'snf', 'hospital']

  const anthropic = new Anthropic({ apiKey })
  const prompt =
    `You are an expert healthcare HR / talent-acquisition analyst building a position ` +
    `catalog for a company that operates outpatient medical practices, skilled-nursing / ` +
    `long-term-care facilities, a corporate management company, laboratories, and hospitals.\n\n` +
    `Define the role: "${title}".\n` +
    `It applies to these org types: ${orgTypes.join(', ')} ` +
    `(practice=outpatient clinic, snf=skilled nursing/LTC, mgmt=management company/corporate, lab=laboratory, hospital).\n` +
    (body.context ? `Extra context: ${body.context}\n` : '') +
    `\nProvide a concise, specific definition: a high-level category, the org types it fits, ` +
    `a realistic US pay range (Annual for providers/leadership/lab professionals/accounting; ` +
    `Hourly for MA/CNA/LPN/techs/front office; NA if truly variable), 4-8 action-led ` +
    `responsibilities specific to THIS role (not generic filler), 3-6 requirements ` +
    `(license/cert/education/experience), and 4-12 lowercase search keywords.`

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    const parsed = JSON.parse(text)
    return json({ role: parsed, method: 'ai' })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
