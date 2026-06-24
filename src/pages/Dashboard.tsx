import { useEffect, useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type Candidate,
  type JobOpening,
  type Profile,
} from '../lib/types'
import { Spinner, StatCard } from '../components/ui'

const STAGE_COLORS = ['#94a3b8', '#3b82f6', '#6366f1', '#f59e0b', '#22c55e']

export function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const [openings, setOpenings] = useState<JobOpening[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [o, c, p] = await Promise.all([
        supabase.from('job_openings').select('*'),
        supabase.from('candidates').select('*'),
        supabase.from('profiles').select('*'),
      ])
      if (!active) return
      setOpenings((o.data as JobOpening[]) ?? [])
      setCandidates((c.data as Candidate[]) ?? [])
      setProfiles((p.data as Profile[]) ?? [])
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const metrics = useMemo(() => {
    const openOpenings = openings.filter((o) => o.status === 'open')
    const totalSeats = openOpenings.reduce((sum, o) => sum + (o.openings_count || 1), 0)
    const activeCandidates = candidates.filter(
      (c) => !['hired', 'rejected', 'withdrawn'].includes(c.current_stage),
    )
    const hired = candidates.filter((c) => c.current_stage === 'hired')
    return {
      openCount: openOpenings.length,
      totalSeats,
      activeCandidates: activeCandidates.length,
      hired: hired.length,
    }
  }, [openings, candidates])

  const stageData = useMemo(
    () =>
      PIPELINE_STAGES.map((stage) => ({
        stage: STAGE_LABELS[stage],
        count: candidates.filter((c) => c.current_stage === stage).length,
      })),
    [candidates],
  )

  const recruiterData = useMemo(() => {
    if (!isAdmin) return []
    const recruiters = profiles.filter((p) => p.active)
    return recruiters
      .map((r) => ({
        name: r.full_name || r.email,
        openings: openings.filter((o) => o.assigned_recruiter_id === r.id && o.status === 'open')
          .length,
        candidates: candidates.filter(
          (c) =>
            c.recruiter_id === r.id &&
            !['hired', 'rejected', 'withdrawn'].includes(c.current_stage),
        ).length,
      }))
      .filter((r) => r.openings > 0 || r.candidates > 0)
  }, [isAdmin, profiles, openings, candidates])

  if (loading) return <Spinner label="Loading dashboard…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {isAdmin ? 'Team Dashboard' : 'My Dashboard'}
        </h1>
        <p className="text-sm text-gray-500">
          {isAdmin
            ? 'Full visibility across all recruiters and openings.'
            : `Welcome back, ${profile?.full_name || profile?.email}.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open positions" value={metrics.openCount} hint={`${metrics.totalSeats} seats to fill`} />
        <StatCard label="Active candidates" value={metrics.activeCandidates} />
        <StatCard label="Hires" value={metrics.hired} />
        <StatCard
          label="Fill rate"
          value={
            metrics.hired + metrics.activeCandidates > 0
              ? `${Math.round((metrics.hired / (metrics.hired + metrics.activeCandidates)) * 100)}%`
              : '—'
          }
          hint="hired vs. in-pipeline"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Pipeline by stage</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stageData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
              <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {stageData.map((_, i) => (
                  <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Openings by status</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusBreakdown(openings)}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label
              >
                {statusBreakdown(openings).map((_, i) => (
                  <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {isAdmin && recruiterData.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Workload by recruiter</h2>
          <ResponsiveContainer width="100%" height={Math.max(220, recruiterData.length * 48)}>
            <BarChart data={recruiterData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef0f4" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="openings" name="Open positions" fill="#3563ff" radius={[0, 6, 6, 0]} />
              <Bar dataKey="candidates" name="Active candidates" fill="#22c55e" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function statusBreakdown(openings: JobOpening[]) {
  const counts: Record<string, number> = {}
  for (const o of openings) counts[o.status] = (counts[o.status] || 0) + 1
  return Object.entries(counts).map(([name, value]) => ({
    name: name.replace('_', ' '),
    value,
  }))
}
