import { v2, fetchAll } from './client'
import { currentOrgId } from './org'
import type {
  RequisitionRow,
  Facility,
  OrgUser,
  RoleFamily,
  RequisitionStatus,
  ApprovalStatus,
} from './types'

const REQ_SELECT =
  '*, facility:facilities(id,name,state,city,division:divisions(id,name)), department:departments(id,name), manager:users!requisitions_hiring_manager_id_fkey(id,full_name), hiring_manager:users!requisitions_actual_hiring_manager_id_fkey(id,full_name), applications(count)'

export interface ReqFilters {
  // Multi-select: empty/undefined array means "all".
  statuses?: RequisitionStatus[]
  facilityIds?: string[]
  divisionIds?: string[]
  departmentIds?: string[]
  roleFamilies?: string[]
  managerIds?: string[]
  hiringManagerIds?: string[]
  specialty?: string
  maxAgeDays?: number | null
  search?: string
}

export async function listFacilities(): Promise<Facility[]> {
  const { data } = await v2.from('facilities').select('id,name,state,city').order('name')
  return (data as Facility[]) ?? []
}

export async function listOrgUsers(): Promise<OrgUser[]> {
  const { data } = await v2.from('users').select('id,full_name,role').order('full_name')
  return (data as OrgUser[]) ?? []
}

export async function listRoleFamilies(): Promise<RoleFamily[]> {
  const { data } = await v2.from('role_families').select('*').order('sort_order')
  return (data as RoleFamily[]) ?? []
}

export async function listRequisitions(f: ReqFilters = {}): Promise<RequisitionRow[]> {
  // Paginate past the 1000-row cap so every requisition is listed; re-sort newest-first in JS.
  let rows = await fetchAll<RequisitionRow>('requisitions', REQ_SELECT, (q) => {
    let query = q
    if (f.statuses?.length) query = query.in('status', f.statuses)
    if (f.facilityIds?.length) query = query.in('facility_id', f.facilityIds)
    if (f.departmentIds?.length) query = query.in('department_id', f.departmentIds)
    if (f.roleFamilies?.length) query = query.in('role_family', f.roleFamilies)
    if (f.managerIds?.length) query = query.in('hiring_manager_id', f.managerIds)
    if (f.hiringManagerIds?.length) query = query.in('actual_hiring_manager_id', f.hiringManagerIds)
    return query
  })
  rows = rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))

  // Division filter is on the embedded facility, so apply it client-side.
  if (f.divisionIds?.length) {
    const set = new Set(f.divisionIds)
    rows = rows.filter((r) => r.facility?.division?.id != null && set.has(r.facility.division.id))
  }

  const term = f.search?.trim().toLowerCase()
  if (term) {
    rows = rows.filter(
      (r) => r.title.toLowerCase().includes(term) || (r.specialty ?? '').toLowerCase().includes(term),
    )
  }
  const spec = f.specialty?.trim().toLowerCase()
  if (spec) rows = rows.filter((r) => (r.specialty ?? '').toLowerCase().includes(spec))
  if (f.maxAgeDays != null) rows = rows.filter((r) => daysOpen(r) <= f.maxAgeDays!)
  return rows
}

/** Lightweight requisition list for pickers (id/title/role/status), title-sorted. */
export interface ReqOption {
  id: string
  title: string
  role_family: string
  status: RequisitionStatus
}
export async function listRequisitionOptions(): Promise<ReqOption[]> {
  const rows = await fetchAll<ReqOption>('requisitions', 'id,title,role_family,status')
  return rows.sort((a, b) => a.title.localeCompare(b.title))
}

export async function getRequisition(id: string): Promise<RequisitionRow | null> {
  const { data } = await v2.from('requisitions').select(REQ_SELECT).eq('id', id).maybeSingle()
  return (data as RequisitionRow) ?? null
}

export interface ReqInput {
  title: string
  facility_id: string
  department_id?: string | null
  role_family: string
  specialty?: string | null
  headcount: number
  budget?: number | null
  hiring_manager_id?: string | null
  actual_hiring_manager_id?: string | null
  // Plain `text` columns feeding AI matching + the public careers page.
  description?: string | null
  requirements?: string | null
}

