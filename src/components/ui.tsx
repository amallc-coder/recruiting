import type { ReactNode } from 'react'
import { STAGE_LABELS, STATUS_LABELS, PRIORITY_LABELS } from '../lib/types'
import type { Stage, OpeningStatus, Priority } from '../lib/types'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-gray-500">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: ReactNode
  hint?: string
}) {
  return (
    <div className="card p-5">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  )
}

const STAGE_COLORS: Record<Stage, string> = {
  applied: 'bg-gray-100 text-gray-700',
  screening: 'bg-blue-100 text-blue-700',
  interview: 'bg-indigo-100 text-indigo-700',
  offer: 'bg-amber-100 text-amber-700',
  hired: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-500',
}

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
  )
}

const STATUS_COLORS: Record<OpeningStatus, string> = {
  open: 'bg-green-100 text-green-700',
  on_hold: 'bg-amber-100 text-amber-700',
  filled: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
}

export function StatusBadge({ status }: { status: OpeningStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority]}`}>
      {PRIORITY_LABELS[priority]}
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className={`card my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
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
      <div className="text-base font-medium text-gray-700">{title}</div>
      {hint && <div className="mt-1 max-w-md text-sm text-gray-400">{hint}</div>}
    </div>
  )
}
