// Supabase Edge Function: checkr-order  (verify_jwt = true)
// -----------------------------------------------------------------------------
// Orders a Checkr background check for ONE application. Creates (or reuses) the
// Checkr candidate from our candidate's name + email, then sends a Checkr
// invitation for the configured package — Checkr emails the candidate to collect
// their PII and run the check. We record the Checkr candidate id, set
// background_sent_date, and mark checkr_status = 'pending'. The result arrives
// later via the checkr-webhook function.
//
//   POST { application_id }   Authorization: Bearer <jwt>
//
// Required secrets (supabase secrets set ...):
//   CHECKR_API_KEY     (Checkr secret API key)
//   CHECKR_PACKAGE     (the package slug to order, e.g. "driver_pro")
// Optional:
//   CHECKR_WORK_STATE  (US state for work_locations, e.g. "MO"; country US assumed)
// Auto-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const CHECKR_BASE = 'https://api.checkr.com/v1'

/** Basic auth header: Checkr uses the API key as the username with an empty password. */
function checkrAuth(apiKey: string): string {
  return 'Basic ' + btoa(`${apiKey}:`)
}

/** Best-effort split of a single full name into first / last for Checkr. */
function splitName(full: string): { first: string; last: string } {
  const parts = (full || '').trim().split(/\s+/)
  if (parts.length === 0) return { first: 'Candidate', last: '-' }
  if (parts.length === 1) return { first: parts[0], last: '-' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const env = (k: string) => Deno.env.get(k) ?? ''
  const apiKey = env('CHECKR_API_KEY')
  const pkg = env('CHECKR_PACKAGE')
  if (!apiKey || !pkg) {
    const missing = [!apiKey && 'CHECKR_API_KEY', !pkg && 'CHECKR_PACKAGE'].filter(Boolean).join(', ')
    return json({ error: `Checkr isn't configured yet. Set these Edge Function secrets: ${missing}.` }, 400)
  }

  const url = env('SUPABASE_URL')
  const caller = createClient(url, env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
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

  const service = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'))

  // Caller must be active staff in the org that owns the application.
  const { data: me } = await service.from('users').select('role, active, org_id').eq('id', u.user.id).maybeSingle()
  if (!me || !me.active || !['admin', 'recruiter', 'coordinator'].includes(me.role)) {
    return json({ error: 'Not allowed' }, 403)
  }

  const { data: app, error: appErr } = await service
    .from('applications')
    .select('id, org_id, checkr_candidate_id, candidate:candidates(full_name, email)')
    .eq('id', applicationId)
    .maybeSingle()
  if (appErr) return json({ error: `Failed to load application: ${appErr.message}` }, 500)
  if (!app) return json({ error: 'Application not found' }, 404)
  if ((app as { org_id?: string }).org_id !== (me as { org_id?: string }).org_id) {
    return json({ error: 'Not allowed' }, 403)
  }

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))
  const candidate = one<{ full_name?: string | null; email?: string | null }>(
    (app as Record<string, unknown>).candidate as never,
  )
  const email = candidate?.email?.trim()
  if (!email) return json({ error: 'Candidate has no email — Checkr requires one to invite them.' }, 422)

  try {
    // 1. Reuse the stored Checkr candidate, or create one.
    let checkrCandidateId = (app as { checkr_candidate_id?: string | null }).checkr_candidate_id ?? null
    if (!checkrCandidateId) {
      const { first, last } = splitName(candidate?.full_name ?? '')
      const res = await fetch(`${CHECKR_BASE}/candidates`, {
        method: 'POST',
        headers: { Authorization: checkrAuth(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: first, last_name: last, email }),
      })
      const data = await res.json()
      if (!res.ok) return json({ error: `Checkr candidate failed: ${data?.error ?? JSON.stringify(data)}` }, 502)
      checkrCandidateId = data.id
    }

    // 2. Send the invitation for the configured package.
    const workState = env('CHECKR_WORK_STATE')
    const invitePayload: Record<string, unknown> = {
      candidate_id: checkrCandidateId,
      package: pkg,
      work_locations: [workState ? { country: 'US', state: workState } : { country: 'US' }],
    }
    const invRes = await fetch(`${CHECKR_BASE}/invitations`, {
      method: 'POST',
      headers: { Authorization: checkrAuth(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(invitePayload),
    })
    const inv = await invRes.json()
    if (!invRes.ok) return json({ error: `Checkr invitation failed: ${inv?.error ?? JSON.stringify(inv)}` }, 502)

    // 3. Record on the application: candidate id, sent date, pending status.
    const today = new Date().toISOString().slice(0, 10)
    await service
      .from('applications')
      .update({ checkr_candidate_id: checkrCandidateId, checkr_status: 'pending', background_sent_date: today })
      .eq('id', applicationId)

    return json({ ok: true, checkr_candidate_id: checkrCandidateId, status: 'pending', invitation_status: inv.status })
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    console.error('checkr-order failed:', msg)
    return json({ error: msg }, 500)
  }
})
