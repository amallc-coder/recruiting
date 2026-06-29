// Referral engine — worker/employee referrals tracked through to hire + reward.
// Org-scoped with RLS; the public "refer someone" link submits via the
// submit_referral SECURITY DEFINER RPC (no login). Source-of-hire attribution
// already lives in Analytics → Sources; this adds the referral lifecycle + a
// referrer leaderboard.
import { v2, fetchAll } from './client'
import { currentOrgId } from './org'

export type ReferralStatus = 'submitted' | 'reviewing' | 'contacted' | 'hired' | 'rejected' | 'paid'
export type RewardStatus = 'pending' | 'approved' | 'paid' | 'void'

export const REFERRAL_STATUSES: ReferralStatus[] = ['submitted', 'reviewing', 'contacted', 'hired', 'rejected', 'paid']
export const REWARD_STATUSES: RewardStatus[] = ['pending', 'approved', 'paid', 'void']

/** Default reward suggested when a referral is marked hired (tune per program). */
export const DEFAULT_REFERRAL_REWARD = 750

export interface Referral {
  id: string
  org_id: string
  referrer_name: string
  referrer_email: string | null
  referrer_phone: string | null
  candidate_id: string | null
  requisition_id: string | null
  candidate_name: string
  candidate_email: string | null
  candidate_phone: string | null
  role_interest: string | null
  relationship: string | null
  note: string | null
  status: ReferralStatus
  reward_amount: number | null
  reward_status: RewardStatus
  source: 'staff' | 'public'
  created_at: string
  updated_at: string
}

const SELECT =
  'id,org_id,referrer_name,referrer_email,referrer_phone,candidate_id,requisition_id,candidate_name,candidate_email,candidate_phone,role_interest,relationship,note,status,reward_amount,reward_status,source,created_at,updated_at'

export async function listReferrals(): Promise<Referral[]> {
  const rows = await fetchAll<Referral>('referrals', SELECT)
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export interface ReferralInput {
  referrer_name: string
  referrer_email?: string | null
  referrer_phone?: string | null
  candidate_name: string
  candidate_email?: string | null
  candidate_phone?: string | null
  role_interest?: string | null
  relationship?: string | null
  note?: string | null
  requisition_id?: string | null
}

/** Staff-created referral (logged-in). */
export async function createReferral(input: ReferralInput): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization for current user.' }
  const { data: auth } = await v2.auth.getUser()
  const { error } = await v2.from('referrals').insert({
    ...input,
    org_id,
    source: 'staff',
    referrer_user_id: auth.user?.id ?? null,
    created_by: auth.user?.id ?? null,
  })
  return { error: error?.message ?? null }
}

export async function updateReferral(
  id: string,
  patch: Partial<Pick<Referral, 'status' | 'reward_amount' | 'reward_status' | 'note' | 'candidate_id'>>,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('referrals').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteReferral(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('referrals').delete().eq('id', id)
  return { error: error?.message ?? null }
}

/** Public referral submission (anon) via the SECURITY DEFINER RPC. */
export async function submitPublicReferral(input: ReferralInput): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await v2.rpc('submit_referral', {
    p_referrer_name: input.referrer_name,
    p_referrer_email: input.referrer_email ?? null,
    p_referrer_phone: input.referrer_phone ?? null,
    p_candidate_name: input.candidate_name,
    p_candidate_email: input.candidate_email ?? null,
    p_candidate_phone: input.candidate_phone ?? null,
    p_role_interest: input.role_interest ?? null,
    p_relationship: input.relationship ?? null,
    p_note: input.note ?? null,
    p_requisition_id: input.requisition_id ?? null,
  })
  return { id: (data as string | null) ?? null, error: error?.message ?? null }
}

export interface LeaderboardRow {
  referrer: string
  email: string | null
  total: number
  hired: number
  rewardPaid: number
  rewardPending: number
}

/** Aggregate referrals by referrer (case-insensitive name + email) for the leaderboard. */
export function leaderboard(rows: Referral[]): LeaderboardRow[] {
  const by = new Map<string, LeaderboardRow>()
  for (const r of rows) {
    const key = (r.referrer_email ?? r.referrer_name).toLowerCase().trim()
    if (!by.has(key)) by.set(key, { referrer: r.referrer_name, email: r.referrer_email, total: 0, hired: 0, rewardPaid: 0, rewardPending: 0 })
    const row = by.get(key)!
    row.total++
    if (r.status === 'hired' || r.status === 'paid') row.hired++
    const amt = r.reward_amount ?? 0
    if (r.reward_status === 'paid') row.rewardPaid += amt
    else if (r.reward_status === 'pending' || r.reward_status === 'approved') row.rewardPending += amt
  }
  return Array.from(by.values()).sort((a, b) => b.hired - a.hired || b.total - a.total)
}
