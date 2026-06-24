export type Role = 'admin' | 'recruiter'

export type OpeningStatus = 'open' | 'on_hold' | 'filled' | 'closed' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Stage =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: Role
  active: boolean
  created_at: string
  updated_at: string
}

export interface JobOpening {
  id: string
  title: string
  department: string | null
  client: string | null
  location: string | null
  employment_type: string | null
  status: OpeningStatus
  priority: Priority
  openings_count: number
  hiring_manager: string | null
  salary_min: number | null
  salary_max: number | null
  description: string | null
  notes: string | null
  assigned_recruiter_id: string | null
  date_opened: string
  target_fill_date: string | null
  date_filled: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Candidate {
  id: string
  opening_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  location: string | null
  source: string | null
  current_stage: Stage
  status: 'active' | 'inactive'
  resume_url: string | null
  linkedin_url: string | null
  expected_salary: number | null
  rating: number | null
  notes: string | null
  recruiter_id: string | null
  applied_date: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface StageHistory {
  id: string
  candidate_id: string
  from_stage: Stage | null
  to_stage: Stage
  note: string | null
  changed_by: string | null
  created_at: string
}

export const STAGES: Stage[] = [
  'applied',
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
]

export const PIPELINE_STAGES: Stage[] = ['applied', 'screening', 'interview', 'offer', 'hired']

export const STAGE_LABELS: Record<Stage, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const STATUS_LABELS: Record<OpeningStatus, string> = {
  open: 'Open',
  on_hold: 'On hold',
  filled: 'Filled',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
}
