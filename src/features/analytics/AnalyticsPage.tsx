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
import { Camera, TrendingUp, TrendingDown, Minus, AlertTriangle, Download } from 'lucide-react'
import { Card, MultiSelect, Tabs, Button, Select, Input } from '../../components/primitives'
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

/** Download the current KPI set as a CSV (value/benchmark/target/prior per metric). */
function exportKpisCsv(kpis: Kpi[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = ['Metric', 'Category', 'Value', 'Unit', 'Benchmark', 'Target', 'Prior', 'Formula']
  const lines = kpis.map((k) =>
    [k.label, k.category, k.value ?? '', k.unit, k.benchmark ?? '', k.target ?? '', k.prior ?? '', k.formula].map(esc).join(','),
  )
  const csv = [header.map(esc).join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `clinilytics-kpis-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const CATEGORY_LABELS: Record<Kpi['category'], string> = {
  speed: 'Speed',
  quality: 'Quality',
  cost: 'Cost',
  throughput: 'Throughput',
  healthcare: 'Healthcare',
}

type RangePreset = 'all' | '30d' | '90d' | 'ytd' | 'custom'

const RANGE_LABELS: Record<RangePreset, string> = {
  all: 'All time',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  custom: 'Custom…',
}

/** Local-time YYYY-MM-DD (matches the <input type="date"> value format). */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Resolve a preset to a concrete inclusive {from,to}; 'all' clears the window. */
function presetRange(preset: RangePreset): { from: string | null; to: string | null } {
  if (preset === 'all' || preset === 'custom') return { from: null, to: null }
  const now = new Date()
  const to = isoDate(now)
  if (preset === 'ytd') return { from: `${now.getFullYear()}-01-01`, to }
  const back = preset === '30d' ? 29 : 89
  const f = new Date(now)
  f.setDate(f.getDate() - back)
  return { from: isoDate(f), to }
}

function fmtRangeDay(s: string): string {
  return new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AnalyticsPage() {
  const [segment, setSegment] = useState<KpiSegment>({ roleFamilies: [], facilityIds: [] })
  const [preset, setPreset] = useState<RangePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [bundle, setBundle] = useState<KpiBundle | null>(null)
  const [breakdown, setBreakdown] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const range = preset === 'custom' ? { from: customFrom || null, to: customTo || null } : presetRange(preset)
  const filter: KpiSegment = { ...segment, from: range.from, to: range.to }

  const refresh = useCallback((seg: KpiSegment) => {
    setLoading(true)
    loadKpis(seg).then((b) => {
      setBundle(b)
      setLoading(false)
    })
  }, [])

  // Re-run KPIs whenever the segment or date window changes; load org-wide
  // breakdown charts once. Deps are the primitive window bounds (not the derived
  // object) so the effect doesn't re-fire on every render.
  useEffect(() => {
    refresh({ ...segment, from: range.from, to: range.to })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, range.from, range.to, refresh])
  useEffect(() => {
    loadAnalytics().then(setBreakdown)
  }, [])

  async function onCapture() {
    setCapturing(true)
    setNote(null)
    const { captured, error } = await captureSnapshot()
    setCapturing(false)
    setNote(error ? `Snapshot failed: ${error}` : `Captured ${captured} KPI${captured === 1 ? '' : 's'} — trends will compare against this point.`)
    if (!error) refresh(filter)
  }

  const segmented = (segment.roleFamilies?.length ?? 0) > 0 || (segment.facilityIds?.length ?? 0) > 0
  const dateActive = !!(range.from || range.to)
  const filtered = segmented || dateActive

  function clearFilters() {
    setSegment({ roleFamilies: [], facilityIds: [] })
    setPreset('all')
    setCustomFrom('')
    setCustomTo('')
  }

  const rangeLabel = dateActive
    ? range.from && range.to
      ? `${fmtRangeDay(range.from)} – ${fmtRangeDay(range.to)}`
      : range.from
        ? `since ${fmtRangeDay(range.from)}`
        : `through ${fmtRangeDay(range.to!)}`
    : ''

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
        <div className="flex items-center gap-2">
          {bundle && (
            <Button variant="secondary" onClick={() => exportKpisCsv(bundle.kpis)}>
              <Download size={15} className="mr-1.5" />
              Export CSV
            </Button>
          )}
          <Button variant="secondary" onClick={onCapture} disabled={capturing}>
            <Camera size={15} className="mr-1.5" />
            {capturing ? 'Capturing…' : 'Capture snapshot'}
          </Button>
        </div>
      </div>

      {/* Segment + date-range filters */}
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
          <Select label="Date range" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}>
            {(Object.keys(RANGE_LABELS) as RangePreset[]).map((p) => (
              <option key={p} value={p}>
                {RANGE_LABELS[p]}
              </option>
            ))}
          </Select>
          {preset === 'custom' ? (
            <div className="grid grid-cols-2 gap-2">
              <Input label="From" type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
              <Input label="To" type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          ) : (
            <div />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {dateActive
              ? `Activity ${rangeLabel} — requisitions opened, applications received, offers made, and spend incurred in this window.`
              : 'Showing all-time activity.'}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        {note && <p className="mt-2 text-xs text-sage-700">{note}</p>}
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
              <ExecView kpis={bundle.kpis} filtered={filtered} />
            ) : tab === 'funnel' ? (
              <FunnelView funnel={bundle.funnel} breakdown={breakdown} filtered={filtered} />
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
function ExecView({ kpis, filtered }: { kpis: Kpi[]; filtered: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => (
        <KpiCard key={k.key} kpi={k} filtered={filtered} />
      ))}
    </div>
  )
}

function KpiCard({ kpi, filtered }: { kpi: Kpi; filtered: boolean }) {
  const tone = classify(kpi, kpi.value)
  const valueColor = tone === 'warn' ? 'text-rust-500' : tone === 'good' ? 'text-sage-600' : 'text-ink'
  // Snapshots are stored at the all-time org level, so a trend delta is only
  // meaningful for the unfiltered headline. Under a segment/date filter, suppress
  // the comparison rather than show a misleading "vs last."
  const trend = filtered ? null : trendDelta(kpi)

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
          <span className="text-muted">{filtered ? 'Filtered view — no trend' : 'No prior snapshot'}</span>
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
  filtered,
}: {
  funnel: FunnelStage[]
  breakdown: AnalyticsData | null
  filtered: boolean
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
            Org-wide breakdown{filtered ? ' (not filtered by segment or date)' : ''}
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
