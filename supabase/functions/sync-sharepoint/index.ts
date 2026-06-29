// Supabase Edge Function: sync-sharepoint  (verify_jwt = true)
// -----------------------------------------------------------------------------
// "Pull from SharePoint" for the v2 schema — reads a tabular Excel worksheet from
// the team's SharePoint via Microsoft Graph and writes candidates (including
// résumé text) into the v2 `candidates` table. Mirrors the in-app importer:
//
//   * ENRICH — a row whose email matches an existing candidate UPDATES that
//     record (resume_text / notes / phone). This backfills the talent pool
//     without creating duplicates; resume_text is what the AI match engine reads.
//   * CREATE — a row with no email match is upserted as a new candidate, keyed on
//     (source_system='sharepoint', source_key), with newest-wins via
//     source_modified so edits on either side aren't clobbered by stale data.
//
// IMPORTANT — needs setup before it works:
//   1. An Entra (Azure AD) app registration with Microsoft Graph application
//      permission Files.Read.All (admin-consented).
//   2. A TABULAR worksheet: one header row, then one row per candidate. Map your
//      column headers in COLUMN_MAP below (lower-cased), including a résumé /
//      summary / experience column so resume_text gets populated.
//
// Required secrets (supabase secrets set ...):
//   TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
//   SHARE_URL        (the SharePoint share link to the .xlsx)
//   WORKSHEET_NAME   (the tab to read, e.g. "Candidates")
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

// --- CONFIG: map your worksheet's header names (lower-cased) to candidate fields.
const COLUMN_MAP: Record<string, string> = {
  name: 'full_name',
  'full name': 'full_name',
  candidate: 'full_name',
  email: 'email',
  'email address': 'email',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  resume: 'resume_text',
  'résumé': 'resume_text',
  'resume text': 'resume_text',
  cv: 'resume_text',
  summary: 'resume_text',
  experience: 'resume_text',
  'work history': 'resume_text',
  notes: 'notes',
  comments: 'notes',
  source: 'source',
  tags: 'tags',
}

const RESUME_MAX = 20000

