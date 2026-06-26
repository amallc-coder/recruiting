// In-browser spreadsheet import. Parses an uploaded .xlsx/.csv entirely client
// side (SheetJS) — no SharePoint, no Graph size limits, no CSV gymnastics — and
// maps rows to candidate records. Handles multi-tab workbooks (e.g. one tab per
// recruiter): the sheet name is used as the recruiter when no recruiter column
// is present.
import * as XLSX from 'xlsx'
import type { Stage, ClinicalRole } from './types'

export type Field =
  | 'full_name' | 'email' | 'phone' | 'recruiter' | 'facility'
  | 'role' | 'stage' | 'start_date' | 'state' | 'city' | 'notes' | 'ignore'

export interface ParsedSheet {
  name: string
  headers: string[]
  rows: Record<string, string>[]
}

export interface MappedCandidate {
  full_name: string
  email: string | null
  phone: string | null
  recruiter: string | null
  facilityText: string | null
  position: string | null
  role: ClinicalRole
  current_stage: Stage
  start_date: string | null
  state: string | null
  city: string | null
  sheet: string
}

// ---- column detection -------------------------------------------------------

const ALIASES: Record<Field, string[]> = {
  full_name: ['name', 'candidate', 'candidate name', 'full name', 'fullname', 'applicant'],
  email: ['email', 'e-mail', 'email address', 'emails'],
  phone: ['phone', 'phone number', 'phone numbers', 'cell', 'mobile', 'contact'],
  recruiter: ['recruiter', 'recruiter name', 'assigned recruiter'],
  facility: ['facility', 'facility name', 'facility name or clinic name', 'clinic', 'location', 'home', 'site'],
  role: ['role', 'position', 'title', 'job', 'job title'],
  stage: ['stage', 'status', 'current stage', 'pipeline', 'pipeline stage', 'current_stage'],
  start_date: ['start date', 'start', 'start_date', 'sd', 'date started', 'hire date'],
  state: ['state'],
  city: ['city', 'city/region', 'region'],
  notes: ['notes', 'note', 'comment', 'comments'],
  ignore: [],
}

const norm = (s: string) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function autoMap(headers: string[]): Record<string, Field> {
  const map: Record<string, Field> = {}
  for (const h of headers) {
    const n = norm(h)
    let best: Field = 'ignore'
    for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
      if (aliases.some((a) => n === a)) { best = field; break }
    }
    if (best === 'ignore') {
      for (const [field, aliases] of Object.entries(ALIASES) as [Field, string[]][]) {
        if (aliases.some((a) => a && n.includes(a))) { best = field; break }
      }
    }
    map[h] = best
  }
  return map
}

// ---- value mapping ----------------------------------------------------------

export function mapStage(raw: string): Stage {
  const s = norm(raw)
  if (!s) return 'sourced'
  if (/(declin|fell off|no show|no-show|terminat|rescind|withdrew|not interested)/.test(s)) return 'declined'
  if (/(no response|^nr$|unrespons|ghost)/.test(s)) return 'no_response'
  if (/(active|hired|started|employed|placed)/.test(s)) return 'active'
  if (/(train|onboard|orientation)/.test(s)) return 'training'
  if (/(welcome)/.test(s)) return 'welcome_call'
  if (/(cleared|bg clear|background clear)/.test(s)) return 'cleared'
  if (/(background|bg sent|drug|consent)/.test(s)) return 'background'
  if (/(accept)/.test(s)) return 'accepted'
  if (/(offer)/.test(s)) return 'offer'
  if (/(interview|screen)/.test(s)) return 'interview'
  return 'sourced'
}

