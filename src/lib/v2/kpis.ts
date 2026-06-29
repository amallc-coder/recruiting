// KPI engine for the v2 Analytics workspace. KPIs are first-class objects: each
// carries a plain-English definition, its formula, the live value, an industry
// benchmark, an internal target, the prior-period value (from kpi_snapshots), and
// a one-line "what to fix next." Everything computes in-browser from org-scoped,
// RLS-filtered rows (paginated past the 1000-row cap) so the numbers always
// reflect exactly what the caller is allowed to see.
//
// Segment filters (role family, facility) narrow every metric. The hiring funnel
// is cumulative-reach based (an application that reached `interview` is counted as
// having passed `applied` + `screen`), which lets us derive stage-to-stage
// conversion and highlight the worst-converting stage without a stage-history
// table. Trends come from the kpi_snapshots ledger — capture a snapshot and the
// next load shows movement vs that capture (nightly pg_cron capture is a
// follow-up; the on-demand capture button ships here).
import { v2, fetchAll } from './client'
import { currentOrgId } from './org'
import { DEFAULT_DAILY_VACANCY_COST } from './requisitions'
import type { PipelineStageType } from './types'

const MS_PER_DAY = 86_400_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type KpiCategory = 'speed' | 'quality' | 'cost' | 'throughput' | 'healthcare'
export type KpiUnit = 'days' | 'pct' | 'usd' | 'ratio' | 'count'
export type KpiTone = 'good' | 'default' | 'warn'

export interface Kpi {
  key: string
  label: string
  category: KpiCategory
  definition: string
  formula: string
  value: number | null
  unit: KpiUnit
  benchmark: number | null
  target: number | null
  higherIsBetter: boolean
  /** Most recent stored snapshot value for this metric (org-level) — the "last period" baseline. */
  prior: number | null
  whatToFix: string
}

export interface FunnelStage {
  key: FunnelBucket
  label: string
  count: number
  /** Conversion from the previous stage (0–100), null for the first stage. */
  conversionPct: number | null
  /** True for the stage with the steepest drop-off (worst conversion). */
  isBottleneck: boolean
}

export interface RecruiterRow {
  id: string
  name: string
  openReqs: number
  hires: number
  fillRatePct: number | null
  avgTimeToFillDays: number | null
  interviewToOffer: number | null
}

export interface KpiSegment {
  roleFamilies?: string[]
  facilityIds?: string[]
  /** Inclusive date-range window (ISO `YYYY-MM-DD`). Null/absent = all time. */
  from?: string | null
  to?: string | null
}

/**
 * Build an "is this timestamp inside the window?" predicate. With no window both
 * bounds are null and everything passes (preserving all-time behavior, including
 * rows with a null date). Once a bound is set, rows with no date are excluded.
 */
function makeInWindow(from?: string | null, to?: string | null): (s: string | null | undefined) => boolean {
  const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null
  const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null
  if (fromTs == null && toTs == null) return () => true
  return (s) => {
    if (!s) return false
    const t = new Date(s).getTime()
    if (Number.isNaN(t)) return false
    if (fromTs != null && t < fromTs) return false
    if (toTs != null && t > toTs) return false
    return true
  }
}

export interface SegmentOption {
  value: string
  label: string
}

export interface KpiBundle {
  kpis: Kpi[]
  funnel: FunnelStage[]
  recruiters: RecruiterRow[]
  roleFamilyOptions: SegmentOption[]
  facilityOptions: SegmentOption[]
  /** True when no requisitions/applications fall inside the active segment. */
  empty: boolean
}

// ---------------------------------------------------------------------------
// Benchmarks & targets — healthcare staffing (SNF/LTC clinical roles).
// Sourced from published HR/staffing benchmarks; tune as the org accumulates
// its own history.
// ---------------------------------------------------------------------------
interface KpiSpec {
  key: string
  label: string
  category: KpiCategory
  definition: string
  formula: string
  unit: KpiUnit
  benchmark: number | null
  target: number | null
  higherIsBetter: boolean
}

