// Positions repository: the catalog of roles a medical practice, SNF/LTC,
// management company, laboratory, or hospital may hire for — with AI-assisted
// generation of responsibilities & requirements for both new and existing
// roles. The catalog seed lives in the data store (demo/Supabase `positions`
// table); this module holds the types, org metadata, and the generation logic
// (Claude via the `ai-role` Edge Function, with a local heuristic fallback so
// it works in local mode and offline).

import { supabase, demoMode } from './supabase'

export type OrgType = 'practice' | 'snf' | 'mgmt' | 'lab' | 'hospital'

export const ORG_TYPES: { key: OrgType; label: string; short: string; blurb: string }[] = [
  { key: 'practice', label: 'Medical Practice', short: 'Practice', blurb: 'Outpatient clinics & physician practices' },
  { key: 'snf', label: 'Long-Term Care / SNF', short: 'LTC / SNF', blurb: 'Skilled nursing & long-term care facilities' },
  { key: 'mgmt', label: 'Management Company', short: 'Management', blurb: 'Corporate, operations & administration' },
  { key: 'lab', label: 'Laboratory', short: 'Lab', blurb: 'Clinical & diagnostic laboratories' },
  { key: 'hospital', label: 'Hospital', short: 'Hospital', blurb: 'Acute-care & hospital settings' },
]

export const ORG_LABEL: Record<OrgType, string> = Object.fromEntries(
  ORG_TYPES.map((o) => [o.key, o.label]),
) as Record<OrgType, string>

export const POSITION_CATEGORIES = [
  'Provider - Physician',
  'Provider - Advanced Practice',
  'Clinical - Nursing',
  'Clinical - MA',
  'Clinical - Therapy',
  'Clinical - Pharmacy',
  'Clinical - Tech',
  'Laboratory',
  'Admin - Front Office',
  'Operations - Leadership',
  'Other',
] as const

export interface Position {
  id: string
  code: string
  title: string
  category: string
  org_types: OrgType[]
  rate_min: number | null
  rate_max: number | null
  rate_unit: 'Hourly' | 'Annual' | 'NA'
  responsibilities: string[]
  requirements: string[]
  keywords: string[]
  active: boolean
  ai_generated?: boolean
  created_at?: string
  updated_at?: string
}

export interface GeneratedRole {
  title: string
  category: string
  org_types: OrgType[]
  rate_min: number | null
  rate_max: number | null
  rate_unit: 'Hourly' | 'Annual' | 'NA'
  responsibilities: string[]
  requirements: string[]
  keywords: string[]
  method: 'ai' | 'heuristic'
}

export function formatRate(p: Pick<Position, 'rate_min' | 'rate_max' | 'rate_unit'>): string {
  if (p.rate_unit === 'NA' || (p.rate_min == null && p.rate_max == null)) return '—'
  const fmt = (n: number) =>
    p.rate_unit === 'Hourly' ? `$${n}` : `$${Math.round(n / 1000)}k`
  const lo = p.rate_min != null ? fmt(p.rate_min) : '?'
  const hi = p.rate_max != null ? fmt(p.rate_max) : '?'
  const unit = p.rate_unit === 'Hourly' ? '/hr' : '/yr'
  return `${lo}–${hi}${unit}`
}

// ---- Heuristic role generator (offline fallback) ----------------------------
// Keyword-driven templates. Not as nuanced as Claude, but produces a sensible,
// role-specific starting point that the user can edit.

interface Family {
  test: RegExp
  category: string
  rate: [number | null, number | null, 'Hourly' | 'Annual' | 'NA']
  orgs: OrgType[]
  resp: string[]
  reqs: string[]
  keys: string[]
}

