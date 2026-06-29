import { v2 } from './client'
import type { CoverageNeed, FacilityCoverage, CoveragePriority, RoleFamily } from './types'

const COVERAGE_SELECT =
  'id,facility_id,role_family,have_count,need_count,priority,current_provider,description,notes'

/** Facilities with their per-role coverage needs grouped, for the Have/Need view. */
export async function listFacilityCoverage(): Promise<FacilityCoverage[]> {
  const [{ data: facs }, { data: needs }] = await Promise.all([
    v2.from('facilities').select('id,name,state,city,region').order('name'),
    v2.from('coverage_needs').select(COVERAGE_SELECT),
  ])
  const byFacility = new Map<string, CoverageNeed[]>()
  for (const n of (needs as CoverageNeed[]) ?? []) {
    if (!byFacility.has(n.facility_id)) byFacility.set(n.facility_id, [])
    byFacility.get(n.facility_id)!.push(n)
  }
  return ((facs as FacilityCoverage[]) ?? []).map((f) => ({
    ...f,
    needs: (byFacility.get(f.id) ?? []).sort((a, b) => a.role_family.localeCompare(b.role_family)),
  }))
}

export async function listRoleFamilies(): Promise<RoleFamily[]> {
  const { data } = await v2.from('role_families').select('code,label,description,sort_order').order('sort_order')
  return (data as RoleFamily[]) ?? []
}

export interface CoverageInput {
  have_count: number
  need_count: number
  priority: CoveragePriority
  current_provider?: string | null
  description?: string | null
  notes?: string | null
}

/** Insert or update the coverage need for a (facility, role family). */
export async function upsertCoverageNeed(
  facilityId: string,
  roleFamily: string,
  input: CoverageInput,
): Promise<{ error: string | null }> {
  const { error } = await v2
    .from('coverage_needs')
    .upsert(
      {
        facility_id: facilityId,
        role_family: roleFamily,
        have_count: Math.max(0, input.have_count || 0),
        need_count: Math.max(0, input.need_count || 0),
        priority: input.priority,
        current_provider: input.current_provider ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null,
      },
      { onConflict: 'facility_id,role_family' },
    )
  return { error: error?.message ?? null }
}

export async function deleteCoverageNeed(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('coverage_needs').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Gap = need - have, clamped at 0. Drives the "open positions" rollups. */
export function gap(n: CoverageNeed): number {
  return Math.max(0, (n.need_count || 0) - (n.have_count || 0))
}
