import { useCallback, useEffect, useState } from 'react'
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
import { Camera, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import { Card, MultiSelect, Tabs, Button } from '../../components/primitives'
import { Spinner, EmptyState } from '../../components/ui'
import { loadAnalytics, loadSourceEffectiveness, type AnalyticsData, type SourceEffectivenessRow } from '../../lib/v2/analytics'
import {
  loadKpis,
  captureSnapshot,
  classify,
  formatKpi,
  trendDelta,
  type Kpi,
  type KpiBundle,
  type KpiSegment,
  type FunnelStage,
  type RecruiterRow,
} from '../../lib/v2/kpis'

const BAR_COLORS = ['#6e9a6a', '#d2774a', '#be4b43', '#577f54', '#b4663b', '#a9a18d', '#26221f']
const GRID_STROKE = '#e7e2d7'
const CHART_HEIGHT = 260

const CATEGORY_LABELS: Record<Kpi['category'], string> = {
  speed: 'Speed',
  quality: 'Quality',
  cost: 'Cost',
  throughput: 'Throughput',
  healthcare: 'Healthcare',
}

export function AnalyticsPage() {
  const [segment, setSegment] = useState<KpiSegment>({ roleFamilies: [], facilityIds: [] })
  const [bundle, setBundle] = useState<KpiBundle | null>(null)
  const [breakdown, setBreakdown] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback((seg: KpiSegment) => {
    setLoading(true)
    loadKpis(seg).then((b) => {
      setBundle(b)
      setLoading(false)
    })
  }, [])

  // Re-run KPIs whenever the segment changes; load org-wide breakdown charts once.
  useEffect(() => {
    refresh(segment)
  }, [segment, refresh])
  useEffect(() => {
    loadAnalytics().then(setBreakdown)
  }, [])

  async function onCapture() {
    setCapturing(true)
    setNote(null)
    const { captured, error } = await captureSnapshot()
    setCapturing(false)
    setNote(error ? `Snapshot failed: ${error}` : `Captured ${captured} KPI${captured === 1 ? '' : 's'} — trends will compare against this point.`)
    if (!error) refresh(segment)
  }

  const segmented = (segment.roleFamilies?.length ?? 0) > 0 || (segment.facilityIds?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Analytics &amp; KPIs</h1>
          <p className="mt-1 text-sm text-muted">
            Speed, quality, cost, and throughput against healthcare-staffing benchmarks — with the
            hiring funnel and per-recruiter performance.
          </p>
        </div>
        <Button variant="secondary" onClick={onCapture} disabled={capturing}>
          <Camera size={15} className="mr-1.5" />
          {capturing ? 'Capturing…' : 'Capture snapshot'}
        </Button>
      </div>

      {/* Segment filters */}
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MultiSelect
            label="Role family"
            placeholder="All role families"
            options={bundle?.roleFamilyOptions ?? []}
            value={segment.roleFamilies ?? []}
            onChange={(v) => setSegment((s) => ({ ...s, roleFamilies: v }))}
          />
          <MultiSelect
            label="Facility"
            placeholder="All facilities"
            options={bundle?.facilityOptions ?? []}
            value={segment.facilityIds ?? []}
            onChange={(v) => setSegment((s) => ({ ...s, facilityIds: v }))}
          />
          <div className="flex items-end">
            {segmented && (
              <button
                type="button"
                onClick={() => setSegment({ roleFamilies: [], facilityIds: [] })}
                className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Clear segment
              </button>
            )}
          </div>
        </div>
        {note && <p className="mt-3 text-xs text-sage-700">{note}</p>}
      </Card>

      {loading || !bundle ? (
        <Spinner label="Computing KPIs…" />
      ) : bundle.empty ? (
        <EmptyState
          title="No data in this segment"
          hint="Widen the role family / facility filter, or open requisitions and add candidates to populate KPIs."
        />
      ) : (
        <Tabs
          tabs={[
            { value: 'exec', label: 'Executive' },
            { value: 'funnel', label: 'Funnel' },
            { value: 'sources', label: 'Sources' },
            { value: 'recruiters', label: 'Recruiters' },
          ]}
          defaultValue="exec"
        >
          {(tab) =>
            tab === 'exec' ? (
              <ExecView kpis={bundle.kpis} />
            ) : tab === 'funnel' ? (
              <FunnelView funnel={bundle.funnel} breakdown={breakdown} segmented={segmented} />
            ) : tab === 'sources' ? (
              <SourcesView />
            ) : (
              <RecruiterView rows={bundle.recruiters} />
            )
          }
        </Tabs>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Executive view — KPI cards
// ---------------------------------------------------------------------------
function ExecView({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <KpiCard key={k.key} kpi={k} />
      ))}
    </div>
  )
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const tone = classify(kpi, kpi.value)
  const valueColor = tone === 'warn' ? 'text-rust-500' : tone === 'good' ? 'text-sage-600' : 'text-ink'
  const trend = trendDelta(kpi)

  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="stat-label">{kpi.label}</div>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
          {CATEGORY_LABELS[kpi.category]}
        </span>
      </div>

      <div className={`mt-1.5 text-3xl font-semibold tracking-tight tnum ${valueColor}`}>
        {formatKpi(kpi.value, kpi.unit)}
      </div>

      {/* vs last period */}
      <div className="mt-1 flex h-5 items-center gap-1 text-xs">
        {trend == null ? (
          <span className="text-muted">No prior snapshot</span>
        ) : trend.delta === 0 ? (
          <span className="flex items-center gap-1 text-muted">
            <Minus size={12} /> Flat vs last
          </span>
        ) : (
          <span className={`flex items-center gap-1 ${trend.improving ? 'text-sage-600' : 'text-rust-500'}`}>
            {trend.improving ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {formatKpi(Math.abs(trend.delta), kpi.unit)} vs last
          </span>
        )}
      </div>

      {/* benchmark / target */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {kpi.benchmark != null && <span>Benchmark {formatKpi(kpi.benchmark, kpi.unit)}</span>}
        {kpi.target != null && <span>Target {formatKpi(kpi.target, kpi.unit)}</span>}
      </div>

      {/* what to fix next */}
      <div className="mt-3 border-t border-line pt-2 text-xs leading-snug text-muted">
        <span title={`${kpi.definition}\n\nFormula: ${kpi.formula}`}>{kpi.whatToFix}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Funnel view — cumulative reach + conversion + bottleneck
// ---------------------------------------------------------------------------
function FunnelView({
  funnel,
  breakdown,
  segmented,
}: {
  funnel: FunnelStage[]
  breakdown: AnalyticsData | null
  segmented: boolean
}) {
  const chartData = funnel.map((s) => ({ stage: s.label, count: s.count }))
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink">Hiring funnel</h2>
        <p className="mb-4 text-xs text-muted">
          Cumulative reach — each stage counts every candidate who reached it or beyond. The steepest
          drop-off is flagged as the bottleneck.
        </p>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="count" radius={[6, 6, 0, 0]}>
              {funnel.map((s, i) => (
                <Cell key={i} fill={s.isBottleneck ? '#be4b43' : BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* conversion ladder */}
        <div className="mt-5 space-y-1">
          {funnel.map((s, i) => (
            <div key={s.key}>
              {i > 0 && (
                <div
                  className={`flex items-center gap-2 px-3 py-1 text-xs ${
                    s.isBottleneck ? 'font-medium text-rust-600' : 'text-muted'
                  }`}
                >
                  <span className="tnum">↓ {s.conversionPct == null ? '—' : `${s.conversionPct}%`}</span>
                  {s.isBottleneck && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rust-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rust-600">
                      <AlertTriangle size={10} /> Bottleneck
                    </span>
                  )}
                </div>
              )}
              <div
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  s.isBottleneck ? 'border-rust-200 bg-rust-50/40' : 'border-line bg-paper'
                }`}
              >
                <span className="text-sm font-medium text-ink">{s.label}</span>
                <span className="tnum text-sm text-ink">{s.count.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {breakdown && (
        <>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            Org-wide breakdown{segmented ? ' (not segment-filtered)' : ''}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold text-ink">Candidate sources</h2>
              {breakdown.bySource.length === 0 ? (
                <div className="flex items-center justify-center text-sm text-muted" style={{ height: CHART_HEIGHT }}>
                  No source data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={breakdown.bySource} layout="vertical" margin={{ left: 30 }}>
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
              {breakdown.byRoleFamily.length === 0 ? (
                <div className="flex items-center justify-center text-sm text-muted" style={{ height: CHART_HEIGHT }}>
                  No open requisitions
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                  <BarChart data={breakdown.byRoleFamily} layout="vertical" margin={{ left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="role" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar isAnimationActive={false} dataKey="open" radius={[0, 6, 6, 0]}>
                      {breakdown.byRoleFamily.map((_, i) => (
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

// ---------------------------------------------------------------------------
// Sources view — source-of-hire & cost-per-source effectiveness
// ---------------------------------------------------------------------------
function SourcesView() {
  const [rows, setRows] = useState<SourceEffectivenessRow[] | null>(null)
  useEffect(() => {
    loadSourceEffectiveness().then(setRows)
  }, [])
  if (!rows) return <Spinner label="Computing source effectiveness…" />
  if (rows.length === 0) return <EmptyState title="No source data yet" />

  const usd = (n: number | null) => (n == null ? '—' : '$' + n.toLocaleString())
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 text-right font-medium">Applications</th>
            <th className="px-4 py-3 text-right font-medium">Hires</th>
            <th className="px-4 py-3 text-right font-medium">Hire rate</th>
            <th className="px-4 py-3 text-right font-medium">Spend</th>
            <th className="px-4 py-3 text-right font-medium">Cost / hire</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3 font-medium text-ink">{r.source}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{r.applications.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{r.hires.toLocaleString()}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{r.hireRatePct == null ? '—' : `${r.hireRatePct}%`}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{usd(r.cost)}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{usd(r.costPerHire)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">
        Spend is matched from Finance cost entries by vendor name. Add costs under Finance to populate cost-per-hire.
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Recruiter view — per-owner performance table
// ---------------------------------------------------------------------------
function RecruiterView({ rows }: { rows: RecruiterRow[] }) {
  if (rows.length === 0) return <EmptyState title="No recruiter activity in this segment" />
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 font-medium">Recruiter</th>
            <th className="px-4 py-3 text-right font-medium">Open reqs</th>
            <th className="px-4 py-3 text-right font-medium">Hires</th>
            <th className="px-4 py-3 text-right font-medium">Fill rate</th>
            <th className="px-4 py-3 text-right font-medium">Time to fill</th>
            <th className="px-4 py-3 text-right font-medium">Interview:offer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{r.openReqs}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{r.hires}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{r.fillRatePct == null ? '—' : `${r.fillRatePct}%`}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{r.avgTimeToFillDays == null ? '—' : `${r.avgTimeToFillDays}d`}</td>
              <td className="px-4 py-3 text-right tnum text-ink">{r.interviewToOffer == null ? '—' : `${r.interviewToOffer.toFixed(1)}:1`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
