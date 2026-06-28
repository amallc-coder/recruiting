// Analytics + recruiter benchmarking.
//
// Executive view (admins): company-wide KPIs, funnel, applications-over-time,
// recruiter leaderboard, and source breakdown — computed from the rows the
// admin can already read.
//
// Recruiter view: the caller's own KPIs plus an ANONYMOUS benchmark. In Supabase
// mode this comes from the SECURITY DEFINER `recruiter_dashboard` RPC, so the
// recruiter's client never reads a peer's raw row. In local/demo mode (where all
// data is visible anyway) we compute the same shape client-side and mask peers.
import { supabase, demoMode, selectAll } from './supabase'
import {
  PIPELINE_STAGES, STAGE_LABELS,
  INTERVIEW_STATUSES, INTERVIEW_STATUS_LABELS, OFFER_STATUSES, OFFER_STATUS_LABELS,
  COST_CATEGORIES, COST_CATEGORY_LABELS,
  type Candidate, type Application, type Job, type Profile, type Interview, type Offer,
  type RecruitingCost,
} from './types'

export interface Period { label: string; days: number | null }
export const PERIODS: Period[] = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last year', days: 365 },
  { label: 'All time', days: null },
]

const PEER_ALIASES = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel',
  'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa',
  'Quebec', 'Romeo', 'Sierra', 'Tango',
]

function sinceMs(days: number | null): number {
  return days == null ? 0 : Date.now() - days * 86400_000
}
function inPeriod(iso: string | null | undefined, days: number | null): boolean {
  if (days == null) return true
  if (!iso) return false
  return new Date(iso).getTime() >= sinceMs(days)
}

const LIVE = (c: Candidate) => !['active', 'declined', 'no_response'].includes(c.current_stage)

// Stage-to-stage conversion in the linear pipeline: a candidate at stage K has
// reached every earlier stage (terminal "active" = final stage). Declined /
// no-response are excluded since their drop-off stage isn't known without history.
function pipelineConversion(candidates: Candidate[]): { from: string; to: string; rate: number }[] {
  const idxOf = (c: Candidate) =>
    c.current_stage === 'active' ? PIPELINE_STAGES.length - 1 : PIPELINE_STAGES.indexOf(c.current_stage)
  const reached = PIPELINE_STAGES.map((_, i) => candidates.filter((c) => idxOf(c) >= i).length)
  return PIPELINE_STAGES.slice(0, -1).map((stage, i) => ({
    from: STAGE_LABELS[stage],
    to: STAGE_LABELS[PIPELINE_STAGES[i + 1]],
    rate: reached[i] ? Math.round((reached[i + 1] / reached[i]) * 100) : 0,
  }))
}

// ---- Candidate-journey timestamps (skew-safe) -------------------------------
// Time-based KPIs are computed from the real recorded timeline in
// candidate_stage_history (each stage change is timestamped + attributed when a
// recruiter acts on the platform). Bulk-IMPORTED candidates carry a stage but
// not a genuine recorded journey — their history is stamped at import time — so
// they are EXCLUDED from every duration metric to avoid skewing results. They
// still count toward volume metrics (totals, funnel, counts).
export const isNativeCandidate = (c: Pick<Candidate, 'source'>) =>
  !/^(import|sharepoint)$/i.test((c.source || '').trim())

interface HistRow { candidate_id: string; to_stage: string; created_at: string }
type Journeys = Map<string, { entered: Record<string, number>; last: number }>

async function loadStageHistory(): Promise<HistRow[]> {
  const { data } = await selectAll('candidate_stage_history', 'candidate_id,to_stage,created_at')
  return (data as HistRow[]) ?? []
}

