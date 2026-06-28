import type { Role } from './types'
import type { BadgeTone } from '../components/primitives/Badge'

// ---------------------------------------------------------------------------
// RBAC model — the front-end source of truth for what each role can DO in the
// UI. The database RLS policies remain the real security boundary; these
// capabilities only decide which affordances to render. Server always re-checks.
// ---------------------------------------------------------------------------

export const APP_ROLES: Role[] = ['admin', 'recruiter', 'coordinator', 'hiring_manager', 'compliance']

export interface RoleMeta {
  label: string
  description: string
  tone: BadgeTone
}

export const ROLE_META: Record<Role, RoleMeta> = {
  admin: {
    label: 'Admin',
    description: 'Full access across every region, plus team, settings, and integrations.',
    tone: 'ink',
  },
  recruiter: {
    label: 'Recruiter',
    description: 'Owns candidates and pipeline within their assigned regions.',
    tone: 'sage',
  },
  coordinator: {
    label: 'Coordinator',
    description: 'Schedules interviews and supports recruiters across the pipeline.',
    tone: 'clay',
  },
  hiring_manager: {
    label: 'Hiring Manager',
    description: 'Reviews candidates and interviews for their own requisitions.',
    tone: 'clay',
  },
  compliance: {
    label: 'Compliance',
    description: 'Read-only oversight of analytics and the hiring audit trail.',
    tone: 'rust',
  },
}

export type Capability =
  | 'view_dashboard'
  | 'view_candidates'
  | 'view_jobs'
  | 'view_analytics'
  | 'view_facilities'
  | 'view_matching'
  | 'view_positions'
  | 'manage_team'
  | 'manage_settings'
  | 'import_data'
  | 'manage_integrations'

const ALL_CAPABILITIES: Capability[] = [
  'view_dashboard',
  'view_candidates',
  'view_jobs',
  'view_analytics',
  'view_facilities',
  'view_matching',
  'view_positions',
  'manage_team',
  'manage_settings',
  'import_data',
  'manage_integrations',
]

// admin + recruiter keep exactly their current reach so nothing regresses; the
// three new roles get a sensible, least-privilege starting surface.
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  admin: ALL_CAPABILITIES,
  recruiter: [
    'view_dashboard',
    'view_candidates',
    'view_jobs',
    'view_analytics',
    'view_facilities',
    'view_matching',
    'view_positions',
  ],
  coordinator: ['view_dashboard', 'view_candidates', 'view_jobs', 'view_matching'],
  hiring_manager: ['view_dashboard', 'view_jobs', 'view_candidates'],
  compliance: ['view_dashboard', 'view_analytics'],
}

/** Whether a role may use a capability. Unknown/legacy roles get nothing. */
export function roleCan(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false
}

/** Human label for any role value (tolerates legacy DB roles). */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—'
  return (ROLE_META as Record<string, RoleMeta | undefined>)[role]?.label ?? role
}
