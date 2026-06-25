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
  if (/lpn|licensed practical/.test(s)) return 'lpn'
  if (/\bnp\b|nurse practitioner|aprn|fnp/.test(s)) return 'np'
  if (/\bpa\b|physician assistant/.test(s)) return 'pa'
  if (/psych/.test(s)) return 'psych_np'
  if (/wound/.test(s)) return 'wound'
  if (/\brn\b|registered nurse/.test(s)) return 'rn'
  if (/physician|\bmd\b|\bdo\b|doctor/.test(s)) return 'md'
  if (/tech|imaging|x-?ray|ct|mri|ultrasound|phlebotom|echo/.test(s)) return 'tech'
  if (/recept|scribe|schedul|front desk|clerk|admin/.test(s)) return 'admin'
  if (/manager|director|account|payroll|hr|operations|coordinator/.test(s)) return 'ops'
  if (/\bma\b|medical assistant/.test(s)) return 'ma'
  return 'ma'
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
