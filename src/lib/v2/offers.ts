import { v2 } from './client'
import { currentOrgId } from './org'
import type { Offer, OfferStatus } from './types'

export interface OfferRow extends Offer {
  candidate: { id: string; full_name: string } | null
}

const OFFER_SELECT =
  'id,org_id,candidate_id,application_id,requisition_id,salary,bonus,equity,start_date,status,sent_at,created_at, candidate:candidates(id,full_name)'

/** All offers, newest first, with the candidate's name joined for display. */
export async function listOffers(): Promise<OfferRow[]> {
  const { data } = await v2.from('offers').select(OFFER_SELECT).order('created_at', { ascending: false })
  return (data as unknown as OfferRow[]) ?? []
}

export interface OfferInput {
  candidate_id: string
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
