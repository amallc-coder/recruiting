// v2 types used by the requisitions/pipeline workspace. Mirrors supabase/v2/types.ts
// (kept here so it's inside the app's tsconfig include) plus a few joined shapes.

export type RequisitionStatus =
  | 'draft'
  | 'pending_approval'
  | 'open'
  | 'on_hold'
  | 'filled'
  | 'closed'
  | 'cancelled'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ApplicationStatus = 'active' | 'rejected' | 'withdrawn' | 'hired'
export type CandidateStatus = 'new' | 'active' | 'passive' | 'placed' | 'do_not_contact' | 'archived'
export type CredentialType = 'license' | 'board_cert' | 'dea' | 'immunization' | 'bls'
export type PipelineStageType = 'applied' | 'screen' | 'interview' | 'offer' | 'hired' | 'rejected' | 'in_process'

export interface RoleFamily {
  code: string
  label: string
  description: string | null
  sort_order: number
}

export interface Facility {
  id: string
  name: string
  state: string | null
  city: string | null
}

export interface OrgUser {
  id: string
  full_name: string
  role: string
}

export interface PipelineStage {
  id: string
  role_family: string
  name: string
  sort_order: number
  stage_type: PipelineStageType
  is_terminal: boolean
}

export interface Requisition {
  id: string
  org_id: string
  facility_id: string
  title: string
  role_family: string
  specialty: string | null
  status: RequisitionStatus
  headcount: number
  budget: number | null
  hiring_manager_id: string | null
  approval_status: ApprovalStatus
  opened_at: string | null
  filled_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Candidate {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  source: string | null
  status: CandidateStatus
  tags: string[]
}

export interface Application {
  id: string
  org_id: string
  candidate_id: string
  requisition_id: string
  current_stage_id: string | null
  status: ApplicationStatus
  applied_at: string
  reject_reason: string | null
}

// ---- joined / derived shapes ----

export interface RequisitionRow extends Requisition {
  facility: Facility | null
  manager: { id: string; full_name: string } | null
  // PostgREST count embed → [{ count }]
  applications: { count: number }[]
}

export type ReadinessLevel = 'green' | 'amber' | 'red'

export interface PipelineCard {
  application: Application
  candidate: Candidate
  stageId: string | null
  readiness: ReadinessLevel
  placementReady: boolean
  missingCredentials: CredentialType[]
  daysInStage: number
  // Placeholder until the AI module lands; 0–100 or null.
  fitScore: number | null
}
