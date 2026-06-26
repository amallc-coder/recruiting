import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { Trophy, TrendingUp, Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Spinner, StatCard } from '../components/ui'
import {
  PERIODS, getExecutive, getRecruiter, getPipeline, getInterviews, getOffers, logAudit,
  type ExecutiveData, type RecruiterData, type PipelineData, type InterviewData, type OfferData,
} from '../lib/analytics'

const BAR_COLORS = ['#6e9a6a', '#cd7c4f', '#be4b43', '#577f54', '#b4663b', '#a9a18d', '#1f1d1a']

function ChartCard({ title, children, height = 280, empty }: {
  title: string; children: React.ReactElement; height?: number; empty?: string
}) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-ink">{title}</h2>
      {empty ? (
        <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>{empty}</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
      )}
    </div>
  )
}

type AdminView = 'executive' | 'pipeline' | 'interviews' | 'offers'

export function Analytics() {
  const { isAdmin, profile } = useAuth()
  const [days, setDays] = useState<number | null>(90)
  const [view, setView] = useState<AdminView>('executive')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{isAdmin ? 'Analytics' : 'My performance'}</h1>
          <p className="text-sm text-muted">
            {isAdmin
              ? 'Company-wide hiring health, funnel, pipeline velocity, and recruiter performance.'
              : 'Your hiring metrics and how you compare to the team — peers stay anonymous.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex gap-1 rounded-lg border border-line bg-surface p-0.5">
              {([['executive', 'Executive'], ['pipeline', 'Pipeline'], ['interviews', 'Interviews'], ['offers', 'Offers']] as [AdminView, string][]).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    view === v ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                onClick={() => setDays(p.days)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  days === p.days ? 'bg-ink text-paper' : 'text-muted hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isAdmin
        ? (view === 'executive' ? <ExecutiveView days={days} />
          : view === 'pipeline' ? <PipelineView days={days} />
          : view === 'interviews' ? <InterviewsView days={days} />
          : <OffersView days={days} />)
        : <RecruiterView userId={profile?.id ?? ''} days={days} />}
    </div>
  )
}

function InterviewsView({ days }: { days: number | null }) {
  const [data, setData] = useState<InterviewData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true; setLoading(true)
    getInterviews(days).then((d) => { if (active) { setData(d); setLoading(false) } })
    logAudit('dashboard_viewed', { view: 'interviews', days })
    return () => { active = false }
  }, [days])
  if (loading || !data) return <Spinner label="Loading interviews…" />
  const k = data.kpis
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Scheduled" value={k.scheduled} />
        <StatCard label="Completed" value={k.completed} tone="good" />
        <StatCard label="No-shows" value={k.noShow} tone={k.noShow > 0 ? 'warn' : 'default'} />
        <StatCard label="Cancelled" value={k.cancelled} />
        <StatCard label="Avg score" value={k.avgScore == null ? '—' : `${k.avgScore}/5`} />
        <StatCard label="Feedback rate" value={`${k.feedbackRate}%`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Interviews by status">
          <BarChart data={data.byStatus}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="status" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]}>
              {data.byStatus.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
        <ChartCard title="Interviews over time">
          <LineChart data={data.overTime}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line isAnimationActive={false} type="monotone" dataKey="count" stroke="#6e9a6a" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartCard>
      </div>
      <ChartCard
        title="Interviewer leaderboard"
        height={Math.max(220, data.interviewers.length * 40)}
        empty={data.interviewers.length === 0 ? 'No completed interviews yet' : undefined}
      >
        <BarChart data={data.interviewers} layout="vertical" margin={{ left: 30 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e2d7" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar isAnimationActive={false} dataKey="completed" fill="#577f54" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  )
}

function OffersView({ days }: { days: number | null }) {
  const [data, setData] = useState<OfferData | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true; setLoading(true)
    getOffers(days).then((d) => { if (active) { setData(d); setLoading(false) } })
    logAudit('dashboard_viewed', { view: 'offers', days })
    return () => { active = false }
  }, [days])
  if (loading || !data) return <Spinner label="Loading offers…" />
  const k = data.kpis
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Sent" value={k.sent} />
        <StatCard label="Accepted" value={k.accepted} tone="good" />
        <StatCard label="Declined" value={k.declined} tone={k.declined > 0 ? 'warn' : 'default'} />
        <StatCard label="Negotiating" value={k.negotiating} />
        <StatCard label="Acceptance rate" value={`${k.acceptanceRate}%`} tone="good" />
        <StatCard label="Avg salary" value={k.avgSalary == null ? '—' : `$${Math.round(k.avgSalary / 1000)}k`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Offers by status">
          <BarChart data={data.byStatus}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="status" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]}>
              {data.byStatus.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
        <ChartCard title="Salary distribution" empty={data.salaryBuckets.length === 0 ? 'No salary data yet' : undefined}>
          <BarChart data={data.salaryBuckets}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="range" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="count" fill="#cd7c4f" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
      <ChartCard title="Offer acceptances over time">
        <LineChart data={data.acceptanceTrend}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Line isAnimationActive={false} type="monotone" dataKey="count" stroke="#6e9a6a" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ChartCard>
    </div>
  )
}

