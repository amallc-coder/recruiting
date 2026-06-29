import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Scale, ScrollText, Bot, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, Tabs, Select } from '../../components/primitives'
import { Spinner, StatCard } from '../../components/ui'
import {
  loadRlsCoverage,
  loadAiActivity,
  loadAdverseImpact,
  type RlsCoverage,
  type AiActivity,
  type AdverseImpactReport,
  type ImpactDimension,
} from '../../lib/v2/governance'

// ---- AI system inventory (static posture content) ----
const AI_SYSTEMS = [
  { name: 'Candidate–requisition match scoring', use: 'Ranks/explains fit', oversight: 'Advisory — recruiter decides; logged to ai_decisions' },
  { name: 'AI screening analysis', use: 'Summarizes screening responses', oversight: 'Advisory — human reviews before advancing' },
  { name: 'Fair-market-value comp', use: 'Suggests offer ranges', oversight: 'Advisory — human sets the actual offer' },
  { name: 'Natural-language search / console', use: 'Reads data in plain language', oversight: 'Read-only; no decisions; audit-logged' },
  { name: 'Autopilot', use: 'Proposes next-best actions', oversight: 'Tiered policy — high-stakes actions never automated' },
]

// ---- Compliance control mapping ----
type PostureStatus = 'addressed' | 'partial' | 'action'
const POSTURE_BADGE: Record<PostureStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  addressed: { label: 'Addressed', cls: 'bg-sage-50 text-sage-700', Icon: CheckCircle2 },
  partial: { label: 'Partial', cls: 'bg-clay-50 text-clay-600', Icon: AlertTriangle },
  action: { label: 'Action needed', cls: 'bg-rust-50 text-rust-600', Icon: ShieldAlert },
}
const CONTROLS: { framework: string; control: string; how: string; status: PostureStatus }[] = [
  { framework: 'EU AI Act', control: 'Human oversight (Art. 14)', how: 'Prohibited actions (offers, rejections, hires, pay) are never automated; approval-tier actions need an explicit click.', status: 'addressed' },
  { framework: 'EU AI Act', control: 'Record-keeping (Art. 12)', how: 'Every AI decision (ai_decisions) and agent action (audit_logs) is logged, timestamped, and attributable.', status: 'addressed' },
  { framework: 'EU AI Act', control: 'Transparency (Art. 13)', how: 'The public application form discloses AI-assisted screening/matching; rationales are shown to recruiters.', status: 'addressed' },
  { framework: 'EU AI Act', control: 'Data governance (Art. 10)', how: 'RLS isolates data per org/region; only job-relevant PII is stored; no protected-class data collected.', status: 'addressed' },
  { framework: 'NYC LL144', control: 'Bias audit of AEDT', how: 'Selection-rate framework below; a full independent audit requires voluntary self-ID data not yet collected.', status: 'action' },
  { framework: 'NYC LL144', control: 'Candidate notice (≥10 days)', how: 'Served via the careers/application flow; the tool stays assistive (no automated hire/reject).', status: 'partial' },
]

