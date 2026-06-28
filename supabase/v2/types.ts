// ============================================================================
// Clinilytics ATS v2 — TypeScript types (generated to match 01_schema.sql)
// ----------------------------------------------------------------------------
// Hand-authored to mirror the v2 schema. If/when this schema is adopted, prefer
// regenerating with `supabase gen types typescript` against the live project.
// `uuid`, timestamptz, and date are represented as ISO strings.
// ============================================================================

export type UUID = string
export type Timestamptz = string // ISO 8601
export type DateString = string // 'YYYY-MM-DD'

// ---- enums ----
export type UserRole = 'admin' | 'recruiter' | 'coordinator' | 'hiring_manager' | 'compliance'
export type RequisitionStatus = 'draft' | 'pending_approval' | 'open' | 'on_hold' | 'filled' | 'closed' | 'cancelled'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ApplicationStatus = 'active' | 'rejected' | 'withdrawn' | 'hired'
export type CandidateStatus = 'new' | 'active' | 'passive' | 'placed' | 'do_not_contact' | 'archived'
export type DocumentType = 'resume' | 'license' | 'board_cert' | 'dea' | 'immunization' | 'bls' | 'reference' | 'other'
export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired'
export type CredentialType = 'license' | 'board_cert' | 'dea' | 'immunization' | 'bls'
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected' | 'expired'
export type InterviewType = 'phone_screen' | 'video' | 'onsite' | 'panel' | 'clinical'
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled'
export type CommChannel = 'email' | 'sms' | 'call'
export type CommDirection = 'inbound' | 'outbound'
export type Sentiment = 'positive' | 'neutral' | 'negative'
export type ScorecardRecommendation = 'strong_yes' | 'yes' | 'no' | 'strong_no'
export type PipelineStageType = 'applied' | 'screen' | 'interview' | 'offer' | 'hired' | 'rejected' | 'in_process'

// ---- rows ----
export interface Organization {
  id: UUID
  name: string
  slug: string | null
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface User {
  id: UUID
  org_id: UUID
  email: string
  full_name: string
  role: UserRole
  active: boolean
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface RoleFamily {
  code: string
  label: string
  description: string | null
  sort_order: number
}

export interface Facility {
  id: UUID
  org_id: UUID
  name: string
  state: string | null
  city: string | null
  address: string | null
  requirements: Record<string, unknown>
  active: boolean
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface FacilityCredentialRequirement {
  id: UUID
  facility_id: UUID
  role_family: string
  credential_type: CredentialType
  is_required: boolean
  created_at: Timestamptz
}

export interface PipelineStage {
  id: UUID
  role_family: string
  name: string
  sort_order: number
  stage_type: PipelineStageType
  is_terminal: boolean
  created_at: Timestamptz
}

export interface Candidate {
  id: UUID
  org_id: UUID
  full_name: string
  email: string | null
  phone: string | null
  source: string | null
  status: CandidateStatus
  tags: string[]
  notes: string | null
  created_by: UUID | null
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface Requisition {
  id: UUID
  org_id: UUID
  facility_id: UUID
  title: string
  role_family: string
  specialty: string | null
  status: RequisitionStatus
  headcount: number
  budget: number | null
  hiring_manager_id: UUID | null
  approval_status: ApprovalStatus
  opened_at: Timestamptz | null
  filled_at: Timestamptz | null
  created_by: UUID | null
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface Application {
  id: UUID
  org_id: UUID
  candidate_id: UUID
  requisition_id: UUID
  current_stage_id: UUID | null
  status: ApplicationStatus
  applied_at: Timestamptz
  reject_reason: string | null
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface ApplicationStageHistory {
  id: UUID
  application_id: UUID
  from_stage_id: UUID | null
  stage_id: UUID | null
  entered_at: Timestamptz
  exited_at: Timestamptz | null
  changed_by: UUID | null
}

export interface CandidateDocument {
  id: UUID
  candidate_id: UUID
  type: DocumentType
  storage_path: string | null
  file_name: string | null
  status: DocumentStatus
  uploaded_by: UUID | null
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface Credential {
  id: UUID
  candidate_id: UUID
  type: CredentialType
  number: string | null
  issuing_state: string | null
  issue_date: DateString | null
  expiration_date: DateString | null
  verification_status: VerificationStatus
  primary_source_verified: boolean
  verified_by: UUID | null
  verified_at: Timestamptz | null
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface Interview {
  id: UUID
  application_id: UUID
  scheduled_at: Timestamptz | null
  type: InterviewType
  interviewers: UUID[]
  status: InterviewStatus
  location: string | null
  duration_min: number | null
  created_by: UUID | null
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface Scorecard {
  id: UUID
  application_id: UUID
  interview_id: UUID | null
  reviewer_id: UUID | null
  recommendation: ScorecardRecommendation | null
  overall_rating: number | null
  submitted_at: Timestamptz | null
  created_at: Timestamptz
  updated_at: Timestamptz
}

export interface ScorecardResponse {
  id: UUID
  scorecard_id: UUID
  criterion: string
  rating: number | null
  comment: string | null
}

export interface Communication {
  id: UUID
  candidate_id: UUID
  application_id: UUID | null
  channel: CommChannel
  direction: CommDirection
  subject: string | null
  body: string | null
  transcript: string | null
  sentiment: Sentiment | null
  occurred_at: Timestamptz
  created_by: UUID | null
  created_at: Timestamptz
}

export interface AiDecision {
  id: UUID
  org_id: UUID
  entity_type: string
  entity_id: UUID
  model: string | null
  score: number | null
  rationale: string | null
  checklist: Record<string, unknown>
  created_by_agent: string | null
  human_override: boolean
  overridden_by: UUID | null
  overridden_at: Timestamptz | null
  created_at: Timestamptz
}

export interface KpiSnapshot {
  id: UUID
  org_id: UUID
  metric: string
  dimension: string | null
  dimension_value: string | null
  value: number | null
  period_start: DateString
  period_end: DateString
  captured_at: Timestamptz
}

// ---- view: per-application placement readiness ----
export interface ApplicationPlacementReady {
  application_id: UUID
  candidate_id: UUID
  requisition_id: UUID
  facility_id: UUID
  role_family: string
  placement_ready: boolean
  missing_credential_types: CredentialType[]
}