const SPECS: KpiSpec[] = [
  {
    key: 'time_to_fill',
    label: 'Time to fill',
    category: 'speed',
    definition: 'Average calendar days from a requisition opening to its first hire.',
    formula: 'avg(hire date − opened date) over filled requisitions',
    unit: 'days',
    benchmark: 36,
    target: 28,
    higherIsBetter: false,
  },
  {
    key: 'offer_acceptance',
    label: 'Offer acceptance',
    category: 'quality',
    definition: 'Share of decided offers (accepted + declined) that candidates accepted.',
    formula: 'accepted ÷ (accepted + declined) × 100',
    unit: 'pct',
    benchmark: 80,
    target: 85,
    higherIsBetter: true,
  },
  {
    key: 'cost_per_hire',
    label: 'Cost per hire',
    category: 'cost',
    definition: 'Total recruiting spend divided by hires. Spend is org-wide; segment views approximate.',
    formula: 'Σ recruiting_costs ÷ hires',
    unit: 'usd',
    benchmark: 4700,
    target: 4000,
    higherIsBetter: false,
  },
  {
    key: 'cost_of_vacancy',
    label: 'Cost of vacancy',
    category: 'cost',
    definition: `Running cost of unfilled openings — each open day burns ~$${DEFAULT_DAILY_VACANCY_COST.toLocaleString()} in coverage/agency premium.`,
    formula: `Σ (days open × $${DEFAULT_DAILY_VACANCY_COST.toLocaleString()}/day) over open requisitions`,
    unit: 'usd',
    benchmark: null,
    target: null,
    higherIsBetter: false,
  },
  {
    key: 'interview_to_offer',
    label: 'Interview-to-offer',
    category: 'throughput',
    definition: 'Candidates reaching interview per candidate reaching an offer. Lower = a more decisive interview loop.',
    formula: 'interview-stage reach ÷ offer-stage reach',
    unit: 'ratio',
    benchmark: 3,
    target: 2.5,
    higherIsBetter: false,
  },
  {
    key: 'fill_rate',
    label: 'Fill rate',
    category: 'throughput',
    definition: 'Share of marketed requisitions (past draft) that produced at least one hire.',
    formula: 'requisitions with a hire ÷ marketed requisitions × 100',
    unit: 'pct',
    benchmark: 90,
    target: 95,
    higherIsBetter: true,
  },
  {
    key: 'credential_ready',
    label: 'Credential-ready',
    category: 'healthcare',
    definition: 'Share of active candidates whose licenses/credentials are complete and placement-ready.',
    formula: 'placement-ready active apps ÷ active apps × 100',
    unit: 'pct',
    benchmark: 85,
    target: 95,
    higherIsBetter: true,
  },
  {
    key: 'hires',
    label: 'Hires',
    category: 'throughput',
    definition: 'Applications that reached a hired outcome in the selected segment.',
    formula: 'count(applications where status = hired)',
    unit: 'count',
    benchmark: null,
    target: null,
    higherIsBetter: true,
  },
]

// ---------------------------------------------------------------------------
// Funnel buckets (cumulative reach), in display order.
// ---------------------------------------------------------------------------
export type FunnelBucket = 'applied' | 'screen' | 'interview' | 'offer' | 'hired'
const FUNNEL_ORDER: FunnelBucket[] = ['applied', 'screen', 'interview', 'offer', 'hired']
const FUNNEL_LABELS: Record<FunnelBucket, string> = {
  applied: 'Applied',
  screen: 'Screen',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
}
const BUCKET_ORDINAL: Record<FunnelBucket, number> = { applied: 0, screen: 1, interview: 2, offer: 3, hired: 4 }

function bucketFor(stageType: PipelineStageType | null | undefined): FunnelBucket {
  if (stageType && (FUNNEL_ORDER as string[]).includes(stageType)) return stageType as FunnelBucket
  return 'applied'
}

// ---------------------------------------------------------------------------
// Row shapes (minimal projections)
// ---------------------------------------------------------------------------
interface ReqRow {
  id: string
  status: string
  role_family: string | null
  facility_id: string | null
  hiring_manager_id: string | null
  created_by: string | null
  opened_at: string | null
  created_at: string
  filled_at: string | null
}
interface AppRow {
  id: string
  requisition_id: string | null
  status: string
  current_stage_id: string | null
  applied_at: string | null
  created_at: string | null
  updated_at: string | null
}
interface StageRow {
  id: string
  stage_type: PipelineStageType
}
interface OfferRow {
  requisition_id: string | null
  status: string
  created_at: string | null
}
interface ReadyRow {
  application_id: string
  placement_ready: boolean
}
interface CostRow {
  amount: number | null
  created_at: string | null
}
interface UserRow {
  id: string
  full_name: string
}
interface SnapshotRow {
  metric: string
  value: number | null
  captured_at: string
}

