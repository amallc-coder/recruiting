export type Role = 'admin' | 'recruiter'

export type ClinicalRole =
  | 'lpn' | 'ma' | 'np' | 'pa' | 'md' | 'psych_np' | 'wound'
  | 'rn' | 'tech' | 'admin' | 'ops'

export type Stage =
  | 'sourced'
  | 'interview'
  | 'offer'
  | 'accepted'
  | 'background'
  | 'cleared'
  | 'welcome_call'
  | 'training'
  | 'active'
  | 'declined'
  | 'no_response'

export type Priority = 'standard' | 'premium' | 'urgent'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  active: boolean
  created_at: string
  updated_at: string
}

export interface Facility {
  id: string
  name: string
  division: string | null
  region: string | null
  portfolio: string | null
  city: string | null
  state: string | null
  zip: string | null
  address: string | null
  phone: string | null
  fax: string | null
  census: number | null
  capacity: number | null
  active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CoverageNeed {
  id: string
  facility_id: string
  role: ClinicalRole
  have_count: number
  need_count: number
  priority: Priority
  current_provider: string | null
  description: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Candidate {
  id: string
  full_name: string
  role: ClinicalRole
  email: string | null
  phone: string | null
  source: string | null
  facility_id: string | null
  region: string | null
  recruiter_id: string | null
  current_stage: Stage
  background_sent_date: string | null
  background_cleared_date: string | null
  welcome_call_done: boolean
  start_date: string | null
  resume_text: string | null
  checklist: Record<string, boolean>
  rating: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface StageHistory {
  id: string
  candidate_id: string
  from_stage: Stage | null
  to_stage: Stage
  changed_by: string | null
  created_at: string
}

// ---- ATS layer: companies, jobs, applications --------------------------------

// The single default tenant until the multi-company workspace phase lands.
export const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001'

export type JobStatus = 'draft' | 'published' | 'paused' | 'closed' | 'archived'
export type EmploymentType =
  | 'full_time' | 'part_time' | 'contract' | 'per_diem' | 'temporary' | 'internship'
export type Workplace = 'onsite' | 'hybrid' | 'remote'

export interface Job {
  id: string
  company_id: string
  title: string
  department: string | null
  location: string | null
  employment_type: EmploymentType
  workplace: Workplace
  salary_min: number | null
  salary_max: number | null
  salary_unit: 'year' | 'hour'
  description: string | null
  responsibilities: string | null
  requirements: string | null
  benefits: string | null
  hiring_manager_id: string | null
  assigned_recruiter_id: string | null
  facility_id: string | null
  role: ClinicalRole | null
  status: JobStatus
  visibility: 'public' | 'internal'
  slug: string | null
  open_date: string | null
  close_date: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Application {
  id: string
  company_id: string
  job_id: string
  candidate_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  linkedin: string | null
  portfolio: string | null
  cover_letter: string | null
  resume_url: string | null
  resume_text: string | null
  source: string | null
  custom_answers: Record<string, unknown>
  stage: Stage
  assigned_recruiter_id: string | null
  created_at: string
  updated_at: string
}

export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'no_show'
export type OfferStatus = 'pending' | 'sent' | 'accepted' | 'declined' | 'expired' | 'negotiating'

export interface Interview {
  id: string
  company_id: string
  candidate_id: string
  job_id: string | null
  application_id: string | null
  interviewer_id: string | null
  scheduled_at: string | null
  duration_min: number
  location: string | null
  status: InterviewStatus
  feedback: string | null
  score: number | null
  created_at: string
  updated_at: string
}

export interface Offer {
  id: string
  company_id: string
  candidate_id: string
  job_id: string | null
  application_id: string | null
  salary: number | null
  bonus: number | null
  equity: string | null
  start_date: string | null
  status: OfferStatus
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
  signed_url: string | null
  created_at: string
  updated_at: string
}

export const INTERVIEW_STATUSES: InterviewStatus[] = ['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show']
export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', rescheduled: 'Rescheduled', no_show: 'No-show',
}
export const OFFER_STATUSES: OfferStatus[] = ['pending', 'sent', 'accepted', 'declined', 'expired', 'negotiating']
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: 'Pending', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', negotiating: 'Negotiating',
}

export const JOB_STATUSES: JobStatus[] = ['draft', 'published', 'paused', 'closed', 'archived']
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  paused: 'Paused',
  closed: 'Closed',
  archived: 'Archived',
}

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  'full_time', 'part_time', 'contract', 'per_diem', 'temporary', 'internship',
]
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  per_diem: 'Per diem',
  temporary: 'Temporary',
  internship: 'Internship',
}

export const WORKPLACE_TYPES: Workplace[] = ['onsite', 'hybrid', 'remote']
export const WORKPLACE_LABELS: Record<Workplace, string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
}

// ---- Reference data & labels -------------------------------------------------