export async function createRequisition(input: ReqInput): Promise<{ id: string | null; error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { id: null, error: 'Could not resolve organization' }
  const { data, error } = await v2
    .from('requisitions')
    .insert({ ...input, org_id, status: 'draft', approval_status: 'pending' })
    .select('id')
    .single()
  return { id: (data as { id: string })?.id ?? null, error: error?.message ?? null }
}

export async function updateRequisition(id: string, patch: Partial<ReqInput>): Promise<{ error: string | null }> {
  const { error } = await v2.from('requisitions').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

// ---- auto-screen-on-apply config (opt-in per requisition) ----
export type AutoScreenChannel = 'sms' | 'phone' | 'both'
export interface AutoScreenConfig {
  auto_screen: boolean
  auto_screen_channel: AutoScreenChannel
}

export async function getAutoScreen(id: string): Promise<AutoScreenConfig> {
  const { data } = await v2.from('requisitions').select('auto_screen,auto_screen_channel').eq('id', id).maybeSingle()
  const r = data as { auto_screen?: boolean; auto_screen_channel?: AutoScreenChannel } | null
  return { auto_screen: r?.auto_screen ?? false, auto_screen_channel: r?.auto_screen_channel ?? 'both' }
}

export async function setAutoScreen(id: string, cfg: AutoScreenConfig): Promise<{ error: string | null }> {
  const { error } = await v2.from('requisitions').update(cfg).eq('id', id)
  return { error: error?.message ?? null }
}

// ---- approval chain: draft → pending_approval → open → filled (+ side states) ----
export type ReqAction = 'submit' | 'approve' | 'reject' | 'reopen' | 'hold' | 'fill' | 'close' | 'cancel'

const TRANSITIONS: Record<ReqAction, { status: RequisitionStatus; approval_status?: ApprovalStatus; label: string }> = {
  submit: { status: 'pending_approval', approval_status: 'pending', label: 'Submit for approval' },
  approve: { status: 'open', approval_status: 'approved', label: 'Approve & open' },
  reject: { status: 'draft', approval_status: 'rejected', label: 'Send back' },
  reopen: { status: 'open', label: 'Reopen' },
  hold: { status: 'on_hold', label: 'Put on hold' },
  fill: { status: 'filled', label: 'Mark filled' },
  close: { status: 'closed', label: 'Close' },
  cancel: { status: 'cancelled', label: 'Cancel' },
}

/** Which actions are available from a given status (the approval/lifecycle chain). */
export function availableActions(status: RequisitionStatus): { action: ReqAction; label: string }[] {
  const map: Record<RequisitionStatus, ReqAction[]> = {
    draft: ['submit', 'cancel'],
    pending_approval: ['approve', 'reject'],
    open: ['fill', 'hold', 'close'],
    on_hold: ['reopen', 'close'],
    filled: ['reopen'],
    closed: ['reopen'],
    cancelled: ['reopen'],
  }
  return map[status].map((action) => ({ action, label: TRANSITIONS[action].label }))
}

export async function transitionRequisition(id: string, action: ReqAction): Promise<{ error: string | null }> {
  const t = TRANSITIONS[action]
  const patch: Record<string, unknown> = { status: t.status }
  if (t.approval_status) patch.approval_status = t.approval_status
  const { error } = await v2.from('requisitions').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

// ---- metrics ----
export function daysOpen(r: { opened_at: string | null; created_at: string; filled_at: string | null }): number {
  const start = new Date(r.opened_at ?? r.created_at).getTime()
  const end = r.filled_at ? new Date(r.filled_at).getTime() : Date.now()
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

export function appCount(r: RequisitionRow): number {
  return r.applications?.[0]?.count ?? 0
}

/** Hired-application count per requisition id — powers the "X of Y filled" view. */
export async function hiredCountsByReq(): Promise<Record<string, number>> {
  const rows = await fetchAll<{ requisition_id: string | null }>('applications', 'requisition_id', (q) =>
    q.eq('status', 'hired'),
  )
  const m: Record<string, number> = {}
  for (const r of rows) if (r.requisition_id) m[r.requisition_id] = (m[r.requisition_id] ?? 0) + 1
  return m
}

export const DEFAULT_DAILY_VACANCY_COST = 1200

export function costOfVacancy(
  r: { opened_at: string | null; created_at: string; filled_at: string | null },
  dailyRate = DEFAULT_DAILY_VACANCY_COST,
): number {
  return daysOpen(r) * dailyRate
}
