// Supabase Edge Function: recruiter-admin
// -----------------------------------------------------------------------------
// Admin tools for managing recruiter accounts from the in-app Team panel:
//   POST { action: 'update_email', user_id, email }
//        -> sets the user's (login) email, marks it confirmed, clears the
//           placeholder flag, and syncs profiles.email.
//
// Sending the password-reset email is done client-side
// (supabase.auth.resetPasswordForEmail), which only needs the anon key.
//
// Runs with the service role and verifies the caller is an admin.
//
// Deploy:
//   supabase functions deploy recruiter-admin
// -----------------------------------------------------------------------------
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)
  const admin = createClient(URL_, SERVICE)
  const caller = createClient(URL_, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)
  const { data: prof } = await admin.from('profiles').select('role,active').eq('id', u.user.id).single()
  if (!prof || prof.role !== 'admin' || !prof.active) return json({ error: 'Admin only' }, 403)

  const body = await req.json().catch(() => ({}))
  const action = body.action

  if (action === 'update_email') {
    const userId = String(body.user_id ?? '')
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!userId || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Valid user_id and email required' }, 400)

    const { error: uErr } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
    if (uErr) return json({ error: uErr.message }, 400)
    await admin.from('profiles').update({ email, placeholder: false }).eq('id', userId)
    return json({ ok: true, email })
  }

  return json({ error: `Unknown action: ${action}` }, 400)
})
