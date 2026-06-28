import { Badge } from '../../components/primitives'
import type { BadgeTone } from '../../components/primitives/Badge'
import type { RequisitionStatus, ReadinessLevel } from '../../lib/v2/types'

const REQ_STATUS_TONE: Record<RequisitionStatus, BadgeTone> = {
  draft: 'neutral',
  pending_approval: 'clay',
  open: 'sage',
  on_hold: 'clay',
  filled: 'ink',
  closed: 'neutral',
  cancelled: 'rust',
}

export const REQ_STATUS_LABEL: Record<RequisitionStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  open: 'Open',
  on_hold: 'On hold',
  filled: 'Filled',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export function ReqStatusBadge({ status }: { status: RequisitionStatus }) {
  return <Badge tone={REQ_STATUS_TONE[status]}>{REQ_STATUS_LABEL[status]}</Badge>
}

const READINESS: Record<ReadinessLevel, { tone: BadgeTone; label: string }> = {
  green: { tone: 'sage', label: 'Ready' },
  amber: { tone: 'clay', label: 'Verifying' },
  red: { tone: 'rust', label: 'Not ready' },
}

/** Placement-ready credential badge (green/amber/red) from the placement_ready view. */
export function PlacementBadge({ level, missing }: { level: ReadinessLevel; missing?: string[] }) {
  const m = READINESS[level]
  const title =
    level === 'green'
      ? 'All required credentials verified and current'
      : missing && missing.length
        ? `${level === 'amber' ? 'Awaiting verification' : 'Missing'}: ${missing.join(', ')}`
        : undefined
  return (
    <span title={title} className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${level === 'green' ? 'bg-sage-500' : level === 'amber' ? 'bg-clay-500' : 'bg-rust-500'}`}
      />
      <Badge tone={m.tone}>{m.label}</Badge>
    </span>
  )
}
