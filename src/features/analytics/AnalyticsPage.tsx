import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts'
import { Card } from '../../components/primitives'
import { Spinner, EmptyState, StatCard } from '../../components/ui'
import { loadAnalytics, type AnalyticsData } from '../../lib/v2/analytics'

// Warm token palette mirrored from the legacy Analytics page (terracotta clay,
// sage greens, rust, charcoal ink) so the v2 charts stay on-brand.
const BAR_COLORS = ['#6e9a6a', '#d2774a', '#be4b43', '#577f54', '#b4663b', '#a9a18d', '#26221f']
const GRID_STROKE = '#e7e2d7'
const CHART_HEIGHT = 260

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    loadAnalytics().then((d) => {
      if (!active) return
      setData(d)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  if (loading || !data) return <Spinner label="Crunching analytics…" />

  const { totals, funnel, bySource, byRoleFamily } = data
  const empty = totals.applications === 0 && totals.openReqs === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Hiring funnel, candidate sources, and open-requisition load across the org.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Applications" value={totals.applications} />
        <StatCard label="Hires" value={totals.hires} tone={totals.hires > 0 ? 'good' : 'default'} />
        <StatCard label="Open reqs" value={totals.openReqs} />
        <StatCard
          label="Avg time-to-fill"
          value={totals.avgTimeToFillDays == null ? '—' : `${totals.avgTimeToFillDays}d`}
        />
        <StatCard
          label="Conversion"
          value={totals.conversionPct == null ? '—' : `${totals.conversionPct}%`}
          tone={totals.conversionPct != null && totals.conversionPct > 0 ? 'good' : 'default'}
        />
      </div>

      {empty ? (
        <EmptyState
          title="No analytics yet"
          hint="Once you open requisitions and candidates start applying, funnel, source, and time-to-fill metrics populate here."
        />
      ) : (
        <>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Hiring funnel</h2>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]}>
                  {funnel.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-ink">Candidate sources</h2>
              {bySource.length === 0 ? (
                <div className="flex items-center justify-center text-sm text-muted" style={{ height: CHART_HEIGHT }}>
                  No source data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={bySource} layout="vertical" margin={{ left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="source" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="count" fill="#577f54" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-ink">Open reqs by role family</h2>
              {byRoleFamily.length === 0 ? (
                <div className="flex items-center justify-center text-sm text-muted" style={{ height: CHART_HEIGHT }}>
                  No open requisitions
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={byRoleFamily} layout="vertical" margin={{ left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="role" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="open" radius={[0, 6, 6, 0]}>
                      {byRoleFamily.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
