// Supabase Edge Function: ai-jobad
// -----------------------------------------------------------------------------
// AI-authors a structured, marketing-ready job description for a role: an
// intro paragraph, responsibilities, requirements, and benefits — with
// {{blank}} tokens left for facility-specific details (facility name, city,
// shift, pay range, start date) so one template adapts to many facilities.
// Powers the "AI draft" button in the Job-description templates library.
//
// The app falls back to a local generator when this function isn't deployed,
// so the button always works; this upgrades the quality.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai-jobad
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
  required: ['intro', 'responsibilities', 'requirements', 'benefits', 'blanks'],
  properties: {
    intro: { type: 'string', description: 'One inviting paragraph (2-4 sentences) opening the job ad. Use {{blank}} tokens for facility specifics.' },
    responsibilities: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 8 },
    requirements: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
    benefits: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 },
    blanks: {
      type: 'array',
      description: 'The {{key}} tokens used anywhere in the text, with a human label each.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'label'],
        properties: { key: { type: 'string' }, label: { type: 'string' } },
      },
    },
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

  let body: { title?: string; role_family?: string; category?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const title = (body.title ?? '').trim()
  if (!title) return json({ error: 'title is required' }, 400)

  const anthropic = new Anthropic({ apiKey })
  const prompt =
    `You are an expert healthcare talent-acquisition copywriter for a company that operates ` +
    `outpatient medical practices, skilled-nursing / long-term-care facilities, a management ` +
    `company, laboratories, and hospitals.\n\n` +
    `Write a reusable, marketing-ready job description TEMPLATE for the role: "${title}"` +
    (body.role_family ? ` (role family: ${body.role_family})` : '') +
    (body.category ? ` (category: ${body.category})` : '') +
    `.\n\n` +
    `This template will be adapted to many different facilities, so leave facility-specific ` +
    `details as {{blank}} tokens rather than inventing them. Use these tokens where natural: ` +
    `{{facility_name}}, {{city}}, {{state}}, {{schedule}}, {{pay_range}}, {{start_date}}, {{reports_to}}. ` +
    `You may add others if useful (lowercase snake_case keys).\n\n` +
    `Return: an inviting intro paragraph (2-4 sentences, include some {{tokens}}), 4-8 specific ` +
    `responsibilities for THIS role (not generic filler), 3-6 requirements (license/cert/education/` +
    `experience), 3-8 benefits (you may reference {{pay_range}}), and the list of every {{token}} ` +
    `you used with a friendly label.`

  try {
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2500,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    const parsed = JSON.parse(text)
    return json({ template: parsed, method: 'ai' })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
