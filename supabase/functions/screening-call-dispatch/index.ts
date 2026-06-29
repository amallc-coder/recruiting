// Supabase Edge Function: screening-call-dispatch
// -----------------------------------------------------------------------------
// Places DUE scheduled screening callbacks. A pg_cron job pings this every few
// minutes (with the public anon key); we then find pending rows in
// scheduled_screening_calls whose time has arrived and place each call by
// invoking `vapi-call` with the service-role key (its internal-invocation path).
//
// Idempotent: it only acts on rows still 'pending' and marks them 'placed'
// immediately, so repeated pings never double-dial. Self-contained; safe to call
// repeatedly. Optional hardening: set DISPATCH_SECRET and pass it as
// x-dispatch-secret to restrict who can trigger it.
//
// Deploy: supabase functions deploy screening-call-dispatch --no-verify-jwt
// -----------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DISPATCH_SECRET = Deno.env.get('DISPATCH_SECRET')
const admin = createClient(URL_, SERVICE)
const MAX_ATTEMPTS = 3

Deno.serve(async (req: Request) => {
  if (req.method === 'GET') return json({ ok: true })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (DISPATCH_SECRET && req.headers.get('x-dispatch-secret') !== DISPATCH_SECRET) return json({ error: 'forbidden' }, 403)

  const nowIso = new Date().toISOString()
  const { data: due } = await admin
    .from('scheduled_screening_calls')
    .select('id,screening_id,attempts')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(25)

  let placed = 0
  let failed = 0
  for (const row of (due as { id: string; screening_id: string | null; attempts: number | null }[]) ?? []) {
    if (!row.screening_id) {
      await admin.from('scheduled_screening_calls').update({ status: 'cancelled', note: 'No screening attached.' }).eq('id', row.id)
      continue
    }
    const attempts = (row.attempts ?? 0) + 1
    try {
      const r = await fetch(`${URL_}/functions/v1/vapi-call`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ screening_id: row.screening_id, mode: 'call' }),
      })
      const b = await r.json().catch(() => ({}))
      if (r.ok && b?.ok) {
        await admin.from('scheduled_screening_calls').update({ status: 'placed', placed_at: new Date().toISOString(), call_id: b.call_id ?? null, attempts }).eq('id', row.id)
        placed++
      } else {
        await admin.from('scheduled_screening_calls').update({ status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', attempts, note: String(b?.error ?? `HTTP ${r.status}`).slice(0, 300) }).eq('id', row.id)
        failed++
      }
    } catch (e) {
      await admin.from('scheduled_screening_calls').update({ status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', attempts, note: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).eq('id', row.id)
      failed++
    }
  }
  return json({ ok: true, due: (due ?? []).length, placed, failed })
})
