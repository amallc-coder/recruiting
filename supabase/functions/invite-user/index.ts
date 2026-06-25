// Supabase Edge Function: invite-user
// -----------------------------------------------------------------------------
// Lets an admin invite a teammate by email. Supabase emails them a secure link;
// they click it and set their own password. The new user's role (and optional
// regions) are attached so handle_new_user provisions them correctly.
//
// Security: this runs server-side with the service-role key (never exposed to
// the browser). It first verifies the CALLER is an active admin before inviting.
//
// Deploy:
//   supabase functions deploy invite-user
// Required env (set automatically by Supabase, except SITE_URL):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   SITE_URL  -> e.g. https://amallc-coder.github.io/recruiting/  (set via:
//               supabase secrets set SITE_URL=...)
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const siteUrl = Deno.env.get('SITE_URL') ?? ''

  // 1. Verify the caller is an authenticated admin.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await callerClient.auth.getUser()
  if (!userData?.user) return json({ error: 'Not authenticated' }, 401)

  const { data: profile } = await callerClient
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .single()
  if (!profile || profile.role !== 'admin' || !profile.active) {
    return json({ error: 'Admins only' }, 403)
  }

  // 2. Validate input.
  let body: { email?: string; full_name?: string; role?: string; regions?: string[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return json({ error: 'A valid email is required' }, 400)
  const role = body.role === 'admin' ? 'admin' : 'recruiter'

  // 3. Send the invite with the service-role client.
  const admin = createClient(url, serviceKey)
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: body.full_name ?? '',
      role,
      regions: Array.isArray(body.regions) ? body.regions.join(',') : '',
    },
    redirectTo: siteUrl || undefined,
  })

  if (error) return json({ error: error.message }, 400)
  return json({ ok: true, userId: data.user?.id, email })
})
