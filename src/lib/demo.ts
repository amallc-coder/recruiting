// =============================================================================
// Demo mode — lets you explore the app with sample data, no Supabase required.
// Data lives in the browser (localStorage) and persists until you reset it.
// A minimal mock of the Supabase client backs the same calls the pages make,
// so the entire UI works offline. The demo user is an admin (sees everything).
// =============================================================================

type Row = Record<string, any>

const FLAG = 'demo_mode'
const SEEDED = 'demo_seeded_v1'
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

function seedIfNeeded() {
  if (localStorage.getItem(SEEDED) === '1') return

  save('profiles', [
    { id: DEMO_USER.id, full_name: 'You (Demo Admin)', email: DEMO_USER.email, role: 'admin', active: true, created_at: nowIso(), updated_at: nowIso() },
    { id: 'rec-alex', full_name: 'Alexandra Chisholm', email: 'alexandra@demo', role: 'recruiter', active: true, created_at: nowIso(), updated_at: nowIso() },
    { id: 'rec-hannah', full_name: 'Hannah McCartney Walsh', email: 'hannah@demo', role: 'recruiter', active: true, created_at: nowIso(), updated_at: nowIso() },
  ])

  save('recruiter_regions', [
    { recruiter_id: 'rec-alex', region: 'Kansas City MO' },
    { recruiter_id: 'rec-alex', region: 'Sedalia' },
    { recruiter_id: 'rec-hannah', region: 'St Louis' },
    { recruiter_id: 'rec-hannah', region: 'SE MO' },
  ])

  const F = (id: string, name: string, division: string, region: string, portfolio: string, census: number, city: string, state: string): Row => ({
    id, name, division, region, portfolio, census, city, state, active: true, created_at: nowIso(), updated_at: nowIso(),
  })
  save('facilities', [
    F('f1', 'Bridgewood Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 'Reliant Homes', 137, 'Kansas City', 'MO'),
    F('f2', 'Parkway Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 'Reliant Homes', 58, 'Kansas City', 'MO'),
    F('f3', 'Gregory Ridge Health Care Center', 'Missouri / Kansas', 'Kansas City MO', 'Reliant Homes', 104, 'Kansas City', 'MO'),
    F('f4', 'Four Seasons Living Center', 'Missouri / Kansas', 'Sedalia', 'Reliant Homes', 224, 'Sedalia', 'MO'),
    F('f5', 'Pettis County Assisted Living', 'Missouri / Kansas', 'Sedalia', 'Reliant Homes', 111, 'Sedalia', 'MO'),
    F('f6', 'Bernard Care Center (STL)', 'Missouri / Kansas', 'St Louis', 'Reliant Homes', 89, 'St Louis', 'MO'),
    F('f7', 'Crestwood Health Care Center (STL)', 'Missouri / Kansas', 'St Louis', 'Reliant Homes', 88, 'St Louis', 'MO'),
    F('f8', 'Cedargate Health Care Center', 'Missouri / Kansas', 'SE MO', 'Reliant Homes', 11, 'Cape Girardeau', 'MO'),
    F('f9', 'Cambridge', 'Ohio', 'West Columbus', 'Embassy', 72, 'Cambridge', 'OH'),
    F('f10', 'Logan', 'Ohio', 'Central Southern', 'Embassy', 95, 'Logan', 'OH'),
  ])

  const CN = (facility_id: string, role: string, have: number, need: number, priority: string, current?: string): Row => ({
    id: uuid(), facility_id, role, have_count: have, need_count: need, priority, current_provider: current ?? null, created_at: nowIso(), updated_at: nowIso(),
  })
  save('coverage_needs', [
    CN('f1', 'lpn', 0, 1, 'standard'),
    CN('f1', 'np', 1, 0, 'standard', 'Sara Koenemann'),
    CN('f2', 'lpn', 0, 1, 'standard'),
    CN('f3', 'lpn', 1, 0, 'standard'),
    CN('f3', 'np', 1, 0, 'standard', 'Dr. Sutherland'),
    CN('f4', 'lpn', 0, 2, 'premium'),
    CN('f5', 'lpn', 0, 1, 'standard'),
    CN('f6', 'lpn', 0, 1, 'standard'),
    CN('f6', 'np', 1, 0, 'standard', 'Candace Kirkpatrick'),
    CN('f8', 'lpn', 0, 1, 'standard'),
    CN('f9', 'np', 0, 1, 'premium'),
    CN('f10', 'np', 0, 1, 'premium'),
    CN('f10', 'lpn', 0, 1, 'standard'),
  ])

  const C = (full_name: string, role: string, facility_id: string, recruiter_id: string, stage: string, checklist: Row, extra: Row = {}): Row =>
    stampInsert('candidates', {
      full_name, role, facility_id, recruiter_id, current_stage: stage, checklist,
      email: full_name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
      source: 'Indeed', ...extra,
    })
  save('candidates', [
    C('Xaviera Roberts', 'lpn', 'f1', 'rec-alex', 'accepted', { offer: true, background: true }, { phone: '816-807-2867', start_date: '2026-05-20', background_sent_date: '2026-04-21', background_cleared_date: '2026-04-28' }),
    C('Rebeca Sousley', 'lpn', 'f2', 'rec-alex', 'background', { offer: true, background: true }, { start_date: '2026-06-08', background_sent_date: '2026-05-30' }),
    C('Carlene Merritt', 'lpn', 'f3', 'rec-alex', 'welcome_call', { offer: true, background: true, onboarding: true, groupchat: true }, { start_date: '2026-06-29' }),
    C('Chelsea Wiseman', 'lpn', 'f4', 'rec-alex', 'active', { offer: true, background: true, onboarding: true, groupchat: true, welcome_call: true, loop_team: true }, { start_date: '2026-06-08', welcome_call_done: true, rating: 5 }),
    C('Bianca Howard', 'lpn', 'f6', 'rec-hannah', 'offer', { offer: true }, { start_date: '2026-06-15' }),
    C('Erika Lavington-Foster', 'lpn', 'f7', 'rec-hannah', 'interview', {}, { phone: '314-406-3988' }),
    C('Sarah Brooks', 'np', 'f9', 'rec-hannah', 'sourced', { screen_summary: true }, {}),
    C('Tabatha Peters', 'np', 'f10', 'rec-hannah', 'declined', {}, { notes: 'Declined offer — comp.' }),
  ])

  localStorage.setItem(SEEDED, '1')
}
