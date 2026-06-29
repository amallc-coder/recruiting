import { v2 } from './client'
import type { PipelineStageType } from './types'

// Read-only analytics rollups for the v2 Analytics page. We pull the minimal
// columns we need and aggregate in JS — the datasets here are org-scoped and
// small enough that a few selects + in-memory grouping is simpler (and cheaper
// to reason about) than bespoke SQL. Everything is guarded with `?? []` so the
// page stays resilient to zeros and RLS-filtered empty result sets.

export interface AnalyticsTotals {
  applications: number
  hires: number
  openReqs: number
  avgTimeToFillDays: number | null
  conversionPct: number | null
}

export interface FunnelRow {
  stage: string
  count: number
}

export interface SourceRow {
  source: string
  count: number
}

export interface RoleFamilyRow {
  role: string
  open: number
}

export interface AnalyticsData {
  totals: AnalyticsTotals
  funnel: FunnelRow[]
  bySource: SourceRow[]
  byRoleFamily: RoleFamilyRow[]
}

// Funnel buckets, in display order. Stages that aren't part of the linear
// progression (rejected / in_process) collapse into 'applied' so every
// application still lands somewhere meaningful.
type FunnelBucket = 'applied' | 'screen' | 'interview' | 'offer' | 'hired'
const FUNNEL_ORDER: FunnelBucket[] = ['applied', 'screen', 'interview', 'offer', 'hired']
const FUNNEL_LABELS: Record<FunnelBucket, string> = {
  applied: 'Applied',
  screen: 'Screen',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
}

interface ApplicationRow {
  status: string
  current_stage_id: string | null
  applied_at: string | null
}

interface StageRow {
  id: string
  stage_type: PipelineStageType
}

interface RequisitionRow {
  status: string
  opened_at: string | null
  filled_at: string | null
  role_family: string | null
}

interface CandidateRow {
  source: string | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/** Map an application's current stage to one of the five funnel buckets. */
function bucketFor(stageType: PipelineStageType | null): FunnelBucket {
  if (stageType && (FUNNEL_ORDER as PipelineStageType[]).includes(stageType)) {
    return stageType as FunnelBucket
  }
  return 'applied'
}

export async function loadAnalytics(): Promise<AnalyticsData> {
  const [appsRes, stagesRes, reqsRes, candidatesRes] = await Promise.all([
    v2.from('applications').select('status,current_stage_id,applied_at'),
    v2.from('pipeline_stages').select('id,stage_type'),
    v2.from('requisitions').select('status,opened_at,filled_at,role_family'),
    v2.from('candidates').select('source'),
  ])

  const apps = (appsRes.data as ApplicationRow[]) ?? []
  const stages = (stagesRes.data as StageRow[]) ?? []
  const reqs = (reqsRes.data as RequisitionRow[]) ?? []
  const candidates = (candidatesRes.data as CandidateRow[]) ?? []

  const stageType = new Map<string, PipelineStageType>()
  for (const s of stages) stageType.set(s.id, s.stage_type)

  return {
    totals: computeTotals(apps, reqs),
    funnel: computeFunnel(apps, stageType),
    bySource: computeBySource(candidates),
    byRoleFamily: computeByRoleFamily(reqs),
  }
}

function computeTotals(apps: ApplicationRow[], reqs: RequisitionRow[]): AnalyticsTotals {
  const applications = apps.length
  const hires = apps.filter((a) => a.status === 'hired').length
  const openReqs = reqs.filter((r) => r.status === 'open').length

  const fillDurations: number[] = []
  for (const r of reqs) {
    if (!r.opened_at || !r.filled_at) continue
    const opened = new Date(r.opened_at).getTime()
    const filled = new Date(r.filled_at).getTime()
    if (Number.isNaN(opened) || Number.isNaN(filled)) continue
    fillDurations.push((filled - opened) / MS_PER_DAY)
  }
  const avgTimeToFillDays =
    fillDurations.length > 0
      ? Math.round(fillDurations.reduce((s, d) => s + d, 0) / fillDurations.length)
      : null

  const conversionPct = applications > 0 ? Math.round((hires / applications) * 100) : null

  return { applications, hires, openReqs, avgTimeToFillDays, conversionPct }
}

function computeFunnel(
  apps: ApplicationRow[],
  stageType: Map<string, PipelineStageType>,
): FunnelRow[] {
  const tally = new Map<FunnelBucket, number>()
  for (const bucket of FUNNEL_ORDER) tally.set(bucket, 0)
  for (const a of apps) {
    const type = a.current_stage_id ? stageType.get(a.current_stage_id) ?? null : null
    const bucket = bucketFor(type)
    tally.set(bucket, (tally.get(bucket) ?? 0) + 1)
  }
  return FUNNEL_ORDER.map((bucket) => ({ stage: FUNNEL_LABELS[bucket], count: tally.get(bucket) ?? 0 }))
}

function computeBySource(candidates: CandidateRow[]): SourceRow[] {
  const tally = new Map<string, number>()
  for (const c of candidates) {
    const source = c.source?.trim() || 'Unknown'
    tally.set(source, (tally.get(source) ?? 0) + 1)
  }
  return Array.from(tally, ([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function computeByRoleFamily(reqs: RequisitionRow[]): RoleFamilyRow[] {
  const tally = new Map<string, number>()
  for (const r of reqs) {
    if (r.status !== 'open') continue
    const role = r.role_family?.trim() || 'Unspecified'
    tally.set(role, (tally.get(role) ?? 0) + 1)
  }
  return Array.from(tally, ([role, open]) => ({ role, open })).sort((a, b) => b.open - a.open)
}