export function mapRole(raw: string): ClinicalRole {
  const s = norm(raw)
  if (!s) return 'ma'
  if (/lpn|licensed practical/.test(s)) return 'lpn'
  if (/nurse practitioner|\bnp\b|aprn|\bfnp\b|crnp/.test(s)) return 'np'
  if (/physician assistant|\bpa\b|pa-c/.test(s)) return 'pa'
  if (/psych/.test(s)) return 'psych_np'
  if (/wound/.test(s)) return 'wound'
  // Nursing leadership reads as RN before the generic "director/manager" → ops.
  if (/director of nursing|\bdon\b|\badon\b|\bmds\b|infection prevent|charge nurse|nurse manager/.test(s)) return 'rn'
  if (/registered nurse|\brn\b/.test(s)) return 'rn'
  if (/cna|certified nursing assistant|nursing assistant|nurse aide|medication technician|med tech|\bqma\b|\bcma\b|caregiver|resident aide|restorative/.test(s)) return 'ma'
  if (/medical assistant|\bma\b/.test(s)) return 'ma'
  if (/phlebotom|imaging|x-?ray|ct tech|mri|ultrasound|sonograph|\becho\b|radiolog|lab tech|technologist/.test(s)) return 'tech'
  if (/physician|\bmd\b|\bdo\b|doctor|hospitalist|medical director/.test(s)) return 'md'
  if (/recept|scribe|schedul|front desk|clerk|office manager|secretary|data entry|medical records/.test(s)) return 'admin'
  if (/administrator|\bnha\b|director|manager|account|payroll|\bhr\b|human resources|operations|coordinator|officer|chief|recruit|social worker|dietary|activit|housekeep|maintenance|laundry|cook|recovery|labor relations|supervisor|analyst|specialist|payable|receivable|controller|marketing|admission/.test(s)) return 'ops'
  return 'ma'
}

// Derive a pipeline Stage from the team sheet's per-candidate date columns
// (Open / Interview / Offer / Hire). Hire present = a completed hire (active).
function stageFromDates(open: string, interview: string, offer: string, hire: string): Stage {
  const has = (v: string) => String(v ?? '').trim() !== ''
  const flag = (v: string) => /no show|declin|withdrew|not interested|pass|rejected/i.test(String(v))
  if (flag(interview) || flag(offer)) return 'no_response'
  if (has(hire)) return 'active'
  if (has(offer)) return 'offer'
  if (has(interview)) return 'interview'
  if (has(open)) return 'sourced'
  return 'sourced'
}

// ---- "Recruitment Team Sheet" wide format -----------------------------------
// Each row is an OPENING (facility + position + recruiter); candidates are laid
// out horizontally in repeating blocks: "Candidate N", "CN Open Date",
// "CN Interview Date", "CN Offer Date", "CN Hire Date". We unpivot to one
// candidate record per non-empty name.

export function isTeamSheet(headers: string[]): boolean {
  const hs = headers.map((h) => norm(h))
  const hasCandidate = hs.some((h) => /^candidate ?1$/.test(h))
  const hasReq = hs.some((h) => /facility name|clinic name/.test(h)) || hs.includes('position')
  return hasCandidate && hasReq
}

// Distinct recruiter names referenced by team-sheet rows (Recruiter column) and
// the tab names themselves — used to build the recruiter-mapping step.
export function teamSheetRecruiters(sheets: ParsedSheet[]): string[] {
  const names = new Set<string>()
  for (const sheet of sheets) {
    const recI = sheet.headers.map((h) => norm(h)).findIndex((h) => /^recruiter$/.test(h))
    let any = false
    for (const row of sheet.rows) {
      const v = recI >= 0 ? String(row[sheet.headers[recI]] ?? '').trim() : ''
      if (v) { names.add(v); any = true }
    }
    // Fall back to the tab name (which is the recruiter) when the column is blank.
    if (!any && sheet.rows.length) names.add(sheet.name.trim())
  }
  return [...names].filter((n) => n && n.length > 1).sort()
}

