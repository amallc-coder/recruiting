// Seed catalog for the Positions repository — 160 roles across medical practice,
// LTC/SNF, management company, laboratory, and hospital settings, each with
// role-specific responsibilities, requirements, pay range, and keywords.
// Generated from the position-catalog build; users add/edit more (with AI) in app.
//
// Shape matches the `positions` table / Position type in ./positions.ts.
import type { Position } from './positions'

export type PositionSeed = Omit<Position, 'id' | 'created_at' | 'updated_at' | 'active'>

const POSITIONS = [
  {
    code: 'POS-001',
    title: 'Physician - Family Medicine',
    category: 'Provider - Physician',
    org_types: ['practice','hospital'],
    rate_min: 220000, rate_max: 290000, rate_unit: 'Annual',
    responsibilities: [
      'Diagnose and treat acute and chronic illness across all age groups',
      'Perform comprehensive physical exams and preventive screenings',
      'Order, interpret, and act on diagnostic labs and imaging',
      'Manage chronic conditions including diabetes, hypertension, and COPD',
      'Coordinate referrals to specialists and follow up on care plans',
      'Document encounters accurately in the EHR and meet coding standards',
      'Counsel patients and families on lifestyle, medication, and disease management'
    ],
    requirements: [
      'MD or DO from an accredited medical school',
      'Board certified or board eligible in Family Medicine',
      'Active, unrestricted state medical license and DEA registration',
      'Completion of an accredited Family Medicine residency',
      'Current BLS/ACLS certification'
    ],
    keywords: ['family medicine','primary care','outpatient','chronic care','preventive','physician']
  },
  {
    code: 'POS-002',
    title: 'Physician - Internal Medicine',
    category: 'Provider - Physician',
    org_types: ['practice','hospital','snf'],
    rate_min: 220000, rate_max: 300000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and manage complex adult medical conditions',
      'Lead longitudinal care for patients with multiple comorbidities',
      'Interpret diagnostic studies and adjust treatment plans accordingly',
      'Perform hospital and post-acute rounding as assigned',
      'Coordinate multidisciplinary care across specialties',
      'Provide preventive care and age-appropriate screenings for adults',
      'Maintain accurate problem lists and medication reconciliation'
    ],
    requirements: [
      'MD or DO from an accredited medical school',
      'Board certified or board eligible in Internal Medicine',
      'Active state medical license and DEA registration',
      'Completion of an accredited Internal Medicine residency',
      'Current BLS/ACLS certification'
    ],
    keywords: ['internal medicine','adult medicine','comorbidity','outpatient','physician','im']
  },
  {
    code: 'POS-003',
    title: 'Physician - Primary Care',
    category: 'Provider - Physician',
    org_types: ['practice'],
    rate_min: 210000, rate_max: 280000, rate_unit: 'Annual',
    responsibilities: [
      'Serve as the first point of contact for a panel of patients',
      'Deliver continuity care across the lifespan in an outpatient clinic',
      'Manage preventive health, wellness visits, and immunizations',
      'Treat common acute illnesses and stable chronic disease',
      'Coordinate care transitions and specialist referrals',
      'Meet quality and value-based care metrics',
      'Supervise advanced practice providers and clinical staff as needed'
    ],
    requirements: [
      'MD or DO with primary care residency training',
      'Board certified or eligible in Family or Internal Medicine',
      'Active state medical license and DEA registration',
      'Current BLS certification',
      'Experience in value-based or panel-based care preferred'
    ],
    keywords: ['primary care','continuity','panel','wellness','outpatient','physician']
  },
  {
    code: 'POS-004',
    title: 'Physician - Pediatrics',
    category: 'Provider - Physician',
    org_types: ['practice','hospital'],
    rate_min: 200000, rate_max: 260000, rate_unit: 'Annual',
    responsibilities: [
      'Provide well-child visits and developmental assessments',
      'Administer and manage childhood immunization schedules',
      'Diagnose and treat pediatric acute and chronic conditions',
      'Counsel parents on nutrition, growth, and behavioral health',
      'Coordinate care with pediatric specialists and schools',
      'Screen for developmental delays and refer for early intervention',
      'Document growth charts and milestones in the EHR'
    ],
    requirements: [
      'MD or DO with completion of a Pediatrics residency',
      'Board certified or eligible in Pediatrics',
      'Active state medical license and DEA registration',
      'Current PALS and BLS certification',
      'Experience with pediatric outpatient care preferred'
    ],
    keywords: ['pediatrics','well-child','immunization','development','peds','physician']
  },
  {
    code: 'POS-005',
    title: 'Physician - Geriatrics',
    category: 'Provider - Physician',
    org_types: ['practice','snf'],
    rate_min: 210000, rate_max: 270000, rate_unit: 'Annual',
    responsibilities: [
      'Manage complex care for elderly patients with multiple comorbidities',
      'Conduct comprehensive geriatric assessments including cognition and falls',
      'Optimize polypharmacy and deprescribe where appropriate',
      'Coordinate goals-of-care and advance care planning discussions',
      'Provide care in clinic and skilled-nursing settings',
      'Collaborate with interdisciplinary teams on functional outcomes',
      'Address frailty, dementia, and end-of-life care needs'
    ],
    requirements: [
      'MD or DO with geriatric medicine fellowship or CAQ',
      'Board certified or eligible in Family or Internal Medicine',
      'Active state medical license and DEA registration',
      'Current BLS certification',
      'Experience in long-term care settings preferred'
    ],
    keywords: ['geriatrics','elderly','polypharmacy','dementia','frailty','physician']
  },
  {
    code: 'POS-006',
    title: 'Physician - Psychiatry',
    category: 'Provider - Physician',
    org_types: ['practice','snf','hospital'],
    rate_min: 240000, rate_max: 320000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and diagnose psychiatric and behavioral health disorders',
      'Develop and manage psychopharmacologic treatment plans',
      'Provide medication management and brief therapeutic interventions',
      'Assess suicide and violence risk and document safety plans',
      'Collaborate with therapists, social workers, and care teams',
      'Conduct psychiatric consultations in clinic and facility settings',
      'Manage involuntary holds and capacity evaluations as needed'
    ],
    requirements: [
      'MD or DO with completion of a Psychiatry residency',
      'Board certified or eligible in Psychiatry',
      'Active state medical license and DEA registration',
      'Current BLS certification',
      'Telepsychiatry experience preferred'
    ],
    keywords: ['psychiatry','behavioral health','psychopharmacology','mental health','physician']
  },
  {
    code: 'POS-007',
    title: 'Physician - Podiatry',
    category: 'Provider - Physician',
    org_types: ['practice','snf'],
    rate_min: 180000, rate_max: 250000, rate_unit: 'Annual',
    responsibilities: [
      'Diagnose and treat disorders of the foot, ankle, and lower extremity',
      'Perform routine and surgical podiatric procedures',
      'Manage diabetic foot care and ulcer prevention programs',
      'Provide nail and callus care for high-risk patients',
      'Order and interpret lower-extremity imaging',
      'Coordinate wound care and offloading with the care team',
      'Round at skilled-nursing facilities for at-risk residents'
    ],
    requirements: [
      'DPM from an accredited podiatric medical school',
      'Completion of a podiatric residency',
      'Active state podiatry license and DEA registration',
      'Board certified or eligible by ABFAS or ABPM',
      'Current BLS certification'
    ],
    keywords: ['podiatry','foot','diabetic foot','ulcer','dpm','lower extremity']
  },
  {
    code: 'POS-008',
    title: 'Physician - Pain Management',
    category: 'Provider - Physician',
    org_types: ['practice','hospital'],
    rate_min: 280000, rate_max: 400000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and manage acute and chronic pain conditions',
      'Develop multimodal pain treatment plans',
      'Prescribe and monitor controlled substances per compliance protocols',
      'Perform diagnostic and therapeutic injections',
      'Coordinate physical therapy and behavioral pain management',
      'Monitor opioid use with PDMP checks and risk stratification',
      'Document outcomes and functional improvement measures'
    ],
    requirements: [
      'MD or DO with pain medicine fellowship',
      'Board certified or eligible in Pain Medicine',
      'Active state medical license and DEA registration with controlled-substance authority',
      'Current BLS/ACLS certification',
      'Experience with interventional pain techniques preferred'
    ],
    keywords: ['pain management','chronic pain','opioid','injections','multimodal','physician']
  },
  {
    code: 'POS-009',
    title: 'Physician - Interventional Pain',
    category: 'Provider - Physician',
    org_types: ['practice','hospital'],
    rate_min: 320000, rate_max: 480000, rate_unit: 'Annual',
    responsibilities: [
      'Perform fluoroscopically guided spinal and joint injections',
      'Conduct epidural steroid injections and nerve blocks',
      'Implant and manage spinal cord stimulators and pumps',
      'Perform radiofrequency ablation procedures',
      'Evaluate candidacy for interventional pain procedures',
      'Manage procedural sedation and post-procedure care',
      'Document fluoroscopy use and procedural outcomes'
    ],
    requirements: [
      'MD or DO with interventional pain or anesthesiology fellowship',
      'Board certified or eligible in Pain Medicine',
      'Active state medical license and DEA registration',
      'Fluoroscopy certification per state requirements',
      'Current ACLS certification'
    ],
    keywords: ['interventional pain','fluoroscopy','epidural','rfa','spinal cord stimulator','injections']
  },
  {
    code: 'POS-010',
    title: 'Physician - Interventional Radiology',
    category: 'Provider - Physician',
    org_types: ['hospital','practice'],
    rate_min: 400000, rate_max: 550000, rate_unit: 'Annual',
    responsibilities: [
      'Perform image-guided minimally invasive procedures',
      'Conduct angiography, embolization, and ablation procedures',
      'Place catheters, ports, drains, and vascular access devices',
      'Interpret cross-sectional and fluoroscopic imaging',
      'Manage periprocedural patient care and complications',
      'Collaborate with referring physicians on treatment planning',
      'Ensure radiation safety and ALARA compliance'
    ],
    requirements: [
      'MD or DO with radiology residency and IR fellowship',
      'Board certified or eligible in Radiology / Interventional Radiology',
      'Active state medical license and DEA registration',
      'Current ACLS certification',
      'Experience with vascular and nonvascular IR procedures'
    ],
    keywords: ['interventional radiology','angiography','embolization','ablation','image-guided','ir']
  },
  {
    code: 'POS-011',
    title: 'Physician - Invasive Cardiology',
    category: 'Provider - Physician',
    org_types: ['hospital','practice'],
    rate_min: 400000, rate_max: 600000, rate_unit: 'Annual',
    responsibilities: [
      'Perform diagnostic cardiac catheterization and angiography',
      'Conduct percutaneous coronary interventions',
      'Evaluate and manage acute coronary syndromes',
      'Interpret echocardiograms, stress tests, and nuclear studies',
      'Manage periprocedural anticoagulation and complications',
      'Provide consultative cardiology care in clinic and hospital',
      'Document hemodynamic findings and intervention outcomes'
    ],
    requirements: [
      'MD or DO with cardiology fellowship and interventional training',
      'Board certified or eligible in Cardiovascular Disease / Interventional Cardiology',
      'Active state medical license and DEA registration',
      'Current ACLS certification',
      'Cath lab experience required'
    ],
    keywords: ['cardiology','cath lab','pci','angiography','interventional','physician']
  },
  {
    code: 'POS-012',
    title: 'Physician - Neurology',
    category: 'Provider - Physician',
    org_types: ['practice','hospital'],
    rate_min: 250000, rate_max: 350000, rate_unit: 'Annual',
    responsibilities: [
      'Diagnose and manage neurological disorders across the lifespan',
      'Evaluate stroke, seizure, headache, and neuromuscular conditions',
      'Order and interpret EEG, EMG, and neuroimaging studies',
      'Manage chronic conditions such as MS, Parkinson, and epilepsy',
      'Provide inpatient neurology consultation and stroke coverage',
      'Coordinate rehabilitation and disease-modifying therapies',
      'Document neurological exams and treatment plans'
    ],
    requirements: [
      'MD or DO with completion of a Neurology residency',
      'Board certified or eligible in Neurology',
      'Active state medical license and DEA registration',
      'Current BLS/ACLS certification',
      'Stroke or subspecialty experience preferred'
    ],
    keywords: ['neurology','stroke','seizure','eeg','emg','physician']
  },
  {
    code: 'POS-013',
    title: 'Physician - Wound Care',
    category: 'Provider - Physician',
    org_types: ['practice','snf','hospital'],
    rate_min: 220000, rate_max: 300000, rate_unit: 'Annual',
    responsibilities: [
      'Assess and stage acute and chronic wounds',
      'Perform sharp and surgical debridement procedures',
      'Order advanced dressings, NPWT, and skin substitutes',
      'Manage diabetic, pressure, venous, and arterial ulcers',
      'Coordinate hyperbaric oxygen therapy where indicated',
      'Lead facility wound rounds and prevention programs',
      'Document wound measurements and healing trajectory'
    ],
    requirements: [
      'MD or DO with wound care training or certification',
      'Active state medical license and DEA registration',
      'Board certification in a primary specialty',
      'CWSP or equivalent wound certification preferred',
      'Current BLS certification'
    ],
    keywords: ['wound care','debridement','npwt','ulcer','hyperbaric','physician']
  },
  {
    code: 'POS-014',
    title: 'Physician - Hospitalist',
    category: 'Provider - Physician',
    org_types: ['hospital'],
    rate_min: 250000, rate_max: 340000, rate_unit: 'Annual',
    responsibilities: [
      'Manage admitted patients across the inpatient continuum',
      'Conduct daily rounds and adjust treatment plans',
      'Coordinate admissions, transfers, and discharges',
      'Respond to rapid responses and clinical deterioration',
      'Collaborate with consultants and care management',
      'Ensure timely, accurate documentation and coding',
      'Lead discharge planning and medication reconciliation'
    ],
    requirements: [
      'MD or DO with Internal or Family Medicine residency',
      'Board certified or eligible in Internal or Family Medicine',
      'Active state medical license and DEA registration',
      'Current ACLS certification',
      'Inpatient hospitalist experience preferred'
    ],
    keywords: ['hospitalist','inpatient','rounding','admissions','discharge','physician']
  },
  {
    code: 'POS-015',
    title: 'Physician - Emergency Medicine',
    category: 'Provider - Physician',
    org_types: ['hospital'],
    rate_min: 280000, rate_max: 400000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and stabilize patients with acute and emergent conditions',
      'Perform emergency procedures and resuscitations',
      'Triage and prioritize care in a high-acuity environment',
      'Order and interpret rapid diagnostics and imaging',
      'Direct trauma and critical care resuscitation teams',
      'Coordinate admissions, transfers, and disposition',
      'Document encounters under time-sensitive conditions'
    ],
    requirements: [
      'MD or DO with Emergency Medicine residency',
      'Board certified or eligible in Emergency Medicine',
      'Active state medical license and DEA registration',
      'Current ACLS, ATLS, and PALS certification',
      'Emergency department experience required'
    ],
    keywords: ['emergency medicine','ed','trauma','resuscitation','acute','physician']
  },
  {
    code: 'POS-016',
    title: 'Medical Director - SNF',
    category: 'Provider - Physician Leadership',
    org_types: ['snf'],
    rate_min: 200000, rate_max: 280000, rate_unit: 'Annual',
    responsibilities: [
      'Oversee clinical care quality across the skilled-nursing facility',
      'Develop and enforce medical policies and care protocols',
      'Coordinate with the DON and interdisciplinary team',
      'Lead QAPI initiatives and regulatory survey readiness',
      'Supervise attending physicians and advanced practice providers',
      'Review infection control and antibiotic stewardship programs',
      'Serve as liaison between the facility and medical staff'
    ],
    requirements: [
      'MD or DO with active state medical license',
      'Board certification in Family, Internal, or Geriatric Medicine',
      'CMD (Certified Medical Director) credential preferred',
      'Experience in long-term care leadership',
      'Knowledge of CMS and state SNF regulations'
    ],
    keywords: ['medical director','snf','long-term care','qapi','leadership','cmd']
  },
  {
    code: 'POS-017',
    title: 'Anesthesiologist',
    category: 'Provider - Physician',
    org_types: ['hospital'],
    rate_min: 350000, rate_max: 480000, rate_unit: 'Annual',
    responsibilities: [
      'Provide anesthesia for surgical and procedural cases',
      'Conduct preoperative assessments and risk stratification',
      'Manage airway, hemodynamics, and pain intraoperatively',
      'Supervise CRNAs and anesthesia care teams',
      'Manage post-anesthesia recovery and complications',
      'Provide regional anesthesia and nerve blocks',
      'Document anesthesia records and adverse events'
    ],
    requirements: [
      'MD or DO with Anesthesiology residency',
      'Board certified or eligible in Anesthesiology',
      'Active state medical license and DEA registration',
      'Current ACLS and PALS certification',
      'Operating room experience required'
    ],
    keywords: ['anesthesiology','anesthesia','perioperative','airway','or','physician']
  },
  {
    code: 'POS-018',
    title: 'CRNA',
    category: 'Provider - Advanced Practice',
    org_types: ['hospital'],
    rate_min: 180000, rate_max: 250000, rate_unit: 'Annual',
    responsibilities: [
      'Administer anesthesia under the anesthesia care team model',
      'Conduct pre-anesthetic patient assessments',
      'Manage airway and ventilation during procedures',
      'Monitor and adjust anesthetic depth and hemodynamics',
      'Provide post-anesthesia recovery monitoring',
      'Perform regional and neuraxial anesthesia techniques',
      'Document anesthesia care accurately'
    ],
    requirements: [
      'Master or Doctoral degree in Nurse Anesthesia',
      'Active RN and APRN licensure',
      'National certification as a CRNA (NBCRNA)',
      'Current ACLS, PALS, and BLS certification',
      'Clinical anesthesia experience preferred'
    ],
    keywords: ['crna','nurse anesthetist','anesthesia','perioperative','airway','aprn']
  },
  {
    code: 'POS-019',
    title: 'NP - Primary Care',
    category: 'Provider - Advanced Practice',
    org_types: ['practice'],
    rate_min: 105000, rate_max: 135000, rate_unit: 'Annual',
    responsibilities: [
      'Provide comprehensive primary care for a panel of patients',
      'Diagnose and treat acute and chronic conditions',
      'Order and interpret labs, imaging, and diagnostics',
      'Prescribe medications and manage treatment plans',
      'Deliver preventive care, screenings, and immunizations',
      'Educate patients on self-management and wellness',
      'Coordinate referrals and document encounters in the EHR'
    ],
    requirements: [
      'MSN or DNP from an accredited NP program',
      'Active state APRN license and national NP certification',
      'DEA registration and state prescriptive authority',
      'Current BLS certification',
      'Primary care clinical experience preferred'
    ],
    keywords: ['nurse practitioner','primary care','aprn','outpatient','preventive','np']
  },
  {
    code: 'POS-020',
    title: 'NP - SNF',
    category: 'Provider - Advanced Practice',
    org_types: ['snf'],
    rate_min: 110000, rate_max: 140000, rate_unit: 'Annual',
    responsibilities: [
      'Round on skilled-nursing residents and manage acute changes',
      'Conduct admission, follow-up, and discharge assessments',
      'Manage chronic disease and polypharmacy in elderly residents',
      'Order labs, imaging, and treatments within scope',
      'Collaborate with the attending physician and medical director',
      'Reduce avoidable hospitalizations through proactive care',
      'Document visits and complete required regulatory paperwork'
    ],
    requirements: [
      'MSN or DNP from an accredited NP program',
      'Active state APRN license and national NP certification',
      'DEA registration and prescriptive authority',
      'Experience in geriatrics or long-term care preferred',
      'Current BLS certification'
    ],
    keywords: ['nurse practitioner','snf','long-term care','geriatrics','rounding','np']
  },
  {
    code: 'POS-021',
    title: 'NP - Wound Care',
    category: 'Provider - Advanced Practice',
    org_types: ['practice','snf','hospital'],
    rate_min: 110000, rate_max: 145000, rate_unit: 'Annual',
    responsibilities: [
      'Assess, stage, and document acute and chronic wounds',
      'Perform conservative sharp debridement within scope',
      'Apply advanced dressings, NPWT, and skin substitutes',
      'Manage diabetic, pressure, venous, and arterial ulcers',
      'Lead bedside wound rounds at facilities',
      'Educate staff on prevention and offloading',
      'Track healing progress and adjust treatment plans'
    ],
    requirements: [
      'MSN or DNP from an accredited NP program',
      'Active state APRN license and national certification',
      'Wound care certification (CWCN/CWS) preferred',
      'DEA registration and prescriptive authority',
      'Current BLS certification'
    ],
    keywords: ['nurse practitioner','wound care','debridement','npwt','ulcer','np']
  },
  {
    code: 'POS-022',
    title: 'NP - Pain Management',
    category: 'Provider - Advanced Practice',
    org_types: ['practice'],
    rate_min: 115000, rate_max: 150000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and manage patients with chronic pain',
      'Develop and adjust multimodal pain treatment plans',
      'Prescribe and monitor controlled substances per protocol',
      'Conduct PDMP checks and opioid risk assessments',
      'Assist with or perform minor procedures within scope',
      'Coordinate physical therapy and behavioral interventions',
      'Document functional outcomes and compliance monitoring'
    ],
    requirements: [
      'MSN or DNP from an accredited NP program',
      'Active state APRN license and national certification',
      'DEA registration with controlled-substance authority',
      'Pain management experience preferred',
      'Current BLS certification'
    ],
    keywords: ['nurse practitioner','pain management','opioid','pdmp','chronic pain','np']
  },
  {
    code: 'POS-023',
    title: 'NP - GYN',
    category: 'Provider - Advanced Practice',
    org_types: ['practice'],
    rate_min: 110000, rate_max: 140000, rate_unit: 'Annual',
    responsibilities: [
      'Provide womens health and gynecologic care',
      'Perform well-woman exams and Pap smears',
      'Manage contraception and family planning counseling',
      'Diagnose and treat common gynecologic conditions',
      'Provide menopause and hormone management',
      'Order and interpret relevant labs and imaging',
      'Educate patients on reproductive and preventive health'
    ],
    requirements: [
      'MSN or DNP from an accredited NP program',
      'Active state APRN license and national certification',
      'Women health (WHNP) certification preferred',
      'DEA registration and prescriptive authority',
      'Current BLS certification'
    ],
    keywords: ['nurse practitioner','gyn','womens health','contraception','pap','np']
  },
  {
    code: 'POS-024',
    title: 'NP - Urgent Care',
    category: 'Provider - Advanced Practice',
    org_types: ['practice'],
    rate_min: 110000, rate_max: 140000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and treat acute illness and minor injuries',
      'Perform laceration repair, splinting, and incision and drainage',
      'Order and interpret point-of-care diagnostics and imaging',
      'Manage rapid patient throughput in a walk-in setting',
      'Prescribe medications and provide discharge instructions',
      'Identify and refer emergent conditions appropriately',
      'Document encounters efficiently in the EHR'
    ],
    requirements: [
      'MSN or DNP from an accredited NP program',
      'Active state APRN license and national certification',
      'DEA registration and prescriptive authority',
      'Urgent care or emergency experience preferred',
      'Current BLS/ACLS certification'
    ],
    keywords: ['nurse practitioner','urgent care','walk-in','laceration','acute','np']
  },
  {
    code: 'POS-025',
    title: 'NP - Telehealth',
    category: 'Provider - Advanced Practice',
    org_types: ['practice','mgmt'],
    rate_min: 105000, rate_max: 135000, rate_unit: 'Annual',
    responsibilities: [
      'Conduct virtual patient visits via secure video platform',
      'Diagnose and manage conditions appropriate for telehealth',
      'Prescribe medications electronically within regulations',
      'Triage patients and escalate to in-person care when needed',
      'Document visits and ensure telehealth compliance',
      'Coordinate follow-up labs, imaging, and referrals',
      'Maintain multi-state licensure for cross-state care'
    ],
    requirements: [
      'MSN or DNP from an accredited NP program',
      'Active APRN license (multi-state compact preferred)',
      'National NP certification and DEA registration',
      'Experience with telehealth platforms preferred',
      'Strong remote communication skills'
    ],
    keywords: ['nurse practitioner','telehealth','virtual','remote','telemedicine','np']
  },
  {
    code: 'POS-026',
    title: 'PMHNP - Psychiatric NP',
    category: 'Provider - Advanced Practice',
    org_types: ['practice','snf','hospital'],
    rate_min: 125000, rate_max: 160000, rate_unit: 'Annual',
    responsibilities: [
      'Assess and diagnose psychiatric and behavioral disorders',
      'Develop and manage psychopharmacologic treatment plans',
      'Provide medication management and brief therapy',
      'Conduct suicide and safety risk assessments',
      'Collaborate with psychiatrists and behavioral health teams',
      'Deliver care via in-person and telepsychiatry visits',
      'Document mental status exams and treatment response'
    ],
    requirements: [
      'MSN or DNP with psychiatric-mental health specialization',
      'Active state APRN license and PMHNP certification',
      'DEA registration with controlled-substance authority',
      'Behavioral health clinical experience preferred',
      'Current BLS certification'
    ],
    keywords: ['pmhnp','psychiatric','behavioral health','mental health','psychopharmacology','np']
  },
  {
    code: 'POS-027',
    title: 'PA - Family Medicine',
    category: 'Provider - Advanced Practice',
    org_types: ['practice'],
    rate_min: 105000, rate_max: 135000, rate_unit: 'Annual',
    responsibilities: [
      'Provide primary care under physician collaboration',
      'Diagnose and treat acute and chronic conditions',
      'Order and interpret diagnostic studies',
      'Prescribe medications and manage care plans',
      'Perform preventive screenings and immunizations',
      'Counsel patients on health maintenance',
      'Document encounters and coordinate referrals'
    ],
    requirements: [
      'Masters degree from an accredited PA program',
      'NCCPA certification and active state PA license',
      'DEA registration and prescriptive authority',
      'Current BLS certification',
      'Primary care experience preferred'
    ],
    keywords: ['physician assistant','family medicine','primary care','outpatient','pa']
  },
  {
    code: 'POS-028',
    title: 'PA - Urgent Care',
    category: 'Provider - Advanced Practice',
    org_types: ['practice'],
    rate_min: 110000, rate_max: 140000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and treat acute illness and minor trauma',
      'Perform suturing, splinting, and minor procedures',
      'Order and interpret point-of-care testing and imaging',
      'Manage high patient volume in a walk-in clinic',
      'Prescribe medications and provide discharge guidance',
      'Recognize and refer emergent presentations',
      'Document encounters efficiently'
    ],
    requirements: [
      'Masters degree from an accredited PA program',
      'NCCPA certification and active state PA license',
      'DEA registration and prescriptive authority',
      'Urgent care or ED experience preferred',
      'Current BLS/ACLS certification'
    ],
    keywords: ['physician assistant','urgent care','walk-in','suturing','acute','pa']
  },
  {
    code: 'POS-029',
    title: 'PA - Surgical',
    category: 'Provider - Advanced Practice',
    org_types: ['hospital','practice'],
    rate_min: 115000, rate_max: 155000, rate_unit: 'Annual',
    responsibilities: [
      'First- or second-assist in surgical procedures',
      'Conduct preoperative and postoperative assessments',
      'Perform wound closure and surgical site management',
      'Round on surgical patients and manage care plans',
      'Place and remove lines, drains, and sutures',
      'Coordinate discharge and follow-up care',
      'Document operative and progress notes'
    ],
    requirements: [
      'Masters degree from an accredited PA program',
      'NCCPA certification and active state PA license',
      'Surgical first-assist experience preferred',
      'DEA registration and prescriptive authority',
      'Current BLS/ACLS certification'
    ],
    keywords: ['physician assistant','surgical','first assist','perioperative','operative','pa']
  },
  {
    code: 'POS-030',
    title: 'PA - Pain Management',
    category: 'Provider - Advanced Practice',
    org_types: ['practice'],
    rate_min: 115000, rate_max: 150000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and manage chronic pain patients',
      'Develop multimodal pain treatment plans',
      'Prescribe and monitor controlled substances per protocol',
      'Perform PDMP checks and opioid risk stratification',
      'Assist with interventional pain procedures',
      'Coordinate adjunctive therapies and referrals',
      'Document functional outcomes and compliance'
    ],
    requirements: [
      'Masters degree from an accredited PA program',
      'NCCPA certification and active state PA license',
      'DEA registration with controlled-substance authority',
      'Pain management experience preferred',
      'Current BLS certification'
    ],
    keywords: ['physician assistant','pain management','opioid','interventional','chronic pain','pa']
  },
  {
    code: 'POS-031',
    title: 'RN - Staff Nurse',
    category: 'Nursing',
    org_types: ['practice','snf','hospital'],
    rate_min: 32, rate_max: 48, rate_unit: 'Hourly',
    responsibilities: [
      'Deliver direct patient care per the plan of care',
      'Administer medications and treatments safely',
      'Assess patient status and document findings',
      'Educate patients and families on care needs',
      'Coordinate with the interdisciplinary care team',
      'Respond to changes in condition and escalate appropriately',
      'Maintain accurate and timely clinical documentation'
    ],
    requirements: [
      'ADN or BSN from an accredited nursing program',
      'Active state RN license',
      'Current BLS certification',
      'Strong clinical assessment skills',
      'EHR documentation experience preferred'
    ],
    keywords: ['registered nurse','staff nurse','patient care','medication','assessment','rn']
  },
  {
    code: 'POS-032',
    title: 'RN - Charge Nurse',
    category: 'Nursing',
    org_types: ['snf','hospital'],
    rate_min: 38, rate_max: 55, rate_unit: 'Hourly',
    responsibilities: [
      'Supervise nursing staff during the shift',
      'Coordinate assignments and patient flow',
      'Serve as clinical resource for the unit',
      'Manage admissions, discharges, and transfers',
      'Ensure compliance with policies and protocols',
      'Respond to emergencies and escalations',
      'Communicate with providers and families'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Two or more years of nursing experience',
      'Current BLS certification (ACLS for hospital)',
      'Demonstrated leadership and delegation skills',
      'Charge or supervisory experience preferred'
    ],
    keywords: ['registered nurse','charge nurse','supervision','unit','leadership','rn']
  },
  {
    code: 'POS-033',
    title: 'RN - Clinical Trainer',
    category: 'Nursing',
    org_types: ['practice','snf','hospital','mgmt'],
    rate_min: 36, rate_max: 52, rate_unit: 'Hourly',
    responsibilities: [
      'Develop and deliver clinical training programs',
      'Onboard and orient new nursing staff',
      'Conduct competency assessments and skills validation',
      'Maintain training records and compliance documentation',
      'Update curriculum to reflect best practices and regulations',
      'Provide bedside coaching and remediation',
      'Coordinate continuing education activities'
    ],
    requirements: [
      'BSN with active state RN license',
      'Three or more years of clinical experience',
      'Experience in education or staff development preferred',
      'Current BLS certification',
      'Strong presentation and curriculum design skills'
    ],
    keywords: ['registered nurse','clinical trainer','education','onboarding','competency','rn']
  },
  {
    code: 'POS-034',
    title: 'RN - MDS Coordinator',
    category: 'Nursing',
    org_types: ['snf'],
    rate_min: 38, rate_max: 55, rate_unit: 'Hourly',
    responsibilities: [
      'Complete and submit MDS assessments accurately and timely',
      'Coordinate the RAI process and care plan meetings',
      'Optimize reimbursement through accurate PDPM coding',
      'Audit documentation to support MDS coding',
      'Track assessment schedules and ARD dates',
      'Collaborate with the interdisciplinary team on care plans',
      'Ensure regulatory compliance for MDS submissions'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'RAC-CT certification preferred',
      'Knowledge of MDS 3.0 and PDPM',
      'Long-term care experience required',
      'Strong analytical and documentation skills'
    ],
    keywords: ['registered nurse','mds','rai','pdpm','snf','rac-ct']
  },
  {
    code: 'POS-035',
    title: 'RN - Infection Preventionist',
    category: 'Nursing',
    org_types: ['snf','hospital'],
    rate_min: 38, rate_max: 56, rate_unit: 'Hourly',
    responsibilities: [
      'Develop and oversee the infection prevention program',
      'Conduct surveillance and track healthcare-associated infections',
      'Investigate outbreaks and implement control measures',
      'Lead antibiotic stewardship initiatives',
      'Educate staff on infection control practices',
      'Ensure compliance with CDC and CMS requirements',
      'Maintain infection control documentation and reporting'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'CIC (Certification in Infection Control) preferred',
      'Experience in infection prevention or epidemiology',
      'Knowledge of CMS and CDC guidelines',
      'Current BLS certification'
    ],
    keywords: ['registered nurse','infection prevention','surveillance','stewardship','hai','ipc']
  },
  {
    code: 'POS-036',
    title: 'RN - Wound Care',
    category: 'Nursing',
    org_types: ['snf','hospital','practice'],
    rate_min: 36, rate_max: 54, rate_unit: 'Hourly',
    responsibilities: [
      'Assess, measure, and document wounds',
      'Perform wound dressing changes and NPWT management',
      'Implement pressure injury prevention protocols',
      'Educate staff and patients on wound care',
      'Coordinate with providers on treatment plans',
      'Track wound healing and outcomes data',
      'Lead skin integrity and prevention rounds'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Wound care certification (WCC, CWCN) preferred',
      'Two or more years of clinical experience',
      'Knowledge of wound staging and treatment',
      'Current BLS certification'
    ],
    keywords: ['registered nurse','wound care','npwt','pressure injury','skin integrity','rn']
  },
  {
    code: 'POS-037',
    title: 'RN - ICU',
    category: 'Nursing',
    org_types: ['hospital'],
    rate_min: 40, rate_max: 60, rate_unit: 'Hourly',
    responsibilities: [
      'Provide critical care to high-acuity patients',
      'Monitor and titrate vasoactive and sedative drips',
      'Manage ventilators and advanced hemodynamic monitoring',
      'Respond to rapid deterioration and codes',
      'Collaborate with intensivists on care plans',
      'Educate families on critical care status',
      'Document detailed critical care assessments'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Critical care experience required',
      'Current BLS and ACLS certification',
      'CCRN certification preferred',
      'Strong critical thinking and rapid-response skills'
    ],
    keywords: ['registered nurse','icu','critical care','ventilator','hemodynamic','rn']
  },
  {
    code: 'POS-038',
    title: 'RN - Emergency Department',
    category: 'Nursing',
    org_types: ['hospital'],
    rate_min: 38, rate_max: 58, rate_unit: 'Hourly',
    responsibilities: [
      'Triage and prioritize patients by acuity',
      'Provide rapid assessment and stabilization',
      'Administer emergency medications and interventions',
      'Assist with trauma and resuscitation procedures',
      'Manage rapid patient throughput and disposition',
      'Coordinate with providers and ancillary services',
      'Document time-sensitive care accurately'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Emergency or critical care experience preferred',
      'Current BLS, ACLS, and PALS certification',
      'CEN certification preferred',
      'TNCC certification a plus'
    ],
    keywords: ['registered nurse','emergency','ed','triage','trauma','rn']
  },
  {
    code: 'POS-039',
    title: 'RN - OR / Surgical',
    category: 'Nursing',
    org_types: ['hospital'],
    rate_min: 40, rate_max: 60, rate_unit: 'Hourly',
    responsibilities: [
      'Provide circulating and scrub nursing in the OR',
      'Prepare the surgical suite and verify instruments',
      'Maintain sterile field and aseptic technique',
      'Perform surgical counts and documentation',
      'Position and prep patients for procedures',
      'Anticipate surgeon needs during cases',
      'Coordinate perioperative patient handoffs'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Perioperative or OR experience required',
      'Current BLS and ACLS certification',
      'CNOR certification preferred',
      'Knowledge of sterile technique and surgical workflow'
    ],
    keywords: ['registered nurse','or','surgical','perioperative','circulating','rn']
  },
  {
    code: 'POS-040',
    title: 'RN - Case Manager',
    category: 'Nursing',
    org_types: ['hospital','snf','practice','mgmt'],
    rate_min: 36, rate_max: 54, rate_unit: 'Hourly',
    responsibilities: [
      'Coordinate care transitions and discharge planning',
      'Conduct utilization review and medical necessity assessments',
      'Collaborate with payers on authorizations',
      'Connect patients to community and post-acute resources',
      'Monitor length of stay and care progression',
      'Advocate for appropriate level of care',
      'Document case management activities'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Case management or utilization review experience',
      'CCM certification preferred',
      'Knowledge of payer and discharge regulations',
      'Strong coordination and communication skills'
    ],
    keywords: ['registered nurse','case management','discharge','utilization','transitions','rn']
  },
  {
    code: 'POS-041',
    title: 'LPN - SNF',
    category: 'Nursing',
    org_types: ['snf'],
    rate_min: 24, rate_max: 36, rate_unit: 'Hourly',
    responsibilities: [
      'Administer medications and treatments to residents',
      'Monitor and document resident status and vitals',
      'Perform wound care and routine nursing procedures',
      'Supervise CNAs and delegate care tasks',
      'Communicate changes in condition to the RN or provider',
      'Maintain accurate medication administration records',
      'Support care plan implementation'
    ],
    requirements: [
      'Completion of an accredited practical nursing program',
      'Active state LPN/LVN license',
      'Current BLS certification',
      'Long-term care experience preferred',
      'Knowledge of medication administration'
    ],
    keywords: ['licensed practical nurse','lpn','snf','medication','long-term care','lvn']
  },
  {
    code: 'POS-042',
    title: 'LPN - Clinic',
    category: 'Nursing',
    org_types: ['practice'],
    rate_min: 23, rate_max: 34, rate_unit: 'Hourly',
    responsibilities: [
      'Room patients and obtain vitals and history',
      'Administer injections, vaccines, and medications',
      'Assist providers with procedures and exams',
      'Perform point-of-care testing and specimen collection',
      'Manage prescription refills and prior authorizations',
      'Triage patient calls and messages',
      'Document care in the EHR'
    ],
    requirements: [
      'Completion of an accredited practical nursing program',
      'Active state LPN/LVN license',
      'Current BLS certification',
      'Outpatient or clinic experience preferred',
      'EHR proficiency'
    ],
    keywords: ['licensed practical nurse','lpn','clinic','injections','triage','outpatient']
  },
  {
    code: 'POS-043',
    title: 'LPN - Charge',
    category: 'Nursing',
    org_types: ['snf'],
    rate_min: 26, rate_max: 38, rate_unit: 'Hourly',
    responsibilities: [
      'Lead the nursing unit during the shift',
      'Coordinate CNA assignments and resident care',
      'Administer medications and complex treatments',
      'Communicate with providers and families',
      'Ensure documentation and regulatory compliance',
      'Respond to resident emergencies',
      'Support admissions and discharges'
    ],
    requirements: [
      'Active state LPN/LVN license',
      'Two or more years of long-term care experience',
      'Current BLS certification',
      'Leadership and delegation skills',
      'IV certification preferred'
    ],
    keywords: ['licensed practical nurse','lpn','charge','snf','leadership','lvn']
  },
  {
    code: 'POS-044',
    title: 'CNA - Certified Nursing Assistant',
    category: 'Nursing Support',
    org_types: ['snf','hospital'],
    rate_min: 16, rate_max: 24, rate_unit: 'Hourly',
    responsibilities: [
      'Assist residents with activities of daily living',
      'Take and record vital signs',
      'Support mobility, transfers, and repositioning',
      'Assist with feeding, bathing, and toileting',
      'Report changes in condition to the nurse',
      'Maintain a clean and safe resident environment',
      'Document care provided'
    ],
    requirements: [
      'State CNA certification',
      'Completion of an approved nurse aide training program',
      'Current BLS certification',
      'Compassionate, patient-focused approach',
      'Ability to perform physical care tasks'
    ],
    keywords: ['certified nursing assistant','cna','adl','vitals','direct care','aide']
  },
  {
    code: 'POS-045',
    title: 'QMA / CMA - Medication Aide',
    category: 'Nursing Support',
    org_types: ['snf'],
    rate_min: 18, rate_max: 26, rate_unit: 'Hourly',
    responsibilities: [
      'Administer routine medications under nurse supervision',
      'Document medication administration accurately',
      'Monitor residents for medication effects',
      'Report concerns to the supervising nurse',
      'Maintain the medication cart and inventory',
      'Assist with resident care as a certified aide',
      'Follow the six rights of medication administration'
    ],
    requirements: [
      'State CNA certification',
      'QMA or CMA medication aide certification',
      'Completion of an approved medication aide course',
      'Current BLS certification',
      'Long-term care experience preferred'
    ],
    keywords: ['qma','cma','medication aide','snf','administration','aide']
  },
  {
    code: 'POS-046',
    title: 'Medication Aide',
    category: 'Nursing Support',
    org_types: ['snf'],
    rate_min: 17, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Pass routine oral and topical medications',
      'Document administration on the MAR',
      'Observe and report resident responses',
      'Maintain medication storage and security',
      'Communicate refill needs to nursing',
      'Support certified aide duties as needed',
      'Adhere to facility medication protocols'
    ],
    requirements: [
      'State medication aide certification',
      'Active CNA certification',
      'Completion of an approved medication administration course',
      'Current BLS certification',
      'Attention to detail and accuracy'
    ],
    keywords: ['medication aide','mar','administration','snf','aide','medication']
  },
  {
    code: 'POS-047',
    title: 'Restorative Aide',
    category: 'Nursing Support',
    org_types: ['snf'],
    rate_min: 17, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Carry out restorative nursing programs per care plan',
      'Assist residents with range-of-motion and mobility exercises',
      'Support ambulation, transfer, and ADL retraining',
      'Document restorative program participation and progress',
      'Coordinate with therapy and nursing staff',
      'Encourage resident independence and function',
      'Maintain restorative equipment'
    ],
    requirements: [
      'State CNA certification',
      'Restorative aide training preferred',
      'Current BLS certification',
      'Knowledge of restorative care principles',
      'Long-term care experience preferred'
    ],
    keywords: ['restorative aide','rom','mobility','adl','snf','restorative']
  },
  {
    code: 'POS-048',
    title: 'Medical Assistant',
    category: 'Clinical Support',
    org_types: ['practice'],
    rate_min: 17, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Room patients and record vitals and chief complaint',
      'Update medication lists and medical history',
      'Administer injections and vaccines per order',
      'Perform point-of-care testing and EKGs',
      'Assist providers with exams and procedures',
      'Manage prior authorizations and refill requests',
      'Maintain clean exam rooms and stock supplies'
    ],
    requirements: [
      'Completion of an accredited medical assistant program',
      'CMA (AAMA) or RMA certification preferred',
      'Current BLS certification',
      'EHR proficiency',
      'Outpatient clinic experience preferred'
    ],
    keywords: ['medical assistant','ma','rooming','vitals','injections','outpatient']
  },
  {
    code: 'POS-049',
    title: 'Medical Assistant - SNF',
    category: 'Clinical Support',
    org_types: ['snf'],
    rate_min: 17, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Support providers during facility rounds',
      'Obtain vitals and assist with resident assessments',
      'Coordinate documentation and order entry',
      'Schedule follow-up visits and diagnostics',
      'Manage supplies and rounding logistics',
      'Communicate with facility nursing staff',
      'Maintain accurate records in the EHR'
    ],
    requirements: [
      'Completion of an accredited medical assistant program',
      'CMA or RMA certification preferred',
      'Current BLS certification',
      'Long-term care exposure preferred',
      'Strong organizational skills'
    ],
    keywords: ['medical assistant','ma','snf','rounding','documentation','support']
  },
  {
    code: 'POS-050',
    title: 'Medical Assistant - X-Ray / Limited Scope',
    category: 'Clinical Support',
    org_types: ['practice'],
    rate_min: 19, rate_max: 28, rate_unit: 'Hourly',
    responsibilities: [
      'Perform limited-scope radiographic imaging',
      'Position patients and ensure image quality',
      'Practice radiation safety and ALARA principles',
      'Room patients and obtain vitals',
      'Assist providers with clinical procedures',
      'Maintain imaging equipment and logs',
      'Document imaging in the EHR'
    ],
    requirements: [
      'Medical assistant training plus limited-scope X-ray certification',
      'State limited radiologic technologist permit',
      'Current BLS certification',
      'Knowledge of radiation safety',
      'Clinic experience preferred'
    ],
    keywords: ['medical assistant','x-ray','limited scope','radiography','radiation safety','ma']
  },
  {
    code: 'POS-051',
    title: 'Medical Assistant / Receptionist',
    category: 'Clinical Support',
    org_types: ['practice'],
    rate_min: 16, rate_max: 24, rate_unit: 'Hourly',
    responsibilities: [
      'Greet and check in patients at the front desk',
      'Room patients and obtain vitals when needed',
      'Verify insurance and collect copays',
      'Schedule appointments and manage the calendar',
      'Assist with clinical tasks during busy periods',
      'Answer phones and route messages',
      'Maintain front-office and clinical flow'
    ],
    requirements: [
      'Medical assistant training or certification',
      'Front-office and clinical experience',
      'Current BLS certification',
      'EHR and scheduling proficiency',
      'Strong customer service skills'
    ],
    keywords: ['medical assistant','receptionist','front desk','rooming','hybrid','ma']
  },
  {
    code: 'POS-052',
    title: 'Phlebotomist',
    category: 'Clinical Support',
    org_types: ['practice','lab','hospital','snf'],
    rate_min: 17, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Perform venipuncture and capillary blood draws',
      'Verify patient identity and labeling accuracy',
      'Prepare and process specimens for testing',
      'Maintain specimen integrity and chain of custody',
      'Follow safety and infection control protocols',
      'Document collection details in the LIS',
      'Provide a positive patient experience during draws'
    ],
    requirements: [
      'Phlebotomy certification (CPT, ASCP) preferred',
      'Completion of an accredited phlebotomy program',
      'Current BLS certification',
      'Knowledge of specimen handling',
      'Strong attention to detail'
    ],
    keywords: ['phlebotomist','venipuncture','blood draw','specimen','collection','lab']
  },
  {
    code: 'POS-053',
    title: 'Phlebotomist / Courier',
    category: 'Clinical Support',
    org_types: ['lab','practice'],
    rate_min: 17, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Perform blood draws at clinics and patient sites',
      'Transport specimens between sites and the lab',
      'Maintain specimen temperature and integrity in transit',
      'Manage chain-of-custody and delivery logs',
      'Follow routes and time-sensitive delivery schedules',
      'Maintain a clean and stocked vehicle',
      'Communicate delays or issues to the lab'
    ],
    requirements: [
      'Phlebotomy certification preferred',
      'Valid drivers license and clean driving record',
      'Knowledge of specimen handling and transport',
      'Current BLS certification',
      'Reliable and punctual'
    ],
    keywords: ['phlebotomist','courier','specimen transport','blood draw','logistics','lab']
  },
  {
    code: 'POS-054',
    title: 'Physical Therapist',
    category: 'Rehabilitation Therapy',
    org_types: ['snf','hospital','practice'],
    rate_min: 75000, rate_max: 100000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate patient function, mobility, and strength',
      'Develop and implement physical therapy plans of care',
      'Provide therapeutic exercise and gait training',
      'Document progress and adjust treatment goals',
      'Supervise PTAs and rehab aides',
      'Educate patients and caregivers on home programs',
      'Coordinate with the interdisciplinary team'
    ],
    requirements: [
      'DPT or MPT from an accredited program',
      'Active state physical therapy license',
      'Current BLS certification',
      'Geriatric or post-acute experience preferred',
      'Knowledge of Medicare therapy documentation'
    ],
    keywords: ['physical therapist','pt','rehab','gait','mobility','therapy']
  },
  {
    code: 'POS-055',
    title: 'Physical Therapist Assistant (PTA)',
    category: 'Rehabilitation Therapy',
    org_types: ['snf','practice','hospital'],
    rate_min: 28, rate_max: 40, rate_unit: 'Hourly',
    responsibilities: [
      'Deliver physical therapy interventions per the PT plan',
      'Guide therapeutic exercises and gait training',
      'Monitor and document patient response',
      'Educate patients on exercises and safety',
      'Maintain therapy equipment and treatment areas',
      'Communicate progress to the supervising PT',
      'Support functional mobility goals'
    ],
    requirements: [
      'Associate degree from an accredited PTA program',
      'Active state PTA license',
      'Current BLS certification',
      'Post-acute experience preferred',
      'Strong patient interaction skills'
    ],
    keywords: ['pta','physical therapy assistant','rehab','exercise','gait','therapy']
  },
  {
    code: 'POS-056',
    title: 'Occupational Therapist',
    category: 'Rehabilitation Therapy',
    org_types: ['snf','hospital','practice'],
    rate_min: 75000, rate_max: 100000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate patients ADL and functional performance',
      'Develop occupational therapy plans of care',
      'Provide interventions for self-care and fine motor skills',
      'Recommend adaptive equipment and modifications',
      'Document outcomes and update goals',
      'Supervise COTAs and rehab aides',
      'Educate patients and families on strategies'
    ],
    requirements: [
      'Masters or Doctoral degree in Occupational Therapy',
      'Active state OT license and NBCOT certification',
      'Current BLS certification',
      'Post-acute or geriatric experience preferred',
      'Knowledge of therapy documentation requirements'
    ],
    keywords: ['occupational therapist','ot','adl','rehab','adaptive','therapy']
  },
  {
    code: 'POS-057',
    title: 'Certified Occupational Therapy Assistant (COTA)',
    category: 'Rehabilitation Therapy',
    org_types: ['snf','practice','hospital'],
    rate_min: 27, rate_max: 39, rate_unit: 'Hourly',
    responsibilities: [
      'Implement OT interventions per the OT plan of care',
      'Assist patients with ADL and motor skill retraining',
      'Document treatment and patient response',
      'Educate patients on adaptive techniques',
      'Maintain therapy supplies and equipment',
      'Communicate progress to the supervising OT',
      'Support functional independence goals'
    ],
    requirements: [
      'Associate degree from an accredited COTA program',
      'Active state COTA license and NBCOT certification',
      'Current BLS certification',
      'Post-acute experience preferred',
      'Strong patient-care skills'
    ],
    keywords: ['cota','occupational therapy assistant','adl','rehab','therapy','adaptive']
  },
  {
    code: 'POS-058',
    title: 'Speech-Language Pathologist',
    category: 'Rehabilitation Therapy',
    org_types: ['snf','hospital','practice'],
    rate_min: 78000, rate_max: 105000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate speech, language, cognition, and swallowing',
      'Develop and implement treatment plans',
      'Conduct swallowing assessments and dysphagia therapy',
      'Provide cognitive-communication rehabilitation',
      'Document progress and adjust goals',
      'Educate patients, families, and staff',
      'Recommend diet modifications and strategies'
    ],
    requirements: [
      'Masters degree in Speech-Language Pathology',
      'Active state SLP license and ASHA CCC-SLP',
      'Current BLS certification',
      'Dysphagia and post-acute experience preferred',
      'Knowledge of therapy documentation'
    ],
    keywords: ['speech language pathologist','slp','dysphagia','swallowing','cognition','therapy']
  },
  {
    code: 'POS-059',
    title: 'Respiratory Therapist',
    category: 'Rehabilitation Therapy',
    org_types: ['hospital','snf'],
    rate_min: 30, rate_max: 45, rate_unit: 'Hourly',
    responsibilities: [
      'Assess and treat patients with respiratory conditions',
      'Manage ventilators and airway support',
      'Administer breathing treatments and oxygen therapy',
      'Perform arterial blood gas sampling and analysis',
      'Respond to codes and rapid responses',
      'Educate patients on respiratory care',
      'Document respiratory assessments and treatments'
    ],
    requirements: [
      'Associate or Bachelor degree in Respiratory Therapy',
      'Active state RT license and RRT credential',
      'Current BLS and ACLS certification',
      'Critical care experience preferred',
      'Knowledge of ventilator management'
    ],
    keywords: ['respiratory therapist','rrt','ventilator','oxygen','abg','respiratory']
  },
  {
    code: 'POS-060',
    title: 'Pharmacist',
    category: 'Pharmacy',
    org_types: ['hospital','lab','mgmt','snf'],
    rate_min: 115000, rate_max: 145000, rate_unit: 'Annual',
    responsibilities: [
      'Review and verify medication orders for accuracy and safety',
      'Perform clinical interventions and drug interaction checks',
      'Counsel patients and providers on medication therapy',
      'Oversee medication dispensing and compounding',
      'Manage formulary and antibiotic stewardship',
      'Ensure regulatory compliance and controlled-substance accountability',
      'Supervise pharmacy technicians'
    ],
    requirements: [
      'PharmD from an accredited pharmacy school',
      'Active state pharmacist license',
      'Residency or clinical experience preferred',
      'Knowledge of pharmacy regulations and compounding',
      'BLS certification preferred'
    ],
    keywords: ['pharmacist','pharmd','medication','formulary','stewardship','pharmacy']
  },
  {
    code: 'POS-061',
    title: 'Pharmacy Technician',
    category: 'Pharmacy',
    org_types: ['hospital','snf','mgmt'],
    rate_min: 18, rate_max: 27, rate_unit: 'Hourly',
    responsibilities: [
      'Prepare and dispense medications under pharmacist supervision',
      'Manage inventory and restock medications',
      'Process prescriptions and insurance claims',
      'Compound non-sterile and sterile preparations as trained',
      'Maintain controlled-substance records',
      'Operate automated dispensing systems',
      'Support pharmacy workflow and patient service'
    ],
    requirements: [
      'State pharmacy technician registration or license',
      'PTCB or NHA certification preferred',
      'Knowledge of pharmacy operations',
      'Attention to detail and accuracy',
      'Customer service skills'
    ],
    keywords: ['pharmacy technician','dispensing','inventory','compounding','ptcb','pharmacy']
  },
  {
    code: 'POS-062',
    title: 'Registered Dietitian',
    category: 'Clinical Nutrition',
    org_types: ['snf','hospital','practice'],
    rate_min: 60000, rate_max: 80000, rate_unit: 'Annual',
    responsibilities: [
      'Conduct nutritional assessments and screenings',
      'Develop individualized nutrition care plans',
      'Manage therapeutic diets and enteral nutrition',
      'Monitor nutritional status and adjust interventions',
      'Educate patients and staff on nutrition',
      'Participate in interdisciplinary care planning',
      'Ensure regulatory compliance for dietary services'
    ],
    requirements: [
      'Bachelor or Master degree in Nutrition or Dietetics',
      'Registered Dietitian (RD/RDN) credential',
      'Active state dietitian license where required',
      'Long-term care or clinical experience preferred',
      'Knowledge of therapeutic diets'
    ],
    keywords: ['registered dietitian','rd','nutrition','therapeutic diet','enteral','dietary']
  },
  {
    code: 'POS-063',
    title: 'CT Technologist',
    category: 'Imaging / Technologist',
    org_types: ['hospital','practice','lab'],
    rate_min: 32, rate_max: 48, rate_unit: 'Hourly',
    responsibilities: [
      'Perform CT scans per protocol and physician orders',
      'Position patients and ensure image quality',
      'Administer contrast media per protocol',
      'Practice radiation safety and ALARA principles',
      'Monitor patients for contrast reactions',
      'Maintain CT equipment and quality control',
      'Document exams in the RIS/PACS'
    ],
    requirements: [
      'ARRT registration with CT certification',
      'State radiologic technologist license',
      'Current BLS certification',
      'Knowledge of CT protocols and contrast',
      'Clinical imaging experience'
    ],
    keywords: ['ct tech','computed tomography','contrast','imaging','arrt','radiology']
  },
  {
    code: 'POS-064',
    title: 'MRI Technologist',
    category: 'Imaging / Technologist',
    org_types: ['hospital','practice','lab'],
    rate_min: 34, rate_max: 50, rate_unit: 'Hourly',
    responsibilities: [
      'Perform MRI exams per protocol and orders',
      'Screen patients for MRI safety and contraindications',
      'Position patients and optimize image quality',
      'Administer contrast agents when ordered',
      'Enforce MRI zone safety and ferromagnetic screening',
      'Maintain scanner quality control',
      'Document exams in the RIS/PACS'
    ],
    requirements: [
      'ARRT registration with MRI certification',
      'State licensure where required',
      'Current BLS certification',
      'Knowledge of MRI safety protocols',
      'Clinical MRI experience'
    ],
    keywords: ['mri tech','magnetic resonance','imaging','safety','arrt','radiology']
  },
  {
    code: 'POS-065',
    title: 'X-Ray / Radiologic Technologist',
    category: 'Imaging / Technologist',
    org_types: ['hospital','practice','lab','snf'],
    rate_min: 28, rate_max: 42, rate_unit: 'Hourly',
    responsibilities: [
      'Perform diagnostic radiographic exams',
      'Position patients and select exposure factors',
      'Practice radiation safety and ALARA principles',
      'Ensure image quality and reprocess as needed',
      'Assist with portable and fluoroscopic exams',
      'Maintain imaging equipment and logs',
      'Document exams in the RIS/PACS'
    ],
    requirements: [
      'ARRT registration in Radiography',
      'State radiologic technologist license',
      'Current BLS certification',
      'Knowledge of positioning and radiation safety',
      'Clinical experience preferred'
    ],
    keywords: ['x-ray tech','radiography','radiologic','imaging','arrt','radiology']
  },
  {
    code: 'POS-066',
    title: 'Ultrasound Technologist / Sonographer',
    category: 'Imaging / Technologist',
    org_types: ['hospital','practice','lab'],
    rate_min: 34, rate_max: 52, rate_unit: 'Hourly',
    responsibilities: [
      'Perform diagnostic ultrasound exams',
      'Capture and optimize sonographic images',
      'Provide preliminary findings to radiologists',
      'Position patients and ensure comfort',
      'Maintain ultrasound equipment and QC',
      'Document exams and measurements',
      'Follow exam protocols and safety standards'
    ],
    requirements: [
      'Completion of an accredited sonography program',
      'ARDMS registration (RDMS)',
      'Current BLS certification',
      'Knowledge of abdominal, OB, and vascular imaging',
      'Clinical sonography experience'
    ],
    keywords: ['ultrasound','sonographer','rdms','imaging','diagnostic','ardms']
  },
  {
    code: 'POS-067',
    title: 'Echo / Vascular Technologist',
    category: 'Imaging / Technologist',
    org_types: ['hospital','practice'],
    rate_min: 36, rate_max: 54, rate_unit: 'Hourly',
    responsibilities: [
      'Perform echocardiograms and vascular Doppler studies',
      'Capture cardiac and vascular images and measurements',
      'Assess hemodynamics and blood flow',
      'Provide preliminary findings to cardiologists',
      'Maintain echo and vascular equipment',
      'Document exams and measurements accurately',
      'Follow imaging protocols and safety standards'
    ],
    requirements: [
      'Completion of an accredited cardiovascular or vascular program',
      'ARDMS (RDCS) or CCI (RVT) registration',
      'Current BLS certification',
      'Knowledge of cardiac and vascular anatomy',
      'Clinical echo/vascular experience'
    ],
    keywords: ['echo','doppler','vascular','echocardiogram','rdcs','imaging']
  },
  {
    code: 'POS-068',
    title: 'Nuclear Medicine Technologist',
    category: 'Imaging / Technologist',
    org_types: ['hospital','practice'],
    rate_min: 36, rate_max: 54, rate_unit: 'Hourly',
    responsibilities: [
      'Prepare and administer radiopharmaceuticals',
      'Perform nuclear medicine imaging exams',
      'Operate gamma cameras and SPECT/PET systems',
      'Practice radiation safety and handle radioactive materials',
      'Monitor patients during procedures',
      'Maintain quality control and dose records',
      'Document exams in the RIS/PACS'
    ],
    requirements: [
      'Completion of an accredited nuclear medicine program',
      'NMTCB or ARRT (N) certification',
      'State nuclear medicine license where required',
      'Current BLS certification',
      'Knowledge of radiation safety and radiopharmaceuticals'
    ],
    keywords: ['nuclear medicine','radiopharmaceutical','spect','pet','nmtcb','imaging']
  },
  {
    code: 'POS-069',
    title: 'Mammography Technologist',
    category: 'Imaging / Technologist',
    org_types: ['hospital','practice'],
    rate_min: 32, rate_max: 48, rate_unit: 'Hourly',
    responsibilities: [
      'Perform screening and diagnostic mammograms',
      'Position patients per MQSA standards',
      'Ensure image quality and compression technique',
      'Practice radiation safety',
      'Assist with breast biopsies and localizations',
      'Maintain mammography QC per MQSA',
      'Document exams in the RIS/PACS'
    ],
    requirements: [
      'ARRT registration with Mammography (M) certification',
      'State radiologic technologist license',
      'MQSA compliance training',
      'Current BLS certification',
      'Mammography experience preferred'
    ],
    keywords: ['mammography','mammogram','mqsa','breast imaging','arrt','imaging']
  },
  {
    code: 'POS-070',
    title: 'Surgical Technologist',
    category: 'Imaging / Technologist',
    org_types: ['hospital'],
    rate_min: 24, rate_max: 38, rate_unit: 'Hourly',
    responsibilities: [
      'Prepare the operating room and sterile field',
      'Set up surgical instruments and supplies',
      'Pass instruments to the surgeon during procedures',
      'Maintain sterile technique throughout cases',
      'Perform surgical counts with the circulating nurse',
      'Anticipate procedural needs',
      'Manage instrument decontamination handoff'
    ],
    requirements: [
      'Completion of an accredited surgical technology program',
      'CST certification preferred',
      'Current BLS certification',
      'Knowledge of sterile technique and instrumentation',
      'Operating room experience preferred'
    ],
    keywords: ['surgical tech','cst','sterile','instruments','operating room','surgery']
  },
  {
    code: 'POS-071',
    title: 'Medical Laboratory Scientist (MLS/MT)',
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 60000, rate_max: 85000, rate_unit: 'Annual',
    responsibilities: [
      'Perform complex clinical laboratory testing',
      'Analyze specimens across chemistry, hematology, and microbiology',
      'Verify and report accurate test results',
      'Perform quality control and instrument maintenance',
      'Troubleshoot analyzers and resolve discrepancies',
      'Ensure compliance with CLIA and accreditation standards',
      'Mentor lab technicians and trainees'
    ],
    requirements: [
      'Bachelor degree in Medical Laboratory Science or related field',
      'ASCP (MLS) certification',
      'State license where required',
      'Knowledge of CLIA regulations',
      'Clinical laboratory experience'
    ],
    keywords: ['mls','medical technologist','clinical lab','clia','testing','ascp']
  },
  {
    code: 'POS-072',
    title: 'Medical Laboratory Technician (MLT)',
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 24, rate_max: 36, rate_unit: 'Hourly',
    responsibilities: [
      'Perform routine clinical laboratory tests',
      'Process and prepare specimens for analysis',
      'Operate and maintain lab instruments',
      'Perform quality control procedures',
      'Report results under MLS supervision',
      'Maintain accurate lab records',
      'Follow safety and CLIA protocols'
    ],
    requirements: [
      'Associate degree in Medical Laboratory Technology',
      'ASCP (MLT) certification',
      'State license where required',
      'Knowledge of lab procedures and QC',
      'Clinical lab experience preferred'
    ],
    keywords: ['mlt','lab technician','clinical lab','clia','testing','ascp']
  },
  {
    code: 'POS-073',
    title: 'Laboratory Assistant',
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 16, rate_max: 24, rate_unit: 'Hourly',
    responsibilities: [
      'Receive, label, and accession specimens',
      'Prepare specimens for testing',
      'Perform waived testing as authorized',
      'Maintain lab supplies and inventory',
      'Operate centrifuges and basic equipment',
      'Support phlebotomy and processing workflow',
      'Maintain a clean and safe lab environment'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Laboratory assistant or phlebotomy training preferred',
      'Knowledge of specimen handling',
      'Attention to detail',
      'Ability to follow safety protocols'
    ],
    keywords: ['lab assistant','accessioning','specimen','processing','support','lab']
  },
  {
    code: 'POS-074',
    title: 'Histotechnologist',
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 28, rate_max: 42, rate_unit: 'Hourly',
    responsibilities: [
      'Prepare and process tissue specimens',
      'Embed, section, and stain tissue slides',
      'Operate microtomes and tissue processors',
      'Perform special and immunohistochemical stains',
      'Maintain QC for histology procedures',
      'Troubleshoot staining and processing issues',
      'Document specimen workflow'
    ],
    requirements: [
      'Associate or Bachelor degree in related science',
      'ASCP (HT or HTL) certification',
      'Knowledge of histology techniques',
      'Attention to detail',
      'Histology lab experience preferred'
    ],
    keywords: ['histotechnologist','histology','tissue','staining','microtome','lab']
  },
  {
    code: 'POS-075',
    title: 'Cytotechnologist',
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 65000, rate_max: 90000, rate_unit: 'Annual',
    responsibilities: [
      'Examine cellular specimens for abnormalities',
      'Screen Pap smears and cytology slides',
      'Identify precancerous and cancerous cells',
      'Prepare and stain cytology specimens',
      'Refer abnormal findings to pathologists',
      'Maintain QC and proficiency standards',
      'Document cytologic interpretations'
    ],
    requirements: [
      'Bachelor degree and accredited cytotechnology program',
      'ASCP (CT) certification',
      'Knowledge of cytopathology',
      'Strong microscopy and analytical skills',
      'Cytology lab experience preferred'
    ],
    keywords: ['cytotechnologist','cytology','pap','microscopy','screening','lab']
  },
  {
    code: 'POS-076',
    title: 'Microbiology Technologist',
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 28, rate_max: 44, rate_unit: 'Hourly',
    responsibilities: [
      'Culture and identify microorganisms',
      'Perform antimicrobial susceptibility testing',
      'Process clinical specimens for microbiology',
      'Operate automated microbiology systems',
      'Report critical and final results',
      'Maintain QC and biosafety standards',
      'Support infection control surveillance'
    ],
    requirements: [
      'Bachelor degree in Medical Laboratory Science or Microbiology',
      'ASCP (M or MLS) certification preferred',
      'Knowledge of microbiology procedures',
      'Familiarity with susceptibility testing',
      'Clinical microbiology experience'
    ],
    keywords: ['microbiology','culture','susceptibility','specimen','biosafety','lab']
  },
  {
    code: 'POS-077',
    title: 'Molecular Technologist',
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 32, rate_max: 50, rate_unit: 'Hourly',
    responsibilities: [
      'Perform molecular diagnostic assays including PCR',
      'Extract and prepare nucleic acids',
      'Operate molecular platforms and sequencers',
      'Validate and report molecular test results',
      'Perform QC and assay validation',
      'Troubleshoot molecular workflows',
      'Maintain documentation per CLIA'
    ],
    requirements: [
      'Bachelor degree in Medical Laboratory Science or related',
      'ASCP (MB) certification preferred',
      'Knowledge of molecular techniques and PCR',
      'Attention to detail',
      'Molecular lab experience preferred'
    ],
    keywords: ['molecular','pcr','sequencing','nucleic acid','diagnostics','lab']
  },
  {
    code: 'POS-078',
    title: 'Laboratory Director',
    category: 'Laboratory Leadership',
    org_types: ['lab','hospital'],
    rate_min: 150000, rate_max: 220000, rate_unit: 'Annual',
    responsibilities: [
      'Provide overall direction and oversight of laboratory operations',
      'Ensure CLIA, CAP, and regulatory compliance',
      'Establish testing policies and quality standards',
      'Oversee test validation and method approval',
      'Lead the laboratory quality management program',
      'Direct staffing, budgeting, and resource planning',
      'Serve as the CLIA laboratory director of record'
    ],
    requirements: [
      'MD, DO, or PhD meeting CLIA director qualifications',
      'Board certification in Clinical Pathology or equivalent',
      'Significant laboratory leadership experience',
      'Knowledge of CLIA and CAP regulations',
      'State licensure where required'
    ],
    keywords: ['lab director','clia','cap','leadership','quality','laboratory']
  },
  {
    code: 'POS-079',
    title: 'Laboratory Manager',
    category: 'Laboratory Leadership',
    org_types: ['lab','hospital'],
    rate_min: 90000, rate_max: 130000, rate_unit: 'Annual',
    responsibilities: [
      'Manage daily laboratory operations and workflow',
      'Supervise lab technologists and technicians',
      'Oversee quality control and proficiency testing',
      'Manage budgets, supplies, and equipment',
      'Ensure regulatory and accreditation compliance',
      'Coordinate staffing and scheduling',
      'Drive process improvement initiatives'
    ],
    requirements: [
      'Bachelor degree in Medical Laboratory Science',
      'ASCP certification',
      'Laboratory supervisory experience',
      'Knowledge of CLIA and CAP standards',
      'Strong leadership and operations skills'
    ],
    keywords: ['lab manager','operations','supervision','quality','clia','laboratory']
  },
  {
    code: 'POS-080',
    title: 'Pathologist',
    category: 'Laboratory Leadership',
    org_types: ['lab','hospital'],
    rate_min: 250000, rate_max: 380000, rate_unit: 'Annual',
    responsibilities: [
      'Interpret surgical and cytology specimens',
      'Render diagnoses on tissue and fluid samples',
      'Provide clinical pathology consultation',
      'Oversee laboratory quality and test interpretation',
      'Perform or supervise autopsies as needed',
      'Collaborate with clinicians on diagnostic findings',
      'Sign out pathology reports'
    ],
    requirements: [
      'MD or DO with pathology residency',
      'Board certified in Anatomic and/or Clinical Pathology',
      'Active state medical license',
      'Subspecialty fellowship preferred',
      'Knowledge of laboratory regulations'
    ],
    keywords: ['pathologist','anatomic','clinical pathology','diagnosis','tissue','physician']
  },
  {
    code: 'POS-081',
    title: "Pathologists' Assistant",
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 80000, rate_max: 115000, rate_unit: 'Annual',
    responsibilities: [
      'Perform gross examination and dissection of specimens',
      'Prepare tissue for histologic processing',
      'Document gross findings and dictate descriptions',
      'Assist pathologists in the autopsy suite',
      'Photograph specimens for the record',
      'Maintain specimen accessioning and tracking',
      'Ensure proper specimen handling and safety'
    ],
    requirements: [
      'Masters degree from an accredited PathA program',
      'ASCP (PA) certification',
      'Knowledge of gross pathology and anatomy',
      'Strong attention to detail',
      'Surgical pathology experience preferred'
    ],
    keywords: ['pathologists assistant','grossing','specimen','dissection','pathology','lab']
  },
  {
    code: 'POS-082',
    title: 'Specimen Processor',
    category: 'Laboratory',
    org_types: ['lab','hospital'],
    rate_min: 16, rate_max: 23, rate_unit: 'Hourly',
    responsibilities: [
      'Receive and accession incoming specimens',
      'Sort, label, and prepare specimens for testing',
      'Centrifuge and aliquot samples',
      'Verify specimen and requisition accuracy',
      'Resolve specimen discrepancies and rejections',
      'Maintain processing area cleanliness',
      'Enter specimen data into the LIS'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Specimen processing or lab experience preferred',
      'Knowledge of specimen handling',
      'Strong data-entry accuracy',
      'Ability to work in a fast-paced environment'
    ],
    keywords: ['specimen processor','accessioning','aliquot','lis','processing','lab']
  },
  {
    code: 'POS-083',
    title: 'Laboratory Courier',
    category: 'Laboratory',
    org_types: ['lab'],
    rate_min: 15, rate_max: 22, rate_unit: 'Hourly',
    responsibilities: [
      'Transport specimens between collection sites and the lab',
      'Maintain proper specimen temperature in transit',
      'Follow scheduled routes and pickups',
      'Manage chain-of-custody documentation',
      'Maintain a clean and stocked vehicle',
      'Communicate delays to lab operations',
      'Deliver supplies to client sites'
    ],
    requirements: [
      'Valid drivers license and clean driving record',
      'Knowledge of specimen transport handling preferred',
      'Reliable and punctual',
      'Ability to lift and carry coolers',
      'Familiarity with route logistics'
    ],
    keywords: ['courier','specimen transport','logistics','routes','delivery','lab']
  },
  {
    code: 'POS-084',
    title: 'Receptionist',
    category: 'Administrative / Front Office',
    org_types: ['practice','snf','mgmt'],
    rate_min: 14, rate_max: 20, rate_unit: 'Hourly',
    responsibilities: [
      'Greet patients and visitors warmly',
      'Answer and route incoming phone calls',
      'Check in and check out patients',
      'Verify demographic and insurance information',
      'Schedule and confirm appointments',
      'Collect copays and process payments',
      'Maintain a clean and organized front desk'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Front-office or customer service experience',
      'EHR and scheduling familiarity',
      'Strong communication skills',
      'Professional and courteous demeanor'
    ],
    keywords: ['receptionist','front desk','check-in','scheduling','customer service','admin']
  },
  {
    code: 'POS-085',
    title: 'Front Desk Coordinator',
    category: 'Administrative / Front Office',
    org_types: ['practice','snf'],
    rate_min: 16, rate_max: 23, rate_unit: 'Hourly',
    responsibilities: [
      'Oversee front-desk operations and patient flow',
      'Coordinate check-in, check-out, and scheduling',
      'Train and support reception staff',
      'Resolve patient inquiries and complaints',
      'Verify insurance and manage eligibility',
      'Reconcile daily payments and reporting',
      'Liaise between patients and clinical staff'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Front-office healthcare experience',
      'EHR and practice-management proficiency',
      'Strong organizational and leadership skills',
      'Excellent customer service'
    ],
    keywords: ['front desk','coordinator','patient flow','scheduling','reception','admin']
  },
  {
    code: 'POS-086',
    title: 'Medical Scribe',
    category: 'Administrative / Front Office',
    org_types: ['practice','hospital'],
    rate_min: 15, rate_max: 22, rate_unit: 'Hourly',
    responsibilities: [
      'Document patient encounters in real time',
      'Record histories, exams, and provider assessments',
      'Enter orders and results under provider direction',
      'Maintain accurate and complete EHR notes',
      'Track follow-up items and referrals',
      'Reduce provider documentation burden',
      'Ensure documentation meets coding standards'
    ],
    requirements: [
      'High school diploma; pre-health students preferred',
      'Knowledge of medical terminology',
      'Strong typing and EHR skills',
      'Attention to detail',
      'Scribe certification a plus'
    ],
    keywords: ['scribe','documentation','ehr','medical terminology','charting','admin']
  },
  {
    code: 'POS-087',
    title: 'Radiology Scheduler',
    category: 'Administrative / Front Office',
    org_types: ['practice','hospital'],
    rate_min: 16, rate_max: 23, rate_unit: 'Hourly',
    responsibilities: [
      'Schedule imaging exams across modalities',
      'Verify orders, authorizations, and prep instructions',
      'Coordinate patient and equipment availability',
      'Communicate prep and arrival instructions',
      'Obtain prior authorizations for imaging',
      'Manage cancellations and rescheduling',
      'Document scheduling in the RIS'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Scheduling or front-office experience',
      'Knowledge of imaging modalities and prep',
      'Familiarity with prior authorization',
      'Strong organizational skills'
    ],
    keywords: ['radiology scheduler','imaging','authorization','scheduling','ris','admin']
  },
  {
    code: 'POS-088',
    title: 'LTC Scheduler',
    category: 'Administrative / Front Office',
    org_types: ['snf','mgmt'],
    rate_min: 17, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Build and maintain nursing staff schedules',
      'Fill open shifts and manage call-offs',
      'Coordinate agency and PRN staffing',
      'Track staffing ratios and compliance',
      'Communicate schedule changes to staff',
      'Maintain scheduling records and reports',
      'Support payroll with timekeeping data'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Scheduling experience in healthcare or LTC',
      'Familiarity with staffing software',
      'Knowledge of staffing ratio requirements',
      'Strong organizational and communication skills'
    ],
    keywords: ['ltc scheduler','staffing','shifts','snf','scheduling','admin']
  },
  {
    code: 'POS-089',
    title: 'Scheduler',
    category: 'Administrative / Front Office',
    org_types: ['practice','mgmt','hospital'],
    rate_min: 15, rate_max: 22, rate_unit: 'Hourly',
    responsibilities: [
      'Schedule patient appointments and procedures',
      'Coordinate provider and resource availability',
      'Confirm and remind patients of appointments',
      'Manage waitlists and rescheduling',
      'Verify referral and authorization requirements',
      'Optimize provider templates and utilization',
      'Document scheduling in the EHR'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Scheduling or front-office experience',
      'EHR and scheduling system proficiency',
      'Strong organizational skills',
      'Customer service orientation'
    ],
    keywords: ['scheduler','appointments','scheduling','coordination','ehr','admin']
  },
  {
    code: 'POS-090',
    title: 'Medical Records Clerk',
    category: 'Administrative / Front Office',
    org_types: ['practice','snf','hospital'],
    rate_min: 15, rate_max: 22, rate_unit: 'Hourly',
    responsibilities: [
      'Maintain and organize patient medical records',
      'Process release-of-information requests',
      'Scan and index documents into the EHR',
      'Ensure record completeness and accuracy',
      'Comply with HIPAA and retention policies',
      'Respond to records requests from providers and patients',
      'Audit charts for missing documentation'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Medical records or HIM experience preferred',
      'Knowledge of HIPAA and ROI',
      'EHR proficiency',
      'Strong attention to detail'
    ],
    keywords: ['medical records','him','roi','hipaa','charts','admin']
  },
  {
    code: 'POS-091',
    title: 'Prior Authorization Specialist',
    category: 'Administrative / Front Office',
    org_types: ['practice','mgmt','hospital'],
    rate_min: 18, rate_max: 26, rate_unit: 'Hourly',
    responsibilities: [
      'Obtain prior authorizations for services and medications',
      'Submit clinical documentation to payers',
      'Track authorization status and follow up',
      'Appeal denied authorizations',
      'Communicate approvals to scheduling and clinical staff',
      'Maintain authorization logs and records',
      'Stay current on payer requirements'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Prior authorization or insurance experience',
      'Knowledge of payer requirements and CPT/ICD codes',
      'Strong follow-up and documentation skills',
      'EHR proficiency'
    ],
    keywords: ['prior authorization','payer','insurance','appeals','referrals','admin']
  },
  {
    code: 'POS-092',
    title: 'Patient Access Representative',
    category: 'Administrative / Front Office',
    org_types: ['practice','hospital'],
    rate_min: 16, rate_max: 24, rate_unit: 'Hourly',
    responsibilities: [
      'Register and admit patients accurately',
      'Verify insurance eligibility and benefits',
      'Collect demographic and financial information',
      'Process point-of-service collections',
      'Explain financial responsibility to patients',
      'Coordinate with clinical and billing teams',
      'Ensure registration data integrity'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Patient access or registration experience',
      'Knowledge of insurance verification',
      'EHR and registration system proficiency',
      'Strong customer service skills'
    ],
    keywords: ['patient access','registration','eligibility','admissions','verification','admin']
  },
  {
    code: 'POS-093',
    title: 'Insurance / Billing Specialist',
    category: 'Revenue Cycle',
    org_types: ['practice','mgmt','hospital','snf'],
    rate_min: 18, rate_max: 27, rate_unit: 'Hourly',
    responsibilities: [
      'Prepare and submit insurance claims',
      'Post payments and reconcile accounts',
      'Follow up on unpaid and denied claims',
      'Manage patient billing inquiries',
      'Process appeals and corrected claims',
      'Verify coverage and benefits',
      'Maintain accurate billing records'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Medical billing experience',
      'Knowledge of CPT, ICD-10, and payer rules',
      'Practice-management system proficiency',
      'Strong attention to detail'
    ],
    keywords: ['billing','insurance','claims','denials','revenue cycle','reimbursement']
  },
  {
    code: 'POS-094',
    title: 'Medical Coder',
    category: 'Revenue Cycle',
    org_types: ['practice','mgmt','hospital'],
    rate_min: 22, rate_max: 34, rate_unit: 'Hourly',
    responsibilities: [
      'Assign accurate CPT, ICD-10, and HCPCS codes',
      'Review documentation for coding support',
      'Query providers on documentation gaps',
      'Ensure compliance with coding guidelines',
      'Optimize coding accuracy and reimbursement',
      'Audit charts for coding integrity',
      'Stay current on coding updates'
    ],
    requirements: [
      'CPC, CCS, or equivalent coding certification',
      'Knowledge of CPT, ICD-10, and HCPCS',
      'Coding or HIM experience',
      'Understanding of payer and compliance rules',
      'Strong analytical skills'
    ],
    keywords: ['coder','cpt','icd-10','hcpcs','coding','revenue cycle']
  },
  {
    code: 'POS-095',
    title: 'Referral Coordinator',
    category: 'Administrative / Front Office',
    org_types: ['practice','mgmt'],
    rate_min: 16, rate_max: 24, rate_unit: 'Hourly',
    responsibilities: [
      'Process and track patient referrals to specialists',
      'Obtain referral authorizations from payers',
      'Coordinate appointments with specialty offices',
      'Communicate referral status to patients',
      'Maintain referral logs and documentation',
      'Follow up on pending and completed referrals',
      'Ensure clinical records accompany referrals'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Referral or front-office experience',
      'Knowledge of payer referral requirements',
      'EHR proficiency',
      'Strong organizational skills'
    ],
    keywords: ['referral coordinator','referrals','authorization','specialty','coordination','admin']
  },
  {
    code: 'POS-096',
    title: 'Practice Manager',
    category: 'Operations / Leadership',
    org_types: ['practice','mgmt'],
    rate_min: 65000, rate_max: 95000, rate_unit: 'Annual',
    responsibilities: [
      'Oversee daily operations of the medical practice',
      'Manage front-office and clinical support staff',
      'Drive patient satisfaction and operational efficiency',
      'Manage budgets, scheduling, and revenue cycle',
      'Ensure regulatory and compliance adherence',
      'Coordinate with providers on workflow',
      'Lead hiring, training, and performance management'
    ],
    requirements: [
      'Bachelor degree in healthcare administration or related',
      'Practice or clinic management experience',
      'Knowledge of revenue cycle and operations',
      'Strong leadership and communication skills',
      'EHR and practice-management proficiency'
    ],
    keywords: ['practice manager','operations','clinic','leadership','revenue cycle','management']
  },
  {
    code: 'POS-097',
    title: 'Regional Operations Director',
    category: 'Operations / Leadership',
    org_types: ['mgmt'],
    rate_min: 110000, rate_max: 160000, rate_unit: 'Annual',
    responsibilities: [
      'Oversee operations across multiple sites or facilities',
      'Drive financial and operational performance',
      'Standardize processes and best practices',
      'Support and develop site-level leaders',
      'Monitor KPIs and implement improvement plans',
      'Ensure regulatory compliance across the region',
      'Lead strategic initiatives and expansion'
    ],
    requirements: [
      'Bachelor degree; MBA or MHA preferred',
      'Multi-site healthcare operations leadership experience',
      'Strong financial and analytical acumen',
      'Knowledge of healthcare regulations',
      'Excellent leadership and communication skills'
    ],
    keywords: ['regional director','operations','multi-site','leadership','kpi','management']
  },
  {
    code: 'POS-098',
    title: 'Director of Administration',
    category: 'Operations / Leadership',
    org_types: ['mgmt','hospital'],
    rate_min: 100000, rate_max: 150000, rate_unit: 'Annual',
    responsibilities: [
      'Oversee administrative functions and support services',
      'Develop and implement operational policies',
      'Manage administrative staff and departments',
      'Coordinate facilities, vendors, and contracts',
      'Support executive leadership initiatives',
      'Monitor administrative budgets',
      'Ensure compliance and risk management'
    ],
    requirements: [
      'Bachelor degree; Master preferred',
      'Healthcare administration leadership experience',
      'Strong organizational and analytical skills',
      'Knowledge of healthcare operations and compliance',
      'Excellent leadership abilities'
    ],
    keywords: ['director of administration','operations','leadership','administration','compliance','management']
  },
  {
    code: 'POS-099',
    title: 'Administrative Assistant',
    category: 'Operations / Support',
    org_types: ['mgmt','practice','snf','hospital'],
    rate_min: 16, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Provide administrative support to leadership and teams',
      'Manage calendars, meetings, and travel',
      'Prepare documents, reports, and correspondence',
      'Maintain files and office organization',
      'Coordinate office supplies and vendors',
      'Handle phone, email, and visitor management',
      'Support special projects as assigned'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Administrative support experience',
      'Proficiency in Microsoft Office',
      'Strong organizational and communication skills',
      'Attention to detail'
    ],
    keywords: ['administrative assistant','support','calendar','office','coordination','admin']
  },
  {
    code: 'POS-100',
    title: 'Executive Assistant',
    category: 'Operations / Support',
    org_types: ['mgmt'],
    rate_min: 55000, rate_max: 80000, rate_unit: 'Annual',
    responsibilities: [
      'Provide high-level support to executives',
      'Manage complex calendars and scheduling',
      'Coordinate board and leadership meetings',
      'Prepare presentations and confidential reports',
      'Manage travel and expense reporting',
      'Serve as liaison for internal and external stakeholders',
      'Handle sensitive and confidential matters'
    ],
    requirements: [
      'Bachelor degree preferred',
      'Executive support experience',
      'Advanced Microsoft Office and scheduling skills',
      'Discretion and confidentiality',
      'Strong organizational and communication skills'
    ],
    keywords: ['executive assistant','executive support','calendar','confidential','coordination','admin']
  },
  {
    code: 'POS-101',
    title: 'Administrator (LNHA)',
    category: 'Operations / Leadership',
    org_types: ['snf'],
    rate_min: 110000, rate_max: 160000, rate_unit: 'Annual',
    responsibilities: [
      'Direct overall operations of the skilled-nursing facility',
      'Ensure regulatory compliance and survey readiness',
      'Manage budgets, census, and financial performance',
      'Lead the interdisciplinary leadership team',
      'Oversee quality, safety, and resident satisfaction',
      'Manage staffing, hiring, and labor relations',
      'Serve as primary liaison with corporate and regulators'
    ],
    requirements: [
      'Active LNHA (Licensed Nursing Home Administrator) license',
      'Bachelor degree in healthcare administration or related',
      'SNF leadership experience',
      'Knowledge of CMS and state LTC regulations',
      'Strong financial and leadership skills'
    ],
    keywords: ['administrator','lnha','snf','nursing home','leadership','operations']
  },
  {
    code: 'POS-102',
    title: 'Assistant Administrator',
    category: 'Operations / Leadership',
    org_types: ['snf'],
    rate_min: 75000, rate_max: 105000, rate_unit: 'Annual',
    responsibilities: [
      'Support the administrator in facility operations',
      'Oversee assigned departments and projects',
      'Assist with regulatory compliance and surveys',
      'Monitor operational and quality metrics',
      'Support staffing and human resources functions',
      'Manage vendor and facility coordination',
      'Step in during administrator absence'
    ],
    requirements: [
      'LNHA license or administrator-in-training status',
      'Bachelor degree in healthcare administration or related',
      'Long-term care experience',
      'Knowledge of LTC regulations',
      'Strong organizational and leadership skills'
    ],
    keywords: ['assistant administrator','snf','operations','long-term care','leadership','ait']
  },
  {
    code: 'POS-103',
    title: 'Director of Nursing (DON)',
    category: 'Nursing Leadership',
    org_types: ['snf'],
    rate_min: 95000, rate_max: 140000, rate_unit: 'Annual',
    responsibilities: [
      'Direct nursing services and clinical operations',
      'Ensure quality of care and regulatory compliance',
      'Lead and develop the nursing leadership team',
      'Oversee staffing, scheduling, and competencies',
      'Manage clinical quality, infection control, and QAPI',
      'Coordinate with the medical director and administrator',
      'Lead survey readiness and corrective action plans'
    ],
    requirements: [
      'Active state RN license; BSN preferred',
      'Nursing leadership experience in long-term care',
      'Knowledge of CMS and state SNF regulations',
      'Strong clinical and management skills',
      'Current BLS certification'
    ],
    keywords: ['director of nursing','don','snf','nursing leadership','qapi','clinical']
  },
  {
    code: 'POS-104',
    title: 'Assistant Director of Nursing (ADON)',
    category: 'Nursing Leadership',
    org_types: ['snf'],
    rate_min: 80000, rate_max: 110000, rate_unit: 'Annual',
    responsibilities: [
      'Support the DON in clinical operations',
      'Supervise nursing staff and shift coverage',
      'Assist with quality, compliance, and audits',
      'Coordinate staff education and competencies',
      'Manage clinical documentation oversight',
      'Support infection control and care planning',
      'Act as DON in their absence'
    ],
    requirements: [
      'Active state RN license; BSN preferred',
      'Long-term care nursing experience',
      'Supervisory or leadership experience',
      'Knowledge of LTC regulations',
      'Current BLS certification'
    ],
    keywords: ['adon','assistant director of nursing','snf','nursing leadership','supervision','clinical']
  },
  {
    code: 'POS-105',
    title: 'Director of Rehabilitation',
    category: 'Operations / Leadership',
    org_types: ['snf'],
    rate_min: 80000, rate_max: 115000, rate_unit: 'Annual',
    responsibilities: [
      'Direct the rehabilitation department and therapy services',
      'Manage PT, OT, and SLP staff and productivity',
      'Ensure therapy documentation and compliance',
      'Coordinate care with nursing and physicians',
      'Monitor therapy outcomes and quality',
      'Manage budgets and staffing',
      'Support survey readiness for therapy services'
    ],
    requirements: [
      'Licensed PT, OT, or SLP',
      'Active state therapy license',
      'Rehabilitation leadership experience',
      'Knowledge of Medicare therapy regulations',
      'Strong management skills'
    ],
    keywords: ['director of rehab','therapy','rehabilitation','leadership','snf','pt ot slp']
  },
  {
    code: 'POS-106',
    title: 'Business Office Manager',
    category: 'Revenue Cycle',
    org_types: ['snf','practice'],
    rate_min: 55000, rate_max: 80000, rate_unit: 'Annual',
    responsibilities: [
      'Manage facility billing and accounts receivable',
      'Oversee resident trust and private-pay accounts',
      'Coordinate Medicaid and Medicare billing',
      'Supervise business office staff',
      'Manage collections and aging reports',
      'Ensure financial compliance and audit readiness',
      'Liaise with families on financial matters'
    ],
    requirements: [
      'Associate or Bachelor degree in business or related',
      'Healthcare business office or billing experience',
      'Knowledge of Medicaid/Medicare billing',
      'Strong financial and supervisory skills',
      'Attention to detail'
    ],
    keywords: ['business office manager','billing','accounts receivable','medicaid','collections','revenue cycle']
  },
  {
    code: 'POS-107',
    title: 'HR Generalist / Manager',
    category: 'Human Resources',
    org_types: ['mgmt','snf','hospital','practice'],
    rate_min: 60000, rate_max: 95000, rate_unit: 'Annual',
    responsibilities: [
      'Manage recruitment, onboarding, and offboarding',
      'Administer benefits and leave programs',
      'Handle employee relations and investigations',
      'Ensure compliance with labor laws and policies',
      'Maintain HRIS and personnel records',
      'Support performance management and training',
      'Advise leadership on HR matters'
    ],
    requirements: [
      'Bachelor degree in HR or related field',
      'HR generalist experience, healthcare preferred',
      'Knowledge of employment law and compliance',
      'PHR or SHRM certification preferred',
      'Strong interpersonal and problem-solving skills'
    ],
    keywords: ['hr generalist','human resources','employee relations','benefits','compliance','hr']
  },
  {
    code: 'POS-108',
    title: 'Recruiter',
    category: 'Human Resources',
    org_types: ['mgmt'],
    rate_min: 55000, rate_max: 80000, rate_unit: 'Annual',
    responsibilities: [
      'Source and recruit candidates across roles',
      'Screen resumes and conduct interviews',
      'Manage the applicant tracking system',
      'Coordinate hiring with managers',
      'Build talent pipelines for hard-to-fill roles',
      'Extend offers and manage onboarding handoff',
      'Track recruiting metrics and time-to-fill'
    ],
    requirements: [
      'Bachelor degree or equivalent experience',
      'Recruiting experience, healthcare preferred',
      'ATS and sourcing tool proficiency',
      'Strong communication and relationship skills',
      'Knowledge of healthcare licensure requirements'
    ],
    keywords: ['recruiter','talent','sourcing','ats','hiring','hr']
  },
  {
    code: 'POS-109',
    title: 'Talent Acquisition Specialist',
    category: 'Human Resources',
    org_types: ['mgmt'],
    rate_min: 60000, rate_max: 90000, rate_unit: 'Annual',
    responsibilities: [
      'Develop and execute talent acquisition strategies',
      'Manage full-cycle recruiting for key positions',
      'Build employer branding and outreach campaigns',
      'Partner with leaders on workforce planning',
      'Optimize the candidate experience',
      'Manage recruiting vendors and job boards',
      'Analyze recruiting data and report on KPIs'
    ],
    requirements: [
      'Bachelor degree in HR, business, or related',
      'Talent acquisition or recruiting experience',
      'ATS and sourcing expertise',
      'Knowledge of healthcare hiring',
      'Strong strategic and analytical skills'
    ],
    keywords: ['talent acquisition','recruiting','sourcing','employer branding','workforce','hr']
  },
  {
    code: 'POS-110',
    title: 'Payroll Specialist',
    category: 'Finance / Accounting',
    org_types: ['mgmt'],
    rate_min: 45000, rate_max: 68000, rate_unit: 'Annual',
    responsibilities: [
      'Process multi-site payroll accurately and on time',
      'Maintain timekeeping and attendance records',
      'Calculate wages, overtime, and deductions',
      'Process garnishments and tax withholdings',
      'Reconcile payroll and resolve discrepancies',
      'Ensure payroll tax compliance and filings',
      'Respond to employee payroll inquiries'
    ],
    requirements: [
      'Associate or Bachelor degree in accounting or related',
      'Payroll processing experience',
      'Knowledge of payroll systems and tax rules',
      'CPP or FPC certification preferred',
      'Strong attention to detail'
    ],
    keywords: ['payroll','timekeeping','wages','compliance','deductions','finance']
  },
  {
    code: 'POS-111',
    title: 'Senior Accountant',
    category: 'Finance / Accounting',
    org_types: ['mgmt'],
    rate_min: 70000, rate_max: 95000, rate_unit: 'Annual',
    responsibilities: [
      'Prepare and review financial statements',
      'Manage month-end and year-end close',
      'Perform account reconciliations and analysis',
      'Support audits and tax preparation',
      'Maintain general ledger integrity',
      'Develop and monitor budgets and forecasts',
      'Ensure GAAP compliance'
    ],
    requirements: [
      'Bachelor degree in accounting or finance',
      'Senior accounting experience',
      'Knowledge of GAAP and financial reporting',
      'CPA or progress toward CPA preferred',
      'Strong analytical and ERP skills'
    ],
    keywords: ['senior accountant','gaap','close','reconciliation','financial reporting','finance']
  },
  {
    code: 'POS-112',
    title: 'Staff Accountant',
    category: 'Finance / Accounting',
    org_types: ['mgmt'],
    rate_min: 55000, rate_max: 72000, rate_unit: 'Annual',
    responsibilities: [
      'Record journal entries and maintain the ledger',
      'Process accounts payable and receivable',
      'Reconcile bank and general ledger accounts',
      'Assist with month-end close',
      'Prepare financial reports and schedules',
      'Support audit and tax documentation',
      'Maintain accurate accounting records'
    ],
    requirements: [
      'Bachelor degree in accounting or finance',
      'Entry-level to mid-level accounting experience',
      'Knowledge of GAAP fundamentals',
      'Accounting software proficiency',
      'Strong attention to detail'
    ],
    keywords: ['staff accountant','general ledger','ap','ar','reconciliation','finance']
  },
  {
    code: 'POS-113',
    title: 'Controller',
    category: 'Finance / Accounting',
    org_types: ['mgmt'],
    rate_min: 110000, rate_max: 160000, rate_unit: 'Annual',
    responsibilities: [
      'Direct accounting operations and financial reporting',
      'Oversee close, consolidations, and audits',
      'Maintain internal controls and policies',
      'Manage budgeting and forecasting processes',
      'Supervise the accounting team',
      'Ensure GAAP and regulatory compliance',
      'Advise leadership on financial performance'
    ],
    requirements: [
      'Bachelor degree in accounting or finance; CPA preferred',
      'Controller or senior accounting leadership experience',
      'Strong knowledge of GAAP and internal controls',
      'Multi-entity healthcare experience preferred',
      'Excellent leadership and analytical skills'
    ],
    keywords: ['controller','accounting','financial reporting','internal controls','gaap','finance']
  },
  {
    code: 'POS-114',
    title: 'Chief Financial Officer (CFO)',
    category: 'Executive Leadership',
    org_types: ['mgmt'],
    rate_min: 180000, rate_max: 280000, rate_unit: 'Annual',
    responsibilities: [
      'Lead the organization financial strategy',
      'Oversee accounting, treasury, and financial planning',
      'Manage capital structure and financing',
      'Drive financial performance and forecasting',
      'Advise the executive team and board',
      'Ensure regulatory and audit compliance',
      'Lead financial risk management'
    ],
    requirements: [
      'Bachelor degree in finance or accounting; MBA/CPA preferred',
      'Senior financial leadership experience',
      'Healthcare finance experience strongly preferred',
      'Strong strategic and analytical acumen',
      'Excellent leadership and communication skills'
    ],
    keywords: ['cfo','finance executive','strategy','financial planning','leadership','executive']
  },
  {
    code: 'POS-115',
    title: 'Billing Manager',
    category: 'Revenue Cycle',
    org_types: ['mgmt','practice'],
    rate_min: 65000, rate_max: 95000, rate_unit: 'Annual',
    responsibilities: [
      'Manage the billing department and staff',
      'Oversee claims submission and payment posting',
      'Monitor denial trends and resolution',
      'Optimize billing workflows and accuracy',
      'Ensure payer and coding compliance',
      'Report on billing KPIs and AR',
      'Train and develop billing staff'
    ],
    requirements: [
      'Bachelor degree or equivalent experience',
      'Medical billing leadership experience',
      'Knowledge of CPT, ICD-10, and payer rules',
      'Practice-management system expertise',
      'Strong leadership and analytical skills'
    ],
    keywords: ['billing manager','claims','denials','revenue cycle','leadership','reimbursement']
  },
  {
    code: 'POS-116',
    title: 'Revenue Cycle Manager',
    category: 'Revenue Cycle',
    org_types: ['mgmt'],
    rate_min: 75000, rate_max: 110000, rate_unit: 'Annual',
    responsibilities: [
      'Manage the end-to-end revenue cycle',
      'Optimize charge capture, billing, and collections',
      'Monitor KPIs including AR days and denial rate',
      'Lead process improvement across the cycle',
      'Coordinate front-end and back-end functions',
      'Ensure compliance with payer and coding rules',
      'Report financial performance to leadership'
    ],
    requirements: [
      'Bachelor degree in healthcare administration or related',
      'Revenue cycle leadership experience',
      'Strong knowledge of billing, coding, and collections',
      'Analytical and process-improvement skills',
      'Experience with revenue cycle systems'
    ],
    keywords: ['revenue cycle','rcm','collections','ar days','denials','reimbursement']
  },
  {
    code: 'POS-117',
    title: 'Credentialing Specialist',
    category: 'Compliance / Credentialing',
    org_types: ['mgmt','hospital'],
    rate_min: 22, rate_max: 32, rate_unit: 'Hourly',
    responsibilities: [
      'Manage provider credentialing and re-credentialing',
      'Verify licenses, certifications, and education',
      'Maintain CAQH and payer enrollment',
      'Track expirations and renewals',
      'Coordinate privileging with facilities',
      'Maintain accurate credentialing records',
      'Ensure compliance with credentialing standards'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Credentialing or provider enrollment experience',
      'Knowledge of CAQH, NPI, and payer enrollment',
      'CPCS certification preferred',
      'Strong attention to detail'
    ],
    keywords: ['credentialing','enrollment','caqh','privileging','provider','compliance']
  },
  {
    code: 'POS-118',
    title: 'Compliance Officer',
    category: 'Compliance / Credentialing',
    org_types: ['mgmt'],
    rate_min: 95000, rate_max: 145000, rate_unit: 'Annual',
    responsibilities: [
      'Develop and oversee the compliance program',
      'Conduct audits, monitoring, and risk assessments',
      'Investigate compliance concerns and complaints',
      'Ensure HIPAA, fraud, and abuse compliance',
      'Provide compliance training and education',
      'Maintain policies and regulatory documentation',
      'Report to leadership and the board on compliance'
    ],
    requirements: [
      'Bachelor degree; JD or advanced degree preferred',
      'Healthcare compliance experience',
      'Knowledge of HIPAA, Stark, and Anti-Kickback laws',
      'CHC certification preferred',
      'Strong investigative and analytical skills'
    ],
    keywords: ['compliance','hipaa','audit','risk','regulatory','fraud']
  },
  {
    code: 'POS-119',
    title: 'IT Support / Help Desk',
    category: 'Information Technology',
    org_types: ['mgmt'],
    rate_min: 20, rate_max: 32, rate_unit: 'Hourly',
    responsibilities: [
      'Provide first-line technical support to staff',
      'Troubleshoot hardware, software, and network issues',
      'Manage help desk tickets and resolution',
      'Set up and configure user accounts and devices',
      'Support EHR and clinical applications',
      'Document issues and solutions',
      'Escalate complex issues to senior IT'
    ],
    requirements: [
      'Associate degree or equivalent experience',
      'Help desk or technical support experience',
      'Knowledge of Windows, networking, and ticketing',
      'CompTIA A+ certification preferred',
      'Strong customer service and troubleshooting skills'
    ],
    keywords: ['it support','help desk','troubleshooting','technical support','ehr','it']
  },
  {
    code: 'POS-120',
    title: 'Systems Administrator',
    category: 'Information Technology',
    org_types: ['mgmt'],
    rate_min: 75000, rate_max: 110000, rate_unit: 'Annual',
    responsibilities: [
      'Administer servers, networks, and infrastructure',
      'Manage user access, security, and backups',
      'Maintain EHR and enterprise systems',
      'Monitor system performance and uptime',
      'Implement patches and updates',
      'Support disaster recovery and business continuity',
      'Ensure security and HIPAA compliance'
    ],
    requirements: [
      'Bachelor degree in IT or related; or equivalent experience',
      'Systems administration experience',
      'Knowledge of Windows/Linux, networking, and security',
      'Relevant certifications (MCSA, Network+) preferred',
      'Healthcare IT experience a plus'
    ],
    keywords: ['systems administrator','infrastructure','servers','security','networking','it']
  },
  {
    code: 'POS-121',
    title: 'Marketing / Admissions Coordinator',
    category: 'Operations / Support',
    org_types: ['snf','mgmt'],
    rate_min: 45000, rate_max: 68000, rate_unit: 'Annual',
    responsibilities: [
      'Manage facility admissions and inquiries',
      'Build referral relationships with hospitals and providers',
      'Conduct facility tours for prospective residents',
      'Coordinate admission paperwork and clinical review',
      'Track census and conversion metrics',
      'Execute community marketing and outreach',
      'Support occupancy and revenue goals'
    ],
    requirements: [
      'Bachelor degree in marketing, healthcare, or related',
      'Healthcare sales, admissions, or marketing experience',
      'Knowledge of SNF admission processes',
      'Strong relationship-building and communication skills',
      'Ability to meet census targets'
    ],
    keywords: ['admissions','marketing','census','referrals','outreach','snf']
  },
  {
    code: 'POS-122',
    title: 'Social Worker (SNF)',
    category: 'Clinical Support',
    org_types: ['snf'],
    rate_min: 50000, rate_max: 72000, rate_unit: 'Annual',
    responsibilities: [
      'Conduct psychosocial assessments of residents',
      'Develop and implement social service care plans',
      'Coordinate discharge planning and community resources',
      'Advocate for resident rights and preferences',
      'Support residents and families through transitions',
      'Address behavioral and emotional needs',
      'Document social services per regulations'
    ],
    requirements: [
      'Bachelor or Master degree in Social Work',
      'State social work license where required',
      'Long-term care experience preferred',
      'Knowledge of discharge planning and resources',
      'Strong interpersonal and advocacy skills'
    ],
    keywords: ['social worker','psychosocial','discharge planning','snf','resources','msw']
  },
  {
    code: 'POS-123',
    title: 'Activities Director',
    category: 'Operations / Support',
    org_types: ['snf'],
    rate_min: 40000, rate_max: 60000, rate_unit: 'Annual',
    responsibilities: [
      'Plan and lead resident activity programs',
      'Assess resident interests and engagement needs',
      'Coordinate events, outings, and entertainment',
      'Manage activity staff and volunteers',
      'Document participation per regulations',
      'Promote quality of life and socialization',
      'Manage the activities budget and supplies'
    ],
    requirements: [
      'Activity Director certification (ADC/MEPAP) preferred',
      'Experience in activities or recreation therapy',
      'Knowledge of LTC activity regulations',
      'Creativity and strong interpersonal skills',
      'Organizational and leadership abilities'
    ],
    keywords: ['activities director','recreation','engagement','snf','programming','quality of life']
  },
  {
    code: 'POS-124',
    title: 'Dietary Manager',
    category: 'Operations / Support',
    org_types: ['snf'],
    rate_min: 45000, rate_max: 65000, rate_unit: 'Annual',
    responsibilities: [
      'Manage food service operations and staff',
      'Ensure therapeutic diets are prepared correctly',
      'Maintain food safety and sanitation standards',
      'Coordinate with the dietitian on meal plans',
      'Manage the dietary budget and inventory',
      'Ensure regulatory compliance for food service',
      'Address resident dining preferences and satisfaction'
    ],
    requirements: [
      'Certified Dietary Manager (CDM) credential',
      'Food service management experience',
      'ServSafe certification',
      'Knowledge of therapeutic diets and LTC regulations',
      'Strong leadership and organizational skills'
    ],
    keywords: ['dietary manager','food service','cdm','therapeutic diet','sanitation','snf']
  },
  {
    code: 'POS-125',
    title: 'Maintenance Director',
    category: 'Operations / Support',
    org_types: ['snf'],
    rate_min: 50000, rate_max: 72000, rate_unit: 'Annual',
    responsibilities: [
      'Oversee facility maintenance and operations',
      'Manage preventive maintenance programs',
      'Ensure life safety and environmental compliance',
      'Coordinate repairs and capital projects',
      'Manage maintenance staff and vendors',
      'Maintain HVAC, plumbing, and electrical systems',
      'Support emergency preparedness and inspections'
    ],
    requirements: [
      'High school diploma; technical training preferred',
      'Facility maintenance experience, healthcare preferred',
      'Knowledge of life safety code and regulations',
      'HVAC or trade certifications a plus',
      'Strong problem-solving and leadership skills'
    ],
    keywords: ['maintenance director','facilities','life safety','hvac','preventive maintenance','snf']
  },
  {
    code: 'POS-126',
    title: 'Housekeeping / Environmental Services',
    category: 'Operations / Support',
    org_types: ['snf','hospital'],
    rate_min: 14, rate_max: 20, rate_unit: 'Hourly',
    responsibilities: [
      'Clean and sanitize patient and common areas',
      'Follow infection control cleaning protocols',
      'Manage linens, trash, and biohazard disposal',
      'Maintain cleaning supplies and equipment',
      'Respond to environmental service requests',
      'Support a safe and sanitary environment',
      'Document cleaning per facility standards'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Housekeeping or EVS experience preferred',
      'Knowledge of infection control cleaning',
      'Ability to perform physical tasks',
      'Attention to detail'
    ],
    keywords: ['housekeeping','environmental services','evs','sanitation','infection control','cleaning']
  },
  {
    code: 'POS-127',
    title: 'Rural Health Clinic Director',
    category: 'Operations / Leadership',
    org_types: ['practice','mgmt'],
    rate_min: 85000, rate_max: 120000, rate_unit: 'Annual',
    responsibilities: [
      'Direct operations of the rural health clinic',
      'Ensure RHC regulatory and certification compliance',
      'Manage clinical and administrative staff',
      'Oversee billing and cost-reporting for RHC',
      'Coordinate care with providers and community',
      'Monitor quality and patient access metrics',
      'Manage budgets and grant requirements'
    ],
    requirements: [
      'Bachelor degree in healthcare administration or nursing',
      'RHC or clinic leadership experience',
      'Knowledge of RHC regulations and cost reporting',
      'Strong operational and financial skills',
      'Clinical background preferred'
    ],
    keywords: ['rural health clinic','rhc','director','operations','compliance','leadership']
  },
  {
    code: 'POS-128',
    title: 'House Supervisor',
    category: 'Nursing Leadership',
    org_types: ['hospital'],
    rate_min: 42, rate_max: 60, rate_unit: 'Hourly',
    responsibilities: [
      'Oversee hospital operations during the shift',
      'Manage bed placement and patient flow',
      'Supervise nursing staff across units',
      'Respond to emergencies and escalations',
      'Coordinate staffing and resource allocation',
      'Serve as administrative authority after hours',
      'Resolve operational and patient-care issues'
    ],
    requirements: [
      'BSN with active state RN license',
      'Significant acute-care nursing experience',
      'Current BLS and ACLS certification',
      'Leadership or supervisory experience',
      'Strong decision-making and crisis-management skills'
    ],
    keywords: ['house supervisor','nursing supervisor','patient flow','staffing','hospital','rn']
  },
  {
    code: 'POS-129',
    title: 'Charge Nurse (Hospital)',
    category: 'Nursing Leadership',
    org_types: ['hospital'],
    rate_min: 40, rate_max: 58, rate_unit: 'Hourly',
    responsibilities: [
      'Lead a hospital nursing unit during the shift',
      'Coordinate patient assignments and acuity',
      'Serve as clinical resource for staff',
      'Manage admissions, transfers, and discharges',
      'Ensure quality and safety standards',
      'Respond to codes and rapid responses',
      'Communicate with providers and leadership'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Acute-care nursing experience',
      'Current BLS and ACLS certification',
      'Demonstrated leadership skills',
      'Strong clinical judgment'
    ],
    keywords: ['charge nurse','unit','acute care','leadership','hospital','rn']
  },
  {
    code: 'POS-130',
    title: 'Patient Care Technician',
    category: 'Nursing Support',
    org_types: ['hospital'],
    rate_min: 16, rate_max: 24, rate_unit: 'Hourly',
    responsibilities: [
      'Assist patients with activities of daily living',
      'Obtain and record vital signs',
      'Perform EKGs and phlebotomy as trained',
      'Support patient mobility and transfers',
      'Assist nurses with care tasks and procedures',
      'Report changes in patient condition',
      'Maintain a clean and safe patient environment'
    ],
    requirements: [
      'High school diploma; PCT or CNA certification',
      'Patient care experience preferred',
      'Current BLS certification',
      'EKG and phlebotomy training a plus',
      'Compassionate, team-oriented approach'
    ],
    keywords: ['patient care technician','pct','vitals','ekg','phlebotomy','hospital']
  },
  {
    code: 'POS-131',
    title: 'Unit Secretary',
    category: 'Administrative / Front Office',
    org_types: ['hospital'],
    rate_min: 15, rate_max: 22, rate_unit: 'Hourly',
    responsibilities: [
      'Coordinate communication at the nursing station',
      'Process orders and maintain unit records',
      'Answer phones and direct inquiries',
      'Manage admissions, transfers, and discharge paperwork',
      'Coordinate with ancillary departments',
      'Maintain unit supplies and forms',
      'Support nursing staff with clerical tasks'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Healthcare clerical or unit experience preferred',
      'Knowledge of medical terminology',
      'EHR and computer proficiency',
      'Strong organizational and communication skills'
    ],
    keywords: ['unit secretary','health unit coordinator','clerical','nursing station','orders','hospital']
  },
  {
    code: 'POS-132',
    title: 'RN - Telehealth',
    category: 'Nursing',
    org_types: ['mgmt','practice'],
    rate_min: 33, rate_max: 48, rate_unit: 'Hourly',
    responsibilities: [
      'Conduct telephonic and virtual nursing assessments',
      'Triage patient symptoms and provide guidance',
      'Coordinate follow-up care and referrals',
      'Provide chronic care management remotely',
      'Document encounters in the EHR',
      'Escalate emergent concerns appropriately',
      'Support remote patient monitoring programs'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Telehealth or triage experience preferred',
      'Multi-state compact license a plus',
      'Strong remote communication skills',
      'Current BLS certification'
    ],
    keywords: ['registered nurse','telehealth','triage','remote','virtual','rn']
  },
  {
    code: 'POS-133',
    title: 'RN - Clinical Liaison',
    category: 'Nursing',
    org_types: ['snf','hospital','mgmt'],
    rate_min: 36, rate_max: 54, rate_unit: 'Hourly',
    responsibilities: [
      'Conduct clinical assessments for prospective admissions',
      'Review patient charts for appropriate placement',
      'Build relationships with hospital case managers',
      'Coordinate seamless transitions of care',
      'Communicate clinical needs to the receiving facility',
      'Support census and admission goals',
      'Document assessments and referrals'
    ],
    requirements: [
      'ADN or BSN with active state RN license',
      'Clinical and case management experience',
      'Knowledge of SNF admission criteria',
      'Strong relationship-building skills',
      'Current BLS certification'
    ],
    keywords: ['registered nurse','clinical liaison','admissions','transitions','census','rn']
  },
  {
    code: 'POS-134',
    title: 'RN - Staff Development Coordinator',
    category: 'Nursing',
    org_types: ['snf'],
    rate_min: 35, rate_max: 52, rate_unit: 'Hourly',
    responsibilities: [
      'Coordinate new-hire orientation and onboarding',
      'Deliver mandatory in-service education',
      'Track certifications and competencies',
      'Maintain training and compliance records',
      'Conduct CNA training programs where approved',
      'Support survey readiness through education',
      'Identify and address staff learning needs'
    ],
    requirements: [
      'Active state RN license',
      'Long-term care experience',
      'Staff education or development experience',
      'Knowledge of LTC training regulations',
      'Current BLS certification'
    ],
    keywords: ['registered nurse','staff development','education','orientation','in-service','snf']
  },
  {
    code: 'POS-135',
    title: 'Nurse Practitioner - Urgent Care',
    category: 'Provider - Advanced Practice',
    org_types: ['practice'],
    rate_min: 110000, rate_max: 145000, rate_unit: 'Annual',
    responsibilities: [
      'Evaluate and treat walk-in acute conditions',
      'Perform minor procedures and laceration repair',
      'Order and interpret point-of-care testing',
      'Prescribe medications and discharge instructions',
      'Manage rapid patient throughput',
      'Identify and refer emergent presentations',
      'Document encounters efficiently'
    ],
    requirements: [
      'MSN or DNP from an accredited NP program',
      'Active APRN license and national certification',
      'DEA registration and prescriptive authority',
      'Urgent care experience preferred',
      'Current BLS/ACLS certification'
    ],
    keywords: ['nurse practitioner','urgent care','acute','procedures','walk-in','np']
  },
  {
    code: 'POS-136',
    title: 'EKG Technician',
    category: 'Clinical Support',
    org_types: ['hospital','practice'],
    rate_min: 16, rate_max: 24, rate_unit: 'Hourly',
    responsibilities: [
      'Perform 12-lead EKGs and rhythm strips',
      'Apply and monitor Holter and telemetry devices',
      'Prepare patients for cardiac testing',
      'Recognize and report abnormal rhythms',
      'Maintain EKG equipment and supplies',
      'Document and upload tracings to the EHR',
      'Assist with stress testing as trained'
    ],
    requirements: [
      'High school diploma or equivalent',
      'EKG technician training or certification (CET)',
      'Knowledge of cardiac rhythms',
      'Current BLS certification',
      'Attention to detail'
    ],
    keywords: ['ekg technician','cardiac','telemetry','holter','rhythm','tech']
  },
  {
    code: 'POS-137',
    title: 'Sterile Processing Technician',
    category: 'Imaging / Technologist',
    org_types: ['hospital'],
    rate_min: 18, rate_max: 28, rate_unit: 'Hourly',
    responsibilities: [
      'Decontaminate and sterilize surgical instruments',
      'Inspect and assemble instrument trays',
      'Operate sterilization equipment and autoclaves',
      'Maintain sterility records and QC',
      'Manage instrument inventory and distribution',
      'Follow infection control and safety standards',
      'Coordinate with the OR on instrument needs'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Sterile processing certification (CRCST) preferred',
      'Knowledge of sterilization and instrumentation',
      'Attention to detail',
      'SPD or OR experience preferred'
    ],
    keywords: ['sterile processing','spd','decontamination','sterilization','instruments','tech']
  },
  {
    code: 'POS-138',
    title: 'Lab Phlebotomy Supervisor',
    category: 'Laboratory Leadership',
    org_types: ['lab','hospital'],
    rate_min: 50000, rate_max: 70000, rate_unit: 'Annual',
    responsibilities: [
      'Supervise phlebotomy staff and operations',
      'Manage draw-station schedules and coverage',
      'Ensure specimen collection quality and safety',
      'Train and validate phlebotomy competencies',
      'Monitor turnaround and patient satisfaction',
      'Resolve collection errors and complaints',
      'Maintain compliance with lab standards'
    ],
    requirements: [
      'Phlebotomy certification and significant experience',
      'Supervisory or lead experience',
      'Knowledge of specimen collection standards',
      'Strong leadership and organizational skills',
      'Current BLS certification'
    ],
    keywords: ['phlebotomy supervisor','lead','specimen','collection','leadership','lab']
  },
  {
    code: 'POS-139',
    title: 'Clinical Lab Supervisor',
    category: 'Laboratory Leadership',
    org_types: ['lab','hospital'],
    rate_min: 75000, rate_max: 105000, rate_unit: 'Annual',
    responsibilities: [
      'Supervise bench technologists and daily testing',
      'Oversee QC, calibration, and proficiency testing',
      'Manage department schedules and workflow',
      'Validate new methods and instruments',
      'Ensure CLIA and CAP compliance',
      'Troubleshoot complex testing issues',
      'Train and evaluate lab staff'
    ],
    requirements: [
      'Bachelor degree in Medical Laboratory Science',
      'ASCP (MLS) certification',
      'Lab supervisory experience',
      'Knowledge of CLIA and CAP standards',
      'Strong leadership and technical skills'
    ],
    keywords: ['lab supervisor','technologist','qc','clia','cap','laboratory']
  },
  {
    code: 'POS-140',
    title: 'Patient Financial Counselor',
    category: 'Revenue Cycle',
    org_types: ['practice','hospital'],
    rate_min: 18, rate_max: 27, rate_unit: 'Hourly',
    responsibilities: [
      'Counsel patients on financial responsibility and options',
      'Estimate out-of-pocket costs for services',
      'Set up payment plans and assist with applications',
      'Screen patients for financial assistance and Medicaid',
      'Collect deposits and point-of-service payments',
      'Resolve billing questions and disputes',
      'Document financial counseling activities'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Financial counseling or billing experience',
      'Knowledge of insurance and assistance programs',
      'Strong communication and empathy',
      'Attention to detail'
    ],
    keywords: ['financial counselor','payment plan','assistance','estimates','collections','revenue cycle']
  },
  {
    code: 'POS-141',
    title: 'Quality Improvement Coordinator',
    category: 'Compliance / Credentialing',
    org_types: ['mgmt','snf','hospital'],
    rate_min: 60000, rate_max: 88000, rate_unit: 'Annual',
    responsibilities: [
      'Coordinate quality improvement and QAPI programs',
      'Collect and analyze quality and outcome data',
      'Lead performance-improvement projects',
      'Prepare quality reports and dashboards',
      'Support survey readiness and audits',
      'Educate staff on quality initiatives',
      'Track regulatory quality measures'
    ],
    requirements: [
      'Bachelor degree in nursing, healthcare, or related',
      'Quality or performance-improvement experience',
      'Knowledge of QAPI and quality measures',
      'CPHQ certification preferred',
      'Strong analytical and project skills'
    ],
    keywords: ['quality improvement','qapi','performance improvement','data','compliance','quality']
  },
  {
    code: 'POS-142',
    title: 'Health Information Manager',
    category: 'Administrative / Front Office',
    org_types: ['mgmt','hospital','snf'],
    rate_min: 65000, rate_max: 95000, rate_unit: 'Annual',
    responsibilities: [
      'Manage health information and medical records operations',
      'Ensure record integrity, security, and compliance',
      'Oversee release of information and retention',
      'Supervise HIM staff and workflows',
      'Coordinate with coding and compliance teams',
      'Maintain HIPAA and regulatory compliance',
      'Support EHR data governance'
    ],
    requirements: [
      'Bachelor degree in Health Information Management',
      'RHIA or RHIT certification',
      'HIM leadership experience',
      'Knowledge of HIPAA and record regulations',
      'Strong organizational and leadership skills'
    ],
    keywords: ['health information','him','rhia','records','hipaa','compliance']
  },
  {
    code: 'POS-143',
    title: 'Central Scheduling Supervisor',
    category: 'Administrative / Front Office',
    org_types: ['mgmt','hospital'],
    rate_min: 48000, rate_max: 68000, rate_unit: 'Annual',
    responsibilities: [
      'Supervise the centralized scheduling team',
      'Optimize provider and resource scheduling',
      'Monitor scheduling accuracy and access metrics',
      'Train and develop scheduling staff',
      'Resolve scheduling conflicts and escalations',
      'Coordinate with clinics and ancillary departments',
      'Implement scheduling workflow improvements'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Scheduling and supervisory experience',
      'EHR and scheduling system expertise',
      'Strong leadership and analytical skills',
      'Knowledge of access and authorization workflows'
    ],
    keywords: ['scheduling supervisor','central scheduling','access','leadership','coordination','admin']
  },
  {
    code: 'POS-144',
    title: 'Wound Care Program Coordinator',
    category: 'Nursing',
    org_types: ['snf','hospital'],
    rate_min: 38, rate_max: 56, rate_unit: 'Hourly',
    responsibilities: [
      'Coordinate the facility wound care program',
      'Track wound prevalence and healing outcomes',
      'Lead skin integrity rounds and prevention',
      'Educate staff on wound assessment and treatment',
      'Coordinate with providers and wound specialists',
      'Maintain wound documentation and reporting',
      'Support pressure injury reduction initiatives'
    ],
    requirements: [
      'Active state RN license',
      'Wound care certification (WCC, CWCN) preferred',
      'Wound care clinical experience',
      'Knowledge of wound staging and prevention',
      'Current BLS certification'
    ],
    keywords: ['wound care','program coordinator','skin integrity','pressure injury','prevention','rn']
  },
  {
    code: 'POS-145',
    title: 'Behavioral Health Therapist (LCSW/LPC)',
    category: 'Behavioral Health',
    org_types: ['practice','snf'],
    rate_min: 60000, rate_max: 85000, rate_unit: 'Annual',
    responsibilities: [
      'Provide individual and group psychotherapy',
      'Conduct behavioral health assessments and diagnoses',
      'Develop and implement treatment plans',
      'Coordinate care with psychiatric providers',
      'Provide crisis intervention and safety planning',
      'Document sessions and treatment progress',
      'Connect patients to community resources'
    ],
    requirements: [
      'Master degree in social work or counseling',
      'Active LCSW, LPC, or LMFT license',
      'Behavioral health clinical experience',
      'Knowledge of evidence-based therapies',
      'Strong assessment and counseling skills'
    ],
    keywords: ['behavioral health','therapist','lcsw','lpc','psychotherapy','counseling']
  },
  {
    code: 'POS-146',
    title: 'Chronic Care Management Coordinator',
    category: 'Clinical Support',
    org_types: ['practice','mgmt'],
    rate_min: 22, rate_max: 33, rate_unit: 'Hourly',
    responsibilities: [
      'Manage CCM enrollment and monthly outreach',
      'Coordinate care plans for chronic-condition patients',
      'Conduct telephonic check-ins and education',
      'Track care gaps and coordinate interventions',
      'Document CCM time and activities for billing',
      'Connect patients to resources and specialists',
      'Support transitions of care'
    ],
    requirements: [
      'LPN, MA, or relevant clinical background',
      'Chronic care or care coordination experience',
      'Knowledge of CCM billing requirements',
      'Strong communication and organizational skills',
      'EHR proficiency'
    ],
    keywords: ['chronic care management','ccm','care coordination','outreach','care plan','clinical']
  },
  {
    code: 'POS-147',
    title: 'Optometrist',
    category: 'Provider - Physician',
    org_types: ['practice','snf'],
    rate_min: 110000, rate_max: 160000, rate_unit: 'Annual',
    responsibilities: [
      'Perform comprehensive eye and vision examinations',
      'Diagnose and manage ocular conditions',
      'Prescribe corrective lenses and medications',
      'Screen for glaucoma, cataracts, and retinopathy',
      'Provide diabetic eye exams for at-risk patients',
      'Refer to ophthalmology when indicated',
      'Round at facilities for resident vision care'
    ],
    requirements: [
      'Doctor of Optometry (OD) degree',
      'Active state optometry license',
      'DEA registration where applicable',
      'Knowledge of ocular disease management',
      'Clinical optometry experience'
    ],
    keywords: ['optometrist','od','vision','eye exam','glaucoma','diabetic eye']
  },
  {
    code: 'POS-148',
    title: 'Dentist',
    category: 'Provider - Physician',
    org_types: ['practice','snf'],
    rate_min: 140000, rate_max: 200000, rate_unit: 'Annual',
    responsibilities: [
      'Provide comprehensive dental examinations and care',
      'Diagnose and treat oral and dental conditions',
      'Perform restorations, extractions, and procedures',
      'Develop dental treatment plans',
      'Provide preventive and oral health education',
      'Coordinate care for medically complex patients',
      'Round at facilities for resident dental needs'
    ],
    requirements: [
      'DDS or DMD from an accredited dental school',
      'Active state dental license',
      'DEA registration',
      'Current BLS certification',
      'Geriatric or special-needs experience preferred'
    ],
    keywords: ['dentist','dental','dds','dmd','oral health','extractions']
  },
  {
    code: 'POS-149',
    title: 'Audiologist',
    category: 'Rehabilitation Therapy',
    org_types: ['practice','snf'],
    rate_min: 70000, rate_max: 95000, rate_unit: 'Annual',
    responsibilities: [
      'Conduct hearing and balance evaluations',
      'Diagnose hearing and vestibular disorders',
      'Fit and program hearing aids and devices',
      'Provide aural rehabilitation and counseling',
      'Perform diagnostic audiometric testing',
      'Coordinate with providers on care plans',
      'Educate patients on hearing health'
    ],
    requirements: [
      'Doctor of Audiology (AuD) degree',
      'Active state audiology license',
      'ASHA CCC-A or board certification',
      'Knowledge of audiometric and vestibular testing',
      'Clinical audiology experience'
    ],
    keywords: ['audiologist','hearing','aud','hearing aids','vestibular','audiometry']
  },
  {
    code: 'POS-150',
    title: 'Mobile X-Ray Technologist',
    category: 'Imaging / Technologist',
    org_types: ['snf','mgmt'],
    rate_min: 28, rate_max: 42, rate_unit: 'Hourly',
    responsibilities: [
      'Perform portable radiographic exams at facilities',
      'Transport and operate mobile imaging equipment',
      'Position bedbound and immobile patients safely',
      'Practice radiation safety in non-traditional settings',
      'Transmit images to radiologists for reading',
      'Coordinate orders and schedules with facilities',
      'Maintain mobile equipment and vehicle'
    ],
    requirements: [
      'ARRT registration in Radiography',
      'State radiologic technologist license',
      'Valid drivers license',
      'Current BLS certification',
      'Portable or mobile imaging experience preferred'
    ],
    keywords: ['mobile x-ray','portable','radiography','snf','imaging','arrt']
  },
  {
    code: 'POS-151',
    title: 'Medical Office Biller / Collector',
    category: 'Revenue Cycle',
    org_types: ['practice','mgmt'],
    rate_min: 17, rate_max: 26, rate_unit: 'Hourly',
    responsibilities: [
      'Work accounts receivable and aging reports',
      'Follow up on unpaid and denied claims',
      'Contact payers and patients on outstanding balances',
      'Process appeals and corrected claims',
      'Negotiate and set up payment arrangements',
      'Document collection activity',
      'Meet collection and AR targets'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Medical collections or billing experience',
      'Knowledge of payer and denial processes',
      'Strong negotiation and communication skills',
      'Attention to detail'
    ],
    keywords: ['biller','collector','accounts receivable','denials','appeals','revenue cycle']
  },
  {
    code: 'POS-152',
    title: 'Provider Enrollment Specialist',
    category: 'Compliance / Credentialing',
    org_types: ['mgmt'],
    rate_min: 22, rate_max: 32, rate_unit: 'Hourly',
    responsibilities: [
      'Manage provider enrollment with payers',
      'Complete CMS, Medicaid, and commercial applications',
      'Maintain CAQH profiles and attestations',
      'Track enrollment status and effective dates',
      'Resolve enrollment denials and issues',
      'Coordinate with credentialing and billing',
      'Maintain enrollment records'
    ],
    requirements: [
      'High school diploma; some college preferred',
      'Provider enrollment experience',
      'Knowledge of CAQH, PECOS, and payer enrollment',
      'Strong follow-up and organizational skills',
      'Attention to detail'
    ],
    keywords: ['provider enrollment','pecos','caqh','payer','credentialing','compliance']
  },
  {
    code: 'POS-153',
    title: 'Telemetry Technician',
    category: 'Clinical Support',
    org_types: ['hospital'],
    rate_min: 17, rate_max: 26, rate_unit: 'Hourly',
    responsibilities: [
      'Monitor cardiac telemetry for multiple patients',
      'Interpret and document cardiac rhythms',
      'Recognize and report life-threatening arrhythmias',
      'Notify nursing of rhythm changes',
      'Maintain accurate monitoring records',
      'Manage telemetry equipment and alarms',
      'Support continuous patient surveillance'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Telemetry or monitor tech training',
      'Knowledge of cardiac rhythm interpretation',
      'Current BLS certification',
      'Strong attention and vigilance'
    ],
    keywords: ['telemetry technician','cardiac monitoring','arrhythmia','rhythm','surveillance','tech']
  },
  {
    code: 'POS-154',
    title: 'Cytology / Lab Aide',
    category: 'Laboratory',
    org_types: ['lab'],
    rate_min: 15, rate_max: 22, rate_unit: 'Hourly',
    responsibilities: [
      'Prepare and label cytology and pathology specimens',
      'Assist with slide preparation and staining',
      'Maintain lab supplies and reagents',
      'Accession and track specimens',
      'Support cytotechnologists and pathologists',
      'Maintain clean and safe lab areas',
      'Enter specimen data into the LIS'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Lab or specimen-handling experience preferred',
      'Knowledge of specimen processing',
      'Attention to detail',
      'Ability to follow lab safety protocols'
    ],
    keywords: ['lab aide','cytology','specimen','slide prep','accessioning','lab']
  },
  {
    code: 'POS-155',
    title: 'Director of Nursing (Practice)',
    category: 'Nursing Leadership',
    org_types: ['practice','mgmt'],
    rate_min: 90000, rate_max: 130000, rate_unit: 'Annual',
    responsibilities: [
      'Lead clinical nursing operations across practices',
      'Standardize clinical protocols and workflows',
      'Supervise clinical staff and team leads',
      'Ensure quality, safety, and compliance',
      'Coordinate staff training and competencies',
      'Monitor clinical quality metrics',
      'Partner with providers and administration'
    ],
    requirements: [
      'BSN with active state RN license',
      'Nursing leadership experience in ambulatory care',
      'Knowledge of clinical operations and compliance',
      'Strong leadership and communication skills',
      'Current BLS certification'
    ],
    keywords: ['director of nursing','practice','ambulatory','clinical leadership','quality','rn']
  },
  {
    code: 'POS-156',
    title: 'Front Office / Billing Clerk',
    category: 'Administrative / Front Office',
    org_types: ['practice'],
    rate_min: 15, rate_max: 22, rate_unit: 'Hourly',
    responsibilities: [
      'Support front-office check-in and check-out',
      'Enter charges and post payments',
      'Verify insurance and collect copays',
      'Assist with claims and statements',
      'Answer billing questions from patients',
      'Maintain accurate account records',
      'Coordinate with the billing department'
    ],
    requirements: [
      'High school diploma or equivalent',
      'Front-office and billing experience',
      'Knowledge of insurance basics',
      'Practice-management system proficiency',
      'Strong customer service skills'
    ],
    keywords: ['front office','billing clerk','charges','payments','insurance','admin']
  },
  {
    code: 'POS-157',
    title: 'Clinical Informatics Specialist',
    category: 'Information Technology',
    org_types: ['mgmt','hospital'],
    rate_min: 80000, rate_max: 115000, rate_unit: 'Annual',
    responsibilities: [
      'Optimize EHR workflows and configurations',
      'Bridge clinical and IT requirements',
      'Train clinical staff on systems and updates',
      'Support EHR implementations and upgrades',
      'Analyze clinical data and reporting needs',
      'Troubleshoot clinical application issues',
      'Promote adoption and best practices'
    ],
    requirements: [
      'Clinical background (RN, pharmacist, or similar)',
      'Health informatics experience',
      'EHR configuration and optimization knowledge',
      'Informatics certification preferred',
      'Strong analytical and training skills'
    ],
    keywords: ['clinical informatics','ehr','optimization','workflow','training','it']
  },
  {
    code: 'POS-158',
    title: 'Director of Quality & Compliance',
    category: 'Compliance / Credentialing',
    org_types: ['mgmt'],
    rate_min: 110000, rate_max: 160000, rate_unit: 'Annual',
    responsibilities: [
      'Lead enterprise quality and compliance programs',
      'Oversee QAPI, audits, and risk management',
      'Ensure regulatory and accreditation readiness',
      'Develop policies and corrective action plans',
      'Manage quality and compliance staff',
      'Report to executive leadership and the board',
      'Drive continuous improvement across sites'
    ],
    requirements: [
      'Bachelor degree; Master preferred',
      'Quality and compliance leadership experience',
      'Knowledge of CMS, HIPAA, and accreditation standards',
      'CPHQ or CHC certification preferred',
      'Strong leadership and analytical skills'
    ],
    keywords: ['director of quality','compliance','qapi','risk','accreditation','leadership']
  },
  {
    code: 'POS-159',
    title: 'CNA - Hospice / Palliative',
    category: 'Nursing Support',
    org_types: ['snf'],
    rate_min: 17, rate_max: 25, rate_unit: 'Hourly',
    responsibilities: [
      'Provide compassionate personal care to hospice residents',
      'Assist with comfort, hygiene, and positioning',
      'Support pain and symptom comfort measures',
      'Provide emotional support to residents and families',
      'Report changes in condition to the nurse',
      'Document care and comfort interventions',
      'Maintain dignity and quality of life'
    ],
    requirements: [
      'State CNA certification',
      'Hospice or palliative care experience preferred',
      'Current BLS certification',
      'Compassionate end-of-life care approach',
      'Strong interpersonal skills'
    ],
    keywords: ['cna','hospice','palliative','comfort care','end-of-life','aide']
  },
  {
    code: 'POS-160',
    title: 'Lead Medical Assistant',
    category: 'Clinical Support',
    org_types: ['practice'],
    rate_min: 19, rate_max: 28, rate_unit: 'Hourly',
    responsibilities: [
      'Lead and coordinate the clinical MA team',
      'Manage clinical workflow and patient flow',
      'Train and mentor medical assistants',
      'Maintain clinical supplies and compliance',
      'Perform clinical MA duties as needed',
      'Support providers and resolve issues',
      'Ensure quality and infection control standards'
    ],
    requirements: [
      'Medical assistant certification (CMA/RMA)',
      'Several years of MA experience',
      'Lead or supervisory experience preferred',
      'Current BLS certification',
      'Strong organizational and leadership skills'
    ],
    keywords: ['lead medical assistant','ma','clinical lead','workflow','mentoring','clinical']
  }

];

export const POSITION_SEED = POSITIONS as unknown as PositionSeed[]