async function graphToken(tenant: string, clientId: string, secret: string): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`Graph token failed: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}

// Encode a sharing URL into the Graph "shares" id form.
function shareId(url: string): string {
  const b64 = btoa(url)
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const env = (k: string) => Deno.env.get(k) ?? ''
  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = env('SUPABASE_ANON_KEY')

  // Config gate — return a clear, actionable message if not yet set up.
  const missing = ['TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'SHARE_URL', 'WORKSHEET_NAME'].filter(
    (k) => !env(k),
  )
  if (missing.length) {
    return json(
      { error: `SharePoint sync isn't configured yet. Set these Edge Function secrets: ${missing.join(', ')}.` },
      400,
    )
  }

  // Verify the caller is an active admin (v2: the `users` table, not legacy `profiles`).
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: prof } = await admin
    .from('users')
    .select('role, active, org_id')
    .eq('id', u.user.id)
    .maybeSingle()
  if (!prof || prof.role !== 'admin' || !prof.active) return json({ error: 'Admins only' }, 403)
  const orgId = (prof as { org_id?: string }).org_id
  if (!orgId) return json({ error: 'No organization for the current user.' }, 400)

  try {
    const token = await graphToken(env('TENANT_ID'), env('GRAPH_CLIENT_ID'), env('GRAPH_CLIENT_SECRET'))
    const auth = { Authorization: `Bearer ${token}` }

    // Resolve the shared file → driveId + itemId + lastModified.
    const sid = shareId(env('SHARE_URL'))
    const itemRes = await fetch(
      `https://graph.microsoft.com/v1.0/shares/${sid}/driveItem?$select=id,parentReference,lastModifiedDateTime`,
      { headers: auth },
    )
    if (!itemRes.ok) throw new Error(`Resolve file failed: ${itemRes.status} ${await itemRes.text()}`)
    const item = await itemRes.json()
    const driveId = item.parentReference?.driveId
    const itemId = item.id
    const sourceModified = item.lastModifiedDateTime as string

    // Read the worksheet's used range.
    const ws = encodeURIComponent(env('WORKSHEET_NAME'))
    const rangeRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${ws}')/usedRange?$select=values`,
      { headers: auth },
    )
    if (!rangeRes.ok) throw new Error(`Read worksheet failed: ${rangeRes.status} ${await rangeRes.text()}`)
    const values: string[][] = (await rangeRes.json()).values ?? []
    if (values.length < 2) return json({ ok: true, added: 0, updated: 0, skipped: 0, note: 'No data rows.' })

    // Header row → field positions.
    const headers = values[0].map((h) => String(h ?? '').trim().toLowerCase())
    const colIndex: Record<string, number> = {}
    headers.forEach((h, i) => {
      const field = COLUMN_MAP[h]
      if (field && colIndex[field] === undefined) colIndex[field] = i
    })
    if (colIndex.full_name === undefined && colIndex.email === undefined) {
      return json({ error: `Need a name or email column. Headers seen: ${headers.join(', ')}` }, 400)
    }
    const cell = (row: string[], field: string) =>
      colIndex[field] !== undefined ? String(row[colIndex[field]] ?? '').trim() : ''

    // Build email → existing candidate id, paginating past PostgREST's 1000-row cap.
    const byEmail = new Map<string, string>()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from('candidates')
        .select('id,email')
        .eq('org_id', orgId)
        .order('id', { ascending: true })
        .range(from, from + 999)
      if (error || !data || data.length === 0) break
      for (const c of data as { id: string; email: string | null }[]) {
        if (c.email) byEmail.set(c.email.toLowerCase(), c.id)
      }
      if (data.length < 1000) break
    }

    let added = 0,
      updated = 0,
      skipped = 0

    for (const row of values.slice(1)) {
      const fullName = cell(row, 'full_name')
      const email = cell(row, 'email')
      if (!fullName && !email) {
        skipped++
        continue
      }
      const phone = cell(row, 'phone') || null
      const resume = cell(row, 'resume_text').slice(0, RESUME_MAX) || null
      const notes = cell(row, 'notes') || null
      const source = cell(row, 'source') || 'SharePoint'
      const tags = cell(row, 'tags')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const emailKey = email.toLowerCase()
      const existingId = emailKey ? byEmail.get(emailKey) : undefined

      // ENRICH existing candidate matched by email.
      if (existingId) {
        const patch: Record<string, unknown> = { source_modified: sourceModified }
        if (resume) patch.resume_text = resume
        if (notes) patch.notes = notes
        if (phone) patch.phone = phone
        if (Object.keys(patch).length === 1) {
          skipped++
          continue
        }
        await admin.from('candidates').update(patch).eq('id', existingId)
        updated++
        continue
      }

      // CREATE / update a sharepoint-keyed candidate (newest-wins).
      if (!fullName) {
        skipped++
        continue
      }
      const sourceKey = (emailKey || fullName).toLowerCase()
      const { data: existing } = await admin
        .from('candidates')
        .select('id, source_modified')
        .eq('org_id', orgId)
        .eq('source_system', 'sharepoint')
        .eq('source_key', sourceKey)
        .maybeSingle()
      if (existing && (existing as { source_modified?: string }).source_modified && (existing as { source_modified: string }).source_modified >= sourceModified) {
        skipped++
        continue
      }
      const record: Record<string, unknown> = {
        org_id: orgId,
        full_name: fullName,
        email: email || null,
        phone,
        source,
        tags,
        resume_text: resume,
        notes,
        source_system: 'sharepoint',
        source_key: sourceKey,
        source_modified: sourceModified,
      }
      if (existing) {
        await admin.from('candidates').update(record).eq('id', (existing as { id: string }).id)
        updated++
      } else {
        await admin.from('candidates').insert(record)
        added++
        if (emailKey) byEmail.set(emailKey, '') // guard against dup rows within one run
      }
    }

    return json({ ok: true, added, updated, skipped, rows: values.length - 1, sourceModified })
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e)
    console.error('sync-sharepoint failed:', msg)
    return json({ error: msg }, 500)
  }
})
