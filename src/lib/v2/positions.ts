import { v2, fetchAll } from './client'
import { currentOrgId } from './org'
import type { Position } from './types'

/** All positions in the catalog, ordered by title. */
export async function listPositions(): Promise<Position[]> {
  // Paginate past the 1000-row cap; re-sort by title in JS.
  const rows = await fetchAll<Position>('positions', '*')
  return rows.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
}

export interface PositionInput {
  code?: string | null
  title: string
  category?: string | null
  rate_min?: number | null
  rate_max?: number | null
  rate_unit?: string
  responsibilities?: string[]
  requirements?: string[]
  keywords?: string[]
  active?: boolean
}

export async function createPosition(input: PositionInput): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization found for the current user.' }
  const { error } = await v2.from('positions').insert({ ...input, org_id, ai_generated: false })
  return { error: error?.message ?? null }
}

export async function updatePosition(
  id: string,
  patch: Partial<PositionInput>,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('positions').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deletePosition(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('positions').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Human-readable pay-rate label, e.g. "$35–$55 / hour", "$120,000 / year", or "—". */
export function rateLabel(p: Position): string {
  const fmt = (n: number) => `$${n.toLocaleString()}`
  const unit = p.rate_unit && p.rate_unit !== 'NA' ? ` / ${p.rate_unit}` : ''
  if (p.rate_min != null && p.rate_max != null) {
    return p.rate_min === p.rate_max ? `${fmt(p.rate_min)}${unit}` : `${fmt(p.rate_min)}–${fmt(p.rate_max)}${unit}`
  }
  if (p.rate_min != null) return `${fmt(p.rate_min)}${unit}`
  if (p.rate_max != null) return `${fmt(p.rate_max)}${unit}`
  return '—'
}
