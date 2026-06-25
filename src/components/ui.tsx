import type { ReactNode } from 'react'
import { STAGE_LABELS, PRIORITY_LABELS, ROLE_LABELS } from '../lib/types'
import type { Stage, Priority, ClinicalRole } from '../lib/types'

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
  tone,
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'warn' | 'good'
}) {
  const valueColor =
    tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-green-600' : 'text-gray-900'
  return (
    <div className="card p-5">
      <div className="text-sm font-medium text-gray-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${valueColor}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  )
}

const STAGE_COLORS: Record<Stage, string> = {
  sourced: 'bg-gray-100 text-gray-700',
  interview: 'bg-blue-100 text-blue-700',
  offer: 'bg-indigo-100 text-indigo-700',
  accepted: 'bg-violet-100 text-violet-700',
  background: 'bg-amber-100 text-amber-700',
  cleared: 'bg-teal-100 text-teal-700',
  welcome_call: 'bg-cyan-100 text-cyan-700',
  training: 'bg-lime-100 text-lime-700',
  active: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  no_response: 'bg-gray-100 text-gray-500',
}

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
  )
}

const PRIORITY_COLORS: Record<Priority, string> = {
  standard: 'bg-gray-100 text-gray-600',
  premium: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
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
    <span className="inline-flex rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
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
