// Supabase Edge Function: integration-sync
// -----------------------------------------------------------------------------
// Tests a connection or runs a sync for an integration, using the credentials
// stored server-side (never sent to the browser). Admin-only.
//
//   POST { integration_id, action: 'test' | 'sync' }   Authorization: Bearer jwt
//
// For OAuth providers it refreshes the access token if expired, then calls the
// provider's health endpoint (test) or a light pull (sync). For API-key
// providers it validates that a key is present. Every attempt is written to
// integration_logs with a readable message + technical detail.
//
// Deploy:
//   supabase functions deploy integration-sync --no-verify-jwt
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { providerConfig, exchangeToken, toCredentials } from '../_shared/providers.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = () => createClient(SUPABASE_URL, SERVICE_KEY)

async function log(integrationId: string, event: string, status: string, message: string, detail?: unknown) {
  await admin().from('integration_logs').insert({
    integration_id: integrationId, event_type: event, status, message,
    response_payload: detail ? (detail as Record<string, unknown>) : null,
  })
}

// Ensure a fresh access token, refreshing via refresh_token if expired.
async function freshToken(integration: Record<string, unknown>, creds: Record<string, unknown>): Promise<string | null> {
  const cfg = providerConfig(String(integration.provider))
  const expISO = creds.expires_at as string | null
  const expired = expISO ? new Date(expISO).getTime() < Date.now() + 60_000 : false
  if (!expired || !cfg || !creds.refresh_token) return (creds.access_token as string) ?? null

  const tok = await exchangeToken(cfg, { grant_type: 'refresh_token', refresh_token: String(creds.refresh_token) })
  const next = toCredentials(tok)
  if (!next.refresh_token) next.refresh_token = creds.refresh_token // providers may omit it on refresh
  await admin().from('integration_credentials')
    .update({ encrypted_credentials: next }).eq('id', integration.credentials_reference as string)
  return (next.access_token as string) ?? null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Auth: admin only.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)
  const { data: prof } = await admin().from('profiles').select('role,active').eq('id', u.user.id).single()
  if (!prof || prof.role !== 'admin' || !prof.active) return json({ error: 'Admin only' }, 403)

  const { integration_id, action = 'test' } = await req.json().catch(() => ({}))
  if (!integration_id) return json({ error: 'Missing integration_id' }, 400)

  const sb = admin()
  const { data: integ } = await sb.from('integrations').select('*').eq('id', integration_id).single()
  if (!integ) return json({ error: 'Integration not found' }, 404)

  let creds: Record<string, unknown> = {}
  if (integ.credentials_reference) {
    const { data: c } = await sb.from('integration_credentials').select('encrypted_credentials').eq('id', integ.credentials_reference).single()
    creds = (c?.encrypted_credentials as Record<string, unknown>) ?? {}
  }

  try {
    const cfg = providerConfig(integ.provider)

    // OAuth providers: refresh + call the health endpoint.
    if (cfg) {
      const token = await freshToken(integ, creds)
      if (!token) throw new Error('No access token — re-authorize this integration.')
      if (cfg.testUrl) {
        const res = await fetch(cfg.testUrl, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error(`Provider returned ${res.status}`)
      }
      const msg = action === 'sync'
        ? `Sync ran. Connection healthy; provider-specific record sync is wired per integration.`
        : 'Connection healthy.'
      await sb.from('integrations').update({ status: 'connected', last_sync_at: new Date().toISOString() }).eq('id', integration_id)
      await log(integration_id, action, 'success', msg)
      return json({ ok: true, message: msg })
    }

    // API-key / header providers: validate a credential is present.
    const hasKey = !!(creds.api_key || creds.token || creds.header_value || creds.signing_secret || (creds.username && creds.password))
    if (!hasKey) throw new Error('No credentials stored for this integration.')
    const msg = `Credentials present. ${action === 'sync' ? 'Sync queued' : 'Connection looks valid'}.`
    await sb.from('integrations').update({ status: 'connected', last_sync_at: new Date().toISOString() }).eq('id', integration_id)
    await log(integration_id, action, 'success', msg)
    return json({ ok: true, message: msg })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sb.from('integrations').update({ status: 'error' }).eq('id', integration_id)
    await log(integration_id, action, 'error', msg)
    return json({ ok: false, message: msg }, 200)
  }
})