// ---------------------------------------------------------------------------
// Load + compute
// ---------------------------------------------------------------------------
export async function loadKpis(segment: KpiSegment = {}): Promise<KpiBundle> {
  const [reqs, apps, stages, offers, ready, costs, users, snapshots, facilities] = await Promise.all([
    fetchAll<ReqRow>('requisitions', 'id,status,role_family,facility_id,hiring_manager_id,created_by,opened_at,created_at,filled_at'),
    fetchAll<AppRow>('applications', 'id,requisition_id,status,current_stage_id,applied_at,created_at,updated_at'),
    fetchAll<StageRow>('pipeline_stages', 'id,stage_type'),
    fetchAll<OfferRow>('offers', 'requisition_id,status,created_at'),
    fetchAll<ReadyRow>('v_application_placement_ready', 'application_id,placement_ready'),
    fetchAll<CostRow>('recruiting_costs', 'amount,created_at'),
    fetchAll<UserRow>('users', 'id,full_name'),
    loadLatestSnapshots(),
    fetchAll<{ id: string; name: string }>('facilities', 'id,name'),
  ])

  const stageType = new Map<string, PipelineStageType>()
  for (const s of stages) stageType.set(s.id, s.stage_type)

  // Segment option lists (built from all reqs/facilities, regardless of the active filter).
  const roleFamilyOptions = uniqueOptions(reqs.map((r) => r.role_family).filter(Boolean) as string[])
  const facilityOptions = facilities
    .map((f) => ({ value: f.id, label: f.name }))
    .sort((a, b) => a.label.localeCompare(b.label))

  // Role/facility defines *membership*; the date range defines the *time window*.
  // Membership scopes which apps/offers belong to the segment; the window then
  // narrows each entity by its own most relevant date — requisitions by when they
  // opened, applications by when they were received, offers by when they were made,
  // and spend by when it was incurred — so the whole view reads as "activity in
  // this range."
  const roleSet = new Set(segment.roleFamilies ?? [])
  const facSet = new Set(segment.facilityIds ?? [])
  const reqInScope = (r: ReqRow) =>
    (roleSet.size === 0 || (r.role_family != null && roleSet.has(r.role_family))) &&
    (facSet.size === 0 || (r.facility_id != null && facSet.has(r.facility_id)))
  const inWindow = makeInWindow(segment.from, segment.to)

  const segReqs = reqs.filter(reqInScope) // role/facility membership, all time
  const segReqIds = new Set(segReqs.map((r) => r.id))
  const segApps = apps.filter((a) => a.requisition_id != null && segReqIds.has(a.requisition_id))

  // Window-narrowed sets, each anchored on its own date.
  const windowReqs = segReqs.filter((r) => inWindow(r.opened_at ?? r.created_at))
  const winApps = segApps.filter((a) => inWindow(a.applied_at ?? a.created_at))
  const winOffers = offers.filter((o) => o.requisition_id != null && segReqIds.has(o.requisition_id) && inWindow(o.created_at))
  const winCosts = costs.filter((c) => inWindow(c.created_at))
  const winAppIds = new Set(winApps.map((a) => a.id))
  const winReady = ready.filter((r) => winAppIds.has(r.application_id))

  const funnel = computeFunnel(winApps, stageType)
  const reach = reachCounts(winApps, stageType)
  const priorByMetric = new Map(snapshots.map((s) => [s.metric, s.value]))

  const computed: Record<string, number | null> = {
    time_to_fill: timeToFill(windowReqs, segApps),
    offer_acceptance: offerAcceptance(winOffers),
    cost_per_hire: costPerHire(winCosts, winApps, roleSet.size + facSet.size > 0),
    cost_of_vacancy: costOfVacancy(windowReqs),
    interview_to_offer: reach.offer > 0 ? round(reach.interview / reach.offer, 2) : null,
    fill_rate: fillRate(windowReqs, segApps),
    credential_ready: credentialReady(winApps, winReady),
    hires: winApps.filter((a) => a.status === 'hired').length,
  }

  const kpis: Kpi[] = SPECS.map((spec) => {
    const value = computed[spec.key] ?? null
    const prior = priorByMetric.get(spec.key) ?? null
    return { ...spec, value, prior, whatToFix: whatToFix(spec, value) }
  })

  const recruiters = computeRecruiters(windowReqs, segApps, winOffers, stageType, users)

  return {
    kpis,
    funnel,
    recruiters,
    roleFamilyOptions,
    facilityOptions,
    empty: windowReqs.length === 0 && winApps.length === 0,
  }
}

