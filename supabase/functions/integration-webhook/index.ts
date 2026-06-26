// Supabase Edge Function: integration-webhook
// -----------------------------------------------------------------------------
// Public inbound webhook receiver for external platforms. Validates the
// signature when a signing secret is configured, records every event in
// webhook_events (pending -> processing -> completed/failed), and applies a few
// core event types to ATS data.
//
//   POST /functions/v1/integration-webhook/<provider>
//
// Supported events: candidate.created, application.created,
// application.stage_changed, job.created (others are logged, not applied).
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
const DEFAULT_COMPANY = '00000000-0000-0000-0000-000000000001'
const sb = () => createClient(SUPABASE_URL, SERVICE_KEY)

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
  // Find a matching integration to attribute the event + read its signing secret.
  const { data: integ } = await db.from('integrations').select('id,credentials_reference').eq('provider', provider).limit(1).maybeSingle()
  const integrationId = integ?.id ?? null

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

  // Apply core event types.
  try {
    const data = (payload.data ?? payload) as Record<string, unknown>
    if (eventType === 'candidate.created') {
      const full = (data.full_name as string) || [data.first_name, data.last_name].filter(Boolean).join(' ')
      if (full) {
        await db.from('candidates').insert({
          full_name: full, email: data.email ?? null, phone: data.phone ?? null,
          source: provider, current_stage: 'sourced',
          resume_text: (data.resume as string) || full, checklist: {},
        })
      }
    } else if (eventType === 'application.created') {
      const full = (data.full_name as string) || [data.first_name, data.last_name].filter(Boolean).join(' ')
      if (full && data.job_id) {
        await db.from('applications').insert({
          company_id: DEFAULT_COMPANY, job_id: data.job_id, full_name: full,
          email: data.email ?? null, phone: data.phone ?? null, source: provider, stage: 'sourced',
        })
      }
    } else if (eventType === 'application.stage_changed' && data.application_id && data.stage) {
      await db.from('applications').update({ stage: data.stage }).eq('id', data.application_id)
      const { data: app } = await db.from('applications').select('candidate_id').eq('id', data.application_id).single()
      if (app?.candidate_id) await db.from('candidates').update({ current_stage: data.stage }).eq('id', app.candidate_id)
    } else if (eventType === 'job.created' && data.title) {
      await db.from('jobs').insert({
        company_id: DEFAULT_COMPANY, title: data.title, department: data.department ?? null,
        location: data.location ?? null, status: 'draft',
      })
    }
    if (eventId) await db.from('webhook_events').update({ processed_status: 'completed', processed_at: new Date().toISOString() }).eq('id', eventId)
    if (integrationId) await db.from('integration_logs').insert({ integration_id: integrationId, event_type: `webhook:${eventType}`, status: 'success', message: 'Processed webhook event.' })
    return json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (eventId) await db.from('webhook_events').update({ processed_status: 'failed', error_message: msg, processed_at: new Date().toISOString() }).eq('id', eventId)
    return json({ ok: false, error: msg }, 200)
  }
})
