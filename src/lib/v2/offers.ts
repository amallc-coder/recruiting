import { v2, fetchAll } from './client'
import { currentOrgId } from './org'
import type { Offer, OfferStatus } from './types'

export interface OfferRow extends Offer {
  candidate: { id: string; full_name: string } | null
}

const OFFER_SELECT =
  'id,org_id,candidate_id,application_id,requisition_id,salary,bonus,equity,start_date,status,sent_at,created_at, candidate:candidates(id,full_name)'

/** All offers, newest first, with the candidate's name joined for display. */
export async function listOffers(): Promise<OfferRow[]> {
  // Paginate past the 1000-row cap so every offer shows; re-sort newest-first in JS.
  const rows = await fetchAll<OfferRow>('offers', OFFER_SELECT)
  return rows.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

export interface OfferInput {
  candidate_id: string
  requisition_id?: string | null
  salary?: number | null
  bonus?: number | null
  equity?: string | null
  start_date?: string | null
}

/** Create a new offer in the caller's org, starting in the `pending` status. */
export async function createOffer(input: OfferInput): Promise<{ error: string | null }> {
  const orgId = await currentOrgId()
  if (!orgId) return { error: 'No organization for current user.' }
  const { error } = await v2.from('offers').insert({ ...input, org_id: orgId, status: 'pending' })
  return { error: error?.message ?? null }
}

export async function updateOffer(id: string, patch: Partial<OfferInput>): Promise<{ error: string | null }> {
  const { error } = await v2.from('offers').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

/** Set an offer's status; stamps `sent_at` when moving to `sent`. */
export async function setOfferStatus(id: string, status: OfferStatus): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = { status }
  if (status === 'sent') patch.sent_at = new Date().toISOString()
  const { error } = await v2.from('offers').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteOffer(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('offers').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Format a compensation figure as USD, or an em dash when unset. */
export function money(n: number | null | undefined): string {
  return n == null ? '—' : '$' + n.toLocaleString()
}
