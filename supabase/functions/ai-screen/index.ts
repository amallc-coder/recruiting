// Supabase Edge Function: ai-screen
// -----------------------------------------------------------------------------
// AI screening assistant. Two actions:
//
//   POST { action: 'generate', candidate, job }
//     -> { questions: [{id, question, rationale, competency}] }
//        Builds a tailored phone/text screening questionnaire from the
//        candidate's résumé + the job/opening details. The recruiter reviews
//        and approves before anything is sent.
//
//   POST { action: 'analyze', candidate, job, questions, responses, transcript? }
//     -> { summary, score (0-100), flags: [{type, detail, severity}],
//          recommendation, strengths, concerns }
//        Reads the candidate's answers (typed responses and/or a call/SMS
//        transcript) and returns a recruiter-facing analysis. The summary is
//        also fed back into matching so screened candidates rank better.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy ai-screen
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

const GENERATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'question', 'rationale', 'competency'],
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          rationale: { type: 'string' },
          competency: { type: 'string' },
        },
      },
    },
  },
}

const ANALYZE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'score', 'flags', 'recommendation', 'strengths', 'concerns'],
  properties: {
    summary: { type: 'string' },
    score: { type: 'integer' },
    recommendation: { type: 'string', enum: ['advance', 'hold', 'reject'] },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'detail', 'severity'],
        properties: {
          type: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  },
}

type Candidate = {
  full_name?: string
  role?: string
  region?: string
  resume_text?: string
  rating?: number
  notes?: string
}
type Job = {
  title?: string
  role?: string
  location?: string
  description?: string
  responsibilities?: string
  requirements?: string
  employment_type?: string
}

function jobText(job: Job): string {
  return [
    job.title && `Title: ${job.title}`,
    job.role && `Role code: ${job.role}`,
    job.location && `Location: ${job.location}`,
    job.employment_type && `Employment type: ${job.employment_type}`,
    job.description && `Description:\n${job.description}`,
    job.responsibilities && `Responsibilities:\n${job.responsibilities}`,
    job.requirements && `Requirements:\n${job.requirements}`,
  ].filter(Boolean).join('\n')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500)

  // Require an authenticated user.
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)

  let body: {
    action?: string
    candidate?: Candidate
    job?: Job
    questions?: { id: string; question: string }[]
    responses?: { question_id: string; answer: string }[]
    transcript?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const candidate = body.candidate ?? {}
  const job = body.job ?? {}
  const anthropic = new Anthropic({ apiKey })

  if (body.action === 'generate') {
    const prompt =
      `You are an expert clinical-staffing recruiter building a phone screening for a ` +
      `healthcare candidate. Write 6–9 concise screening questions tailored to THIS ` +
      `candidate and THIS opening. Cover: confirmation of licensure/certifications and ` +
      `their status, relevant clinical experience, availability/start date, ` +
      `location/commute or telehealth fit, compensation expectations, and any gaps or ` +
      `ambiguities you notice in the résumé. Questions must be answerable verbally in a ` +
      `5–10 minute call, neutral, and compliant (no questions about protected ` +
      `characteristics — age, marital/family status, health, religion, national origin). ` +
      `For each, give a one-line rationale and the competency it probes.\n\n` +
      `OPENING\n${jobText(job)}\n\n` +
      `CANDIDATE\nName: ${candidate.full_name ?? 'n/a'}\nRole: ${candidate.role ?? 'n/a'}\n` +
      `Region: ${candidate.region ?? 'n/a'}\nRésumé:\n${candidate.resume_text || '(no résumé text on file)'}\n` +
      `${candidate.notes ? `Recruiter notes: ${candidate.notes}\n` : ''}`

    try {
      const resp = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 3000,
        output_config: { format: { type: 'json_schema', schema: GENERATE_SCHEMA } },
        messages: [{ role: 'user', content: prompt }],
      })
      const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
      const parsed = JSON.parse(text)
      return json({ questions: parsed.questions ?? [] })
    } catch (e) {
      return json({ error: String(e instanceof Error ? e.message : e) }, 500)
    }
  }

  if (body.action === 'analyze') {
    const qa = (body.questions ?? []).map((q) => {
      const r = (body.responses ?? []).find((x) => x.question_id === q.id)
      return `Q: ${q.question}\nA: ${r?.answer?.trim() || '(no answer recorded)'}`
    }).join('\n\n')

    const prompt =
      `You are an expert clinical-staffing recruiter analyzing the results of a screening ` +
      `for a healthcare candidate. Read the questions and answers (and call transcript if ` +
      `provided) and produce a recruiter-facing analysis:\n` +
      `- summary: 2–4 sentence plain-language readout for the recruiter.\n` +
      `- score: 0–100 overall fit for THIS opening given what the screening revealed.\n` +
      `- recommendation: advance | hold | reject.\n` +
      `- strengths and concerns: concrete bullet points.\n` +
      `- flags: anything needing attention (e.g. license_expired, availability_mismatch, ` +
      `comp_gap, location_conflict, inconsistent_answer) with severity low/medium/high.\n` +
      `Base everything ONLY on what the candidate actually said. If the screening is ` +
      `incomplete, say so and keep the score conservative.\n\n` +
      `OPENING\n${jobText(job)}\n\n` +
      `CANDIDATE\nName: ${candidate.full_name ?? 'n/a'}\nRole: ${candidate.role ?? 'n/a'}\n\n` +
      `SCREENING Q&A\n${qa || '(no structured answers)'}\n\n` +
      `${body.transcript ? `CALL/SMS TRANSCRIPT\n${body.transcript}\n` : ''}`

    try {
      const resp = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 3000,
        output_config: { format: { type: 'json_schema', schema: ANALYZE_SCHEMA } },
        messages: [{ role: 'user', content: prompt }],
      })
      const text = resp.content.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
      const parsed = JSON.parse(text)
      return json(parsed)
    } catch (e) {
      return json({ error: String(e instanceof Error ? e.message : e) }, 500)
    }
  }

  return json({ error: `Unknown action: ${body.action}` }, 400)
})
