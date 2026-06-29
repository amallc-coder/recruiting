// Supabase Edge Function: integration-webhook (v2 schema)
// -----------------------------------------------------------------------------
// Public inbound webhook receiver for external platforms. Validates the
// signature when a signing secret is configured, records every event in
// webhook_events (pending -> processing -> completed/failed), and applies a few
// core event types to the v2 ATS data model (org-scoped via the integration).
//
//   POST /functions/v1/integration-webhook/<provider>
//
// Applied on v2: candidate.created, application.created (when requisition_id is
// supplied). job.created / application.stage_changed are recorded (and a status
// change is applied when a valid v2 status is given), but a requisition can't be
// safely created from a webhook (facility_id/role_family are required), so
// job.created is record-only. Everything is written to webhook_events for audit.
//
// Deploy (public — no JWT):
//   supabase functions deploy integration-webhook --no-verify-jwt
// Webhook URL to register with a provider:
//   https://<project>.supabase.co/functions/v1/integration-webhook/<provider>
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const sb = () => createClient(SUPABASE_URL, SERVICE_KEY)
const APP_STATUSES = ['active', 'rejected', 'withdrawn', 'hired']

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const provider = new URL(req.url).pathname.split('/').filter(Boolean).pop() || 'unknown'
  const raw = await req.text()
  let payload: Record<string, unknown> = {}
  try { payload = JSON.parse(raw) } catch { /* keep raw */ }

  const db = sb()
  // Find a matching integration to attribute the event + read its org + signing secret.
  const { data: integ } = await db.from('integrations').select('id,org_id,credentials_reference').eq('provider', provider).limit(1).maybeSingle()
  const integrationId = integ?.id ?? null
  const orgId = (integ as { org_id?: string } | null)?.org_id ?? null

  // Optional signature verification.
  let verified = true
  if (integ?.credentials_reference) {
    const { data: cred } = await db.from('integration_credentials').select('encrypted_credentials').eq('id', integ.credentials_reference).single()
    const secret = (cred?.encrypted_credentials as Record<string, unknown>)?.signing_secret as string | undefined
    const sig = req.headers.get('x-webhook-signature') || ''
    if (secret) {
      const expected = await hmacHex(secret, raw)
      verified = sig.includes(expected)
    }
  }

  const eventType = (payload.event_type as string) || (payload.type as string) || 'unknown'
  const { data: evt } = await db.from('webhook_events').insert({
    integration_id: integrationId, event_type: eventType, source_platform: provider,
    payload, processed_status: verified ? 'processing' : 'failed',
    error_message: verified ? null : 'Signature verification failed',
  }).select('id').single()
  const eventId = evt?.id

  if (!verified) return json({ ok: false, error: 'signature_invalid' }, 401)

  // Apply core event types against the v2 schema (org-scoped via the integration).
  try {
    const data = (payload.data ?? payload) as Record<string, unknown>
    const nameOf = (d: Record<string, unknown>) =>
      (d.full_name as string) || [d.first_name, d.last_name].filter(Boolean).join(' ')

    // Resolve (or create) an org-scoped candidate by email, returning its id.
    const ensureCandidate = async (full: string): Promise<string | null> => {
      if (!orgId || !full) return null
      const email = (data.email as string) || null
      if (email) {
        const { data: existing } = await db.from('candidates').select('id').eq('org_id', orgId).eq('email', email).limit(1).maybeSingle()
        if (existing?.id) return existing.id as string
      }
      const { data: created } = await db.from('candidates').insert({
        org_id: orgId, full_name: full, email, phone: (data.phone as string) ?? null,
        source: provider, status: 'new', resume_text: (data.resume as string) ?? null,
      }).select('id').single()
      return (created?.id as string) ?? null
    }

    let applied = true
    if (eventType === 'candidate.created') {
      await ensureCandidate(nameOf(data))
    } else if (eventType === 'application.created') {
      const candidateId = await ensureCandidate(nameOf(data))
      // A v2 application needs a requisition; only create one when the provider supplies it.
      if (candidateId && orgId && data.requisition_id) {
        const { data: dupe } = await db.from('applications').select('id')
          .eq('org_id', orgId).eq('candidate_id', candidateId).eq('requisition_id', data.requisition_id as string).limit(1).maybeSingle()
        if (!dupe?.id) {
          await db.from('applications').insert({
            org_id: orgId, candidate_id: candidateId, requisition_id: data.requisition_id as string, status: 'active',
          })
        }
      }
    } else if (eventType === 'application.stage_changed' && data.application_id && APP_STATUSES.includes(String(data.status))) {
      await db.from('applications').update({ status: String(data.status) }).eq('id', data.application_id as string)
    } else {
      // job.created and anything else: recorded for audit but not auto-applied
      // (a v2 requisition requires facility_id/role_family a webhook can't supply).
      applied = false
    }

    if (eventId) await db.from('webhook_events').update({ processed_status: 'completed', processed_at: new Date().toISOString() }).eq('id', eventId)
    if (integrationId) await db.from('integration_logs').insert({
      integration_id: integrationId, event_type: `webhook:${eventType}`, status: 'success',
      message: applied ? 'Applied webhook event.' : 'Recorded webhook event (no auto-apply rule).',
    })
    return json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (eventId) await db.from('webhook_events').update({ processed_status: 'failed', error_message: msg, processed_at: new Date().toISOString() }).eq('id', eventId)
    return json({ ok: false, error: msg }, 200)
  }
})
