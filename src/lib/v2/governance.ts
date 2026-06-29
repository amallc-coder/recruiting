// Governance, bias & security posture data layer. Powers the AI Governance
// dashboard (task #47): the AI-decision + agent-action audit trail, an
// adverse-impact (four-fifths) selection-rate report, and a live RLS coverage
// report. Everything reads under the caller's RLS; the RLS report is gated to
// admins by a SECURITY DEFINER function (security_posture()).
import { v2, fetchAll } from './client'

// ---------------------------------------------------------------------------
// Security posture — live RLS coverage (admin only)
// ---------------------------------------------------------------------------
export interface RlsRow {
  table_name: string
  rls_enabled: boolean
  policies: number
}
export interface RlsCoverage {
  rows: RlsRow[]
  total: number
  covered: number
  gaps: RlsRow[]
}

export async function loadRlsCoverage(): Promise<RlsCoverage> {
  const { data, error } = await v2.rpc('security_posture')
  const rows = (error ? [] : ((data as RlsRow[]) ?? [])).map((r) => ({
    table_name: r.table_name,
    rls_enabled: r.rls_enabled,
    policies: Number(r.policies ?? 0),
  }))
  rows.sort((a, b) => a.table_name.localeCompare(b.table_name))
  const covered = rows.filter((r) => r.rls_enabled && r.policies > 0).length
  const gaps = rows.filter((r) => !r.rls_enabled || r.policies === 0)
  return { rows, total: rows.length, covered, gaps }
}

// ---------------------------------------------------------------------------
// AI activity — decision log + agent audit trail
// ---------------------------------------------------------------------------
export interface AiDecisionRow {
  entity_type: string | null
  model: string | null
  score: number | null
  rationale: string | null
  created_by_agent: string | null
  human_override: boolean | null
  created_at: string
}
export interface AuditRow {
  action: string
  entity_type: string | null
  detail: Record<string, unknown> | null
  created_at: string
}
export interface AiActivity {
  decisions: AiDecisionRow[]
  audit: AuditRow[]
  decisionsLogged: number
  overrides: number
  overrideRatePct: number | null
  autopilotPlans: number
  autopilotExecs: number
  consoleQueries: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function headCount(table: string, build?: (q: any) => any): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = v2.from(table).select('id', { count: 'exact', head: true })
    if (build) q = build(q)
    const { count } = await q
    return count ?? 0
  } catch {
    return 0
  }
}

export async function loadAiActivity(): Promise<AiActivity> {
  const [decRes, auditRes, decisionsLogged, overrides, autopilotPlans, autopilotExecs, consoleQueries] = await Promise.all([
    v2.from('ai_decisions').select('entity_type,model,score,rationale,created_by_agent,human_override,created_at').order('created_at', { ascending: false }).limit(50),
    v2.from('audit_logs').select('action,entity_type,detail,created_at').in('action', ['console.query', 'autopilot.plan', 'autopilot.execute', 'screening.callback_scheduled']).order('created_at', { ascending: false }).limit(50),
    headCount('ai_decisions'),
    headCount('ai_decisions', (q) => q.eq('human_override', true)),
    headCount('audit_logs', (q) => q.eq('action', 'autopilot.plan')),
    headCount('audit_logs', (q) => q.eq('action', 'autopilot.execute')),
    headCount('audit_logs', (q) => q.eq('action', 'console.query')),
  ])
  return {
    decisions: (decRes.data as AiDecisionRow[]) ?? [],
    audit: (auditRes.data as AuditRow[]) ?? [],
    decisionsLogged,
    overrides,
    overrideRatePct: decisionsLogged > 0 ? Math.round((overrides / decisionsLogged) * 100) : null,
    autopilotPlans,
    autopilotExecs,
    consoleQueries,
  }
}

// ---------------------------------------------------------------------------
// Adverse-impact (four-fifths rule) selection-rate report
// ---------------------------------------------------------------------------
export type ImpactDimension = 'source' | 'role_family' | 'facility_state'

export interface ImpactGroup {
  group: string
  total: number
  selected: number
  selectionRatePct: number
  impactRatio: number | null // vs the highest-selecting group; null if insufficient sample
  adverse: boolean
  sufficientSample: boolean
}
export interface AdverseImpactReport {
  dimension: ImpactDimension
  groups: ImpactGroup[]
  referenceGroup: string | null
  minSample: number
  flagged: number
}

interface ImpactAppRow {
  status: string
  candidate: { source: string | null } | null
  requisition: { role_family: string | null; facility: { state: string | null } | null } | null
}

const MIN_SAMPLE = 25 // below this the four-fifths ratio is statistical noise

function dimValue(r: ImpactAppRow, d: ImpactDimension): string {
  if (d === 'source') return r.candidate?.source?.trim() || 'Unknown'
  if (d === 'role_family') return r.requisition?.role_family?.trim() || 'Unspecified'
  return r.requisition?.facility?.state?.trim() || 'Unknown'
}

/**
 * Compute selection rates by group and the four-fifths impact ratio against the
 * highest-selecting group. NOTE: this runs over OPERATIONAL segments (source,
 * role family, facility state), NOT protected classes — this system does not
 * collect race/gender/age/EEO data. A legally-defensible adverse-impact audit
 * needs voluntary self-ID data that would be stored and analyzed separately.
 */
export async function loadAdverseImpact(dimension: ImpactDimension): Promise<AdverseImpactReport> {
  const rows = await fetchAll<ImpactAppRow>(
    'applications',
    'status,candidate:candidates(source),requisition:requisitions(role_family,facility:facilities(state))',
  )
  const tally = new Map<string, { total: number; selected: number }>()
  for (const r of rows) {
    const g = dimValue(r, dimension)
    const t = tally.get(g) ?? { total: 0, selected: 0 }
    t.total++
    if (r.status === 'hired') t.selected++
    tally.set(g, t)
  }

  let base: ImpactGroup[] = Array.from(tally, ([group, { total, selected }]) => ({
    group,
    total,
    selected,
    selectionRatePct: total > 0 ? Math.round((selected / total) * 1000) / 10 : 0,
    impactRatio: null,
    adverse: false,
    sufficientSample: total >= MIN_SAMPLE,
  })).sort((a, b) => b.total - a.total)

  // Reference = highest selection rate among sufficiently-sampled groups.
  const eligible = base.filter((g) => g.sufficientSample)
  const maxRate = Math.max(0, ...eligible.map((g) => g.selectionRatePct))
  const refGroup = eligible.find((g) => g.selectionRatePct === maxRate)?.group ?? null

  base = base.map((g) => {
    if (!g.sufficientSample || maxRate === 0) return g
    const ratio = Math.round((g.selectionRatePct / maxRate) * 100) / 100
    return { ...g, impactRatio: ratio, adverse: ratio < 0.8 }
  })

  return {
    dimension,
    groups: base,
    referenceGroup: refGroup,
    minSample: MIN_SAMPLE,
    flagged: base.filter((g) => g.adverse).length,
  }
}
