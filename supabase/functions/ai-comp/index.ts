// Supabase Edge Function: ai-comp
// -----------------------------------------------------------------------------
// Suggested-offer / fair-market-value engine. Given a requisition (role +
// facility location), Claude researches current pay on the open web and returns
// a structured compensation band (hourly + annual low/median/high) with sources.
//
//   POST { requisition_id, refresh? }   Authorization: Bearer <jwt>
//   -> { ok, benchmark: { currency, hourly_*, annual_*, sources[], rationale,
//                         confidence, fetched_at } }
//
// Two-step, because the web-search tool cannot be combined with structured
// outputs in one request:
//   1) web_search_20260209 gathers live salary data (Indeed/BLS/Salary.com/…),
//   2) a second call shapes the findings into strict JSON (output_config.format).
// Results are cached in comp_benchmarks (keyed by org/role_family/state); a fresh
// (<30d) cached row is returned without re-querying unless refresh=true.
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
const FRESH_DAYS = 30

const COMP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['currency', 'hourly_low', 'hourly_median', 'hourly_high', 'annual_low', 'annual_median', 'annual_high', 'sources', 'rationale', 'confidence'],
  properties: {
    currency: { type: 'string' },
    hourly_low: { type: 'number' },
    hourly_median: { type: 'number' },
    hourly_high: { type: 'number' },
    annual_low: { type: 'number' },
    annual_median: { type: 'number' },
    annual_high: { type: 'number' },
    sources: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['title', 'url'],
        properties: { title: { type: 'string' }, url: { type: 'string' } },
      },
    },
    rationale: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!ANTHROPIC_KEY) return json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, 200)

  // Authenticate the caller.
  const authHeader = req.headers.get('Authorization') ?? ''
  const admin = createClient(URL_, SERVICE)
  const caller = createClient(URL_, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)
  const { data: prof } = await admin.from('users').select('active').eq('id', u.user.id).single()
  if (!prof || !prof.active) return json({ error: 'Inactive account' }, 403)

  const { requisition_id, refresh = false } = await req.json().catch(() => ({}))
  if (!requisition_id) return json({ error: 'Missing requisition_id' }, 400)

  // Resolve role + location from the requisition.
  const { data: reqRow } = await admin
    .from('requisitions')
    .select('org_id, role_family, specialty, title, facility:facilities(city,state)')
    .eq('id', requisition_id)
    .single()
  if (!reqRow) return json({ error: 'Requisition not found' }, 404)
  const orgId = reqRow.org_id as string
  const roleFamily = (reqRow.role_family as string) ?? ''
  const specialty = (reqRow.specialty as string) ?? null
  const title = (reqRow.title as string) ?? roleFamily
  const fac = (reqRow as { facility?: { city?: string; state?: string } | null }).facility ?? null
  const city = fac?.city ?? null
  const state = fac?.state ?? null

  // Return a fresh cached benchmark unless a refresh was requested.
  if (!refresh) {
    const { data: cached } = await admin
      .from('comp_benchmarks')
      .select('*')
      .eq('org_id', orgId)
      .eq('role_family', roleFamily)
      .eq('state', state ?? '')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (cached) {
      const ageDays = (Date.now() - new Date((cached as { fetched_at: string }).fetched_at).getTime()) / 86_400_000
      if (ageDays < FRESH_DAYS) return json({ ok: true, benchmark: cached, cached: true })
    }
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
  const where = [city, state].filter(Boolean).join(', ') || 'the United States'
  const roleLabel = `${title}${specialty ? ` (${specialty})` : ''}`

  // Step 1 — research current pay on the open web.
  let findings = ''
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      messages: [{
        role: 'user',
        content:
          `Research current compensation for a ${roleLabel} working in ${where}, in the healthcare / ` +
          `skilled-nursing & long-term-care (SNF/LTC) staffing market. Find recent (this year) pay data from ` +
          `reputable sources (BLS, Indeed, Salary.com, ZipRecruiter, Glassdoor, Vivian, Aya, nursing salary ` +
          `surveys). Report BOTH an hourly range and an annualized range (low / median / high) in USD for this ` +
          `role in this geography, noting which are contract/agency vs permanent if relevant. List the specific ` +
          `sources you used with their URLs. Be concrete with numbers.`,
      }],
    })
    findings = resp.content.filter((b: { type: string }) => b.type === 'text').map((b: { text?: string }) => b.text ?? '').join('\n').trim()
  } catch (e) {
    console.error('ai-comp: web search failed:', e instanceof Error ? e.message : e)
    return json({ ok: false, error: 'Market research failed. Try again.' }, 200)
  }
  if (!findings) return json({ ok: false, error: 'No market data found for this role/area.' }, 200)

  // Step 2 — shape the findings into a strict JSON benchmark.
  let parsed: Record<string, unknown>
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      output_config: { format: { type: 'json_schema', schema: COMP_SCHEMA } },
      messages: [{
        role: 'user',
        content:
          `From the compensation research below, produce a single fair-market-value benchmark for a ${roleLabel} ` +
          `in ${where}. Give hourly_low/median/high and annual_low/median/high in USD (annual ≈ hourly × 2080 if ` +
          `only one basis is reported). Include the cited sources (title + url). Set confidence based on how much ` +
          `concrete, location-specific data you found. Base everything ONLY on the research.\n\nRESEARCH:\n${findings}`,
      }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    parsed = JSON.parse(text)
  } catch (e) {
    console.error('ai-comp: structuring failed:', e instanceof Error ? e.message : e)
    return json({ ok: false, error: 'Could not structure the market data.' }, 200)
  }

  // Persist (newest row wins) and return.
  const row = {
    org_id: orgId, role_family: roleFamily, specialty, state: state ?? '', city,
    currency: (parsed.currency as string) ?? 'USD',
    hourly_low: parsed.hourly_low ?? null, hourly_median: parsed.hourly_median ?? null, hourly_high: parsed.hourly_high ?? null,
    annual_low: parsed.annual_low ?? null, annual_median: parsed.annual_median ?? null, annual_high: parsed.annual_high ?? null,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    rationale: (parsed.rationale as string) ?? null,
    confidence: (parsed.confidence as string) ?? null,
    model: 'claude-opus-4-8',
    fetched_at: new Date().toISOString(),
  }
  const { data: saved } = await admin.from('comp_benchmarks').insert(row).select('*').single()
  return json({ ok: true, benchmark: saved ?? row, cached: false })
})
