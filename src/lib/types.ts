export type Role = 'admin' | 'recruiter'

export type ClinicalRole = 'lpn' | 'ma' | 'np' | 'pa' | 'md' | 'psych_np' | 'wound'

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

// ---- Reference data & labels -------------------------------------------------

export const CLINICAL_ROLES: ClinicalRole[] = ['lpn', 'ma', 'np', 'pa', 'md', 'psych_np', 'wound']

export const ROLE_LABELS: Record<ClinicalRole, string> = {
  lpn: 'LPN',
  ma: 'MA',
  np: 'NP',
  pa: 'PA',
  md: 'Physician (MD)',
  psych_np: 'Psych NP',
  wound: 'Wound',
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

// Which flow applies to a given clinical role.
export function checklistForRole(role: ClinicalRole): ChecklistStep[] {
  return role === 'lpn' || role === 'ma' ? LPN_FLOW : NP_PA_FLOW
}