// ---- individual metric computations ----

/** Days from a req opening to its first hire, averaged over reqs that produced a hire. */
function timeToFill(reqs: ReqRow[], apps: AppRow[]): number | null {
  const hireAtByReq = new Map<string, number>()
  for (const a of apps) {
    if (a.status !== 'hired' || !a.requisition_id || !a.updated_at) continue
    const t = new Date(a.updated_at).getTime()
    if (Number.isNaN(t)) continue
    const prev = hireAtByReq.get(a.requisition_id)
    if (prev == null || t > prev) hireAtByReq.set(a.requisition_id, t)
  }
  const durations: number[] = []
  for (const r of reqs) {
    const hiredAt = hireAtByReq.get(r.id)
    if (hiredAt == null) continue
    const opened = new Date(r.opened_at ?? r.created_at).getTime()
    if (Number.isNaN(opened)) continue
    durations.push(Math.max(0, (hiredAt - opened) / MS_PER_DAY))
  }
  if (durations.length === 0) return null
  return Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
}

function offerAcceptance(offers: OfferRow[]): number | null {
  const accepted = offers.filter((o) => o.status === 'accepted').length
  const declined = offers.filter((o) => o.status === 'declined').length
  const decided = accepted + declined
  return decided > 0 ? Math.round((accepted / decided) * 100) : null
}

function costPerHire(costs: CostRow[], apps: AppRow[], segmented: boolean): number | null {
  const hires = apps.filter((a) => a.status === 'hired').length
  if (hires === 0) return null
  const total = costs.reduce((s, c) => s + (c.amount ?? 0), 0)
  if (total === 0) return null
  // Costs are org-wide; under a segment we scale the headline only by that segment's hires.
  void segmented
  return Math.round(total / hires)
}

function costOfVacancy(reqs: ReqRow[]): number {
  let total = 0
  for (const r of reqs) {
    if (r.status !== 'open') continue
    const start = new Date(r.opened_at ?? r.created_at).getTime()
    if (Number.isNaN(start)) continue
    const days = Math.max(0, Math.round((Date.now() - start) / MS_PER_DAY))
    total += days * DEFAULT_DAILY_VACANCY_COST
  }
  return total
}

function fillRate(reqs: ReqRow[], apps: AppRow[]): number | null {
  const marketed = reqs.filter((r) => r.status !== 'draft' && r.status !== 'pending_approval')
  if (marketed.length === 0) return null
  const reqsWithHire = new Set(apps.filter((a) => a.status === 'hired' && a.requisition_id).map((a) => a.requisition_id))
  const filled = marketed.filter((r) => r.status === 'filled' || reqsWithHire.has(r.id)).length
  return Math.round((filled / marketed.length) * 100)
}

function credentialReady(apps: AppRow[], ready: ReadyRow[]): number | null {
  const activeIds = new Set(apps.filter((a) => a.status === 'active').map((a) => a.id))
  if (activeIds.size === 0) return null
  const readyActive = ready.filter((r) => r.placement_ready && activeIds.has(r.application_id)).length
  return Math.round((readyActive / activeIds.size) * 100)
}

// ---- funnel (cumulative reach) ----

function reachOrdinal(a: AppRow, stageType: Map<string, PipelineStageType>): number {
  if (a.status === 'hired') return BUCKET_ORDINAL.hired
  const type = a.current_stage_id ? stageType.get(a.current_stage_id) ?? null : null
  return BUCKET_ORDINAL[bucketFor(type)]
}

function reachCounts(apps: AppRow[], stageType: Map<string, PipelineStageType>): Record<FunnelBucket, number> {
  const counts: Record<FunnelBucket, number> = { applied: 0, screen: 0, interview: 0, offer: 0, hired: 0 }
  for (const a of apps) {
    const ord = reachOrdinal(a, stageType)
    for (const b of FUNNEL_ORDER) if (BUCKET_ORDINAL[b] <= ord) counts[b]++
  }
  return counts
}

