// Conversational command console — client side. Asks ai-console to translate a
// plain-language question into a read-only query plan, then executes that plan
// against the v2 schema UNDER THE CALLER'S RLS (every read goes through the
// session client, so region/role isolation is enforced by Postgres, not here).
// Strictly read-only: there is no write path. Every question is audit-logged.
import { v2, fetchAll } from '../client'
import { demoMode } from '../../supabase'
import { logAudit } from './audit'

const MS_PER_DAY = 86_400_000

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'in' | 'within_days'
export interface PlanFilter {
  field: string
  op: FilterOp
  value: string
}
export interface QueryPlan {
  entity: string
  intent: 'list' | 'count'
  filters: PlanFilter[]
  sort_field: string
  sort_dir: 'asc' | 'desc' | 'none'
  limit: number
  summary: string
  answer: string
}

export interface ConsoleColumn {
  key: string
  label: string
}
export interface ConsoleResult {
  ok: boolean
  error?: string
  plan?: QueryPlan
  columns: ConsoleColumn[]
  rows: Record<string, unknown>[]
  total: number
  intent: 'list' | 'count'
  answer: string
  summary: string
  link?: (row: Record<string, unknown>) => string | null
}

// ---------------------------------------------------------------------------
// Entity registry — the allowlist. The planner may only touch these entities and
// fields; anything else is ignored (read-only + bounded by construction).
// ---------------------------------------------------------------------------
interface EntityDef {
  table: string
  select: string
  /** Resolve a filterable/sortable field's comparable value from a row. */
  value: (row: Record<string, unknown>, field: string) => unknown
  /** Date fields (for within_days + date-aware comparisons). */
  dateFields: string[]
  columns: ConsoleColumn[]
  link: (row: Record<string, unknown>) => string | null
}

function rec(row: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = row[key]
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

const ENTITIES: Record<string, EntityDef> = {
  requisitions: {
    table: 'requisitions',
    select: 'id,title,role_family,status,specialty,headcount,opened_at,created_at,facility:facilities(name,state)',
    dateFields: ['opened_at', 'created_at'],
    value: (r, f) => {
      if (f === 'facility_state') return rec(r, 'facility')?.state
      if (f === 'facility_name') return rec(r, 'facility')?.name
      return r[f]
    },
    columns: [
      { key: 'title', label: 'Requisition' },
      { key: 'role_family', label: 'Role' },
      { key: 'status', label: 'Status' },
      { key: 'facility_name', label: 'Facility' },
      { key: 'facility_state', label: 'State' },
    ],
    link: (r) => `/requisitions/${r.id}`,
  },
  candidates: {
    table: 'candidates',
    select: 'id,full_name,status,source,tags,last_screened_at',
    dateFields: ['last_screened_at'],
    value: (r, f) => r[f],
    columns: [
      { key: 'full_name', label: 'Candidate' },
      { key: 'status', label: 'Status' },
      { key: 'source', label: 'Source' },
      { key: 'last_screened_at', label: 'Last screened' },
    ],
    link: (r) => `/candidates/${r.id}`,
  },
  applications: {
    table: 'applications',
    select:
      'id,status,applied_at,requisition_id,requisition:requisitions(title,role_family,facility:facilities(state)),stage:pipeline_stages(stage_type)',
    dateFields: ['applied_at'],
    value: (r, f) => {
      if (f === 'role_family') return rec(r, 'requisition')?.role_family
      if (f === 'facility_state') return rec(rec(r, 'requisition') ?? {}, 'facility')?.state
      if (f === 'stage_type') return rec(r, 'stage')?.stage_type
      return r[f]
    },
    columns: [
      { key: 'requisition_title', label: 'Requisition' },
      { key: 'role_family', label: 'Role' },
      { key: 'status', label: 'Status' },
      { key: 'stage_type', label: 'Stage' },
      { key: 'applied_at', label: 'Applied' },
    ],
    link: (r) => (r.requisition_id ? `/requisitions/${r.requisition_id}` : null),
  },
  offers: {
    table: 'offers',
    select: 'id,status,salary,start_date,created_at,sent_at,candidate:candidates(full_name)',
    dateFields: ['start_date', 'created_at', 'sent_at'],
    value: (r, f) => {
      if (f === 'candidate_name') return rec(r, 'candidate')?.full_name
      return r[f]
    },
    columns: [
      { key: 'candidate_name', label: 'Candidate' },
      { key: 'status', label: 'Status' },
      { key: 'salary', label: 'Salary' },
      { key: 'start_date', label: 'Start' },
    ],
    link: () => '/offers',
  },
  screenings: {
    table: 'screenings',
    select: 'id,status,channel,ai_score,created_at,candidate:candidates(full_name)',
    dateFields: ['created_at'],
    value: (r, f) => {
      if (f === 'candidate_name') return rec(r, 'candidate')?.full_name
      return r[f]
    },
    columns: [
      { key: 'candidate_name', label: 'Candidate' },
      { key: 'status', label: 'Status' },
      { key: 'channel', label: 'Channel' },
      { key: 'ai_score', label: 'AI score' },
    ],
    link: () => '/screening',
  },
  interviews: {
    table: 'interviews',
    select: 'id,status,type,scheduled_at',
    dateFields: ['scheduled_at'],
    value: (r, f) => r[f],
    columns: [
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'scheduled_at', label: 'Scheduled' },
    ],
    link: () => '/scheduling',
  },
  facilities: {
    table: 'facilities',
    select: 'id,name,state,city',
    dateFields: [],
    value: (r, f) => r[f],
    columns: [
      { key: 'name', label: 'Facility' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
    ],
    link: () => '/facilities',
  },
}

export const CONSOLE_ENTITIES = Object.keys(ENTITIES)

// ---------------------------------------------------------------------------
function asNumber(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Date.parse(String(v))
  if (!Number.isNaN(n) && (typeof v === 'number' || /\d{4}-\d{2}/.test(String(v)))) return n
  const f = parseFloat(String(v))
  return Number.isNaN(f) ? null : f
}

function matches(def: EntityDef, row: Record<string, unknown>, f: PlanFilter): boolean {
  const raw = def.value(row, f.field)
  const op = f.op
  if (op === 'within_days') {
    const days = parseFloat(f.value)
    if (!def.dateFields.includes(f.field) || Number.isNaN(days)) return true // ignore unknown
    const t = raw ? Date.parse(String(raw)) : NaN
    if (Number.isNaN(t)) return false
    return Math.abs(t - Date.now()) <= days * MS_PER_DAY
  }
  if (op === 'in') {
    const set = f.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    return set.includes(String(raw ?? '').toLowerCase())
  }
  if (op === 'ilike') {
    return String(raw ?? '').toLowerCase().includes(f.value.trim().toLowerCase())
  }
  if (op === 'eq') return String(raw ?? '').toLowerCase() === f.value.trim().toLowerCase()
  if (op === 'neq') return String(raw ?? '').toLowerCase() !== f.value.trim().toLowerCase()
  // numeric / date comparisons
  const a = asNumber(raw)
  const b = asNumber(f.value)
  if (a == null || b == null) return false
  if (op === 'gt') return a > b
  if (op === 'gte') return a >= b
  if (op === 'lt') return a < b
  if (op === 'lte') return a <= b
  return true
}

/** Flatten derived/joined values onto the row so the table can read them by column key. */
function project(def: EntityDef, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }
  for (const c of def.columns) out[c.key] = def.value(row, c.key) ?? row[c.key] ?? null
  // applications: requisition title lives on the embed
  if (def.table === 'applications') out.requisition_title = rec(row, 'requisition')?.title ?? null
  return out
}