export function unpivotTeamSheet(sheet: ParsedSheet): MappedCandidate[] {
  const H = sheet.headers.map((h) => norm(h))
  const find = (re: RegExp) => H.findIndex((h) => re.test(h))
  const stateI = find(/^state$/)
  const cityI = find(/^city|region/)
  const facI = find(/facility name|clinic name|^facility$/)
  const posI = find(/^position$/)
  const recI = find(/^recruiter$/)

  // Map each "Candidate N" column to its four date columns.
  const blocks: { name: number; open: number; interview: number; offer: number; hire: number }[] = []
  sheet.headers.forEach((h, i) => {
    const m = norm(h).match(/^candidate ?(\d+)$/)
    if (!m) return
    const n = m[1]
    const dcol = (kind: string) => H.findIndex((x) => new RegExp(`^c ?${n} ${kind} date$`).test(x))
    blocks.push({ name: i, open: dcol('open'), interview: dcol('interview'), offer: dcol('offer'), hire: dcol('hire') })
  })

  const out: MappedCandidate[] = []
  for (const row of sheet.rows) {
    const cells = sheet.headers.map((h) => row[h] ?? '')
    const recruiter = (recI >= 0 ? cells[recI] : '') || sheet.name
    const facilityText = facI >= 0 ? cells[facI] : ''
    const position = String(posI >= 0 ? cells[posI] : '').trim()
    const role = mapRole(position)
    const state = stateI >= 0 ? cells[stateI] : ''
    const city = cityI >= 0 ? cells[cityI] : ''
    for (const blk of blocks) {
      const name = String(cells[blk.name] ?? '').trim()
      if (!name || /^candidate ?\d+$/i.test(name)) continue
      // Skip junk that leaks into candidate columns: bare initials, numbers,
      // or a stray date like "17-Jun".
      if (name.length < 2 || !/[a-z]/i.test(name)) continue
      if (/^\d{1,2}[-/][a-z]{3}/i.test(name) || /^\d{1,2}[/\-]\d/.test(name)) continue
      const open = blk.open >= 0 ? String(cells[blk.open]) : ''
      const interview = blk.interview >= 0 ? String(cells[blk.interview]) : ''
      const offer = blk.offer >= 0 ? String(cells[blk.offer]) : ''
      const hire = blk.hire >= 0 ? String(cells[blk.hire]) : ''
      out.push({
        full_name: name,
        email: null,
        phone: null,
        recruiter: recruiter || null,
        facilityText: facilityText || null,
        position: position || null,
        role,
        current_stage: stageFromDates(open, interview, offer, hire),
        start_date: mapDate(hire),
        state: state || null,
        city: city || null,
        sheet: sheet.name,
      })
    }
  }
  return out
}

// ---- Openings -> Jobs --------------------------------------------------------
// Each Recruitment Team Sheet row IS an opening (requisition). This pulls the
// job/opening out of every row: title (Position), location (City/Region +
// State), department (Division/Business), facility, recruiter, how many
// openings, and whether it's still open.

export interface MappedJob {
  title: string
  department: string | null
  location: string | null
  state: string | null
  city: string | null
  facilityText: string | null
  recruiter: string | null
  role: ClinicalRole
  openings: number
  openings_remaining: number | null
  status: 'published' | 'closed'
  open_date: string | null
  close_date: string | null
  sheet: string
}

export function extractTeamSheetJobs(sheet: ParsedSheet): MappedJob[] {
  const H = sheet.headers.map((h) => norm(h))
  const find = (re: RegExp) => H.findIndex((h) => re.test(h))
  const stateI = find(/^state$/)
  const cityI = find(/^city|region/)
  const facI = find(/facility name|clinic name|^facility$/)
  const posI = find(/^position$/)
  const recI = find(/^recruiter$/)
  const divI = find(/^division$/)
  const busI = find(/^business$/)
  const openI = find(/^openings$/)
  const remainI = find(/openings remaining/)
  const dOpenI = find(/date open/)
  const dCloseI = find(/date closed/)

  const out: MappedJob[] = []
  for (const row of sheet.rows) {
    const cells = sheet.headers.map((h) => row[h] ?? '')
    const title = String(posI >= 0 ? cells[posI] : '').trim()
    if (!title || /^position$/i.test(title)) continue

    const state = String(stateI >= 0 ? cells[stateI] : '').trim()
    const city = String(cityI >= 0 ? cells[cityI] : '').trim()
    // "Openings" = total positions for this requisition; "Openings Remaining" =
    // how many are still open. Parse 0 as 0 (don't fall back to 1 on a real zero).
    const openingsRaw = String(openI >= 0 ? cells[openI] : '').trim()
    const oNum = Number(openingsRaw)
    const openings = openingsRaw !== '' && Number.isFinite(oNum) ? Math.max(0, Math.round(oNum)) : 1
    const remainRaw = String(remainI >= 0 ? cells[remainI] : '').trim()
    const rNum = Number(remainRaw)
    const openings_remaining = remainRaw === '' || !Number.isFinite(rNum) ? null : Math.max(0, Math.round(rNum))
    const close_date = dCloseI >= 0 ? mapDate(String(cells[dCloseI])) : null
    const status: 'published' | 'closed' = openings_remaining === 0 || close_date ? 'closed' : 'published'
    const dept = String((divI >= 0 ? cells[divI] : '') || (busI >= 0 ? cells[busI] : '')).trim()

    out.push({
      title,
      department: dept || null,
      // City/Region in this sheet often already carries the state; fall back to
      // the State column only when there's no city, to avoid doubling it.
      location: city || state || null,
      state: state || null,
      city: city || null,
      facilityText: String(facI >= 0 ? cells[facI] : '').trim() || null,
      recruiter: String(recI >= 0 ? cells[recI] : '').trim() || null,
      role: mapRole(title),
      openings,
      openings_remaining,
      status,
      open_date: dOpenI >= 0 ? mapDate(String(cells[dOpenI])) : null,
      close_date,
      sheet: sheet.name,
    })
  }
  return out
}