const DIMENSION_LABELS: Record<ImpactDimension, string> = {
  source: 'Candidate source',
  role_family: 'Role family',
  facility_state: 'Facility state',
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export function GovernancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
          <ShieldCheck size={22} className="text-sage-600" /> AI Governance &amp; Compliance
        </h1>
        <p className="mt-1 text-sm text-muted">
          Oversight, audit trail, fairness monitoring, and security posture — the controls a regulated
          healthcare buyer needs to trust AI in hiring.
        </p>
      </div>

      <Tabs
        tabs={[
          { value: 'posture', label: 'Posture' },
          { value: 'activity', label: 'AI activity' },
          { value: 'impact', label: 'Adverse impact' },
          { value: 'security', label: 'Security' },
        ]}
        defaultValue="posture"
      >
        {(tab) =>
          tab === 'posture' ? <PostureView /> : tab === 'activity' ? <ActivityView /> : tab === 'impact' ? <ImpactView /> : <SecurityView />
        }
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
function PostureView() {
  const [activity, setActivity] = useState<AiActivity | null>(null)
  useEffect(() => {
    loadAiActivity().then(setActivity)
  }, [])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="AI decisions logged" value={activity ? activity.decisionsLogged.toLocaleString() : '…'} />
        <StatCard label="Human overrides" value={activity ? `${activity.overrideRatePct ?? 0}%` : '…'} hint="of logged decisions" />
        <StatCard label="Autopilot plans" value={activity ? activity.autopilotPlans.toLocaleString() : '…'} />
        <StatCard label="Console queries" value={activity ? activity.consoleQueries.toLocaleString() : '…'} />
      </div>

      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Bot size={15} /> AI system inventory
        </h2>
        <p className="mb-4 text-xs text-muted">Every AI capability is assistive and kept under human oversight.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">System</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">Human oversight</th>
              </tr>
            </thead>
            <tbody>
              {AI_SYSTEMS.map((s) => (
                <tr key={s.name} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2 font-medium text-ink">{s.name}</td>
                  <td className="px-3 py-2 text-muted">{s.use}</td>
                  <td className="px-3 py-2 text-muted">{s.oversight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <Scale size={15} /> Regulatory posture — EU AI Act &amp; NYC Local Law 144
        </h2>
        <div className="space-y-3">
          {CONTROLS.map((c, i) => {
            const b = POSTURE_BADGE[c.status]
            return (
              <div key={i} className="flex items-start gap-3 border-b border-line/60 pb-3 last:border-0 last:pb-0">
                <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${b.cls}`}>
                  <b.Icon size={10} /> {b.label}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{c.framework}</span> · {c.control}
                  </div>
                  <p className="text-sm text-muted">{c.how}</p>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
function ActivityView() {
  const [activity, setActivity] = useState<AiActivity | null>(null)
  useEffect(() => {
    loadAiActivity().then(setActivity)
  }, [])
  if (!activity) return <Spinner label="Loading audit trail…" />

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <ScrollText size={15} /> Recent AI decisions
        </h2>
        <p className="mb-4 text-xs text-muted">Logged to ai_decisions — reviewable and overridable by a human.</p>
        {activity.decisions.length === 0 ? (
          <p className="text-sm text-muted">No AI decisions logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Model / agent</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Override</th>
                  <th className="px-3 py-2 font-medium">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {activity.decisions.map((d, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate(d.created_at)}</td>
                    <td className="px-3 py-2 text-ink">{d.entity_type ?? '—'}</td>
                    <td className="px-3 py-2 text-muted">{d.created_by_agent ?? d.model ?? '—'}</td>
                    <td className="px-3 py-2 text-right tnum text-ink">{d.score ?? '—'}</td>
                    <td className="px-3 py-2">{d.human_override ? <span className="text-clay-600">overridden</span> : <span className="text-muted">—</span>}</td>
                    <td className="max-w-md px-3 py-2 text-muted">{(d.rationale ?? '').slice(0, 160) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Bot size={15} /> Agent action log
        </h2>
        <p className="mb-4 text-xs text-muted">Console queries and Autopilot plans/executions, from audit_logs.</p>
        {activity.audit.length === 0 ? (
          <p className="text-sm text-muted">No agent activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {activity.audit.map((a, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-muted">{fmtDate(a.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-ink">{a.action}</td>
                    <td className="max-w-lg px-3 py-2 text-muted">{summarizeDetail(a.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function summarizeDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return '—'
  const parts: string[] = []
  if (typeof detail.question === 'string') parts.push(`“${detail.question}”`)
  if (typeof detail.goal === 'string') parts.push(`goal: ${detail.goal}`)
  if (typeof detail.summary === 'string') parts.push(String(detail.summary))
  if (typeof detail.title === 'string') parts.push(String(detail.title))
  if (typeof detail.total === 'number') parts.push(`${detail.total} rows`)
  if (typeof detail.steps === 'number') parts.push(`${detail.steps} steps`)
  if (typeof detail.tier === 'string') parts.push(`[${detail.tier}]`)
  return parts.join(' · ').slice(0, 200) || '—'
}

// ---------------------------------------------------------------------------
function ImpactView() {
  const [dimension, setDimension] = useState<ImpactDimension>('source')
  const [report, setReport] = useState<AdverseImpactReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    loadAdverseImpact(dimension).then((r) => {
      setReport(r)
      setLoading(false)
    })
  }, [dimension])

  return (
    <div className="space-y-5">
      <Card className="border-clay-200 bg-clay-50/40 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-clay-600" />
          <p className="text-sm text-ink">
            <span className="font-medium">Operational segments, not protected classes.</span> This system does
            not collect race, gender, age, or other EEO data. The four-fifths analysis below runs over
            operational segments as an early-warning signal. A legally-defensible adverse-impact audit (e.g.
            NYC LL144) requires voluntary candidate self-identification data, stored and analyzed separately.
          </p>
        </div>
      </Card>

      <div className="max-w-xs">
        <Select
          label="Segment by"
          value={dimension}
          onChange={(e) => setDimension(e.target.value as ImpactDimension)}
          options={(Object.keys(DIMENSION_LABELS) as ImpactDimension[]).map((d) => ({ value: d, label: DIMENSION_LABELS[d] }))}
        />
      </div>

      {loading || !report ? (
        <Spinner label="Computing selection rates…" />
      ) : (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Selection rate by {DIMENSION_LABELS[report.dimension].toLowerCase()}</h2>
            <span className="text-xs text-muted">
              Reference (highest rate): <span className="text-ink">{report.referenceGroup ?? '—'}</span> · four-fifths threshold 0.80 ·
              min sample {report.minSample}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 text-right font-medium">Applications</th>
                  <th className="px-3 py-2 text-right font-medium">Hired</th>
                  <th className="px-3 py-2 text-right font-medium">Selection rate</th>
                  <th className="px-3 py-2 text-right font-medium">Impact ratio</th>
                  <th className="px-3 py-2 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody>
                {report.groups.map((g) => (
                  <tr key={g.group} className={`border-b border-line/60 last:border-0 ${g.adverse ? 'bg-rust-50/40' : ''}`}>
                    <td className="px-3 py-2 font-medium text-ink">{g.group}</td>
                    <td className="px-3 py-2 text-right tnum text-ink">{g.total.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tnum text-ink">{g.selected.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tnum text-ink">{g.selectionRatePct}%</td>
                    <td className="px-3 py-2 text-right tnum text-ink">{g.impactRatio == null ? '—' : g.impactRatio.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {!g.sufficientSample ? (
                        <span className="text-xs text-muted">low sample</span>
                      ) : g.adverse ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-rust-600">
                          <AlertTriangle size={11} /> below 4/5
                        </span>
                      ) : (
                        <span className="text-xs text-sage-600">ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            {report.flagged > 0
              ? `${report.flagged} group(s) fall below the four-fifths threshold and warrant review.`
              : 'No sufficiently-sampled group falls below the four-fifths threshold.'}
          </p>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function SecurityView() {
  const [cov, setCov] = useState<RlsCoverage | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    loadRlsCoverage().then((c) => {
      setCov(c)
      setLoading(false)
    })
  }, [])

  if (loading) return <Spinner label="Checking RLS coverage…" />
  if (!cov || cov.total === 0)
    return (
      <Card className="p-5 text-sm text-muted">
        RLS coverage is available to administrators only. Sign in as an admin to view the per-table security
        posture.
      </Card>
    )

  const allGood = cov.gaps.length === 0
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Tables protected" value={`${cov.covered}/${cov.total}`} tone={allGood ? 'good' : 'warn'} />
        <StatCard label="RLS gaps" value={cov.gaps.length} tone={allGood ? 'good' : 'warn'} />
        <StatCard label="Posture" value={allGood ? 'Pass' : 'Review'} tone={allGood ? 'good' : 'warn'} />
      </div>

      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Lock size={15} /> Row-Level Security coverage
        </h2>
        <p className="mb-4 text-xs text-muted">
          Data access is enforced by Postgres RLS (org + region isolation), not by the client. Every public
          table should have RLS enabled with at least one policy.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Table</th>
                <th className="px-3 py-2 font-medium">RLS</th>
                <th className="px-3 py-2 text-right font-medium">Policies</th>
              </tr>
            </thead>
            <tbody>
              {cov.rows.map((r) => {
                const ok = r.rls_enabled && r.policies > 0
                return (
                  <tr key={r.table_name} className={`border-b border-line/60 last:border-0 ${ok ? '' : 'bg-rust-50/40'}`}>
                    <td className="px-3 py-2 font-mono text-xs text-ink">{r.table_name}</td>
                    <td className="px-3 py-2">
                      {ok ? (
                        <span className="inline-flex items-center gap-1 text-xs text-sage-600">
                          <CheckCircle2 size={12} /> enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-rust-600">
                          <ShieldAlert size={12} /> {r.rls_enabled ? 'no policy' : 'disabled'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tnum text-ink">{r.policies}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