async function getPlan(question: string): Promise<QueryPlan | null> {
  if (demoMode) return null
  try {
    const { data, error } = await v2.functions.invoke('ai-console', { body: { question } })
    if (error || !data?.ok || !data.plan) return null
    return data.plan as QueryPlan
  } catch {
    return null
  }
}

/**
 * Answer a natural-language question by planning + executing a read-only query.
 * Returns rows already projected for display, the count, and how it was interpreted.
 */
export async function askConsole(question: string): Promise<ConsoleResult> {
  const empty = (msg: string): ConsoleResult => ({
    ok: false,
    error: msg,
    columns: [],
    rows: [],
    total: 0,
    intent: 'list',
    answer: '',
    summary: '',
  })

  const plan = await getPlan(question)
  if (!plan) return empty(demoMode ? 'The command console needs the live backend (unavailable in local mode).' : 'I could not interpret that question. Try rephrasing it.')

  const def = ENTITIES[plan.entity]
  if (!def) return empty(`I don't have a "${plan.entity}" view to query.`)

  // Pull rows under RLS (paginated past the 1000-row cap), applying any
  // server-safe direct-column equality up front, then evaluate every filter
  // client-side (handles joined fields + within_days uniformly).
  const rows = await fetchAll<Record<string, unknown>>(def.table, def.select)
  let filtered = rows.filter((r) => (plan.filters ?? []).every((f) => matches(def, r, f)))

  // sort
  if (plan.sort_dir !== 'none' && plan.sort_field) {
    const dir = plan.sort_dir === 'asc' ? 1 : -1
    filtered = filtered.slice().sort((a, b) => {
      const av = asNumber(def.value(a, plan.sort_field))
      const bv = asNumber(def.value(b, plan.sort_field))
      if (av != null && bv != null) return (av - bv) * dir
      return String(def.value(a, plan.sort_field) ?? '').localeCompare(String(def.value(b, plan.sort_field) ?? '')) * dir
    })
  }

  const total = filtered.length
  const limit = Math.min(plan.limit || 50, 200)
  const projected = filtered.slice(0, limit).map((r) => project(def, r))

  void logAudit({
    action: 'console.query',
    entityType: plan.entity,
    detail: { question: question.slice(0, 500), summary: plan.summary, intent: plan.intent, filters: plan.filters, total },
  })

  return {
    ok: true,
    plan,
    columns: def.columns,
    rows: projected,
    total,
    intent: plan.intent,
    answer: plan.answer,
    summary: plan.summary,
    link: def.link,
  }
}