/** First timestamp each NATIVE candidate entered each stage (ms). */
function buildJourneys(history: HistRow[], candidates: Candidate[], days: number | null): Journeys {
  const native = new Set(candidates.filter(isNativeCandidate).map((c) => c.id))
  const rows = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const map: Journeys = new Map()
  for (const h of rows) {
    if (!native.has(h.candidate_id)) continue
    const t = new Date(h.created_at).getTime()
    let j = map.get(h.candidate_id)
    if (!j) { j = { entered: {}, last: 0 }; map.set(h.candidate_id, j) }
    if (j.entered[h.to_stage] === undefined) j.entered[h.to_stage] = t
    if (t > j.last) j.last = t
  }
  if (days != null) {
    const since = sinceMs(days)
    for (const [id, j] of map) {
      const start = j.entered.sourced ?? Math.min(...Object.values(j.entered))
      if (!(start >= since)) map.delete(id)
    }
  }
  return map
}

function durationsDays(journeys: Journeys, from: string, to: string): number[] {
  const out: number[] = []
  for (const j of journeys.values()) {
    const a = j.entered[from], b = j.entered[to]
    if (a != null && b != null && b >= a) out.push((b - a) / 86400_000)
  }
  return out
}
function durStat(arr: number[]) {
  if (!arr.length) return { avgDays: null as number | null, medianDays: null as number | null, n: 0 }
  const sorted = [...arr].sort((x, y) => x - y)
  return {
    avgDays: Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10,
    medianDays: Math.round(sorted[Math.floor((sorted.length - 1) / 2)] * 10) / 10,
    n: arr.length,
  }
}

export interface ExecutiveData {
  kpis: { openJobs: number; openPositions: number; activeCandidates: number; applications: number; offers: number; hires: number; avgTimeToHire: number | null }
  funnel: { stage: string; count: number }[]
  conversion: { from: string; to: string; rate: number }[]
  appsOverTime: { label: string; count: number }[]
  leaderboard: { name: string; pipeline: number; hires: number }[]
  sources: { source: string; count: number }[]
}

export async function getExecutive(days: number | null): Promise<ExecutiveData> {
  const [{ data: cData }, { data: aData }, { data: jData }, { data: pData }, history] = await Promise.all([
    selectAll('candidates', '*'),
    selectAll('applications', '*'),
    selectAll('jobs', '*'),
    supabase.from('profiles').select('*'),
    loadStageHistory(),
  ])
  const candidates = (cData as Candidate[]) ?? []
  const applications = (aData as Application[]) ?? []
  const jobs = (jData as Job[]) ?? []
  const profiles = (pData as Profile[]) ?? []

  const periodCands = candidates.filter((c) => inPeriod(c.created_at, days))
  const periodApps = applications.filter((a) => inPeriod(a.created_at, days))

  // Time to hire from the real recorded journey (sourced → active), native
  // candidates only — imported records are excluded so the metric isn't skewed.
  const journeys = buildJourneys(history, candidates, days)
  const avgTimeToHire = durStat(durationsDays(journeys, 'sourced', 'active')).avgDays

  const publishedJobs = jobs.filter((j) => j.status === 'published')
  const kpis = {
    openJobs: publishedJobs.length,
    openPositions: publishedJobs.reduce((s, j) => s + (j.openings_remaining ?? j.openings ?? 1), 0),
    activeCandidates: candidates.filter((c) => c.current_stage !== 'declined' && c.current_stage !== 'no_response').length,
    applications: periodApps.length,
    offers: candidates.filter((c) => c.current_stage === 'offer' || c.current_stage === 'accepted').length,
    hires: periodCands.filter((c) => c.current_stage === 'active').length,
    avgTimeToHire,
  }

  const funnel = PIPELINE_STAGES.map((stage) => ({
    stage: STAGE_LABELS[stage],
    count: candidates.filter((c) => c.current_stage === stage).length,
  }))

  const conversion = pipelineConversion(candidates)

  // Applications over the last 8 weeks (or candidates if no applications yet).
  const series = periodApps.length ? periodApps.map((a) => a.created_at) : periodCands.map((c) => c.created_at)
  const appsOverTime = weeklyBuckets(series, 8)

  const leaderboard = profiles
    .filter((p) => p.active && p.role === 'recruiter')
    .map((p) => ({
      name: p.full_name || p.email,
      pipeline: candidates.filter((c) => c.recruiter_id === p.id && LIVE(c)).length,
      hires: candidates.filter((c) => c.recruiter_id === p.id && c.current_stage === 'active').length,
    }))
    .filter((r) => r.pipeline > 0 || r.hires > 0)
    .sort((a, b) => b.pipeline + b.hires * 2 - (a.pipeline + a.hires * 2))

  const srcMap: Record<string, number> = {}
  for (const c of periodCands) {
    const s = (c.source || 'Unknown').trim() || 'Unknown'
    srcMap[s] = (srcMap[s] ?? 0) + 1
  }
  const sources = Object.entries(srcMap).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count)

  return { kpis, funnel, conversion, appsOverTime, leaderboard, sources }
}

