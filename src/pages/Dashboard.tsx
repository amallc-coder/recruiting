import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  PIPELINE_STAGES, STAGE_LABELS, ROLE_LABELS, CLINICAL_ROLES,
  type Candidate, type CoverageNeed, type Profile,
} from '../lib/types'
import { Spinner, StatCard } from '../components/ui'

// Warm Clinilytics data palette: sage, clay, rust, and muted neutrals.
const BAR_COLORS = ['#6e9a6a', '#cd7c4f', '#be4b43', '#577f54', '#b4663b', '#a9a18d', '#1f1d1a']

export function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const [needs, setNeeds] = useState<CoverageNeed[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [regionByFacility, setRegionByFacility] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [n, c, p, f] = await Promise.all([
        supabase.from('coverage_needs').select('*'),
        supabase.from('candidates').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('facilities').select('id, region'),
      ])
      if (!active) return
      setNeeds((n.data as CoverageNeed[]) ?? [])
      setCandidates((c.data as Candidate[]) ?? [])
      setProfiles((p.data as Profile[]) ?? [])
      const map = new Map<string, string>()
      for (const row of (f.data as { id: string; region: string | null }[]) ?? []) {
        if (row.region) map.set(row.id, row.region)
      }
      setRegionByFacility(map)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  const metrics = useMemo(() => {
    const openNeeds = needs.reduce((s, n) => s + n.need_count, 0)
    const premiumGaps = needs.filter((n) => n.need_count > 0 && (n.priority === 'premium' || n.priority === 'urgent')).length
    const inPipeline = candidates.filter((c) => !['active', 'declined', 'no_response'].includes(c.current_stage)).length
    const active = candidates.filter((c) => c.current_stage === 'active').length
    return { openNeeds, premiumGaps, inPipeline, active }
  }, [needs, candidates])

  const funnel = useMemo(
    () => PIPELINE_STAGES.map((stage) => ({
      stage: STAGE_LABELS[stage],
      count: candidates.filter((c) => c.current_stage === stage).length,
    })),
    [candidates],
  )

  const needsByRole = useMemo(
    () => CLINICAL_ROLES.map((role) => ({
      role: ROLE_LABELS[role],
      need: needs.filter((n) => n.role === role).reduce((s, n) => s + n.need_count, 0),
    })).filter((r) => r.need > 0),
    [needs],
  )

  const needsByRegion = useMemo(() => {
    const map: Record<string, number> = {}
    for (const n of needs) {
      if (n.need_count <= 0) continue
      const region = regionByFacility.get(n.facility_id) ?? 'Unassigned'
      map[region] = (map[region] ?? 0) + n.need_count
    }
    return Object.entries(map).map(([region, need]) => ({ region, need })).sort((a, b) => b.need - a.need)
  }, [needs, regionByFacility])

  const workload = useMemo(() => {
    if (!isAdmin) return []
    return profiles
      .filter((p) => p.active)
      .map((r) => ({
        name: r.full_name || r.email,
        candidates: candidates.filter((c) => c.recruiter_id === r.id && !['active', 'declined', 'no_response'].includes(c.current_stage)).length,
      }))
      .filter((r) => r.candidates > 0)
      .sort((a, b) => b.candidates - a.candidates)
  }, [isAdmin, profiles, candidates])

  if (loading) return <Spinner label="Loading dashboard…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{isAdmin ? 'Team Dashboard' : 'My Dashboard'}</h1>
        <p className="text-sm text-muted">
          {isAdmin ? 'Coverage and pipeline across all regions.' : `Welcome back, ${profile?.full_name || profile?.email}. Your territory at a glance.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open needs" value={metrics.openNeeds} hint="positions to fill" tone={metrics.openNeeds > 0 ? 'warn' : 'good'} />
        <StatCard label="Premium / urgent gaps" value={metrics.premiumGaps} tone={metrics.premiumGaps > 0 ? 'warn' : 'default'} />
        <StatCard label="In pipeline" value={metrics.inPipeline} hint="active candidates" />
        <StatCard label="Active hires" value={metrics.active} tone="good" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Pipeline funnel">
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

        <ChartCard title="Open needs by role" empty={needsByRole.length === 0 ? 'No open needs 🎉' : undefined}>
          <BarChart data={needsByRole}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e2d7" />
            <XAxis dataKey="role" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="need" radius={[6, 6, 0, 0]}>
              {needsByRole.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Open needs by region"
          height={Math.max(220, needsByRegion.length * 36)}
          empty={needsByRegion.length === 0 ? 'No open needs' : undefined}
        >
          <BarChart data={needsByRegion} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e2d7" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="region" width={120} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="need" fill="#cd7c4f" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ChartCard>

        {isAdmin && (
          <ChartCard
            title="Pipeline by recruiter"
            height={Math.max(220, workload.length * 40)}
            empty={workload.length === 0 ? 'No active candidates' : undefined}
          >
            <BarChart data={workload} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e2d7" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
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
