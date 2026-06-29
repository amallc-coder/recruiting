// Supabase Edge Function: integration-oauth
// -----------------------------------------------------------------------------
// Runs the OAuth 2.0 handshake for integrations (Google Calendar, Gmail,
// Outlook, LinkedIn, Indeed). Two entry points on one URL:
//
//   POST  (action=authorize, Authorization: Bearer <user jwt>)
//         -> verifies the caller is an admin, returns the provider consent URL
//   GET   ?code=...&state=...   (the provider redirects the browser here)
//         -> exchanges the code for tokens, stores them server-side, marks the
//            integration connected, then redirects back to the app.
//
// Tokens are written to integration_credentials (which has NO select policy),
// so they are never exposed to the browser.
//
// Deploy (callback has no JWT, so disable verification and check auth in-code):
//   supabase functions deploy integration-oauth --no-verify-jwt
// Register this exact URL as the OAuth redirect URI with each provider:
//   https://<project>.supabase.co/functions/v1/integration-oauth
// Required secrets (per provider you enable):
//   GOOGLE_CLIENT_ID/SECRET, MICROSOFT_CLIENT_ID/SECRET,
//   LINKEDIN_CLIENT_ID/SECRET, INDEED_CLIENT_ID/SECRET, SITE_URL
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { providerConfig, exchangeToken, toCredentials } from '../_shared/providers.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SITE_URL = Deno.env.get('SITE_URL') ?? ''
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/integration-oauth`

const admin = () => createClient(SUPABASE_URL, SERVICE_KEY)

function b64(obj: unknown) { return btoa(JSON.stringify(obj)) }
function unb64(s: string): { integration_id: string; provider: string } { return JSON.parse(atob(s)) }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)

  // ---- OAuth callback (provider redirects the browser here) ----
  if (req.method === 'GET' && (url.searchParams.has('code') || url.searchParams.has('error'))) {
    const err = url.searchParams.get('error')
    const state = url.searchParams.get('state') ?? ''
    let integrationId = ''
    try {
      const s = unb64(state)
      integrationId = s.integration_id
      if (err) throw new Error(err)
      const cfg = providerConfig(s.provider)
      if (!cfg) throw new Error(`Unknown provider ${s.provider}`)
      const code = url.searchParams.get('code')!
      const tok = await exchangeToken(cfg, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
      const creds = toCredentials(tok)

      const sb = admin()
      const { data: cred } = await sb.from('integration_credentials')
        .insert({ integration_id: integrationId, encrypted_credentials: creds }).select('id').single()
      await sb.from('integrations').update({
        status: 'connected', is_enabled: true, credentials_reference: cred?.id ?? null, last_sync_at: null,
      }).eq('id', integrationId)
      await sb.from('integration_logs').insert({
        integration_id: integrationId, event_type: 'oauth', status: 'success', message: 'Authorized via OAuth.',
      })
      return Response.redirect(`${SITE_URL}#/integrations?connected=${s.provider}`, 302)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (integrationId) {
        const sb = admin()
        await sb.from('integrations').update({ status: 'error' }).eq('id', integrationId)
        await sb.from('integration_logs').insert({ integration_id: integrationId, event_type: 'oauth', status: 'error', message: msg })
      }
      return Response.redirect(`${SITE_URL}#/integrations?error=${encodeURIComponent(msg)}`, 302)
    }
  }

  // ---- Authorize: return the provider consent URL (admin only) ----
  if (req.method === 'POST') {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: u } = await caller.auth.getUser()
    if (!u?.user) return json({ error: 'Not authenticated' }, 401)
    // v2 stores app users + roles in `users` (there is no `profiles` table).
    const { data: prof } = await admin().from('users').select('role,active').eq('id', u.user.id).single()
    if (!prof || prof.role !== 'admin' || !prof.active) return json({ error: 'Admin only' }, 403)

    const { integration_id, provider } = await req.json().catch(() => ({}))
    const cfg = providerConfig(provider)
    if (!integration_id || !cfg) return json({ error: 'Missing integration_id or unknown provider' }, 400)
    const clientId = Deno.env.get(cfg.clientIdEnv)
    if (!clientId) return json({ error: `${cfg.clientIdEnv} not configured` }, 400)

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: cfg.scope,
      state: b64({ integration_id, provider }),
      ...(cfg.extraAuthParams ?? {}),
    })
    return json({ url: `${cfg.authUrl}?${params.toString()}` })
  }

  return json({ error: 'Method not allowed' }, 405)
})