function computeFunnel(apps: AppRow[], stageType: Map<string, PipelineStageType>): FunnelStage[] {
  const counts = reachCounts(apps, stageType)
  const stages: FunnelStage[] = FUNNEL_ORDER.map((key, i) => {
    const prev = i > 0 ? counts[FUNNEL_ORDER[i - 1]] : null
    const conversionPct = prev != null && prev > 0 ? Math.round((counts[key] / prev) * 100) : i === 0 ? null : 0
    return { key, label: FUNNEL_LABELS[key], count: counts[key], conversionPct, isBottleneck: false }
  })
  // Bottleneck = the transition with the lowest conversion (steepest drop), among
  // stages that actually have an inflow. Ignore the first stage (no conversion).
  let worstIdx = -1
  let worst = Infinity
  for (let i = 1; i < stages.length; i++) {
    const c = stages[i].conversionPct
    if (c == null) continue
    if (counts[FUNNEL_ORDER[i - 1]] === 0) continue
    if (c < worst) {
      worst = c
      worstIdx = i
    }
  }
  if (worstIdx >= 0) stages[worstIdx].isBottleneck = true
  return stages
}

// ---- recruiter rollup ----

function computeRecruiters(
  reqs: ReqRow[],
  apps: AppRow[],
  offers: OfferRow[],
  stageType: Map<string, PipelineStageType>,
  users: UserRow[],
): RecruiterRow[] {
  const nameById = new Map(users.map((u) => [u.id, u.full_name]))
  const byOwner = new Map<string, { reqs: ReqRow[] }>()
  for (const r of reqs) {
    const owner = r.hiring_manager_id ?? r.created_by ?? 'unassigned'
    if (!byOwner.has(owner)) byOwner.set(owner, { reqs: [] })
    byOwner.get(owner)!.reqs.push(r)
  }
  const appsByReq = new Map<string, AppRow[]>()
  for (const a of apps) {
    if (!a.requisition_id) continue
    if (!appsByReq.has(a.requisition_id)) appsByReq.set(a.requisition_id, [])
    appsByReq.get(a.requisition_id)!.push(a)
  }
  const offersByReq = new Map<string, OfferRow[]>()
  for (const o of offers) {
    if (!o.requisition_id) continue
    if (!offersByReq.has(o.requisition_id)) offersByReq.set(o.requisition_id, [])
    offersByReq.get(o.requisition_id)!.push(o)
  }

  const rows: RecruiterRow[] = []
  for (const [owner, { reqs: ownerReqs }] of byOwner) {
    const ownerApps = ownerReqs.flatMap((r) => appsByReq.get(r.id) ?? [])
    const reach = reachCounts(ownerApps, stageType)
    rows.push({
      id: owner,
      name: owner === 'unassigned' ? 'Unassigned' : nameById.get(owner) ?? '—',
      openReqs: ownerReqs.filter((r) => r.status === 'open').length,
      hires: ownerApps.filter((a) => a.status === 'hired').length,
      fillRatePct: fillRate(ownerReqs, ownerApps),
      avgTimeToFillDays: timeToFill(ownerReqs, ownerApps),
      interviewToOffer: reach.offer > 0 ? round(reach.interview / reach.offer, 2) : null,
    })
  }
  return rows.sort((a, b) => b.hires - a.hires || b.openReqs - a.openReqs)
}

// ---- "what to fix next" coaching line ----

function whatToFix(spec: KpiSpec, value: number | null): string {
  if (value == null) {
    switch (spec.key) {
      case 'offer_acceptance':
        return 'No decided offers yet — acceptance trends appear once offers are sent and answered.'
      case 'cost_per_hire':
        return 'Log recruiting spend (job boards, agency, referral) to unlock cost-per-hire.'
      case 'time_to_fill':
        return 'No hires recorded against opened reqs yet.'
      case 'credential_ready':
        return 'No active candidates in this segment.'
      default:
        return 'Not enough data in this segment yet.'
    }
  }
  const t = classify(spec, value)
  if (t === 'good') return `On track — at or beyond the ${fmtTargetWord(spec)} target.`
  switch (spec.key) {
    case 'time_to_fill':
      return 'Above benchmark — compress the interview→offer handoff and pre-clear credentials earlier.'
    case 'offer_acceptance':
      return 'Below benchmark — check comp vs market (FMV) and shorten time from final interview to offer.'
    case 'cost_per_hire':
      return 'Above benchmark — shift spend from agencies toward direct sourcing and referrals.'
    case 'cost_of_vacancy':
      return 'Prioritize the oldest open reqs — every open day compounds this number.'
    case 'interview_to_offer':
      return 'Too many interviews per offer — tighten screening so fewer weak candidates reach the panel.'
    case 'fill_rate':
      return 'Below benchmark — revisit stalled open reqs and sourcing coverage by role family.'
    case 'credential_ready':
      return 'Below benchmark — chase outstanding licenses/immunizations so candidates are placement-ready.'
    default:
      return 'Below benchmark — investigate the contributing stage.'
  }
}