export const CLINICAL_ROLES: ClinicalRole[] = [
  'lpn', 'ma', 'np', 'pa', 'md', 'psych_np', 'wound', 'rn', 'tech', 'admin', 'ops',
]

export const ROLE_LABELS: Record<ClinicalRole, string> = {
  lpn: 'LPN',
  ma: 'MA',
  np: 'NP',
  pa: 'PA',
  md: 'Physician (MD)',
  psych_np: 'Psych NP',
  wound: 'Wound',
  rn: 'RN',
  tech: 'Tech / Imaging',
  admin: 'Front Office',
  ops: 'Operations',
}

export const STAGES: Stage[] = [
  'sourced',
  'interview',
  'offer',
  'accepted',
  'background',
  'cleared',
  'welcome_call',
  'training',
  'active',
  'declined',
  'no_response',
]

// Stages that represent forward pipeline progress (for funnel + KPIs).
export const PIPELINE_STAGES: Stage[] = [
  'sourced',
  'interview',
  'offer',
  'accepted',
  'background',
  'cleared',
  'welcome_call',
  'training',
  'active',
]

export const STAGE_LABELS: Record<Stage, string> = {
  sourced: 'Sourced',
  interview: 'Interview',
  offer: 'Offer',
  accepted: 'Offer Accepted',
  background: 'Background Sent',
  cleared: 'Background Cleared',
  welcome_call: 'Welcome Call',
  training: 'Onboarding / Training',
  active: 'Active',
  declined: 'Declined',
  no_response: 'No Response',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  standard: 'Standard',
  premium: 'Premium',
  urgent: 'Urgent',
}

// Suggested values surfaced as datalists in forms (editable free text in the DB).
export const DIVISIONS = ['Missouri / Kansas', 'Ohio']

export const REGION_SUGGESTIONS = [
  // Missouri / Kansas
  'Kansas City MO', 'KC Kansas', 'North Central', 'Central', 'Middle South MO',
  'Moberly', 'NW', 'NE', 'SE MO', 'Sedalia', 'St Louis', 'West Rural MO',
  // Ohio
  'Southern', 'Columbus', 'West Columbus', 'East Cleveland', 'Central Southern',
  'NE Ohio', 'West Cleveland', 'Northern Cleveland', 'Cleveland', 'Toledo', 'Fostoria',
]

export const PORTFOLIO_SUGGESTIONS = [
  'Embassy', 'AMA LTC', 'Divine', 'Lions 10', 'Tranquility', 'Reliant Homes',
]

export const SOURCE_SUGGESTIONS = [
  'Indeed', 'LinkedIn', 'Referral', 'Job Board', 'Career Site', 'Agency', 'Other',
]

export function isActivePipeline(stage: Stage): boolean {
  return !['active', 'declined', 'no_response'].includes(stage)
}

// ---- Hiring-handoff checklists (from the team's documented flows) ------------

export interface ChecklistStep {
  key: string
  label: string
  owner: string // who is responsible for this step
}

// LPN / MA onboarding handoff
export const LPN_FLOW: ChecklistStep[] = [
  { key: 'offer', label: 'Post, recruit, interview, and make offer', owner: 'Recruiter' },
  { key: 'background', label: 'Send background to candidate; once received, send background consent form', owner: 'Recruiter' },
  { key: 'onboarding', label: 'Launch electronic onboarding to candidate (except OH until set up)', owner: 'Tonja' },
  { key: 'groupchat', label: 'Post candidate details in group chat for Corby', owner: 'Recruiter' },
  { key: 'welcome_call', label: 'Schedule welcome call: program details + orientation date', owner: 'Corby' },
  { key: 'loop_team', label: 'Loop in Amber and the team on status', owner: 'Corby' },
]

// NP / PA / Physician onboarding handoff
export const NP_PA_FLOW: ChecklistStep[] = [
  { key: 'screen_summary', label: 'Post, recruit, screen; send bullet summary to Corby and schedule with Corby', owner: 'Recruiter' },
  { key: 'packet_kiyara', label: 'Email candidate details, resume, and new-hire packet to Kiyara (cc Rob)', owner: 'Recruiter' },
  { key: 'startdate_corby', label: 'Email candidate details and start date to Corby (cc Rob) for welcome call', owner: 'Recruiter' },
  { key: 'loop_team', label: 'Loop in Amber and the team on status', owner: 'Corby' },
  { key: 'welcome_call', label: 'Schedule welcome call: program details + orientation date', owner: 'Corby' },
]

// Which flow applies to a given clinical role. Providers (NP/PA/MD/Psych/Wound)
// use the provider handoff; everyone else uses the LPN/MA-style flow.
export function checklistForRole(role: ClinicalRole): ChecklistStep[] {
  return ['np', 'pa', 'md', 'psych_np', 'wound'].includes(role) ? NP_PA_FLOW : LPN_FLOW
}
