// Supabase Edge Function: recruiter-upsert
// -----------------------------------------------------------------------------
// Creates a PLACEHOLDER recruiter from a name (no email yet) so the importer can
// assign candidates to them. A real login is granted later by setting the email
// and inviting them (Team screen / invite-user). Runs with the service role and
// verifies the caller is an admin.
//
//   POST { full_name }  Authorization: Bearer <admin jwt>
//   -> { id, email, placeholder: true }   (id = the new profile/user id)
//
// Deploy:
//   supabase functions deploy recruiter-upsert
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

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40) || 'recruiter'
}
function rand() { return Math.random().toString(36).slice(2, 8) }

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

  const { full_name } = await req.json().catch(() => ({}))
  if (!full_name || !String(full_name).trim()) return json({ error: 'Missing full_name' }, 400)
  // Collapse internal whitespace so "Corey  Weinhaus" matches "Corey Weinhaus".
  const name = String(full_name).replace(/\s+/g, ' ').trim()

  // Already exists by name? Return it (idempotent-ish).
  const { data: existing } = await admin.from('profiles').select('id,email').ilike('full_name', name).limit(1).maybeSingle()
  if (existing?.id) return json({ id: existing.id, email: existing.email, placeholder: true, reused: true })

  // Placeholder email on an unroutable domain — no email is sent.
  const email = `${slug(name)}.${rand()}@placeholder.clinilytics.invalid`
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID(),
    user_metadata: { full_name: name, role: 'recruiter', placeholder: true },
  })
  if (error || !created?.user) return json({ error: error?.message ?? 'Could not create user' }, 400)

  // handle_new_user makes the profile; mark it a placeholder.
  await admin.from('profiles').update({ placeholder: true, full_name: name }).eq('id', created.user.id)
  return json({ id: created.user.id, email, placeholder: true })
})
