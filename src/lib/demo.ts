// =============================================================================
// Demo mode — lets you explore the app with sample data, no Supabase required.
// Data lives in the browser (localStorage) and persists until you reset it.
// A minimal mock of the Supabase client backs the same calls the pages make,
// so the entire UI works offline. The demo user is an admin (sees everything).
// =============================================================================

import { POSITION_SEED } from './positionsSeed'
import { MASTER_FACILITIES, MASTER_REQS, type MasterReq } from './masterData'
import { DEFAULT_COMPANY_ID } from './types'

type Row = Record<string, any>

const FLAG = 'demo_mode'
const SEEDED = 'demo_seeded_v7'
const PREFIX = 'demo:'

export const DEMO_USER = { id: 'demo-admin', email: 'demo@reliant.local' }

export function isDemo(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

export function enableDemo() {
  localStorage.setItem(FLAG, '1')
  seedIfNeeded()
}

export function disableDemo() {
  localStorage.removeItem(FLAG)
}

export function resetDemo() {
  for (const t of TABLES) localStorage.removeItem(PREFIX + t)
  localStorage.removeItem(SEEDED)
  seedIfNeeded()
}

const TABLES = [
  'profiles',
  'recruiter_regions',
  'facilities',
  'coverage_needs',
  'candidates',
  'candidate_stage_history',
  'positions',
  'companies',
  'jobs',
  'applications',
  'analytics_events',
  'audit_logs',
  'integrations',
  'integration_credentials',
  'integration_logs',
  'integration_field_mappings',
  'webhook_events',
  'interviews',
  'offers',
  'recruiting_costs',
]

function load(table: string): Row[] {
  try {
    const raw = localStorage.getItem(PREFIX + table)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return []
}
function save(table: string, rows: Row[]) {
  localStorage.setItem(PREFIX + table, JSON.stringify(rows))
}

function nowIso() {
  // Date is fine in the browser at runtime (only disallowed in workflow scripts).
  return new Date().toISOString()
}
function uuid() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2)
}

function facilityRegion(facilityId: string | null): string | null {
  if (!facilityId) return null
  const f = load('facilities').find((x) => x.id === facilityId)
  return f?.region ?? null
}

function stampInsert(table: string, row: Row): Row {
  const r: Row = { ...row }
  if (!r.id) r.id = uuid()
  r.created_at = r.created_at ?? nowIso()
  r.updated_at = nowIso()
  if (table === 'candidates') {
    if (r.facility_id) r.region = facilityRegion(r.facility_id)
    r.checklist = r.checklist ?? {}
    r.welcome_call_done = !!r.welcome_call_done
  }
  if (table === 'facilities') r.active = r.active ?? true
  return r
}
function stampUpdate(table: string, row: Row): Row {
  const r: Row = { ...row, updated_at: nowIso() }
  if (table === 'candidates' && r.facility_id) r.region = facilityRegion(r.facility_id)
  return r
}

function project(row: Row, cols: string) {
  if (!cols || cols === '*') return row
  const keys = cols.split(',').map((s) => s.trim())
  const out: Row = {}
  for (const k of keys) out[k] = row[k]
  return out
}

function cmp(a: any, b: any): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

class DemoQuery {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  cols = '*'
  filters: [string, any][] = []
  orders: [string, boolean][] = []
  isSingle = false
  payload: any = null
  onConflict?: string

