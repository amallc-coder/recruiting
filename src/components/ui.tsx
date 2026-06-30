import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { STAGE_LABELS, PRIORITY_LABELS, ROLE_LABELS } from '../lib/types'
import type { Stage, Priority, ClinicalRole } from '../lib/types'

/** Small "ⓘ" with a hover/focus tooltip — for defining a metric or term inline. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle" tabIndex={0} aria-label={text} title={text}>
      <Info size={13} className="cursor-help text-muted/70 hover:text-muted" />
      <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-52 -translate-x-1/2 rounded-md bg-ink px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-paper shadow-lg group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-muted">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-sage-500" />
      {label && <span className="font-mono text-xs uppercase tracking-wider">{label}</span>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone,
  info,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'warn' | 'good'
  /** Optional definition shown via an info tooltip next to the label. */
  info?: string
}) {
  const valueColor =
    tone === 'warn' ? 'text-rust-500' : tone === 'good' ? 'text-sage-600' : 'text-ink'
  return (
    <div className="card p-5">
      <div className="flex items-center gap-1 stat-label">
        <span>{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      <div className={`mt-1.5 text-3xl font-semibold tracking-tight tnum ${valueColor}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}

// Warm, muted badge palette in the Clinilytics spirit (sage / clay / rust + ink).
const STAGE_COLORS: Record<Stage, string> = {
  sourced: 'bg-brand-50 text-muted',
  interview: 'bg-clay-50 text-clay-600',
  offer: 'bg-clay-100 text-clay-600',
  accepted: 'bg-sage-50 text-sage-700',
  background: 'bg-clay-50 text-clay-600',
  cleared: 'bg-sage-50 text-sage-600',
  welcome_call: 'bg-sage-100 text-sage-700',
  training: 'bg-sage-100 text-sage-700',
  active: 'bg-sage-500 text-white',
  declined: 'bg-rust-50 text-rust-500',
  no_response: 'bg-brand-50 text-muted',
}

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
  )
}

const PRIORITY_COLORS: Record<Priority, string> = {
  standard: 'bg-brand-50 text-muted',
  premium: 'bg-clay-50 text-clay-600',
  urgent: 'bg-rust-50 text-rust-500',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

export function RoleBadge({ role }: { role: ClinicalRole }) {
  return (
    <span className="inline-flex rounded-md bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink">
      {ROLE_LABELS[role]}
    </span>
  )
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8">
      <div className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center py-16 text-center">
      <div className="text-base font-medium text-ink">{title}</div>
      {hint && <div className="mt-1 max-w-md text-sm text-muted">{hint}</div>}
    </div>
  )
}
