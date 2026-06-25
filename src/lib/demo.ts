// =============================================================================
// Demo mode — lets you explore the app with sample data, no Supabase required.
// Data lives in the browser (localStorage) and persists until you reset it.
// A minimal mock of the Supabase client backs the same calls the pages make,
// so the entire UI works offline. The demo user is an admin (sees everything).
// =============================================================================

type Row = Record<string, any>

const FLAG = 'demo_mode'
const SEEDED = 'demo_seeded_v2'
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

// [name, division, region, census] — census null where unknown.
const FACILITY_SEED: [string, string, string, number | null][] = [
  // Missouri / Kansas
  ['Bridgewood Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 137],
  ['Edgewood Manor Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 47],
  ['Gregory Ridge Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 104],
  ['Nicks Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 66],
  ['Odessa Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 9],
  ['Parkway Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 58],
  ['Eastview Manor Care Center', 'Missouri / Kansas', 'North Central', 80],
  ['Milan Health Care Center', 'Missouri / Kansas', 'North Central', 23],
  ['Brookfield Health Care Center', 'Missouri / Kansas', 'North Central', 4],
  ['Brunswick Health Care Center', 'Missouri / Kansas', 'North Central', 7],
  ['Wellsville Health Care Center', 'Missouri / Kansas', 'North Central', 67],
  ['Westview Nursing Home', 'Missouri / Kansas', 'North Central', 52],
  ['Easton Health Care Center (Kansas)', 'Missouri / Kansas', 'KC Kansas', 2],
  ['Holton Health Care Center (Kansas)', 'Missouri / Kansas', 'KC Kansas', 0],
  ['Nortonville (Kansas)', 'Missouri / Kansas', 'KC Kansas', 0],
  ['St Elizabeth Health Care Center', 'Missouri / Kansas', 'Middle South MO', 59],
  ['Chariton Park Health Care Center', 'Missouri / Kansas', 'Moberly', 114],
  ['North Village Park', 'Missouri / Kansas', 'Moberly', 172],
  ['Levering (RCF) Salt River (Shelbina)', 'Missouri / Kansas', 'North Central', 17],
  ['Cedargate Health Care Center', 'Missouri / Kansas', 'SE MO', 11],
  ['Greenville Health Care Center', 'Missouri / Kansas', 'SE MO', 14],
  ['Portageville Healthcare Center', 'Missouri / Kansas', 'SE MO', 57],
  ['Stonecrest Healthcare', 'Missouri / Kansas', 'SE MO', 56],
  ['Fair View Health Care Center', 'Missouri / Kansas', 'Sedalia', 63],
  ['Four Seasons Living Center', 'Missouri / Kansas', 'Sedalia', 224],
  ['Legendary Health Care Center', 'Missouri / Kansas', 'Sedalia', 18],
  ['Pettis County Assisted Living', 'Missouri / Kansas', 'Sedalia', 111],
  ['Rest Haven Health Care Center', 'Missouri / Kansas', 'Sedalia', 61],
  ['Bernard Care Center (STL)', 'Missouri / Kansas', 'St Louis', 89],
  ['Carrie Ellingson Geitner Health Care (STL)', 'Missouri / Kansas', 'St Louis', 31],
  ['Crestwood Health Care Center (STL)', 'Missouri / Kansas', 'St Louis', 88],
  ['Grand Manor Health Care Center (STL)', 'Missouri / Kansas', 'St Louis', 52],
  ['Heritage Care Center of Berkeley (STL)', 'Missouri / Kansas', 'St Louis', 67],
  ['Hidden Lake Health Care Center (STL)', 'Missouri / Kansas', 'St Louis', 6],
  ['Hillside Health Care Center (STL)', 'Missouri / Kansas', 'St Louis', 0],
  ['South County Health Care Center (STL)', 'Missouri / Kansas', 'St Louis', 25],
  ['Cassville Health Care Center', 'Missouri / Kansas', 'West Rural MO', 0],
  ['Nathan Richard Health Care Center', 'Missouri / Kansas', 'West Rural MO', 59],
  ['Sarcoxie Health Care Center', 'Missouri / Kansas', 'West Rural MO', 35],
  // Ohio
  ['Parkside', 'Ohio', 'Southern', 72],
  ['Carlisle Manor', 'Ohio', 'Southern', 44],
  ['Lebanon', 'Ohio', 'Southern', 59],
  ['Springfield', 'Ohio', 'Southern', 50],
  ['Woodview', 'Ohio', 'Columbus', 63],
  ['Winchester', 'Ohio', 'Columbus', 88],
  ['Pickerington', 'Ohio', 'Columbus', 68],
  ['Forest Hills', 'Ohio', 'Columbus', 66],
  ['Cambridge', 'Ohio', 'West Columbus', 72],
  ['Grande Oaks', 'Ohio', 'East Cleveland', 36],
  ['Grande Pavilion', 'Ohio', 'East Cleveland', 35],
  ['Madison Healthcare', 'Ohio', 'East Cleveland', 101],
  ['Valley View', 'Ohio', 'Central Southern', 44],
  ['Logan', 'Ohio', 'Central Southern', 95],
  ['Longmeadow', 'Ohio', 'NE Ohio', 54],
  ['Autumnwood', 'Ohio', 'NE Ohio', 56],
  ['Shady Lawn', 'Ohio', 'NE Ohio', 73],
  ['Shady Lawn ALF', 'Ohio', 'NE Ohio', 52],
  ['Oak Hills', 'Ohio', 'West Cleveland', 62],
  ['Rockport', 'Ohio', 'Northern Cleveland', 98],
  ['Richmond Hts SNF and AL', 'Ohio', 'Northern Cleveland', 70],
  ['Royal Oak', 'Ohio', 'Northern Cleveland', 63],
  ['Seasons (behaviors)', 'Ohio', 'Cleveland', 46],
  ['Stow (AL)', 'Ohio', 'Cleveland', 64],
  ['Willard ALF', 'Ohio', 'Central', 2],
  ['Willard SNF', 'Ohio', 'Central', 55],
  ['Crystal Care', 'Ohio', 'Central', 62],
  ['Willard Detox Center', 'Ohio', 'Central', null],
  ['Swanton', 'Ohio', 'Toledo', 59],
  ['Fostoria', 'Ohio', 'Toledo', 40],
  ['Fostoria AL', 'Ohio', 'Toledo', null],
]

// Facilities with an explicitly flagged NP gap (premium) in the source sheets.
const NP_GAP_FACILITIES = new Set([
  'Cambridge', 'Valley View', 'Logan', 'Willard SNF', 'Willard ALF',
  'Willard Detox Center', 'Crystal Care', 'Fostoria', 'Fostoria AL',
])

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

  const LPN_DESC =
    'Full-time LPN for a skilled nursing facility (SNF/LTC). Active Missouri LPN license required. ' +
    'Responsibilities: medication administration, wound care, vitals, and EHR charting (PointClickCare). ' +
    '5 days/week, day shift. Long-term care experience preferred.'
  const NP_DESC =
    'Nurse Practitioner to provide primary care coverage at skilled nursing facilities. Active NP license; ' +
    'geriatric / long-term care experience preferred. Rounding, chronic disease management, and ' +
    'collaboration with the attending physician.'

  const facilities: Row[] = []
  const coverage: Row[] = []
  FACILITY_SEED.forEach(([name, division, region, census], i) => {
    const id = `f${i + 1}`
    facilities.push({ id, name, division, region, portfolio: division === 'Missouri / Kansas' ? 'Reliant Homes' : null, census, active: true, created_at: nowIso(), updated_at: nowIso() })
    // LPN need = 1 baseline at every facility (verify & adjust in-app).
    coverage.push({ id: uuid(), facility_id: id, role: 'lpn', have_count: 0, need_count: 1, priority: 'standard', description: LPN_DESC, current_provider: null, created_at: nowIso(), updated_at: nowIso() })
    if (NP_GAP_FACILITIES.has(name)) {
      coverage.push({ id: uuid(), facility_id: id, role: 'np', have_count: 0, need_count: 1, priority: 'premium', description: NP_DESC, current_provider: null, created_at: nowIso(), updated_at: nowIso() })
    }
  })
  save('facilities', facilities)
  save('coverage_needs', coverage)

  // A few example candidates (with résumé text) so AI Matching and the board
  // are populated. Delete them or hit "Reset" once you add your real ones.
  const C = (full_name: string, facility_id: string, recruiter_id: string, stage: string, resume: string, role = 'lpn', extra: Row = {}): Row =>
    stampInsert('candidates', {
      full_name, role, facility_id, recruiter_id, current_stage: stage,
      email: full_name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
      source: 'Indeed', resume_text: resume, checklist: {}, ...extra,
    })
  save('candidates', [
    C('Xaviera Roberts', 'f1', 'rec-alex', 'accepted',
      'Licensed Practical Nurse with 6 years in skilled nursing / long-term care. Active Missouri LPN license. Skilled in medication administration, wound care, vitals, and EHR charting in PointClickCare. Available for 5 day/week day shift in the Kansas City area.',
      'lpn', { rating: 5, start_date: '2026-07-06' }),
    C('Erika Lavington-Foster', 'f31', 'rec-hannah', 'offer',
      'Experienced LPN, 8 years in LTC and rehab. Charge nurse experience supervising CNAs. Strong wound care and medication administration; thorough EHR charting. St. Louis based.',
      'lpn', { rating: 4 }),
    C('Toshia Russell', 'f20', 'rec-hannah', 'interview',
      'LPN with 3 years SNF experience. IV certified, wound care, BLS. Active Missouri license. Seeking full-time day shift.',
      'lpn', {}),
    C('Tamara Evans', 'f10', 'rec-hannah', 'background',
      'LPN new graduate. Recent clinical rotations in long-term care. BLS certified, eager to build medication-administration experience.',
      'lpn', {}),
    C('Hope Amos', 'f28', 'rec-alex', 'sourced',
      'LPN, 2 years assisted living. Medication pass, vitals, resident care. Looking to move into skilled nursing.',
      'lpn', {}),
    C('Sara Koenemann', 'f48', 'rec-hannah', 'interview',
      'Nurse Practitioner with 5 years of geriatric primary care in skilled nursing facilities. Manages chronic conditions, rounds on residents, and collaborates with attending physicians. Active NP license.',
      'np', {}),
  ])

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
    `-- Recruiting Tracker — data export from local workspace\n` +
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