const FAMILIES: Family[] = [
  {
    test: /\bpsychiatr|pmhnp\b/i,
    category: 'Provider - Advanced Practice',
    rate: [120000, 150000, 'Annual'],
    orgs: ['practice', 'snf', 'hospital'],
    resp: [
      'Evaluate, diagnose, and manage psychiatric and behavioral-health conditions',
      'Prescribe and titrate psychotropic medications and monitor response',
      'Develop and adjust individualized treatment and safety plans',
      'Coordinate behavioral-health care with primary providers and facility staff',
      'Document assessments and progress notes in the EHR',
    ],
    reqs: ['Active PMHNP / psychiatric NP license', 'DEA registration', 'Geriatric or SNF behavioral-health experience preferred'],
    keys: ['psychiatric', 'behavioral health', 'pmhnp', 'psychotropic', 'mental health'],
  },
  {
    test: /\bwound\b/i,
    category: 'Provider - Advanced Practice',
    rate: [130000, 160000, 'Annual'],
    orgs: ['practice', 'snf', 'hospital'],
    resp: [
      'Assess and stage acute and chronic wounds; develop treatment plans',
      'Perform debridement, NPWT, and advanced wound-care procedures',
      'Round on facility residents and track healing outcomes',
      'Educate nursing staff on wound prevention and dressing protocols',
      'Document wound measurements and progress in the EHR',
    ],
    reqs: ['Active NP/PA license', 'Wound-care certification (CWS/WCC) preferred', 'DEA registration'],
    keys: ['wound', 'npwt', 'debridement', 'ulcer', 'skin integrity'],
  },
  {
    test: /\b(np|nurse practitioner|pa|physician assistant|aprn|fnp)\b/i,
    category: 'Provider - Advanced Practice',
    rate: [120000, 140000, 'Annual'],
    orgs: ['practice', 'snf', 'hospital'],
    resp: [
      'Provide primary and acute care: assessment, diagnosis, and treatment',
      'Order and interpret labs, imaging, and diagnostics',
      'Prescribe medications and manage chronic disease',
      'Round on patients/residents and coordinate with the attending physician',
      'Document encounters in the EHR (PointClickCare / eCW)',
    ],
    reqs: ['Active NP or PA license', 'DEA registration', 'Geriatric / long-term-care experience preferred'],
    keys: ['nurse practitioner', 'physician assistant', 'primary care', 'rounding', 'chronic care'],
  },
  {
    test: /\bphysician|\bmd\b|\bdo\b|hospitalist|medical director|cardiolog|neurolog|podiatr|psychiatr|radiolog|pain\b/i,
    category: 'Provider - Physician',
    rate: [230000, 350000, 'Annual'],
    orgs: ['practice', 'snf', 'hospital'],
    resp: [
      'Provide expert medical evaluation, diagnosis, and treatment within specialty',
      'Develop and oversee patient care and treatment plans',
      'Supervise advanced-practice providers and clinical staff',
      'Ensure documentation and coding compliance',
      'Collaborate on quality, utilization, and care-coordination initiatives',
    ],
    reqs: ['Active state medical license (MD/DO)', 'Board certification in specialty', 'DEA registration', 'Active or eligible credentialing'],
    keys: ['physician', 'attending', 'specialty', 'diagnosis', 'medical director'],
  },
  {
    test: /\bmds\b|\binfection prevention|clinical trainer|\brn\b|registered nurse|charge nurse|case manager/i,
    category: 'Clinical - Nursing',
    rate: [30, 42, 'Hourly'],
    orgs: ['snf', 'hospital', 'practice'],
    resp: [
      'Deliver and coordinate direct patient/resident nursing care',
      'Administer medications and treatments per orders',
      'Supervise LPNs and nursing assistants on the unit',
      'Complete assessments and maintain accurate EHR documentation',
      'Uphold infection-control and care-quality standards',
    ],
    reqs: ['Active RN license', 'BLS/ACLS certification', 'Long-term-care or acute-care experience preferred'],
    keys: ['registered nurse', 'rn', 'charge', 'assessment', 'care plan'],
  },
  {
    test: /\blpn\b|licensed practical/i,
    category: 'Clinical - Nursing',
    rate: [20, 28, 'Hourly'],
    orgs: ['snf', 'practice'],
    resp: [
      'Administer medications and treatments under RN/provider direction',
      'Provide wound care, vitals, and routine nursing care',
      'Chart accurately in the EHR (PointClickCare)',
      'Communicate resident status changes to the care team',
      'Support admissions, rounds, and care-plan execution',
    ],
    reqs: ['Active LPN license', 'BLS certification', 'SNF / LTC experience preferred'],
    keys: ['lpn', 'medication administration', 'wound care', 'vitals', 'charting'],
  },
  {
    test: /\bcna\b|nurse aide|certified nursing|qma|cma\b|med aide|medication aide|restorative/i,
    category: 'Clinical - Nursing',
    rate: [15, 22, 'Hourly'],
    orgs: ['snf', 'hospital'],
    resp: [
      'Assist residents with activities of daily living (ADLs)',
      'Take and record vital signs and intake/output',
      'Support mobility, transfers, and restorative programs',
      'Report changes in resident condition to nursing staff',
      'Maintain a clean, safe, and dignified care environment',
    ],
    reqs: ['Active CNA / aide certification', 'BLS preferred', 'Reliable, compassionate care approach'],
    keys: ['cna', 'adls', 'vitals', 'direct care', 'restorative'],
  },
  {
    test: /medical assistant|\bma\b|\bma\//i,
    category: 'Clinical - MA',
    rate: [16, 21, 'Hourly'],
    orgs: ['practice', 'snf'],
    resp: [
      'Room patients, take vitals, and document chief complaints',
      'Assist providers with exams and in-office procedures',
      'Administer injections and perform point-of-care testing',
      'Manage referrals, prior auths, and EHR documentation',
      'Support front-office flow and patient communication',
    ],
    reqs: ['MA certification or equivalent experience', 'BLS certification', 'EHR proficiency'],
    keys: ['medical assistant', 'rooming', 'vitals', 'injections', 'ehr'],
  },
  {
    test: /phlebotom/i,
    category: 'Clinical - Tech',
    rate: [16, 22, 'Hourly'],
    orgs: ['lab', 'practice', 'hospital'],
    resp: [
      'Perform venipuncture and capillary blood draws',
      'Label, process, and prepare specimens for testing',
      'Maintain chain-of-custody and specimen integrity',
      'Coordinate courier pickups and transport when required',
      'Follow safety, infection-control, and QA protocols',
    ],
    reqs: ['Phlebotomy certification', 'Specimen-handling experience', 'Valid driver’s license (if courier duties)'],
    keys: ['phlebotomy', 'venipuncture', 'specimen', 'draw', 'courier'],
  },
  {
    test: /\bct\b|\bmri\b|x-?ray|ultrasound|sonograph|echo|doppler|nuclear|mammograph|radiolog(ic|y) tech|imaging|surgical tech/i,
    category: 'Clinical - Tech',
    rate: [28, 45, 'Hourly'],
    orgs: ['practice', 'hospital', 'lab'],
    resp: [
      'Perform diagnostic imaging exams per provider orders',
      'Position patients and operate imaging equipment safely',
      'Ensure image quality and follow ALARA / safety standards',
      'Maintain equipment, supplies, and exam documentation',
      'Coordinate scheduling and patient prep',
    ],
    reqs: ['ARRT / modality registration or equivalent', 'BLS certification', 'State licensure where required'],
    keys: ['imaging', 'tech', 'radiology', 'scan', 'diagnostic'],
  },
  {
    test: /laborator|\bmls\b|\bmlt\b|histotech|cytotech|microbiolog|molecular|pathologist|specimen proc/i,
    category: 'Laboratory',
    rate: [25, 40, 'Hourly'],
    orgs: ['lab', 'hospital'],
    resp: [
      'Perform clinical laboratory testing across assigned departments',
      'Operate, calibrate, and maintain analyzers and instruments',
      'Run QC, document results, and flag critical values',
      'Follow CLIA, CAP, and safety compliance standards',
      'Troubleshoot instrument and assay issues',
    ],
    reqs: ['MLS/MLT certification (ASCP) or equivalent', 'CLIA-compliant testing experience', 'Degree in medical laboratory science where applicable'],
    keys: ['laboratory', 'clia', 'analyzer', 'qc', 'testing'],
  },
  {
    test: /pharmacist|pharmacy tech/i,
    category: 'Clinical - Pharmacy',
    rate: [28, 60, 'Hourly'],
    orgs: ['hospital', 'snf', 'practice'],
    resp: [
      'Review, verify, and dispense medication orders',
      'Counsel on medication safety and interactions',
      'Manage inventory, controlled substances, and compliance',
      'Support medication reconciliation and formulary management',
      'Collaborate with providers on therapy optimization',
    ],
    reqs: ['Pharmacist (PharmD) or pharmacy-tech license/certification', 'State registration', 'Long-term-care pharmacy experience preferred'],
    keys: ['pharmacy', 'dispensing', 'medication', 'formulary', 'controlled substances'],
  },
  {
    test: /therapist|\bpt\b|\bpta\b|\bot\b|cota|speech|slp|respiratory/i,
    category: 'Clinical - Therapy',
    rate: [30, 50, 'Hourly'],
    orgs: ['snf', 'hospital', 'practice'],
    resp: [
      'Evaluate patients and develop individualized therapy plans',
      'Deliver skilled therapy interventions and track progress',
      'Document treatment, goals, and outcomes in the EHR',
      'Educate patients, families, and caregivers',
      'Collaborate with the interdisciplinary care team',
    ],
    reqs: ['Active therapy license in discipline', 'BLS certification', 'SNF / rehab experience preferred'],
    keys: ['therapy', 'rehabilitation', 'evaluation', 'treatment plan', 'outcomes'],
  },
  {
    test: /administrator|\bdon\b|director of nursing|director of rehab|practice manager|operations director|business office|rural health clinic director/i,
    category: 'Operations - Leadership',
    rate: [60000, 95000, 'Annual'],
    orgs: ['snf', 'mgmt', 'practice', 'hospital'],
    resp: [
      'Oversee day-to-day operations, staffing, and workflows',
      'Drive quality, compliance, and financial performance',
      'Lead, hire, and develop department staff',
      'Manage budgets, KPIs, and operational reporting',
      'Ensure regulatory and survey readiness',
    ],
    reqs: ['Relevant leadership experience', 'Licensure where required (e.g., LNHA for SNF Administrator)', 'Strong operational & people-management skills'],
    keys: ['leadership', 'operations', 'management', 'compliance', 'budget'],
  },
  {
    test: /accountant|controller|\bcfo\b|payroll|revenue cycle|billing|coder|credentialing|hr |human resources|recruiter|talent/i,
    category: 'Operations - Leadership',
    rate: [45000, 90000, 'Annual'],
    orgs: ['mgmt'],
    resp: [
      'Own assigned finance, HR, or revenue-cycle workflows',
      'Maintain accurate records and compliance documentation',
      'Produce reporting and support month-end / audit cycles',
      'Coordinate cross-functionally with operations and clinics',
      'Identify and implement process improvements',
    ],
    reqs: ['Relevant degree or certification', 'Healthcare back-office experience preferred', 'Strong systems and analytical skills'],
    keys: ['finance', 'back office', 'revenue cycle', 'compliance', 'reporting'],
  },
  {
    test: /receptionist|front desk|scribe|scheduler|records|prior auth|patient access|referral|insurance/i,
    category: 'Admin - Front Office',
    rate: [14, 20, 'Hourly'],
    orgs: ['practice', 'mgmt'],
    resp: [
      'Greet patients and manage check-in / check-out',
      'Schedule appointments and manage provider calendars',
      'Verify insurance and collect copays',
      'Handle calls, messages, and referral coordination',
      'Maintain accurate patient records in the EHR',
    ],
    reqs: ['Front-office / medical-office experience', 'EHR and scheduling proficiency', 'Strong customer-service skills'],
    keys: ['front office', 'scheduling', 'check-in', 'insurance', 'reception'],
  },
]

