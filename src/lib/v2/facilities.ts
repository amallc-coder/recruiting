import { v2 } from './client'
import { currentOrgId } from './org'

const FACILITY_SELECT = 'id,name,state,city,address,region,active'

export interface FacilityRow {
  id: string
  name: string
  state: string | null
  city: string | null
  address: string | null
  region: string | null
  active: boolean
}

/** All facilities for the org, alphabetical by name. */
export async function listFacilities(): Promise<FacilityRow[]> {
  const { data } = await v2.from('facilities').select(FACILITY_SELECT).order('name')
  return (data as FacilityRow[]) ?? []
}

export interface FacilityInput {
  name: string
  state?: string | null
  city?: string | null
  address?: string | null
  region?: string | null
  active?: boolean
}

/** Insert a facility, scoped to the caller's org. */
export async function createFacility(input: FacilityInput): Promise<{ error: string | null }> {
  const orgId = await currentOrgId()
  if (!orgId) return { error: 'Could not resolve your organization.' }
  const { error } = await v2.from('facilities').insert({
    ...input,
    org_id: orgId,
    active: input.active ?? true,
  })
  return { error: error?.message ?? null }
}

/** Update an existing facility. */
export async function updateFacility(
  id: string,
  patch: Partial<FacilityInput>,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('facilities').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteFacility(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('facilities').delete().eq('id', id)
  return { error: error?.message ?? null }
}
