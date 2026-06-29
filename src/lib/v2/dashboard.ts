import { v2 } from './client'

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
    byStage,
    recentReqs,
  ] = await Promise.all([
    countOpenReqs(),
    countCandidates(),
    countApplications('active'),
    countApplications('hired'),
    countPlacementReady(),
    sumOpenPositions(),
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
    byStage,
    recentReqs,
  }
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
  const { data } = await v2
    .from('applications')
    .select('current_stage_id, stage:pipeline_stages(name)')
  const rows = (data as unknown as StageTallyRow[]) ?? []
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