function PipelineView({ days }: { days: number | null }) {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getPipeline(days).then((d) => { if (active) { setData(d); setLoading(false) } })
    logAudit('dashboard_viewed', { view: 'pipeline', days })
    return () => { active = false }
  }, [days])

  if (loading || !data) return <Spinner label="Analyzing pipeline…" />
  const bottleneck = data.aging.find((a) => a.bottleneck)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active hires" value={data.totalActive} tone="good" />
        <StatCard label="Avg time to hire" value={data.avgTimeToHire == null ? '—' : `${data.avgTimeToHire}d`} />
        <StatCard label="Bottleneck stage" value={bottleneck ? bottleneck.stage : '—'} tone={bottleneck ? 'warn' : 'default'} />
        <StatCard label="Bottleneck aging" value={bottleneck ? `${bottleneck.avgDays}d` : '—'} tone={bottleneck ? 'warn' : 'default'} />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Stage conversion</h2>
        {data.conversion.every((c) => c.rate === 0) ? (
          <div className="text-sm text-muted">Not enough pipeline data yet.</div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {data.conversion.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="rounded-lg border border-line bg-paper px-3 py-2 text-center">
                  <div className="text-lg font-semibold tnum text-ink">{c.rate}%</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">{c.from} → {c.to}</div>
                </div>
                {i < data.conversion.length - 1 && <span className="text-line">›</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Candidates per stage">
          <BarChart data={data.perStage}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]}>
              {data.perStage.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Avg days in stage (aging)" empty={data.aging.every((a) => a.count === 0) ? 'No active candidates' : undefined}>
          <BarChart data={data.aging} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e2d7" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="stage" width={120} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="avgDays" radius={[0, 6, 6, 0]}>
              {data.aging.map((a, i) => <Cell key={i} fill={a.bottleneck ? '#be4b43' : '#cd7c4f'} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>
    </div>
  )
}

function ExecutiveView({ days }: { days: number | null }) {
  const [data, setData] = useState<ExecutiveData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getExecutive(days).then((d) => { if (active) { setData(d); setLoading(false) } })
    logAudit('dashboard_viewed', { view: 'executive', days })
    return () => { active = false }
  }, [days])

  if (loading || !data) return <Spinner label="Crunching numbers…" />
  const k = data.kpis

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Open jobs" value={k.openJobs} />
        <StatCard label="Active candidates" value={k.activeCandidates} />
        <StatCard label="Applications" value={k.applications} hint="in period" />
        <StatCard label="Offers out" value={k.offers} tone={k.offers > 0 ? 'good' : 'default'} />
        <StatCard label="Hires" value={k.hires} tone="good" />
        <StatCard label="Avg time to hire" value={k.avgTimeToHire == null ? '—' : `${k.avgTimeToHire}d`} />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">Funnel conversion</h2>
        {data.conversion.every((c) => c.rate === 0) ? (
          <div className="text-sm text-muted">Not enough pipeline data yet.</div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {data.conversion.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="rounded-lg border border-line bg-paper px-3 py-2 text-center">
                  <div className="text-lg font-semibold tnum text-ink">{c.rate}%</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">{c.from} → {c.to}</div>
                </div>
                {i < data.conversion.length - 1 && <span className="text-line">›</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Hiring funnel">
          <BarChart data={data.funnel}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]}>
              {data.funnel.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Applications over time">
          <LineChart data={data.appsOverTime}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line isAnimationActive={false} type="monotone" dataKey="count" stroke="#6e9a6a" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Recruiter leaderboard"
          height={Math.max(220, data.leaderboard.length * 40)}
          empty={data.leaderboard.length === 0 ? 'No recruiter activity yet' : undefined}
        >
          <BarChart data={data.leaderboard} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e2d7" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="pipeline" stackId="a" fill="#6e9a6a" radius={[0, 0, 0, 0]} name="In pipeline" />
            <Bar isAnimationActive={false} dataKey="hires" stackId="a" fill="#cd7c4f" radius={[0, 6, 6, 0]} name="Hires" />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Candidate sources"
          height={Math.max(220, data.sources.length * 36)}
          empty={data.sources.length === 0 ? 'No source data yet' : undefined}
        >
          <BarChart data={data.sources} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e2d7" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="source" width={120} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="count" fill="#577f54" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  )
}

function RecruiterView({ userId, days }: { userId: string; days: number | null }) {
  const [data, setData] = useState<RecruiterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true); setUnavailable(false)
    getRecruiter(userId, days).then((d) => {
      if (!active) return
      if (!d) setUnavailable(true)
      setData(d)
      setLoading(false)
    })
    logAudit('benchmark_viewed', { days })
    return () => { active = false }
  }, [userId, days])

  if (loading) return <Spinner label="Loading your performance…" />
  if (unavailable || !data) {
    return (
      <div className="card p-6 text-sm text-muted">
        <div className="mb-1 font-medium text-ink">Benchmark not available yet</div>
        Team benchmarking needs the latest database functions. An admin can run the updated
        <code className="mx-1">schema.sql</code> in Supabase to enable it. Your personal metrics still appear once you have assigned candidates.
      </div>
    )
  }

  const leaderMax = Math.max(1, ...data.leaderboard.map((l) => l.value))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="My activity" value={data.me.activity} hint="candidates in period" />
        <StatCard label="In pipeline" value={data.me.pipeline} />
        <StatCard label="Offers" value={data.me.offers} />
        <StatCard label="Hires" value={data.me.hires} tone="good" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card flex flex-col items-center justify-center p-6 text-center">
          <Trophy size={26} className="text-clay-500" />
          <div className="mt-2 text-3xl font-semibold tracking-tight text-ink tnum">#{data.rank}</div>
          <div className="text-xs text-muted">of {data.of} recruiters</div>
        </div>
        <div className="card flex flex-col items-center justify-center p-6 text-center">
          <TrendingUp size={26} className="text-sage-600" />
          <div className="mt-2 text-3xl font-semibold tracking-tight text-ink tnum">{data.percentile}%</div>
          <div className="text-xs text-muted">you outperform this share of peers</div>
        </div>
        <div className="card p-6">
          <div className="stat-label mb-2">Team benchmark</div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">You</dt><dd className="font-semibold text-ink tnum">{data.me.activity}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Team average</dt><dd className="font-medium text-ink tnum">{data.benchmark.avg}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Median</dt><dd className="font-medium text-ink tnum">{data.benchmark.median}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Top performer</dt><dd className="font-medium text-ink tnum">{data.benchmark.top}</dd></div>
          </dl>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">How you compare</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-muted">
            <Lock size={9} /> peers anonymized
          </span>
        </div>
        <p className="mb-4 text-xs text-muted">Activity by recruiter. Peer identities are hidden and not clickable.</p>
        <div className="space-y-2">
          {data.leaderboard.map((l, i) => {
            const isMe = l.label === 'You'
            return (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-32 shrink-0 text-xs ${isMe ? 'font-semibold text-ink' : 'text-muted'}`}>{l.label}</div>
                <div className="h-5 flex-1 overflow-hidden rounded bg-paper">
                  <div
                    className={`h-full rounded ${isMe ? 'bg-sage-500' : 'bg-clay-300'}`}
                    style={{ width: `${Math.max(4, (l.value / leaderMax) * 100)}%` }}
                  />
                </div>
                <div className={`w-8 text-right text-xs tnum ${isMe ? 'font-semibold text-ink' : 'text-muted'}`}>{l.value}</div>
              </div>
            )
          })}
        </div>
      </div>

      <ChartCard title="My pipeline funnel">
        <BarChart data={data.personalFunnel}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
          <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]}>
            {data.personalFunnel.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ChartCard>
    </div>
  )
}