  constructor(table: string) {
    this.table = table
  }
  select(cols = '*') {
    if (this.op === 'select') this.cols = cols
    return this
  }
  insert(payload: any) {
    this.op = 'insert'
    this.payload = payload
    return this
  }
  update(payload: any) {
    this.op = 'update'
    this.payload = payload
    return this
  }
  upsert(payload: any, opts?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = payload
    this.onConflict = opts?.onConflict
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(col: string, val: any) {
    this.filters.push([col, val])
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push([col, opts?.ascending !== false])
    return this
  }
  single() {
    this.isSingle = true
    return this
  }
  // Thenable: awaiting the builder runs the query.
  then(resolve: (v: any) => void) {
    resolve(this.run())
  }

  private run() {
    let rows = load(this.table)
    const match = (r: Row) => this.filters.every(([c, v]) => r[c] === v)

    if (this.op === 'select') {
      let out = rows.filter(match)
      for (const [col, asc] of this.orders) {
        out = [...out].sort((a, b) => cmp(a[col], b[col]) * (asc ? 1 : -1))
      }
      out = out.map((r) => project(r, this.cols))
      if (this.isSingle) return { data: out[0] ?? null, error: out[0] ? null : { message: 'No rows' } }
      return { data: out, error: null }
    }
    if (this.op === 'insert') {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((it) =>
        stampInsert(this.table, it),
      )
      rows.push(...items)
      save(this.table, rows)
      return { data: items, error: null }
    }
    if (this.op === 'update') {
      rows = rows.map((r) => (match(r) ? stampUpdate(this.table, { ...r, ...this.payload }) : r))
      save(this.table, rows)
      return { data: null, error: null }
    }
    if (this.op === 'upsert') {
      const keys = (this.onConflict || 'id').split(',').map((s) => s.trim())
      const items = Array.isArray(this.payload) ? this.payload : [this.payload]
      for (const it of items) {
        const idx = rows.findIndex((r) => keys.every((k) => r[k] === it[k]))
        if (idx >= 0) rows[idx] = stampUpdate(this.table, { ...rows[idx], ...it })
        else rows.push(stampInsert(this.table, it))
      }
      save(this.table, rows)
      return { data: null, error: null }
    }
    // delete
    rows = rows.filter((r) => !match(r))
    save(this.table, rows)
    return { data: null, error: null }
  }
}

const demoAuth = {
  async getSession() {
    return { data: { session: isDemo() ? { user: DEMO_USER } : null }, error: null }
  },
  onAuthStateChange(_cb: unknown) {
    return { data: { subscription: { unsubscribe() {} } } }
  },
  async signInWithPassword() {
    enableDemo()
    return { data: { session: { user: DEMO_USER } }, error: null }
  },
  async signOut() {
    disableDemo()
    return { error: null }
  },
}

export const demoClient = {
  from: (table: string) => new DemoQuery(table),
  auth: demoAuth,
}

// ---- Seed data --------------------------------------------------------------
// The local workspace starts pre-loaded with the real facility list + a coverage
// baseline (matching supabase/seed.sql + seed_coverage.sql), and a clean slate
// for candidates — you add your real ones, then Export to Supabase when ready.

// Map a master requisition (position/category) to the app's role taxonomy.
function reqRole(category: string, position: string): string {
  const p = position.toLowerCase()
  switch (category) {
    case 'Clinical - MA': return 'ma'
    case 'Provider - Advanced Practice': return 'np'
    case 'Provider - Physician': return 'md'
    case 'Clinical - Nursing': return p.includes('rn') && !p.includes('lpn') ? 'rn' : 'lpn'
    case 'Clinical - Tech': return 'tech'
    case 'Admin - Front Office': return 'admin'
    case 'Operations - Leadership': return 'ops'
    default: return 'admin'
  }
}

// Master priority -> app priority.
function reqPriority(p: string): string {
  if (p === 'Critical') return 'urgent'
  if (p === 'High') return 'premium'
  return 'standard'
}

function seedIfNeeded() {
  if (localStorage.getItem(SEEDED) === '1') return

  save('profiles', [
    { id: DEMO_USER.id, full_name: 'You (Admin)', email: DEMO_USER.email, role: 'admin', active: true, created_at: nowIso(), updated_at: nowIso() },
    { id: 'rec-alex', full_name: 'Alexandra Chisholm', email: 'alexandra@local', role: 'recruiter', active: true, created_at: nowIso(), updated_at: nowIso() },
    { id: 'rec-hannah', full_name: 'Hannah McCartney Walsh', email: 'hannah@local', role: 'recruiter', active: true, created_at: nowIso(), updated_at: nowIso() },
  ])

  save('recruiter_regions', [
    { recruiter_id: 'rec-alex', region: 'Kansas City MO' },
    { recruiter_id: 'rec-alex', region: 'Sedalia' },
    { recruiter_id: 'rec-hannah', region: 'St Louis' },
    { recruiter_id: 'rec-hannah', region: 'SE MO' },
  ])

  // Facilities — the authoritative 95-facility master (SNF / clinic / lab /
  // hospital / operations). `division` groups by facility type; `region` falls
  // back to state for non-SNF sites so everything is filterable.
  const facById = new Map(MASTER_FACILITIES.map((f) => [f.id, f]))
  const facilities: Row[] = MASTER_FACILITIES.map((f) => ({
    id: f.id,
    name: f.name,
    division: f.type,
    region: f.region ?? f.state ?? null,
    portfolio: f.network,
    city: f.city,
    state: f.state,
    census: f.total_census ?? f.current_census,
    entity: f.entity,
    notes: [f.assigned_physician && `Physician: ${f.assigned_physician}`, f.assigned_np && `NP: ${f.assigned_np}`]
      .filter(Boolean).join(' · ') || null,
    active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  }))
  save('facilities', facilities)

  // Coverage needs — one per open requisition in the master workbook (the real
  // openings, with priority, recruiter, and pay range surfaced in the blurb).
  const fmtRate = (r: MasterReq) =>
    r.rate_min == null && r.rate_max == null ? '' :
    r.rate_unit === 'Annual' ? ` Pay: $${Math.round((r.rate_min ?? r.rate_max!) / 1000)}k–$${Math.round((r.rate_max ?? r.rate_min!) / 1000)}k/yr.` :
    ` Pay: $${r.rate_min ?? r.rate_max}–$${r.rate_max ?? r.rate_min}/hr.`
  const coverage: Row[] = MASTER_REQS.map((r) => {
    const role = reqRole(r.category, r.position)
    const fac = facById.get(r.facility_id)
    const desc =
      `${r.position} — ${r.type} opening (${r.category}) at ${r.facility_name}` +
      `${r.city ? `, ${r.city}` : ''}.${fmtRate(r)}` +
      `${r.recruiter ? ` Recruiter: ${r.recruiter}.` : ''}` +
      `${r.hiring_manager ? ` Hiring manager: ${r.hiring_manager}.` : ''}`
    return {
      id: uuid(),
      facility_id: r.facility_id,
      role,
      have_count: 0,
      need_count: Math.max(1, Math.ceil(r.openings_count)),
      priority: reqPriority(r.priority),
      description: desc,
      current_provider: role === 'np' ? (fac?.assigned_np ?? null) : null,
      source_req: r.req_id,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
  })
  save('coverage_needs', coverage)

  // Real LPN recruiting pipeline imported from the team's SharePoint workbook
  // (names/contacts as recorded by the recruiters). Stages reflect where each
  // candidate sits in onboarding. Resume text is a generated summary so AI
  // Matching has something to score against; replace with real resumes anytime.
  const facByName = (q: string): string | null =>
    facilities.find((f) => String(f.name).toLowerCase().includes(q.toLowerCase()))?.id as string ?? null

  // [name, email, recruiterId, facilityQuery, startDateISO|'', phone, stage]
  const REAL: [string, string, string, string, string, string, string][] = [
    ['Toshia Russell', 'toshiaj1980@gmail.com', 'rec-hannah', 'Cedargate', '2026-05-11', '617-870-4911', 'accepted'],
    ['Tamara Evans', 'tamtamevans16@gmail.com', 'rec-hannah', 'Brunswick', '2026-05-11', '660-542-4275', 'accepted'],
    ['Katherine Matthews', 'dawnmat69@yahoo.com', 'rec-hannah', 'Greenville', '2026-05-25', '573-714-1809', 'accepted'],
    ['Erika Lavington-Foster', 'emlfoster@sbcglobal.net', 'rec-hannah', 'Crestwood', '2026-05-18', '314-406-3988', 'accepted'],
    ['Teresa Glover', 'teresa12111129@gmail.com', 'rec-hannah', 'North Village Park', '2026-06-01', '660-308-0477', 'accepted'],
    ['Shelby Dale', 'dale.shelby15@gmail.com', 'rec-hannah', 'Eastview', '2026-05-25', '660-605-4407', 'declined'],
    ['Anne Hoover', 'abhoover3694@gmail.com', 'rec-alex', 'Edgewood', '2026-06-01', '816-304-4454', 'accepted'],
    ['Connie Watring', 'cwatring65@gmail.com', 'rec-alex', 'Legendary', '2026-05-26', '660-473-0650', 'accepted'],
    ['Rayna Allee-Manning', 'rcamanning@gmail.com', 'rec-alex', 'Odessa', '2026-05-28', '816-716-7868', 'no_response'],
    ['Lynka Dusabe', 'lynkadusabe@gmail.com', 'rec-alex', 'Gregory', '2026-05-26', '816-609-2376', 'accepted'],
    ['Donna Thompson', 'dlt.nursing@gmail.com', 'rec-alex', 'Nortonville', '2026-06-01', '913-370-3935', 'accepted'],
    ['Hope Amos', 'bartlett.hope97@gmail.com', 'rec-alex', 'Rest Haven', '2026-05-19', '660-310-2354', 'declined'],
    ['Marie Willard', 'marielouise1492@gmail.com', 'rec-alex', 'Pettis County', '2026-06-15', '573-418-9555', 'accepted'],
    ['Xaviera Roberts', 'xavieraroberts32@yahoo.com', 'rec-alex', 'Bridgewood', '2026-05-20', '816-807-2867', 'declined'],
    ['Christina McKinzie', 'Christina.baker.0916@gmail.com', 'rec-alex', 'Nicks', '', '660-646-7970', 'offer'],
    ['Ashleigh Heath', 'ashleighheath03@gmail.com', 'rec-alex', 'Holton', '', '785-501-8957', 'declined'],
    ['Michelle Ross', 'shellydawn734@gmail.com', 'rec-hannah', 'Sarcoxie', '2026-06-01', '417-592-3343', 'accepted'],
    ['Bradley Land', 'b.landexamone213467@gmail.com', 'rec-hannah', 'Stonecrest', '2026-06-08', '573-247-3564', 'accepted'],
    ['Hobie Booker', 'hobiebooker2020@gmail.com', 'rec-hannah', 'Heritage', '', '618-704-1800', 'offer'],
    ['Dana DuBois', 'danaleonard1030@gmail.com', 'rec-hannah', 'Wellsville', '2026-05-25', '309-242-3702', 'accepted'],
    ['Heather Warren', 'col07bae@gmail.com', 'rec-hannah', 'St Elizabeth', '2026-06-15', '573-797-8022', 'no_response'],
    ['Shamaya Johnson', 'shamia3700@gmail.com', 'rec-alex', 'Parkway', '', '913-221-3700', 'offer'],
    ['Misty Zumwait', 'mistyz1976@gmail.com', 'rec-alex', 'Westview', '2026-06-08', '573-587-2186', 'welcome_call'],
    ['Brooklyn Summer', 'mcnellybrooklyn@gmail.com', 'rec-alex', 'Four Seasons', '2026-06-08', '660-322-8208', 'welcome_call'],
    ['Amanda Hopkins', 'ahopkins4382@gmail.com', 'rec-alex', 'Pettis County', '2026-06-08', '573-418-4107', 'welcome_call'],
    ['Sharandell Wallace', 'sharandell@yahoo.com', 'rec-alex', 'Edgewood', '2026-06-08', '816-924-8183', 'welcome_call'],
    ['Charlotte Daugherty', 'Cdaugherty523@yahoo.com', 'rec-alex', 'Bridgewood', '2026-06-08', '816-848-9257', 'welcome_call'],
    ['Carrie Hardaway', 'charris63877@gmail.com', 'rec-hannah', 'Portageville', '2026-06-08', '573-922-3669', 'welcome_call'],
    ['Keara Miller', 'kearamiller0@gmail.com', 'rec-hannah', 'Carrie Ellingson', '2026-06-15', '618-250-3500', 'welcome_call'],
    ['Bianca Howard', 'howard_bianca@yahoo.com', 'rec-hannah', 'Bernard', '2026-06-15', '314-816-9700', 'welcome_call'],
    ['Shernicka Smith', 'venusdreams77@gmail.com', 'rec-hannah', 'Grand Manor', '2026-06-01', '314-527-2216', 'welcome_call'],
    ['Dominique Jones', 'jonesd0717@gmail.com', 'rec-hannah', 'Hidden Lake', '2026-06-15', '314-229-4430', 'welcome_call'],
    ['Elizabeth Thomas', 'smittencajun@icloud.com', 'rec-hannah', 'Heritage', '2026-06-15', '573-823-4600', 'welcome_call'],
    ['Chelsea Wiseman', 'chelsea.vinson@yahoo.com', 'rec-alex', 'Four Seasons', '2026-06-08', '660-619-7063', 'welcome_call'],
    ['Brittany Widebrook', 'brittanywidebrook@gmail.com', 'rec-hannah', 'Chariton Park', '2026-06-08', '573-603-4382', 'welcome_call'],
    ['Breanne Starwalt', 'ghmom1212@gmail.com', 'rec-alex', 'Milan', '2026-06-15', '217-820-1189', 'welcome_call'],
    ['Monde Black', 'monderuben@gmail.com', 'rec-alex', 'Gregory', '2026-06-08', '830-356-1379', 'welcome_call'],
    ['Carrie Campbell', 'nelcampfam7@gmail.com', 'rec-alex', 'Nicks', '2026-06-08', '816-590-4339', 'welcome_call'],
    ['Kennique Keys', 'keneq_jd@hotmail.com', 'rec-hannah', 'Hillside', '2026-06-15', '', 'welcome_call'],
    ['Ashlyn Tush', 'ashlyndyann16@gmail.com', 'rec-hannah', 'Brookfield', '2026-06-08', '785-517-1334', 'welcome_call'],
    ['Rebeca Sousley', 'bekilou9279@gmail.com', 'rec-alex', 'Parkway', '2026-06-08', '660-334-8130', 'welcome_call'],
    ['Lakiehsa Brown', 'keshabrown830@gmail.com', 'rec-alex', 'Bridgewood', '2026-06-29', '816-655-8828', 'welcome_call'],
    ['Tabitha Schroeder', 'tabbys23@yahoo.com', 'rec-hannah', 'Sarcoxie', '2026-06-29', '918-285-6346', 'welcome_call'],
    ['Maraget Swafford', 'maggieswafford68@gmail.com', 'rec-hannah', 'South County', '2026-06-29', '314-915-9947', 'welcome_call'],
    ['Janelle Phipps', 'janelle.l.phipps@gmail.com', 'rec-hannah', 'Nathan Richard', '2026-06-29', '620-704-7808', 'welcome_call'],
    ['Tiffany Hampton', 'tiffanyhampton98@yahoo.com', 'rec-hannah', 'Greenville', '2026-06-29', '573-778-6319', 'welcome_call'],
    ['Julia Snapp', 'jgrace1982@gmail.com', 'rec-alex', 'Legendary', '2026-06-29', '660-815-5419', 'welcome_call'],
    ['Carlene Merritt', 'merrittcarlene@ymail.com', 'rec-alex', 'Gregory', '2026-06-29', '816-612-7453', 'welcome_call'],
    ['Dawn Johnson', 'dwnhuddleston@yahoo.com', 'rec-alex', 'Fair View', '2026-06-29', '660-619-8133', 'welcome_call'],
    ['Krisitina Hewitt', 'kristinanurselife@gmail.com', 'rec-alex', 'Nortonville', '2026-06-29', '913-370-0922', 'welcome_call'],
    ['Alisha Milligan', 'milligan3158@gmail.com', 'rec-hannah', 'North Village Park', '2026-06-29', '660-651-0535', 'welcome_call'],
  ]

  // Missouri MA (medical assistant) onboarding list.
  // [name, email, facilityQuery, startISO|'', phone, stage]
  const MO_MA: [string, string, string, string, string, string][] = [
    ['Lelya Topalo', '', '', '2026-04-21', '', 'active'],
    ['Drenecia Quilling', '', '', '2026-04-07', '', 'active'],
    ['Chandra Flakes', '', '', '2026-04-07', '', 'active'],
    ['Ginger Beerbower', '', 'Fair View', '2026-04-21', '', 'active'],
    ['Sherry Whitalker Reed', '', '', '2026-04-13', '', 'active'],
    ['Sharanya Duvvuri', 'sharanya.duvvuri43@gmail.com', 'Bernard', '2026-06-01', '', 'background'],
    ['Brooke Poe', 'Brookelynnpoe@gmail.com', '', '2026-04-28', '816-509-2977', 'active'],
    ['Estephany Guerra', 'jassmin.e.melton@icloud.com', 'Brookfield', '2026-04-28', '858-413-4843', 'active'],
  ]

  const ROLE_NOUN: Record<string, string> = {
    lpn: 'Licensed Practical Nurse', ma: 'Medical Assistant', np: 'Nurse Practitioner',
    pa: 'Physician Assistant', md: 'Physician', psych_np: 'Psychiatric Nurse Practitioner',
    wound: 'Wound Care Provider',
  }
  const resumeFor = (name: string, role: string, fac: string): string => {
    const noun = ROLE_NOUN[role] ?? 'Clinician'
    const base =
      role === 'np' || role === 'pa' || role === 'psych_np' || role === 'md'
        ? `${name} — ${noun}. Active license; geriatric / long-term care experience. Rounding, chronic disease management, and collaboration with the attending physician.`
        : role === 'ma'
        ? `${name} — ${noun}. Rooming, vitals, EHR charting, and front-office support in a skilled-nursing / clinic setting.`
        : `${name} — ${noun}. Active license. Skilled in medication administration, wound care, vitals, and EHR charting (PointClickCare). Long-term care / skilled-nursing experience; available full-time, day shift.`
    return fac ? `${base} Targeting ${fac}.` : base
  }

  const mk = (
    full_name: string, role: string, email: string, recruiter_id: string | null,
    facQuery: string, start: string, phone: string, stage: string,
  ): Row =>
    stampInsert('candidates', {
      full_name, role, email: email || null,
      phone: phone || null,
      facility_id: facByName(facQuery),
      recruiter_id, current_stage: stage,
      source: 'Indeed', resume_text: resumeFor(full_name, role, facQuery), checklist: {},
      ...(start ? { start_date: start } : {}),
    })

  const candidates: Row[] = [
    ...REAL.map(([n, e, r, f, s, p, st]) => mk(n, 'lpn', e, r, f, s, p, st)),
    ...MO_MA.map(([n, e, f, s, p, st]) => mk(n, 'ma', e, null, f, s, p, st)),
  ]
  save('candidates', candidates)

  // Positions repository catalog.
  save('positions', POSITION_SEED.map((p) => stampInsert('positions', { ...p, active: true })))

  // ---- ATS layer: company + jobs derived from the real open requisitions ----
  save('companies', [
    { id: DEFAULT_COMPANY_ID, name: 'American Medical Administrators', slug: 'ama', created_at: nowIso(), updated_at: nowIso() },
  ])

  const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  const recIds = ['rec-alex', 'rec-hannah']
  const empType = (t: string) => {
    const x = (t || '').toLowerCase()
    if (x.includes('part')) return 'part_time'
    if (x.includes('prn') || x.includes('per diem') || x.includes('perdiem')) return 'per_diem'
    if (x.includes('contract') || x.includes('1099')) return 'contract'
    return 'full_time'
  }
  // Post the first ~16 open requisitions as jobs (most published, a few draft).
  const jobs: Row[] = MASTER_REQS.slice(0, 16).map((r, i) => {
    const fac = facById.get(r.facility_id)
    const role = reqRole(r.category, r.position)
    return stampInsert('jobs', {
      company_id: DEFAULT_COMPANY_ID,
      title: r.position,
      department: r.category,
      // r.city from the master sheet already carries the state; fall back to the
      // facility state only when there's no city, to avoid doubling it.
      location: r.city || fac?.state || null,
      employment_type: empType(r.type),
      workplace: 'onsite',
      role,
      facility_id: r.facility_id,
      assigned_recruiter_id: recIds[i % recIds.length],
      hiring_manager_id: null,
      salary_min: r.rate_min ?? null,
      salary_max: r.rate_max ?? null,
      salary_unit: r.rate_unit === 'Annual' ? 'year' : 'hour',
      description: `Join ${r.facility_name}${r.city ? ` in ${r.city}` : ''} as a ${r.position}. ` +
        `We're a mission-driven team supporting skilled-nursing and clinic care across the region.`,
      responsibilities: null,
      requirements: null,
      benefits: null,
      status: i % 6 === 0 ? 'draft' : 'published',
      visibility: 'public',
      slug: slug(r.position) + '-' + r.facility_id.slice(0, 4),
      created_by: DEMO_USER.id,
      updated_by: null,
    })
  })
  save('jobs', jobs)

  // A few sample applications on the first published jobs, so the applicant
  // view and pipeline have something to show out of the box.
  const published = jobs.filter((j) => j.status === 'published')
  const SAMPLE_APPS: [string, string, string][] = [
    ['Jasmine Carter', 'jasmine.carter@example.com', '816-555-0142'],
    ['Devon Brooks', 'devon.brooks@example.com', '573-555-0198'],
    ['Priya Nair', 'priya.nair@example.com', '314-555-0177'],
  ]
  const applications: Row[] = published.slice(0, 2).flatMap((j, ji) =>
    SAMPLE_APPS.slice(0, ji === 0 ? 3 : 1).map(([name, email, phone]) =>
      stampInsert('applications', {
        company_id: DEFAULT_COMPANY_ID,
        job_id: j.id,
        candidate_id: null,
        full_name: name,
        email,
        phone,
        source: 'Career Site',
        resume_text: `${name} — applicant for ${j.title}.`,
        stage: 'sourced',
        assigned_recruiter_id: j.assigned_recruiter_id,
        custom_answers: {},
      }),
    ),
  )
  save('applications', applications)
  save('analytics_events', applications.map((a) => stampInsert('analytics_events', {
    company_id: DEFAULT_COMPANY_ID,
    event_type: 'application_submitted',
    application_id: a.id,
    job_id: a.job_id,
    to_stage: 'sourced',
    payload: { source: 'Career Site' },
  })))

  // ---- Interviews + offers (sample, spread over the last weeks) ----
  const dayMs = 86400000
  const interviewers = ['rec-alex', 'rec-hannah', DEMO_USER.id]
  const istatuses = ['completed', 'completed', 'scheduled', 'completed', 'no_show', 'completed', 'cancelled', 'rescheduled', 'scheduled', 'completed']
  const interviews: Row[] = candidates.slice(0, 16).map((c, i) => {
    const status = istatuses[i % istatuses.length]
    const done = status === 'completed'
    return stampInsert('interviews', {
      company_id: DEFAULT_COMPANY_ID,
      candidate_id: c.id,
      job_id: null,
      interviewer_id: interviewers[i % interviewers.length],
      scheduled_at: new Date(Date.now() - (i * 4 + 2) * dayMs).toISOString(),
      duration_min: [30, 45, 60][i % 3],
      location: i % 2 ? 'Video call' : 'On-site',
      status,
      feedback: done ? 'Strong communication; relevant clinical experience.' : null,
      score: done ? 3 + (i % 3) : null,
      created_by: DEMO_USER.id,
    })
  })
  save('interviews', interviews)

  const salaryFor = (role: string) =>
    role === 'np' ? 130000 : role === 'md' ? 240000 : role === 'pa' ? 115000 :
    role === 'rn' ? 78000 : role === 'lpn' ? 64000 : role === 'ma' ? 44000 : 60000
  const offerCands = candidates.filter((c) => ['offer', 'accepted', 'welcome_call'].includes(c.current_stage)).slice(0, 14)
  const ostatus = ['accepted', 'sent', 'negotiating', 'declined', 'accepted', 'sent', 'expired', 'accepted', 'accepted', 'sent', 'accepted', 'negotiating']
  const offers: Row[] = offerCands.map((c, i) => stampInsert('offers', {
    company_id: DEFAULT_COMPANY_ID,
    candidate_id: c.id,
    job_id: null,
    salary: salaryFor(c.role) + (i % 5) * 1500,
    bonus: i % 3 === 0 ? 2000 : null,
    start_date: c.start_date ?? null,
    status: ostatus[i % ostatus.length],
    sent_at: new Date(Date.now() - (i * 3 + 5) * dayMs).toISOString(),
    approved_by: DEMO_USER.id,
    approved_at: new Date(Date.now() - (i * 3 + 6) * dayMs).toISOString(),
    created_by: DEMO_USER.id,
  }))
  save('offers', offers)

  // ---- Recruiting costs (last 3 months, for the Finance dashboard) ----
  const monthStart = (back: number) => {
    const d = new Date()
    d.setMonth(d.getMonth() - back, 1)
    return d.toISOString().slice(0, 10)
  }
  const costRows: [string, string, number][] = [
    ['job_board', 'Indeed', 4200], ['job_board', 'LinkedIn', 3800],
    ['agency', 'Regional staffing', 9500], ['referral', 'Employee referrals', 3000],
    ['software', 'Clinilytics ATS', 1200], ['recruiter', 'Recruiter salaries (allocated)', 18000],
  ]
  const costs: Row[] = [0, 1, 2].flatMap((back) =>
    costRows.map(([category, vendor, amount]) => stampInsert('recruiting_costs', {
      company_id: DEFAULT_COMPANY_ID,
      category,
      vendor,
      amount: amount + back * 250,
      period: monthStart(back),
      created_by: DEMO_USER.id,
    })),
  )
  save('recruiting_costs', costs)

  localStorage.setItem(SEEDED, '1')
}

// ---- Export to Supabase -----------------------------------------------------
// Turns the current local data into a SQL script to run in the Supabase SQL
// Editor (after schema.sql). Includes facilities, coverage needs, and candidates
// with their relationships intact. Recruiter assignments are left blank because
// real recruiters are your Supabase users — reassign them on the Team screen.

function sql(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
  return `'${String(value).replace(/'/g, "''")}'`
}

function insertBlock(table: string, cols: string[], rows: Row[]): string {
  if (rows.length === 0) return `-- (no ${table} to import)\n`
  const values = rows
    .map((r) => '  (' + cols.map((c) => sql(r[c])).join(', ') + ')')
    .join(',\n')
  return (
    `insert into public.${table} (${cols.join(', ')}) values\n${values}\n` +
    `on conflict (id) do nothing;\n`
  )
}

export function buildSupabaseSql(): string {
  const facilities = load('facilities')
  const coverage = load('coverage_needs')
  const candidates = load('candidates')

  const header =
    `-- Clinilytics ATS — data export from local workspace\n` +
    `-- Run this in Supabase -> SQL Editor AFTER running schema.sql.\n` +
    `-- Do NOT also run seed.sql / seed_coverage.sql — this file already\n` +
    `-- contains your facilities and coverage. Candidates import with no\n` +
    `-- recruiter assigned; set recruiters on the Team/Candidates screen.\n\n` +
    `begin;\n\n`

  const fac = insertBlock(
    'facilities',
    ['id', 'name', 'division', 'region', 'portfolio', 'city', 'state', 'zip', 'address', 'phone', 'fax', 'census', 'capacity', 'active', 'notes'],
    facilities,
  )
  const cov = insertBlock(
    'coverage_needs',
    ['id', 'facility_id', 'role', 'have_count', 'need_count', 'priority', 'current_provider', 'description', 'notes'],
    coverage,
  )
  const cand = insertBlock(
    'candidates',
    ['id', 'full_name', 'role', 'email', 'phone', 'source', 'facility_id', 'region', 'current_stage', 'background_sent_date', 'background_cleared_date', 'welcome_call_done', 'start_date', 'resume_text', 'checklist', 'rating', 'notes'],
    candidates,
  )

  return header + fac + '\n' + cov + '\n' + cand + '\ncommit;\n'
}

export function downloadSupabaseSql() {
  const text = buildSupabaseSql()
  const blob = new Blob([text], { type: 'text/sql;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'recruiting-data-for-supabase.sql'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