function weeklyBuckets(isoDates: (string | null | undefined)[], weeks: number): { label: string; count: number }[] {
  const now = Date.now()
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * 7 * 86400_000
    return { end, count: 0 }
  })
  for (const iso of isoDates) {
    if (!iso) continue
    const t = new Date(iso).getTime()
    for (let i = 0; i < buckets.length; i++) {
      const start = buckets[i].end - 7 * 86400_000
      if (t > start && t <= buckets[i].end) { buckets[i].count++; break }
    }
  }
  return buckets.map((b) => ({
    label: new Date(b.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    count: b.count,
  }))
}

export interface RecruiterData {
  me: { activity: number; hires: number; offers: number; pipeline: number }
  rank: number
  of: number
  percentile: number
  benchmark: { avg: number; median: number; top: number }
  leaderboard: { label: string; value: number }[]
  personalFunnel: { stage: string; count: number }[]
}

export async function getRecruiter(userId: string, days: number | null): Promise<RecruiterData | null> {
  // Personal funnel uses only the recruiter's own candidates (RLS-visible).
  const { data: mine } = await selectAll('candidates', '*', (q) => q.eq('recruiter_id', userId))
  const myCands = (mine as Candidate[]) ?? []
  const personalFunnel = PIPELINE_STAGES.map((stage) => ({
    stage: STAGE_LABELS[stage],
    count: myCands.filter((c) => c.current_stage === stage).length,
  }))

  if (!demoMode) {
    // Server-computed benchmark — no peer rows ever reach the client.
    const rpc = (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc
    try {
      const { data, error } = await rpc('recruiter_dashboard', { days })
      if (error || !data) return null
      const d = data as Omit<RecruiterData, 'personalFunnel'>
      return { ...d, personalFunnel }
    } catch {
      return null
    }
  }

  // Demo mode: all data is local, so compute + mask client-side.
  const [{ data: cData }, { data: pData }] = await Promise.all([
    selectAll('candidates', '*'),
    supabase.from('profiles').select('*'),
  ])
  const candidates = (cData as Candidate[]) ?? []
  const recruiters = ((pData as Profile[]) ?? []).filter((p) => p.active && p.role === 'recruiter')

  const stats = recruiters.map((p) => ({
    id: p.id,
    activity: candidates.filter((c) => c.recruiter_id === p.id && inPeriod(c.created_at, days)).length,
    hires: candidates.filter((c) => c.recruiter_id === p.id && c.current_stage === 'active').length,
    offers: candidates.filter((c) => c.recruiter_id === p.id && (c.current_stage === 'offer' || c.current_stage === 'accepted')).length,
    pipeline: candidates.filter((c) => c.recruiter_id === p.id && LIVE(c)).length,
  }))
  const mineStat = stats.find((s) => s.id === userId) ?? { id: userId, activity: 0, hires: 0, offers: 0, pipeline: 0 }
  const activities = stats.map((s) => s.activity)
  const cnt = stats.length || 1
  const rank = 1 + stats.filter((s) => s.activity > mineStat.activity).length
  const sorted = [...activities].sort((a, b) => a - b)
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0
  const avg = activities.length ? activities.reduce((s, n) => s + n, 0) / activities.length : 0

  const ranked = [...stats].sort((a, b) => b.activity - a.activity)
  let peer = 0
  const leaderboard = ranked.map((s, i) => ({
    label: s.id === userId ? 'You' : `Recruiter ${PEER_ALIASES[peer++] ?? `#${i + 1}`}`,
    value: s.activity,
  }))

  return {
    me: { activity: mineStat.activity, hires: mineStat.hires, offers: mineStat.offers, pipeline: mineStat.pipeline },
    rank,
    of: cnt,
    percentile: cnt > 1 ? Math.round((100 * (cnt - rank)) / (cnt - 1)) : 100,
    benchmark: { avg: Math.round(avg * 10) / 10, median, top: activities.length ? Math.max(...activities) : 0 },
    leaderboard,
    personalFunnel,
  }
}

export interface PipelineData {
  perStage: { stage: string; count: number }[]
  conversion: { from: string; to: string; rate: number }[]
  aging: { stage: string; avgDays: number; count: number; bottleneck: boolean }[]
  avgTimeToHire: number | null
  totalActive: number
}

export async function getPipeline(days: number | null): Promise<PipelineData> {
  const [{ data: cData }, history] = await Promise.all([
    selectAll('candidates', '*'),
    loadStageHistory(),
  ])
  const allCandidates = (cData as Candidate[]) ?? []
  const candidates = allCandidates.filter((c) => inPeriod(c.created_at, days))

  const perStage = PIPELINE_STAGES.map((stage) => ({
    stage: STAGE_LABELS[stage],
    count: candidates.filter((c) => c.current_stage === stage).length,
  }))

  // Stage aging: average days NATIVE candidates have sat in their current stage,
  // measured from when they actually entered it (recorded timeline). Imported
  // records are excluded so a recent bulk import can't mask a real bottleneck.
  const journeys = buildJourneys(history, allCandidates, days)
  const byId = new Map(allCandidates.map((c) => [c.id, c]))
  const agingRaw = PIPELINE_STAGES.filter((s) => s !== 'active').map((stage) => {
    const ds: number[] = []
    for (const [id, j] of journeys) {
      const c = byId.get(id)
      if (c?.current_stage === stage && j.entered[stage] != null) ds.push((Date.now() - j.entered[stage]) / 86400_000)
    }
    const avg = ds.length ? ds.reduce((s, n) => s + n, 0) / ds.length : 0
    return { stage: STAGE_LABELS[stage], avgDays: Math.round(avg), count: ds.length }
  })
  const maxAging = Math.max(0, ...agingRaw.filter((a) => a.count > 0).map((a) => a.avgDays))
  const aging = agingRaw.map((a) => ({ ...a, bottleneck: a.count > 0 && a.avgDays === maxAging && maxAging > 0 }))

  return {
    perStage,
    conversion: pipelineConversion(candidates),
    aging,
    avgTimeToHire: durStat(durationsDays(journeys, 'sourced', 'active')).avgDays,
    totalActive: candidates.filter((c) => c.current_stage === 'active').length,
  }
}

export interface JourneyData {
  qualifying: number
  excludedImports: number
  kpis: { key: string; label: string; avgDays: number | null; medianDays: number | null; n: number }[]
}

const JOURNEY_MILESTONES: { key: string; label: string; from: string; to: string }[] = [
  { key: 'src_int', label: 'Sourced → Interview', from: 'sourced', to: 'interview' },
  { key: 'int_off', label: 'Interview → Offer', from: 'interview', to: 'offer' },
  { key: 'off_hire', label: 'Offer → Hired', from: 'offer', to: 'active' },
  { key: 'src_off', label: 'Time to Offer (sourced → offer)', from: 'sourced', to: 'offer' },
  { key: 'src_hire', label: 'Time to Hire (sourced → hired)', from: 'sourced', to: 'active' },
]

/** Candidate-journey time KPIs. Computed only from natively-tracked candidates;
 *  imported records are excluded and reported separately to avoid skew. */
export async function getJourney(days: number | null): Promise<JourneyData> {
  const [{ data: cData }, history] = await Promise.all([
    selectAll('candidates', 'id,source,current_stage,created_at'),
    loadStageHistory(),
  ])
  const candidates = (cData as Candidate[]) ?? []
  const journeys = buildJourneys(history, candidates, days)
  const kpis = JOURNEY_MILESTONES.map((m) => ({
    key: m.key, label: m.label, ...durStat(durationsDays(journeys, m.from, m.to)),
  }))
  return {
    qualifying: journeys.size,
    excludedImports: candidates.filter((c) => !isNativeCandidate(c)).length,
    kpis,
  }
}

export interface InterviewData {
  kpis: { scheduled: number; completed: number; cancelled: number; noShow: number; rescheduled: number; avgScore: number | null; feedbackRate: number }
  byStatus: { status: string; count: number }[]
  overTime: { label: string; count: number }[]
  interviewers: { name: string; completed: number; avgScore: number | null }[]
}

export async function getInterviews(days: number | null): Promise<InterviewData> {
  const [{ data: iData }, { data: pData }] = await Promise.all([
    selectAll('interviews', '*'),
    supabase.from('profiles').select('id,full_name,email'),
  ])
  const interviews = ((iData as Interview[]) ?? []).filter((x) => inPeriod(x.scheduled_at || x.created_at, days))
  const profiles = (pData as Profile[]) ?? []
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.full_name || 'Unassigned'

  const by = (s: string) => interviews.filter((i) => i.status === s).length
  const completed = interviews.filter((i) => i.status === 'completed')
  const scores = completed.map((i) => i.score).filter((s): s is number => s != null)
  const withFeedback = completed.filter((i) => (i.feedback ?? '').trim()).length

  const kpis = {
    scheduled: by('scheduled'),
    completed: completed.length,
    cancelled: by('cancelled'),
    noShow: by('no_show'),
    rescheduled: by('rescheduled'),
    avgScore: scores.length ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10 : null,
    feedbackRate: completed.length ? Math.round((withFeedback / completed.length) * 100) : 0,
  }
  const byStatus = INTERVIEW_STATUSES.map((s) => ({ status: INTERVIEW_STATUS_LABELS[s], count: by(s) }))
  const overTime = weeklyBuckets(interviews.map((i) => i.scheduled_at || i.created_at), 8)

  const intMap = new Map<string, Interview[]>()
  for (const i of completed) {
    const k = i.interviewer_id ?? 'none'
    ;(intMap.get(k) ?? intMap.set(k, []).get(k)!).push(i)
  }
  const interviewers = [...intMap.entries()].map(([id, list]) => {
    const ss = list.map((x) => x.score).filter((s): s is number => s != null)
    return { name: nameOf(id === 'none' ? null : id), completed: list.length, avgScore: ss.length ? Math.round((ss.reduce((a, b) => a + b, 0) / ss.length) * 10) / 10 : null }
  }).sort((a, b) => b.completed - a.completed)

  return { kpis, byStatus, overTime, interviewers }
}

export interface OfferData {
  kpis: { sent: number; accepted: number; declined: number; negotiating: number; expired: number; acceptanceRate: number; avgSalary: number | null }
  byStatus: { status: string; count: number }[]
  acceptanceTrend: { label: string; count: number }[]
  salaryBuckets: { range: string; count: number }[]
}

export async function getOffers(days: number | null): Promise<OfferData> {
  const { data } = await selectAll('offers', '*')
  const offers = ((data as Offer[]) ?? []).filter((o) => inPeriod(o.sent_at || o.created_at, days))

  const by = (s: string) => offers.filter((o) => o.status === s).length
  const accepted = by('accepted')
  const decided = accepted + by('declined')
  const salaries = offers.map((o) => o.salary).filter((s): s is number => s != null)

  const kpis = {
    sent: offers.filter((o) => o.status !== 'pending').length,
    accepted,
    declined: by('declined'),
    negotiating: by('negotiating'),
    expired: by('expired'),
    acceptanceRate: decided ? Math.round((accepted / decided) * 100) : 0,
    avgSalary: salaries.length ? Math.round(salaries.reduce((s, n) => s + n, 0) / salaries.length) : null,
  }
  const byStatus = OFFER_STATUSES.map((s) => ({ status: OFFER_STATUS_LABELS[s], count: by(s) }))
  const acceptanceTrend = weeklyBuckets(offers.filter((o) => o.status === 'accepted').map((o) => o.sent_at || o.created_at), 8)

  // Salary distribution in $20k buckets.
  const buckets: Record<string, number> = {}
  for (const s of salaries) {
    const lo = Math.floor(s / 20000) * 20
    const key = `$${lo}–${lo + 20}k`
    buckets[key] = (buckets[key] ?? 0) + 1
  }
  const salaryBuckets = Object.entries(buckets)
    .map(([range, count]) => ({ range, count }))
    .sort((a, b) => parseInt(a.range.slice(1)) - parseInt(b.range.slice(1)))

  return { kpis, byStatus, acceptanceTrend, salaryBuckets }
}

export interface FinanceData {
  kpis: { totalSpend: number; costPerHire: number | null; costPerInterview: number | null; costPerOffer: number | null; hires: number }
  byCategory: { category: string; amount: number }[]
  trend: { label: string; amount: number }[]
}

export async function getFinance(days: number | null): Promise<FinanceData> {
  const [{ data: costData }, { data: cData }, { data: iData }, { data: oData }] = await Promise.all([
    selectAll('recruiting_costs', '*'),
    selectAll('candidates', '*'),
    selectAll('interviews', '*'),
    selectAll('offers', '*'),
  ])
  const costs = ((costData as RecruitingCost[]) ?? []).filter((c) => inPeriod(c.period || c.created_at, days))
  const candidates = ((cData as Candidate[]) ?? []).filter((c) => inPeriod(c.created_at, days))
  const interviews = ((iData as Interview[]) ?? []).filter((i) => i.status === 'completed')
  const offers = ((oData as Offer[]) ?? []).filter((o) => o.status !== 'pending')

  const totalSpend = costs.reduce((s, c) => s + (c.amount || 0), 0)
  const hires = candidates.filter((c) => c.current_stage === 'active').length
  const per = (n: number) => (n > 0 ? Math.round(totalSpend / n) : null)

  const catMap: Record<string, number> = {}
  for (const c of costs) catMap[c.category] = (catMap[c.category] ?? 0) + (c.amount || 0)
  const byCategory = COST_CATEGORIES.map((cat) => ({ category: COST_CATEGORY_LABELS[cat], amount: Math.round(catMap[cat] ?? 0) }))
    .filter((x) => x.amount > 0)

  // Monthly spend trend (last 6 months).
  const now = new Date()
  const trend = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7)
    const amount = costs.filter((c) => (c.period || c.created_at || '').slice(0, 7) === key).reduce((s, c) => s + (c.amount || 0), 0)
    return { label: d.toLocaleDateString(undefined, { month: 'short' }), amount: Math.round(amount) }
  })

  return {
    kpis: { totalSpend: Math.round(totalSpend), costPerHire: per(hires), costPerInterview: per(interviews.length), costPerOffer: per(offers.length), hires },
    byCategory,
    trend,
  }
}

/** Best-effort audit write for permission-sensitive actions. */
export async function logAudit(action: string, meta: Record<string, unknown> = {}): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    await supabase.from('audit_logs').insert({
      user_id: data.session?.user?.id ?? null,
      action,
      meta,
      created_at: new Date().toISOString(),
    })
  } catch {
    /* non-fatal */
  }
}
