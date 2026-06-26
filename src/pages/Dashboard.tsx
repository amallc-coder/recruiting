import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  PIPELINE_STAGES, STAGE_LABELS, ROLE_LABELS, CLINICAL_ROLES,
  type Candidate, type Job, type Profile,
} from '../lib/types'
import { Spinner, StatCard } from '../components/ui'

// Warm Clinilytics data palette: sage, clay, rust, and muted neutrals.
const BAR_COLORS = ['#6e9a6a', '#cd7c4f', '#be4b43', '#577f54', '#b4663b', '#a9a18d', '#1f1d1a']

const LIVE = (c: Candidate) => !['active', 'declined', 'no_response'].includes(c.current_stage)
// Open positions on a published job = remaining (fallback to total).
const openCount = (j: Job) => j.openings_remaining ?? j.openings ?? 1

export function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [j, c, p] = await Promise.all([
        supabase.from('jobs').select('*'),
        supabase.from('candidates').select('*'),
        supabase.from('profiles').select('*'),
      ])
      if (!active) return
      setJobs((j.data as Job[]) ?? [])
      setCandidates((c.data as Candidate[]) ?? [])
      setProfiles((p.data as Profile[]) ?? [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  const publishedJobs = useMemo(() => jobs.filter((j) => j.status === 'published'), [jobs])

  const metrics = useMemo(() => {
    const openPositions = publishedJobs.reduce((s, j) => s + openCount(j), 0)
    const openJobs = publishedJobs.length
    const inPipeline = candidates.filter(LIVE).length
    const active = candidates.filter((c) => c.current_stage === 'active').length
    return { openPositions, openJobs, inPipeline, active }
  }, [publishedJobs, candidates])

  const funnel = useMemo(
    () => PIPELINE_STAGES.map((stage) => ({
      stage: STAGE_LABELS[stage],
      count: candidates.filter((c) => c.current_stage === stage).length,
    })),
    [candidates],
  )

  const openByRole = useMemo(
    () => CLINICAL_ROLES.map((role) => ({
      role: ROLE_LABELS[role],
      open: publishedJobs.filter((j) => j.role === role).reduce((s, j) => s + openCount(j), 0),
    })).filter((r) => r.open > 0),
    [publishedJobs],
  )

  const openByLocation = useMemo(() => {
    const map: Record<string, number> = {}
    for (const j of publishedJobs) {
      const loc = (j.location || '—').trim() || '—'
      map[loc] = (map[loc] ?? 0) + openCount(j)
    }
    return Object.entries(map)
      .map(([location, open]) => ({ location, open }))
      .sort((a, b) => b.open - a.open)
      .slice(0, 12)
  }, [publishedJobs])

  const workload = useMemo(() => {
    if (!isAdmin) return []
    return profiles
      .filter((p) => p.active && p.role === 'recruiter')
      .map((r) => ({
        name: r.full_name || r.email,
        candidates: candidates.filter((c) => c.recruiter_id === r.id && LIVE(c)).length,
      }))
      .filter((r) => r.candidates > 0)
      .sort((a, b) => b.candidates - a.candidates)
      .slice(0, 15)
  }, [isAdmin, profiles, candidates])

  if (loading) return <Spinner label="Loading dashboard…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{isAdmin ? 'Team Dashboard' : 'My Dashboard'}</h1>
        <p className="text-sm text-muted">
          {isAdmin ? 'Open positions and pipeline across the team.' : `Welcome back, ${profile?.full_name || profile?.email}. Your pipeline at a glance.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open positions" value={metrics.openPositions} hint={`across ${metrics.openJobs} published jobs`} tone={metrics.openPositions > 0 ? 'warn' : 'good'} />
        <StatCard label="Open jobs" value={metrics.openJobs} />
        <StatCard label="In pipeline" value={metrics.inPipeline} hint="active candidates" />
        <StatCard label="Active hires" value={metrics.active} tone="good" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Pipeline funnel" empty={metrics.inPipeline + metrics.active === 0 ? 'No candidates yet — import or add some' : undefined}>
          <BarChart data={funnel}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]}>
              {funnel.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Open positions by role" empty={openByRole.length === 0 ? 'No open positions 🎉' : undefined}>
          <BarChart data={openByRole}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="role" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="open" radius={[6, 6, 0, 0]}>
              {openByRole.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Open positions by location"
          height={Math.max(220, openByLocation.length * 32)}
          empty={openByLocation.length === 0 ? 'No open positions' : undefined}
        >
          <BarChart data={openByLocation} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e2d7" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="location" width={130} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="open" fill="#cd7c4f" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ChartCard>

        {isAdmin && (
          <ChartCard
            title="Pipeline by recruiter"
            height={Math.max(220, workload.length * 32)}
            empty={workload.length === 0 ? 'No active candidates' : undefined}
          >
            <BarChart data={workload} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e2d7" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar isAnimationActive={false} dataKey="candidates" fill="#6e9a6a" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ChartCard>
        )}
      </div>
    </div>
  )
}

function ChartCard({
  title,
  children,
  height = 280,
  empty,
}: {
  title: string
  children: React.ReactElement
  height?: number
  empty?: string
}) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 text-sm font-semibold text-ink">{title}</h2>
      {empty ? (
        <div className="flex items-center justify-center text-sm text-muted" style={{ height }}>
          {empty}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  )
}
