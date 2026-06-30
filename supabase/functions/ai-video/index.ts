// Supabase Edge Function: ai-video
// -----------------------------------------------------------------------------
// Score a completed async video screening from its answer transcripts.
//
//   POST { video_screening_id }   Authorization: Bearer <jwt>
//   -> { ok, score, summary, strengths[], concerns[], recommendation }
//
// Reads the per-question transcripts captured during recording and asks Claude
// for a structured assessment (0-100 score, summary, strengths, concerns). Note:
// transcripts are best-effort (browser speech recognition); the recruiter still
// watches the clips. Writes ai_* fields back and marks the screening reviewed.
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
  required: ['score', 'summary', 'strengths', 'concerns', 'recommendation'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string', enum: ['advance', 'maybe', 'pass'] },
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

  const { video_screening_id } = await req.json().catch(() => ({}))
  if (!video_screening_id) return json({ error: 'Missing video_screening_id' }, 400)

  const { data: v } = await admin
    .from('video_screenings')
    .select('id, status, questions, recordings, candidate:candidates(full_name)')
    .eq('id', video_screening_id)
    .single()
  if (!v) return json({ error: 'Video screening not found' }, 404)
  if (v.status === 'pending') return json({ ok: false, error: 'Not recorded yet.' }, 200)

  const candidate = (v as { candidate?: { full_name?: string } | null }).candidate?.full_name ?? 'the candidate'
  const questions = (v.questions as { id: string; prompt: string }[]) ?? []
  const recordings = (v.recordings as { question_id: string; transcript: string | null }[]) ?? []
  const qa = questions
    .map((q) => {
      const t = recordings.find((r) => r.question_id === q.id)?.transcript
      return `Q: ${q.prompt}\nTranscript: ${t && t.trim() ? t.trim() : '(no transcript captured)'}`
    })
    .join('\n\n')
  const hasText = recordings.some((r) => r.transcript && r.transcript.trim())
  if (!hasText) return json({ ok: false, error: 'No transcripts were captured to score. Watch the clips manually.' }, 200)

  let parsed: { score?: number; summary?: string; strengths?: unknown; concerns?: unknown; recommendation?: string }
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1200,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content:
          `Assess this candidate's one-way video screening for a healthcare-staffing (SNF/LTC) role, based on the ` +
          `answer transcripts for ${candidate}. Give a 0-100 fit score, a short summary, concrete strengths and ` +
          `concerns, and a recommendation (advance / maybe / pass). Transcripts are auto-generated and may be ` +
          `imperfect — judge substance over wording, and don't penalize transcription noise.\n\n${qa}`,
      }],
    })
    const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    parsed = JSON.parse(text)
  } catch (e) {
    console.error('ai-video failed:', e instanceof Error ? e.message : e)
    return json({ ok: false, error: 'Scoring failed. Try again.' }, 200)
  }

  await admin
    .from('video_screenings')
    .update({
      ai_score: parsed.score ?? null,
      ai_summary: parsed.summary ?? null,
      ai_strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      ai_concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      ai_recommendation: parsed.recommendation ?? null,
      status: 'reviewed',
    })
    .eq('id', video_screening_id)

  return json({ ok: true, ...parsed })
})
