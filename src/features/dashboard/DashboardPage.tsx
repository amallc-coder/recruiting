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

      {/* At-a-glance summary — mirrors the master tracker. */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">At a glance</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Openings" value={summary.openings} info="Total seats we're hiring for — the sum of headcount across all open requisitions." />
          <StatCard
            label="Openings remaining"
            value={summary.openingsRemaining}
            tone={summary.openingsRemaining > 0 ? 'warn' : 'good'}
            info="Seats still unfilled — openings minus hires already made against open requisitions."
          />
          <StatCard label="Total candidates" value={summary.totalCandidates} info="Every candidate in the system, regardless of stage." />
          <StatCard label="Interviews" value={summary.interviews} info="Total interviews scheduled across all candidates." />
          <StatCard label="Offers extended" value={summary.offersExtended} info="Offers that reached the candidate — sent, accepted, declined, negotiating, or expired (drafts not yet sent are excluded)." />
          <StatCard label="Offers accepted" value={summary.offersAccepted} tone="good" info="Offers the candidate accepted." />
          <StatCard label="Offers declined" value={summary.offersDeclined} tone={summary.offersDeclined > 0 ? 'warn' : 'default'} info="Offers the candidate declined." />
          <StatCard label="Hires" value={summary.hires} tone="good" info="Applications that reached a hired outcome." />
        </div>
      </div>

      {/* Operational counts. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Open requisitions"
          value={summary.openReqs}
          info="Number of job postings currently open (requisition status = open). Each requisition may have more than one opening."
        />
        <StatCard label="Active applications" value={summary.activeApplications} info="Applications currently moving through the pipeline (status = active)." />
        <StatCard
          label="Placement-ready"
          value={summary.placementReady}
          tone="good"
          info="Candidates whose required licenses and credentials are complete and unexpired, so they're cleared to be placed. 'Credential verified' means a credential's authenticity/expiry has been confirmed — once all required ones are verified, the candidate becomes placement-ready."
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