// Excel serial date or text date -> ISO yyyy-mm-dd (best effort).
export function mapDate(raw: string): string | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const d = XLSX.SSF?.parse_date_code?.(Number(v))
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const m = v.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/)
  if (m) {
    const [, mo, da, yr] = m
    const y = yr.length === 2 ? `20${yr}` : yr
    return `${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return null
}

// ---- parsing ----------------------------------------------------------------

/** Read a File into per-sheet objects, detecting the header row in each sheet. */
export async function parseWorkbook(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const out: ParsedSheet[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: '', raw: false }) as unknown as string[][]
    if (!grid.length) continue
    // Header row = the row (within first 15) with the most non-empty cells that
    // also matches the most known aliases.
    let headerIdx = 0
    let bestScore = -1
    for (let i = 0; i < Math.min(grid.length, 15); i++) {
      const cells = grid[i].map((c) => norm(String(c)))
      const filled = cells.filter(Boolean).length
      const known = cells.filter((c) => Object.values(ALIASES).some((al) => al.includes(c))).length
      const score = known * 10 + filled
      if (score > bestScore) { bestScore = score; headerIdx = i }
    }
    const headers = grid[headerIdx].map((h, i) => String(h).trim() || `Column ${i + 1}`)
    const rows: Record<string, string>[] = []
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i]
      if (!r || r.every((c) => !String(c).trim())) continue
      const obj: Record<string, string> = {}
      headers.forEach((h, j) => { obj[h] = String(r[j] ?? '').trim() })
      rows.push(obj)
    }
    out.push({ name, headers, rows })
  }
  return out
}

/** Apply a per-header field mapping to produce candidate records. */
export function mapSheet(sheet: ParsedSheet, mapping: Record<string, Field>): MappedCandidate[] {
  const col = (field: Field) => Object.keys(mapping).find((h) => mapping[h] === field)
  const get = (row: Record<string, string>, field: Field) => {
    const h = col(field)
    return h ? (row[h] ?? '').trim() : ''
  }
  const out: MappedCandidate[] = []
  for (const row of sheet.rows) {
    const full_name = get(row, 'full_name').replace(/\s+(LPN|RN|MA|NP|PA|CNA)\b\.?$/i, '').trim()
    if (!full_name || /^(name|candidate)$/i.test(full_name)) continue
    const recruiter = get(row, 'recruiter') || sheet.name
    out.push({
      full_name,
      email: get(row, 'email') || null,
      phone: get(row, 'phone') || null,
      recruiter: recruiter || null,
      facilityText: get(row, 'facility') || null,
      position: get(row, 'role') || null,
      role: mapRole(get(row, 'role')),
      current_stage: mapStage(get(row, 'stage')),
      start_date: mapDate(get(row, 'start_date')),
      state: get(row, 'state') || null,
      city: get(row, 'city') || null,
      sheet: sheet.name,
    })
  }
  return out
}