const DEFAULT_FAMILY: Omit<Family, 'test'> = {
  category: 'Other',
  rate: [null, null, 'NA'],
  orgs: ['practice', 'snf', 'mgmt', 'lab', 'hospital'],
  resp: [
    'Perform the core duties of the role to a high professional standard',
    'Collaborate with the care/operations team to meet goals',
    'Maintain accurate documentation and compliance',
    'Support quality, safety, and service excellence',
  ],
  reqs: ['Relevant experience or certification for the role', 'Strong communication and reliability'],
  keys: ['healthcare', 'staff'],
}

export function heuristicRole(title: string, orgTypes?: OrgType[]): GeneratedRole {
  const fam = FAMILIES.find((f) => f.test.test(title)) ?? { test: /./, ...DEFAULT_FAMILY }
  const orgs = orgTypes?.length ? orgTypes : fam.orgs
  return {
    title: title.trim(),
    category: fam.category,
    org_types: orgs,
    rate_min: fam.rate[0],
    rate_max: fam.rate[1],
    rate_unit: fam.rate[2],
    responsibilities: fam.resp.slice(),
    requirements: fam.reqs.slice(),
    keywords: Array.from(new Set([...fam.keys, ...title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)])).slice(0, 12),
    method: 'heuristic',
  }
}

/**
 * Generate a role definition. Uses Claude via the `ai-role` Edge Function when
 * Supabase is connected & deployed; otherwise (local mode / error) returns the
 * heuristic so the feature always works.
 */
export async function generateRole(
  title: string,
  orgTypes?: OrgType[],
  context?: string,
): Promise<GeneratedRole> {
  if (!demoMode) {
    try {
      const { data, error } = await supabase.functions.invoke('ai-role', {
        body: { title, org_types: orgTypes, context },
      })
      if (!error && data?.role) {
        const r = data.role
        return {
          title: r.title ?? title,
          category: r.category ?? 'Other',
          org_types: (r.org_types?.length ? r.org_types : orgTypes) ?? ['practice'],
          rate_min: r.rate_min ?? null,
          rate_max: r.rate_max ?? null,
          rate_unit: r.rate_unit ?? 'NA',
          responsibilities: r.responsibilities ?? [],
          requirements: r.requirements ?? [],
          keywords: r.keywords ?? [],
          method: 'ai',
        }
      }
    } catch {
      /* fall through to heuristic */
    }
  }
  return heuristicRole(title, orgTypes)
}
