// Supabase Edge Function: checkr-webhook  (PUBLIC — deploy with --no-verify-jwt)
// -----------------------------------------------------------------------------
// Receives Checkr webhook events and updates the matching application's
// background-check status. Maps the event back to our application by the Checkr
// candidate id we stored when the check was ordered.
//
//   GET  -> { ok: true }                       (health check / Checkr verification)
//   POST <checkr event>                         (report.* / invitation.* events)
//
// Security: if CHECKR_WEBHOOK_SECRET is set, the X-Checkr-Signature header
// (HMAC-SHA256 hex of the raw body) is verified and mismatches are rejected.
// Auto-provided: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-checkr-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Map a Checkr report status to our fields. 'clear' also stamps the cleared date. */
const TERMINAL = new Set(['clear', 'consider', 'suspended', 'dispute', 'canceled'])

async function verifySignature(secret: string, raw: string, header: string | null): Promise<boolean> {
  if (!header) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  // Constant-ish comparison.
  return hex.length === header.length && hex === header.toLowerCase()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method === 'GET') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const env = (k: string) => Deno.env.get(k) ?? ''
  const raw = await req.text()

  const secret = env('CHECKR_WEBHOOK_SECRET')
  if (secret) {
    const ok = await verifySignature(secret, raw, req.headers.get('X-Checkr-Signature'))
    if (!ok) return json({ error: 'Invalid signature' }, 401)
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } }
  try {
    event = JSON.parse(raw)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const type = event.type ?? ''
  const obj = event.data?.object ?? {}
  const candidateId = (obj.candidate_id as string) ?? null
  const status = (obj.status as string) ?? null
  // For report.* events the object id is the report id; for invitations it isn't.
  const reportId = type.startsWith('report.') ? ((obj.id as string) ?? null) : null

  // Nothing to map without a Checkr candidate id.
  if (!candidateId) return json({ ok: true, ignored: 'no candidate_id' })

  const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))

  const patch: Record<string, unknown> = {}
  if (reportId) patch.checkr_report_id = reportId
  if (status) patch.checkr_status = status
  if (status === 'clear') patch.background_cleared_date = new Date().toISOString().slice(0, 10)
  // Only write when we actually have something to set.
  if (Object.keys(patch).length === 0) return json({ ok: true, ignored: type })

  const { error, count } = await service
    .from('applications')
    .update(patch, { count: 'exact' })
    .eq('checkr_candidate_id', candidateId)
  if (error) {
    console.error('checkr-webhook update failed:', error.message)
    return json({ error: error.message }, 500)
  }

  return json({ ok: true, type, updated: count ?? 0, status: status ?? null, terminal: status ? TERMINAL.has(status) : false })
})
