import { v2, fetchAll } from './client'

// Read-only rollups for the v2 Dashboard. Uses efficient COUNT queries
// (`head: true`) wherever a count is all we need, so no row payloads cross the
// wire. Everything is guarded with `?? 0` so the page stays resilient to zeros
// and to RLS-filtered empty result sets.

export interface DashboardSummary {
  openReqs: number
  totalCandidates: number
  activeApplications: number
  hires: number
  placementReady: number
  openPositions: number
  /** Σ headcount across open requisitions — total seats we're hiring for. */
  openings: number
  /** Openings still unfilled = Σ max(0, headcount − hires) over open reqs. */
  openingsRemaining: number
  interviews: number
  offers: number
  byStage: { stage: string; count: number }[]
  recentReqs: { id: string; title: string; status: string; role_family: string }[]
}

/** PostgREST returns a to-one embed as a single object; typed here to avoid the array inference. */
interface StageTallyRow {
  current_stage_id: string | null
  stage: { name: string } | null
}

export async function loadDashboard(): Promise<DashboardSummary> {
  const [
    openReqs,
    totalCandidates,
    activeApplications,
    hires,
    placementReady,
    openPositions,
    openingsAgg,
    interviews,
    offers,
    byStage,
    recentReqs,
  ] = await Promise.all([
    countOpenReqs(),
    countCandidates(),
    countApplications('active'),
    countApplications('hired'),
    countPlacementReady(),
    sumOpenPositions(),
    loadOpenings(),
    countRows('interviews'),
    countRows('offers'),
    loadByStage(),
    loadRecentReqs(),
  ])

  return {
    openReqs,
    totalCandidates,
    activeApplications,
    hires,
    placementReady,
    openPositions,
    openings: openingsAgg.openings,
    openingsRemaining: openingsAgg.remaining,
    interviews,
    offers,
    byStage,
    recentReqs,
  }
}

async function countRows(table: string): Promise<number> {
  const { count } = await v2.from(table).select('id', { count: 'exact', head: true })
  return count ?? 0
}

/** Openings = Σ headcount over open reqs; remaining = Σ max(0, headcount − hires-on-that-req). */
async function loadOpenings(): Promise<{ openings: number; remaining: number }> {
  const reqs = await fetchAll<{ id: string; headcount: number | null }>('requisitions', 'id,headcount', (q) => q.eq('status', 'open'))
  const openings = reqs.reduce((s, r) => s + (r.headcount || 0), 0)
  if (reqs.length === 0) return { openings: 0, remaining: 0 }
  const ids = new Set(reqs.map((r) => r.id))
  const hired = await fetchAll<{ requisition_id: string | null }>('applications', 'requisition_id', (q) => q.eq('status', 'hired'))
  const hiredByReq = new Map<string, number>()
  for (const h of hired) {
    if (h.requisition_id && ids.has(h.requisition_id)) hiredByReq.set(h.requisition_id, (hiredByReq.get(h.requisition_id) ?? 0) + 1)
  }
  const remaining = reqs.reduce((s, r) => s + Math.max(0, (r.headcount || 0) - (hiredByReq.get(r.id) ?? 0)), 0)
  return { openings, remaining }
}

async function countOpenReqs(): Promise<number> {
  const { count } = await v2
    .from('requisitions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
  return count ?? 0
}

async function countCandidates(): Promise<number> {
  const { count } = await v2.from('candidates').select('id', { count: 'exact', head: true })
  return count ?? 0
}

async function countApplications(status: 'active' | 'hired'): Promise<number> {
  const { count } = await v2
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', status)
  return count ?? 0
}

async function countPlacementReady(): Promise<number> {
  const { count } = await v2
    .from('v_application_placement_ready')
    .select('application_id', { count: 'exact', head: true })
    .eq('placement_ready', true)
  return count ?? 0
}

/** Open positions = Σ max(0, need − have) across all coverage needs. */
async function sumOpenPositions(): Promise<number> {
  const { data } = await v2.from('coverage_needs').select('have_count,need_count')
  const rows = (data as { have_count: number; need_count: number }[]) ?? []
  return rows.reduce((s, n) => s + Math.max(0, (n.need_count || 0) - (n.have_count || 0)), 0)
}

/** Tally active-ish applications by their current pipeline stage name. */
async function loadByStage(): Promise<{ stage: string; count: number }[]> {
  // Paginate past the 1000-row cap so the by-stage tally counts every application.
  const rows = await fetchAll<StageTallyRow>('applications', 'current_stage_id, stage:pipeline_stages(name)')
  const tally = new Map<string, number>()
  for (const r of rows) {
    const name = r.stage?.name
    if (!name) continue
    tally.set(name, (tally.get(name) ?? 0) + 1)
  }
  return Array.from(tally, ([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count)
}

async function loadRecentReqs(): Promise<DashboardSummary['recentReqs']> {
  const { data } = await v2
    .from('requisitions')
    .select('id,title,status,role_family')
    .order('created_at', { ascending: false })
    .limit(6)
  return (data as DashboardSummary['recentReqs']) ?? []
}
