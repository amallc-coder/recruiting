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
  region?: string | null
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
  // Free-form text (plain `text` columns) feeding AI matching + the public careers page.
  description: string | null
  requirements: string | null
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
  // Denormalized AI-screening context blended into matching (see screenings.ts).
  screening_summary?: string | null
  last_screened_at?: string | null
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

// ===========================================================================
// Gap-feature shapes (Phase 1 schema homes → Phase 3 frontend port)
// ===========================================================================

export type CoveragePriority = 'standard' | 'premium' | 'urgent'

export interface CoverageNeed {
  id: string
  facility_id: string
  role_family: string
  have_count: number
  need_count: number
  priority: CoveragePriority
  current_provider: string | null
  description: string | null
  notes: string | null
}

/** A facility row with its coverage needs grouped, for the Have/Need view. */
export interface FacilityCoverage extends Facility {
  needs: CoverageNeed[]
}

export type ScreeningStatus = 'draft' | 'approved' | 'sent' | 'completed' | 'analyzed' | 'cancelled'
export type ScreeningChannel = 'phone' | 'sms' | 'email' | 'manual'

export interface Screening {
  id: string
  org_id: string
  candidate_id: string
  requisition_id: string | null
  application_id: string | null
  recruiter_id: string | null
  status: ScreeningStatus
  channel: ScreeningChannel
  questions: unknown[]
  responses: unknown[]
  ai_summary: string | null
  ai_score: number | null
  ai_flags: unknown[]
  transcript: string | null
  external_ref: string | null
  created_at: string
}

export type OfferStatus = 'pending' | 'sent' | 'accepted' | 'declined' | 'expired' | 'negotiating'

export interface Offer {
  id: string
  org_id: string
  candidate_id: string
  application_id: string | null
  requisition_id: string | null
  salary: number | null
  bonus: number | null
  equity: string | null
  start_date: string | null
  status: OfferStatus
  sent_at: string | null
  created_at: string
}

export interface Position {
  id: string
  org_id: string
  code: string | null
  title: string
  category: string | null
  org_types: string[]
  rate_min: number | null
  rate_max: number | null
  rate_unit: string
  responsibilities: string[]
  requirements: string[]
  keywords: string[]
  ai_generated: boolean
  active: boolean
}

export type CostCategory = 'job_board' | 'agency' | 'referral' | 'software' | 'recruiter' | 'other'

export interface RecruitingCost {
  id: string
  org_id: string
  category: CostCategory
  vendor: string | null
  amount: number
  period: string | null
  notes: string | null
}

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'pending'

export interface Integration {
  id: string
  org_id: string
  name: string
  provider: string
  category: string
  status: IntegrationStatus
  auth_type: string
  is_enabled: boolean
  sync_direction: string
  last_sync_at: string | null
}
