import { v2, fetchAll } from './client'
import { currentOrgId } from './org'
import type { Offer, OfferStatus } from './types'

export interface OfferRow extends Offer {
  candidate: { id: string; full_name: string } | null
}

const OFFER_SELECT =
  'id,org_id,candidate_id,application_id,requisition_id,salary,bonus,equity,start_date,status,decline_reason,approved_by,approved_at,signed_url,sent_at,created_at, candidate:candidates(id,full_name)'

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

/** Set an offer's status; stamps `sent_at` on `sent` and records the reason on `declined`. */
export async function setOfferStatus(id: string, status: OfferStatus, declineReason?: string): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = { status }
  if (status === 'sent') patch.sent_at = new Date().toISOString()
  if (status === 'declined') patch.decline_reason = declineReason?.trim() || null
  const { error } = await v2.from('offers').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteOffer(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('offers').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Record manager approval on an offer (stamps approver + timestamp). */
export async function approveOffer(id: string): Promise<{ error: string | null }> {
  const { data: auth } = await v2.auth.getUser()
  const { error } = await v2
    .from('offers')
    .update({ approved_by: auth.user?.id ?? null, approved_at: new Date().toISOString() })
    .eq('id', id)
  return { error: error?.message ?? null }
}

/** Store an e-signature URL on an offer (e.g. a returned DocuSign signing link). */
export async function setSignedUrl(id: string, url: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('offers').update({ signed_url: url.trim() || null }).eq('id', id)
  return { error: error?.message ?? null }
}

/** Format a compensation figure as USD, or an em dash when unset. */
export function money(n: number | null | undefined): string {
  return n == null ? '—' : '$' + n.toLocaleString()
}

/** Render a plain-text offer letter from an offer (template; org-agnostic). */
export function renderOfferLetter(offer: OfferRow, opts?: { roleTitle?: string | null; orgName?: string }): string {
  const org = opts?.orgName ?? 'American Medical Administrators'
  const name = offer.candidate?.full_name ?? 'Candidate'
  const role = opts?.roleTitle?.trim() || 'the offered position'
  const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  const start = offer.start_date ? new Date(offer.start_date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'a mutually agreed date'
  const lines = [
    org,
    today,
    '',
    `Dear ${name},`,
    '',
    `We are pleased to offer you ${role} with ${org}. We were impressed by your background and believe you will be a valuable member of our team supporting skilled nursing and long-term care facilities.`,
    '',
    'The terms of your offer are as follows:',
    `  • Base compensation: ${money(offer.salary)}${offer.salary != null ? ' per year' : ''}`,
  ]
  if (offer.bonus != null) lines.push(`  • Bonus: ${money(offer.bonus)}`)
  if (offer.equity) lines.push(`  • Additional: ${offer.equity}`)
  lines.push(
    `  • Anticipated start date: ${start}`,
    '',
    'This offer is contingent on the successful completion of background checks, credential and license verification, and any pre-employment health screening required for the role.',
    '',
    'To accept, please sign and return this letter. We are excited about the possibility of you joining us.',
    '',
    'Sincerely,',
    `${org} — Talent Acquisition`,
    '',
    `Accepted by: ____________________________   Date: ______________`,
    `${name}`,
  )
  return lines.join('\n')
}
