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
import { supabase, demoMode } from './supabase'
import {
  PIPELINE_STAGES, STAGE_LABELS,
  type Candidate, type Application, type Job, type Profile,
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

export interface ExecutiveData {
  kpis: { openJobs: number; activeCandidates: number; applications: number; offers: number; hires: number; avgTimeToHire: number | null }
  funnel: { stage: string; count: number }[]
  conversion: { from: string; to: string; rate: number }[]
  appsOverTime: { label: string; count: number }[]
  leaderboard: { name: string; pipeline: number; hires: number }[]
  sources: { source: string; count: number }[]
}

export async function getExecutive(days: number | null): Promise<ExecutiveData> {
  const [{ data: cData }, { data: aData }, { data: jData }, { data: pData }] = await Promise.all([
    supabase.from('candidates').select('*'),
    supabase.from('applications').select('*'),
    supabase.from('jobs').select('*'),
    supabase.from('profiles').select('*'),
  ])
  const candidates = (cData as Candidate[]) ?? []
  const applications = (aData as Application[]) ?? []
  const jobs = (jData as Job[]) ?? []
  const profiles = (pData as Profile[]) ?? []

  const periodCands = candidates.filter((c) => inPeriod(c.created_at, days))
  const periodApps = applications.filter((a) => inPeriod(a.created_at, days))

  // Time to hire (days) for hired candidates with a start date.
  const tth: number[] = []
  for (const c of candidates) {
    if (c.current_stage === 'active' && c.start_date && c.created_at) {
      const d = (new Date(c.start_date).getTime() - new Date(c.created_at).getTime()) / 86400_000
      if (d >= 0 && d < 400) tth.push(d)
    }
  }
  const avgTimeToHire = tth.length ? Math.round(tth.reduce((s, n) => s + n, 0) / tth.length) : null

  const kpis = {
    openJobs: jobs.filter((j) => j.status === 'published').length,
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
  const { data: mine } = await supabase.from('candidates').select('*').eq('recruiter_id', userId)
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
    supabase.from('candidates').select('*'),
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
  const { data } = await supabase.from('candidates').select('*')
  const candidates = ((data as Candidate[]) ?? []).filter((c) => inPeriod(c.created_at, days))

  const perStage = PIPELINE_STAGES.map((stage) => ({
    stage: STAGE_LABELS[stage],
    count: candidates.filter((c) => c.current_stage === stage).length,
  }))

  // Stage aging: average days candidates have sat in their current stage
  // (now − last update). The stage with the highest aging is the bottleneck.
  const agingRaw = PIPELINE_STAGES.filter((s) => s !== 'active').map((stage) => {
    const here = candidates.filter((c) => c.current_stage === stage)
    const days = here.map((c) => (Date.now() - new Date(c.updated_at || c.created_at).getTime()) / 86400_000)
    const avg = days.length ? days.reduce((s, n) => s + n, 0) / days.length : 0
    return { stage: STAGE_LABELS[stage], avgDays: Math.round(avg), count: here.length }
  })
  const maxAging = Math.max(0, ...agingRaw.filter((a) => a.count > 0).map((a) => a.avgDays))
  const aging = agingRaw.map((a) => ({ ...a, bottleneck: a.count > 0 && a.avgDays === maxAging && maxAging > 0 }))

  const tth: number[] = []
  for (const c of candidates) {
    if (c.current_stage === 'active' && c.start_date && c.created_at) {
      const d = (new Date(c.start_date).getTime() - new Date(c.created_at).getTime()) / 86400_000
      if (d >= 0 && d < 400) tth.push(d)
    }
  }

  return {
    perStage,
    conversion: pipelineConversion(candidates),
    aging,
    avgTimeToHire: tth.length ? Math.round(tth.reduce((s, n) => s + n, 0) / tth.length) : null,
    totalActive: candidates.filter((c) => c.current_stage === 'active').length,
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
