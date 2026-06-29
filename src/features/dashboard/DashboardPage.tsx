import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Badge } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives'
import { Spinner, StatCard, EmptyState } from '../../components/ui'
import { loadDashboard, type DashboardSummary } from '../../lib/v2/dashboard'

// Warm, muted status tones in the Clinilytics spirit. Unknown statuses fall
// back to neutral so a new requisition state never breaks the badge.
const REQ_STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  pending_approval: 'clay',
  open: 'sage',
  on_hold: 'clay',
  filled: 'ink',
  closed: 'neutral',
  cancelled: 'rust',
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadDashboard().then((s) => {
      if (!active) return
      setSummary(s)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  if (loading || !summary) return <Spinner label="Loading dashboard…" />

  const maxStage = summary.byStage.reduce((m, s) => Math.max(m, s.count), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Open requisitions, pipeline, and coverage at a glance.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Open requisitions" value={summary.openReqs} hint="status = open" />
        <StatCard label="Candidates" value={summary.totalCandidates} hint="total in talent pool" />
        <StatCard label="Active applications" value={summary.activeApplications} hint="in pipeline" />
        <StatCard label="Hires" value={summary.hires} tone="good" hint="applications hired" />
        <StatCard label="Placement-ready" value={summary.placementReady} tone="good" hint="credentials verified" />
        <StatCard
          label="Open positions"
          value={summary.openPositions}
          tone={summary.openPositions > 0 ? 'warn' : 'default'}
          hint="sum of need − have"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-ink">Pipeline by stage</h2>
          {summary.byStage.length === 0 ? (
            <EmptyState title="No applications yet" hint="Applications appear here once candidates enter a pipeline." />
          ) : (
            <div className="space-y-2.5">
              {summary.byStage.map((s) => (
                <div key={s.stage} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 truncate text-sm text-ink" title={s.stage}>
                    {s.stage}
                  </div>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-50">
                    <div
                      className="h-full rounded-full bg-sage-500/40"
                      style={{ width: `${maxStage > 0 ? (s.count / maxStage) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-8 shrink-0 text-right text-sm font-semibold tnum text-ink">{s.count}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-ink">Recent requisitions</h2>
          {summary.recentReqs.length === 0 ? (
            <EmptyState title="No requisitions yet" hint="Create a requisition to start building a pipeline." />
          ) : (
            <ul className="divide-y divide-line/60">
              {summary.recentReqs.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/requisitions/${r.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{r.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">{r.role_family}</div>
                    </div>
                    <Badge tone={REQ_STATUS_TONE[r.status] ?? 'neutral'}>{statusLabel(r.status)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
