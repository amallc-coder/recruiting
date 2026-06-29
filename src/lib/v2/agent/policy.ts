// Agent governance policy — the single source of truth for what the AI agent
// (Autopilot or the command console) may do on its own, what needs a human's
// explicit sign-off, and what it may NEVER do automatically. Both flagship
// surfaces consult this registry, and the client re-validates every proposed
// action against it before execution (defense in depth: the model's suggested
// tier is advisory; THIS table decides).
//
// Tiers:
//   auto       — low-risk, reversible, internal. The agent may execute without
//                asking (still fully audit-logged).
//   approval   — meaningful or outward-facing. The agent may execute ONLY after
//                an explicit human approval click.
//   prohibited — high-stakes / irreversible / regulated. The agent NEVER executes
//                these, even on a click. A human must do them in the normal UI.

export type ActionTier = 'auto' | 'approval' | 'prohibited'
export type TargetKind = 'requisition' | 'candidate' | 'application' | 'offer' | 'screening' | 'none'

export interface ActionSpec {
  type: string
  label: string
  tier: ActionTier
  /** Plain-English description shown in the plan + governance legend. */
  description: string
  /** Which entity this action targets (drives deep links). */
  target: TargetKind
  /** True when the client has a wired, safe handler that can actually run it. */
  executable: boolean
}

export const ACTION_POLICY: Record<string, ActionSpec> = {
  // ---- auto (agent may run unattended) ----
  'kpi.snapshot': {
    type: 'kpi.snapshot',
    label: 'Capture KPI snapshot',
    tier: 'auto',
    description: 'Persist the current KPI headline so trends have a baseline. Internal, reversible.',
    target: 'none',
    executable: true,
  },
  'note.flag': {
    type: 'note.flag',
    label: 'Flag for recruiter attention',
    tier: 'auto',
    description: 'Surface an item (stale req, aging candidate) for a human to look at. Informational only.',
    target: 'none',
    executable: true,
  },
  'match.refresh': {
    type: 'match.refresh',
    label: 'Refresh AI match shortlist',
    tier: 'auto',
    description: 'Re-rank candidates for a requisition. Read-only ranking — surfaces the top matches.',
    target: 'requisition',
    executable: true,
  },

  // ---- approval (human clicks to run) ----
  'screening.draft': {
    type: 'screening.draft',
    label: 'Draft a screening',
    tier: 'approval',
    description: 'Create a DRAFT screening questionnaire for a candidate (not sent). A recruiter reviews before it goes out.',
    target: 'candidate',
    executable: true,
  },
  'screening.dispatch': {
    type: 'screening.dispatch',
    label: 'Send a screening (SMS/voice)',
    tier: 'approval',
    description: 'Outbound contact with a candidate — always requires a human to approve before sending.',
    target: 'screening',
    executable: false,
  },
  'pipeline.advance': {
    type: 'pipeline.advance',
    label: 'Advance a candidate a stage',
    tier: 'approval',
    description: 'Move a candidate forward in the pipeline. Requires recruiter judgment + a scorecard gate.',
    target: 'application',
    executable: false,
  },
  'interview.schedule': {
    type: 'interview.schedule',
    label: 'Send a self-scheduling link',
    tier: 'approval',
    description: 'Invite a candidate to book an interview slot. Outbound contact — needs approval.',
    target: 'application',
    executable: false,
  },
  'candidate.reengage': {
    type: 'candidate.reengage',
    label: 'Re-engage a candidate',
    tier: 'approval',
    description: 'Reach out to a passive or license-expiring candidate. Outbound contact — needs approval.',
    target: 'candidate',
    executable: false,
  },

  // ---- prohibited (agent never executes) ----
  'offer.send': {
    type: 'offer.send',
    label: 'Send an offer',
    tier: 'prohibited',
    description: 'Extending an offer is a human decision. The agent will never send one.',
    target: 'offer',
    executable: false,
  },
  'offer.accept': {
    type: 'offer.accept',
    label: 'Accept/finalize an offer',
    tier: 'prohibited',
    description: 'Recording an acceptance is a human, contractual action.',
    target: 'offer',
    executable: false,
  },
  'candidate.reject': {
    type: 'candidate.reject',
    label: 'Reject a candidate',
    tier: 'prohibited',
    description: 'Adverse decisions affecting a person are never automated (fairness + compliance).',
    target: 'application',
    executable: false,
  },
  'candidate.hire': {
    type: 'candidate.hire',
    label: 'Mark a candidate hired',
    tier: 'prohibited',
    description: 'A hire is a human, contractual decision.',
    target: 'application',
    executable: false,
  },
  'comp.change': {
    type: 'comp.change',
    label: 'Change compensation',
    tier: 'prohibited',
    description: 'Pay decisions are never automated.',
    target: 'offer',
    executable: false,
  },
  'candidate.delete': {
    type: 'candidate.delete',
    label: 'Delete records',
    tier: 'prohibited',
    description: 'Destructive data operations are never automated.',
    target: 'candidate',
    executable: false,
  },
  'comms.external': {
    type: 'comms.external',
    label: 'Send arbitrary external message',
    tier: 'prohibited',
    description: 'Free-form outbound communication is never automated.',
    target: 'none',
    executable: false,
  },
}

/** Every known action type — fed to the planner so it stays within the policy. */
export const ACTION_TYPES = Object.keys(ACTION_POLICY)

export function specFor(type: string): ActionSpec | null {
  return ACTION_POLICY[type] ?? null
}

/**
 * Resolve a proposed action to its policy spec. Unknown action types are treated
 * as PROHIBITED — the agent never runs anything it can't account for.
 */
export function resolveTier(type: string): ActionTier {
  return ACTION_POLICY[type]?.tier ?? 'prohibited'
}

export function isProhibited(type: string): boolean {
  return resolveTier(type) === 'prohibited'
}

/** Can the agent run this step right now (given an approval decision)? */
export function canExecute(type: string, approved: boolean): boolean {
  const spec = ACTION_POLICY[type]
  if (!spec || !spec.executable) return false
  if (spec.tier === 'prohibited') return false
  if (spec.tier === 'approval' && !approved) return false
  return true
}

/** Deep link to where a human can complete an action manually. */
export function deepLink(target: TargetKind, id?: string | null): string {
  switch (target) {
    case 'requisition':
      return id ? `/requisitions/${id}` : '/requisitions'
    case 'candidate':
      return id ? `/candidates/${id}` : '/candidates'
    case 'application':
      return id ? `/requisitions/${id}` : '/requisitions'
    case 'offer':
      return '/offers'
    case 'screening':
      return '/screening'
    default:
      return '/'
  }
}

export const TIER_LABELS: Record<ActionTier, string> = {
  auto: 'Auto',
  approval: 'Needs approval',
  prohibited: 'Human only',
}
