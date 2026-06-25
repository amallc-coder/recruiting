// Supabase Edge Function: sync-sharepoint
// -----------------------------------------------------------------------------
// "Pull from SharePoint" — reads a tabular worksheet from the team's Excel file
// via Microsoft Graph and upserts candidates into the database.
//
//   * No duplicates:  upserts on (source_system, source_key); running it twice
//                     updates the same rows instead of creating new ones.
//   * Newest wins:    a row is only overwritten when the incoming source is
//                     NEWER than what we last synced, so edits made in either
//                     place aren't clobbered by stale data.
//
// IMPORTANT — this needs setup before it works (see docs/sharepoint-sync.md):
//   1. An Entra (Azure AD) app registration with Microsoft Graph application
//      permission Files.Read.All (admin-consented).
//   2. The worksheet it reads must be TABULAR: one header row, then one row per
//      candidate. Point WORKSHEET_NAME at such a tab and map columns in CONFIG.
//
// Required secrets (supabase secrets set ...):
//   TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET,
//   SHARE_URL            (the SharePoint share link to the .xlsx)
//   WORKSHEET_NAME       (the tab to read, e.g. "LPNs")
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

// --- CONFIG: adjust to match the worksheet's header names --------------------
// Map your sheet's column headers (lower-cased) to candidate fields.
const COLUMN_MAP: Record<string, string> = {
  name: 'full_name',
  'full name': 'full_name',
  email: 'email',
  phone: 'phone',
  'phone number': 'phone',
  recruiter: 'recruiter_name',
  location: 'facility_name',
  facility: 'facility_name',
  'start date': 'start_date',
  status: 'status_text',
  role: 'role',
}
// Map free-text status -> our pipeline stage.
function mapStage(status: string): string {
  const s = (status || '').toLowerCase()
  if (/declin/.test(s)) return 'declined'
  if (/no show|no response|\bnr\b|rescind/.test(s)) return 'no_response'
  if (/active|start|hired/.test(s)) return 'active'
  if (/welcome/.test(s)) return 'welcome_call'
  if (/clear/.test(s)) return 'cleared'
  if (/background|bg/.test(s)) return 'background'
  if (/accept|offer sent|offer/.test(s)) return 'offer'
  if (/interview/.test(s)) return 'interview'
  return 'sourced'
}
// -----------------------------------------------------------------------------

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

  // Verify caller is an active admin.
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)
  const { data: prof } = await caller.from('profiles').select('role, active').eq('id', u.user.id).single()
  if (!prof || prof.role !== 'admin' || !prof.active) return json({ error: 'Admins only' }, 403)

  try {
    const token = await graphToken(env('TENANT_ID'), env('GRAPH_CLIENT_ID'), env('GRAPH_CLIENT_SECRET'))
    const auth = { Authorization: `Bearer ${token}` }

    // Resolve the shared file -> driveId + itemId + lastModified.
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

    // Header row -> field positions.
    const headers = values[0].map((h) => String(h ?? '').trim().toLowerCase())
    const colIndex: Record<string, number> = {}
    headers.forEach((h, i) => {
      const field = COLUMN_MAP[h]
      if (field) colIndex[field] = i
    })
    if (colIndex.full_name === undefined) {
      return json({ error: `Could not find a name column. Headers seen: ${headers.join(', ')}` }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const [{ data: facilities }, { data: recruiters }] = await Promise.all([
      admin.from('facilities').select('id, name, region'),
      admin.from('profiles').select('id, full_name'),
    ])
    const findFacility = (name: string) =>
      (facilities ?? []).find((f) => f.name.toLowerCase().includes((name || '').toLowerCase().trim()) || (name || '').toLowerCase().includes(f.name.toLowerCase()))
    const findRecruiter = (name: string) =>
      (recruiters ?? []).find((r) => r.full_name && (r.full_name.toLowerCase().includes((name || '').toLowerCase().trim())))

    let added = 0, updated = 0, skipped = 0
    const cell = (row: string[], field: string) =>
      colIndex[field] !== undefined ? String(row[colIndex[field]] ?? '').trim() : ''

    for (const row of values.slice(1)) {
      const fullName = cell(row, 'full_name')
      if (!fullName) continue
      const email = cell(row, 'email')
      const facilityName = cell(row, 'facility_name')
      const facility = facilityName ? findFacility(facilityName) : null
      const recruiter = findRecruiter(cell(row, 'recruiter_name'))
      const sourceKey = (email || `${fullName}|${facilityName}`).toLowerCase()

      // Newest-wins: skip if we already have this row synced at >= this version.
      const { data: existing } = await admin
        .from('candidates')
        .select('id, source_modified')
        .eq('source_system', 'sharepoint')
        .eq('source_key', sourceKey)
        .maybeSingle()
      if (existing && existing.source_modified && existing.source_modified >= sourceModified) {
        skipped++
        continue
      }

      const record: Record<string, unknown> = {
        full_name: fullName,
        email: email || null,
        phone: cell(row, 'phone') || null,
        role: (cell(row, 'role') || 'lpn').toLowerCase(),
        facility_id: facility?.id ?? null,
        recruiter_id: recruiter?.id ?? null,
        current_stage: mapStage(cell(row, 'status_text')),
        start_date: parseDate(cell(row, 'start_date')),
        source_system: 'sharepoint',
        source_key: sourceKey,
        source_modified: sourceModified,
      }

      if (existing) {
        await admin.from('candidates').update(record).eq('id', existing.id)
        updated++
      } else {
        await admin.from('candidates').insert(record)
        added++
      }
    }

    return json({ ok: true, added, updated, skipped, sourceModified, rows: values.length - 1 })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})

function parseDate(s: string): string | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
