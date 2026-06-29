import { v2 } from './client'
import { currentOrgId } from './org'
import type { RecruitingCost, CostCategory } from './types'

/** Recruiting cost line items, most recent period first. */
export async function listCosts(): Promise<RecruitingCost[]> {
  const { data } = await v2
    .from('recruiting_costs')
    .select('*')
    .order('period', { ascending: false })
  return (data as RecruitingCost[]) ?? []
}

export interface CostInput {
  category: CostCategory
  vendor?: string | null
  amount: number
  period?: string | null
  notes?: string | null
}

export async function createCost(input: CostInput): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization found for the current user.' }
  const { error } = await v2.from('recruiting_costs').insert({ ...input, org_id })
  return { error: error?.message ?? null }
}

export async function updateCost(
  id: string,
  patch: Partial<CostInput>,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('recruiting_costs').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteCost(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('recruiting_costs').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Number of applications that reached the `hired` status — denominator for cost-per-hire. */
export async function countHires(): Promise<number> {
  const { count } = await v2
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'hired')
  return count ?? 0
}

/** Format a number as a plain USD string, e.g. 1200 → "$1,200". */
export function money(n: number): string {
  return '$' + (n || 0).toLocaleString()
}
