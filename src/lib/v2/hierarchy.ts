// System-wide org hierarchy: Division → Facility → Department → Role.
// Divisions group facilities; departments live under a facility; "role" is the
// existing role_families catalog. Admin CRUD here; the anon org_hierarchy() RPC
// feeds the public staffing-request cascade.
import { v2, fetchAll } from './client'
import { currentOrgId } from './org'

export interface Division {
  id: string
  org_id: string
  name: string
}
export interface Department {
  id: string
  org_id: string
  facility_id: string
  name: string
}

// ---- divisions ----
export async function listDivisions(): Promise<Division[]> {
  const rows = await fetchAll<Division>('divisions', 'id,org_id,name')
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}
export async function createDivision(name: string): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization for current user.' }
  const { error } = await v2.from('divisions').insert({ org_id, name: name.trim() })
  return { error: error?.message ?? null }
}
export async function renameDivision(id: string, name: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('divisions').update({ name: name.trim() }).eq('id', id)
  return { error: error?.message ?? null }
}
export async function deleteDivision(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('divisions').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ---- departments ----
export async function listDepartments(): Promise<Department[]> {
  const rows = await fetchAll<Department>('departments', 'id,org_id,facility_id,name')
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}
export async function createDepartment(facilityId: string, name: string): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization for current user.' }
  const { error } = await v2.from('departments').insert({ org_id, facility_id: facilityId, name: name.trim() })
  return { error: error?.message ?? null }
}
export async function deleteDepartment(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('departments').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ---- facilities (lite, with division assignment) ----
export interface FacilityLite {
  id: string
  name: string
  city: string | null
  state: string | null
  division_id: string | null
}
export async function listFacilitiesLite(): Promise<FacilityLite[]> {
  const rows = await fetchAll<FacilityLite>('facilities', 'id,name,city,state,division_id')
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}
export async function assignFacilityDivision(facilityId: string, divisionId: string | null): Promise<{ error: string | null }> {
  const { error } = await v2.from('facilities').update({ division_id: divisionId }).eq('id', facilityId)
  return { error: error?.message ?? null }
}

export interface NewFacility {
  name: string
  city?: string | null
  state?: string | null
  division_id?: string | null
}
export async function createFacility(input: NewFacility): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization for current user.' }
  if (!input.name.trim()) return { error: 'A facility name is required.' }
  const { error } = await v2.from('facilities').insert({
    org_id,
    name: input.name.trim(),
    city: input.city?.trim() || null,
    state: input.state?.trim().toUpperCase() || null,
    division_id: input.division_id || null,
  })
  return { error: error?.message ?? null }
}
export async function updateFacility(
  id: string,
  patch: { name?: string; city?: string | null; state?: string | null },
): Promise<{ error: string | null }> {
  const clean: Record<string, unknown> = {}
  if (patch.name != null) clean.name = patch.name.trim()
  if (patch.city !== undefined) clean.city = patch.city?.trim() || null
  if (patch.state !== undefined) clean.state = patch.state?.trim().toUpperCase() || null
  const { error } = await v2.from('facilities').update(clean).eq('id', id)
  return { error: error?.message ?? null }
}

// ---- roles (role_families catalog; admin-managed, feeds every role dropdown) ----
export interface RoleFamilyRow {
  code: string
  label: string
  sort_order: number
}
export async function listRoleFamiliesFull(): Promise<RoleFamilyRow[]> {
  const { data } = await v2.from('role_families').select('code,label,sort_order').order('sort_order')
  return (data as RoleFamilyRow[]) ?? []
}
/** Derive a short code from a label, e.g. "Nursing Home Administrator" → "NHA". */
export function suggestRoleCode(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  const initials = words.map((w) => w[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return (initials || label.toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, 12)
}
export async function createRoleFamily(code: string, label: string, sortOrder = 100): Promise<{ error: string | null }> {
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 16)
  if (!c) return { error: 'A short code (letters/numbers) is required.' }
  if (!label.trim()) return { error: 'A label is required.' }
  const { error } = await v2.from('role_families').insert({ code: c, label: label.trim(), sort_order: sortOrder })
  return { error: error?.message ?? null }
}
export async function deleteRoleFamily(code: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('role_families').delete().eq('code', code)
  return { error: error?.message ?? null }
}

// ---- public (anon) nested hierarchy ----
export interface HierDepartment {
  id: string
  name: string
}
export interface HierFacility {
  id: string
  name: string
  departments: HierDepartment[]
}
export interface HierDivision {
  id: string | null
  name: string
  facilities: HierFacility[]
}
export interface HierRole {
  code: string
  label: string
}
export interface OrgHierarchy {
  ok: boolean
  divisions: HierDivision[]
  role_families: HierRole[]
}

export async function getOrgHierarchy(): Promise<OrgHierarchy> {
  const { data, error } = await v2.rpc('org_hierarchy')
  if (error || !data) return { ok: false, divisions: [], role_families: [] }
  return data as OrgHierarchy
}