function fmtTargetWord(spec: KpiSpec): string {
  return spec.target != null ? formatKpi(spec.target, spec.unit) : 'internal'
}

// ---------------------------------------------------------------------------
// Classification + formatting (shared with the page)
// ---------------------------------------------------------------------------
export function classify(spec: { benchmark: number | null; target: number | null; higherIsBetter: boolean }, value: number | null): KpiTone {
  if (value == null) return 'default'
  const { benchmark, target, higherIsBetter } = spec
  if (higherIsBetter) {
    if (target != null && value >= target) return 'good'
    if (benchmark != null && value >= benchmark) return 'good'
    if (benchmark != null && value < benchmark) return 'warn'
    return 'default'
  }
  if (target != null && value <= target) return 'good'
  if (benchmark != null && value <= benchmark) return 'good'
  if (benchmark != null && value > benchmark) return 'warn'
  return 'default'
}

export function formatKpi(value: number | null, unit: KpiUnit): string {
  if (value == null) return '—'
  switch (unit) {
    case 'days':
      return `${value}d`
    case 'pct':
      return `${value}%`
    case 'usd':
      return '$' + Math.round(value).toLocaleString()
    case 'ratio':
      return `${value.toFixed(1)}:1`
    case 'count':
      return value.toLocaleString()
  }
}

/** Signed delta vs the prior snapshot, expressed as an improvement direction. */
export function trendDelta(kpi: Kpi): { delta: number; improving: boolean } | null {
  if (kpi.value == null || kpi.prior == null) return null
  const delta = kpi.value - kpi.prior
  if (delta === 0) return { delta: 0, improving: true }
  const improving = kpi.higherIsBetter ? delta > 0 : delta < 0
  return { delta, improving }
}

function round(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function uniqueOptions(values: string[]): SegmentOption[] {
  return Array.from(new Set(values))
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }))
}

// ---------------------------------------------------------------------------
// Snapshot ledger — trend baseline + audit trail.
// ---------------------------------------------------------------------------

/** Latest stored value per metric at org level ('all' dimension), for trend baselines. */
async function loadLatestSnapshots(): Promise<{ metric: string; value: number | null }[]> {
  const { data } = await v2
    .from('kpi_snapshots')
    .select('metric,value,captured_at')
    .eq('dimension', 'org')
    .eq('dimension_value', 'all')
    .order('captured_at', { ascending: false })
    .limit(500)
  const rows = (data as SnapshotRow[] | null) ?? []
  const latest = new Map<string, number | null>()
  for (const r of rows) if (!latest.has(r.metric)) latest.set(r.metric, r.value)
  return Array.from(latest, ([metric, value]) => ({ metric, value }))
}

/**
 * Persist the current org-level KPI values to kpi_snapshots so the next load can
 * show trend vs this capture. Always captures the UNFILTERED org headline (one row
 * per metric, dimension='org'/'all'); segment-level snapshots are a follow-up.
 */
export async function captureSnapshot(): Promise<{ captured: number; error: string | null }> {
  const orgId = await currentOrgId()
  if (!orgId) return { captured: 0, error: 'No organization for current user.' }
  const { kpis } = await loadKpis({})
  const today = new Date().toISOString().slice(0, 10)
  const rows = kpis
    .filter((k) => k.value != null)
    .map((k) => ({
      org_id: orgId,
      metric: k.key,
      dimension: 'org',
      dimension_value: 'all',
      value: k.value,
      period_start: today,
      period_end: today,
    }))
  if (rows.length === 0) return { captured: 0, error: 'No KPI values to capture yet.' }
  // Upsert: kpi_snapshots is unique per (org, metric, dimension, dimension_value,
  // period_start, period_end), so re-capturing the same day refreshes in place
  // (and coexists with the nightly pg_cron job).
  const { error } = await v2
    .from('kpi_snapshots')
    .upsert(rows, { onConflict: 'org_id,metric,dimension,dimension_value,period_start,period_end' })
  return { captured: error ? 0 : rows.length, error: error?.message ?? null }
}
