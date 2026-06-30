// Programmatic ad optimization — per-channel job-ad campaigns with spend +
// funnel metrics, and a deterministic recommendation engine that ranks channels
// by cost-per-quality-applicant and proposes budget reallocation / overspend
// pauses. Org-scoped with RLS. Live auto-posting to ad networks is inert until
// per-channel credentials exist; metrics are entered (or synced) here.
import { v2, fetchAll } from './client'
import { currentOrgId } from './org'

export type AdChannel = 'indeed' | 'ziprecruiter' | 'linkedin' | 'facebook' | 'google' | 'other'
export type CampaignStatus = 'active' | 'paused' | 'ended'

export const AD_CHANNELS: AdChannel[] = ['indeed', 'ziprecruiter', 'linkedin', 'facebook', 'google', 'other']
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['active', 'paused', 'ended']
export const AD_CHANNEL_LABELS: Record<AdChannel, string> = {
  indeed: 'Indeed',
  ziprecruiter: 'ZipRecruiter',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  google: 'Google',
  other: 'Other',
}

export interface AdCampaign {
  id: string
  org_id: string
  requisition_id: string | null
  name: string
  channel: AdChannel
  status: CampaignStatus
  budget: number | null
  spend: number
  impressions: number
  clicks: number
  applies: number
  hires: number
  start_date: string | null
  end_date: string | null
  created_at: string
}

const SELECT =
  'id,org_id,requisition_id,name,channel,status,budget,spend,impressions,clicks,applies,hires,start_date,end_date,created_at'

export async function listCampaigns(): Promise<AdCampaign[]> {
  const rows = await fetchAll<AdCampaign>('job_ad_campaigns', SELECT)
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export interface CampaignInput {
  name: string
  channel: AdChannel
  requisition_id?: string | null
  status?: CampaignStatus
  budget?: number | null
  spend?: number
  impressions?: number
  clicks?: number
  applies?: number
  hires?: number
  start_date?: string | null
  end_date?: string | null
}

export async function createCampaign(input: CampaignInput): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization for current user.' }
  const { data: auth } = await v2.auth.getUser()
  const { error } = await v2.from('job_ad_campaigns').insert({ ...input, org_id, created_by: auth.user?.id ?? null })
  return { error: error?.message ?? null }
}

export async function updateCampaign(id: string, patch: Partial<CampaignInput>): Promise<{ error: string | null }> {
  const { error } = await v2.from('job_ad_campaigns').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteCampaign(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('job_ad_campaigns').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ---- derived metrics + recommendation engine ----

export interface CampaignMetrics {
  costPerApply: number | null
  costPerHire: number | null
  applyRate: number | null // applies / clicks
  budgetUsedPct: number | null
}

export function metricsFor(c: AdCampaign): CampaignMetrics {
  return {
    costPerApply: c.applies > 0 ? c.spend / c.applies : null,
    costPerHire: c.hires > 0 ? c.spend / c.hires : null,
    applyRate: c.clicks > 0 ? c.applies / c.clicks : null,
    budgetUsedPct: c.budget && c.budget > 0 ? (c.spend / c.budget) * 100 : null,
  }
}

export interface Recommendation {
  campaignId: string
  campaignName: string
  type: 'scale' | 'cut' | 'watch'
  note: string
}

export interface CampaignTotals {
  spend: number
  budget: number
  applies: number
  hires: number
  costPerApply: number | null
  costPerHire: number | null
}

export function totals(campaigns: AdCampaign[]): CampaignTotals {
  const spend = campaigns.reduce((s, c) => s + c.spend, 0)
  const budget = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0)
  const applies = campaigns.reduce((s, c) => s + c.applies, 0)
  const hires = campaigns.reduce((s, c) => s + c.hires, 0)
  return {
    spend,
    budget,
    applies,
    hires,
    costPerApply: applies > 0 ? spend / applies : null,
    costPerHire: hires > 0 ? spend / hires : null,
  }
}

/**
 * Deterministic budget-reallocation engine over ACTIVE campaigns:
 *  - "cut": meaningful spend (>= 60% of budget, or >$100) with no applies, OR a
 *    cost-per-apply more than 1.6× the blended average → pause / cut.
 *  - "scale": the most efficient channel (lowest cost-per-apply, with hires
 *    preferred) → shift freed budget here.
 *  - "watch": near budget cap with thin conversion.
 */
export function recommendations(campaigns: AdCampaign[]): Recommendation[] {
  const active = campaigns.filter((c) => c.status === 'active')
  const withApplies = active.filter((c) => c.applies > 0)
  const recs: Recommendation[] = []
  const blendedCPA =
    withApplies.length > 0
      ? withApplies.reduce((s, c) => s + c.spend, 0) / withApplies.reduce((s, c) => s + c.applies, 0)
      : null

  // Cut / watch
  for (const c of active) {
    const m = metricsFor(c)
    const spentEnough = c.spend > 100 || (m.budgetUsedPct != null && m.budgetUsedPct >= 60)
    if (spentEnough && c.applies === 0) {
      recs.push({ campaignId: c.id, campaignName: c.name, type: 'cut', note: `$${Math.round(c.spend).toLocaleString()} spent with no applications — pause and redirect this budget.` })
      continue
    }
    if (blendedCPA != null && m.costPerApply != null && m.costPerApply > blendedCPA * 1.6 && c.applies > 0) {
      recs.push({ campaignId: c.id, campaignName: c.name, type: 'cut', note: `Cost per applicant ($${Math.round(m.costPerApply)}) is well above the blended average ($${Math.round(blendedCPA)}). Trim or pause.` })
      continue
    }
    if (m.budgetUsedPct != null && m.budgetUsedPct >= 90) {
      recs.push({ campaignId: c.id, campaignName: c.name, type: 'watch', note: `${Math.round(m.budgetUsedPct)}% of budget used — top up if it's converting, otherwise let it end.` })
    }
  }

  // Scale: best efficiency (prefer cost-per-hire, then cost-per-apply)
  const ranked = [...withApplies].sort((a, b) => {
    const am = metricsFor(a)
    const bm = metricsFor(b)
    const ah = am.costPerHire ?? Infinity
    const bh = bm.costPerHire ?? Infinity
    if (ah !== bh) return ah - bh
    return (am.costPerApply ?? Infinity) - (bm.costPerApply ?? Infinity)
  })
  const best = ranked[0]
  if (best && !recs.some((r) => r.campaignId === best.id && r.type === 'cut')) {
    const bm = metricsFor(best)
    const eff = bm.costPerHire != null ? `$${Math.round(bm.costPerHire).toLocaleString()}/hire` : `$${Math.round(bm.costPerApply ?? 0)}/applicant`
    recs.push({ campaignId: best.id, campaignName: best.name, type: 'scale', note: `Most efficient channel (${eff}). Shift freed budget here to compound your best source.` })
  }

  return recs
}
