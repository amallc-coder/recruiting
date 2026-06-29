// In-browser spreadsheet import for the v2 `candidates` table. Parses an uploaded
// .xlsx/.xls/.csv entirely client-side (SheetJS — same parsing approach as the v1
// importer) and upserts candidates into the org-scoped v2 schema. Re-imports are
// idempotent via the unique (source_system, source_key) index.
import * as XLSX from 'xlsx'
import { v2 } from './client'
import { currentOrgId } from './org'

export interface ParsedRow {
  [header: string]: string
}

export interface ParsedFile {
  headers: string[]
  rows: ParsedRow[]
}

/**
 * Read a File into headers + string-valued row objects. Uses the first sheet,
 * its first row as the header, and stringifies every cell.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { headers: [], rows: [] }
  const ws = wb.Sheets[sheetName]
  if (!ws) return { headers: [], rows: [] }

  // header: 1 → array-of-arrays; raw: false → formatted strings; defval keeps blanks.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  }) as unknown[][]
  if (!grid.length) return { headers: [], rows: [] }

  const headerRow = grid[0] ?? []
  const headers = headerRow.map((h, i) => String(h ?? '').trim() || `Column ${i + 1}`)

  const rows: ParsedRow[] = []
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i]
    if (!r || r.every((c) => String(c ?? '').trim() === '')) continue
    const obj: ParsedRow = {}
    headers.forEach((h, j) => {
      obj[h] = String(r[j] ?? '').trim()
    })
    rows.push(obj)
  }
  return { headers, rows }
}

export interface FieldMap {
  full_name: string
  email?: string
  phone?: string
  source?: string
  tags?: string
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Auto-map source headers to candidate fields by case-insensitive name match. */
export function guessMapping(headers: string[]): FieldMap {
  const map: FieldMap = { full_name: '' }
  for (const h of headers) {
    const n = norm(h)
    if (!map.full_name && (n === 'name' || n === 'full name' || n === 'fullname' || n === 'candidate' || n === 'candidate name')) {
      map.full_name = h
    } else if (!map.email && (n === 'email' || n === 'e-mail' || n === 'email address')) {
      map.email = h
    } else if (!map.phone && (n === 'phone' || n === 'mobile' || n === 'phone number' || n === 'cell')) {
      map.phone = h
    } else if (!map.source && n === 'source') {
      map.source = h
    } else if (!map.tags && (n === 'tags' || n === 'tag')) {
      map.tags = h
    }
  }
  // Fall back to the first header for the required name field if nothing matched.
  if (!map.full_name && headers.length) map.full_name = headers[0]
  return map
}

export interface ImportResult {
  inserted: number
  skipped: number
  error: string | null
}

interface CandidateInsert {
  org_id: string
  full_name: string
  email: string | null
  phone: string | null
  source: string | null
  tags: string[]
  source_system: string
  source_key: string
}

const SOURCE_SYSTEM = 'xlsx_import'
const BATCH_SIZE = 200

/**
 * Build candidate rows from parsed rows + a field mapping and upsert them into the
 * v2 `candidates` table in batches, deduping on (source_system, source_key).
 * Rows with no name are skipped. Status is omitted so the DB default ('new') applies.
 */
export async function importCandidates(
  rows: ParsedRow[],
  map: FieldMap,
  sourceLabel: string,
): Promise<ImportResult> {
  const orgId = await currentOrgId()
  if (!orgId) return { inserted: 0, skipped: 0, error: 'no org' }

  let skipped = 0
  const candidates: CandidateInsert[] = []

  rows.forEach((row, rowIndex) => {
    const fullName = (row[map.full_name] ?? '').trim()
    if (!fullName) {
      skipped++
      return
    }
    const email = (map.email ? row[map.email] : '').trim() || null
    const phone = (map.phone ? row[map.phone] : '').trim() || null
    const source = (map.source ? row[map.source] : '').trim() || sourceLabel || null
    const tags = (map.tags ? row[map.tags] : '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const sourceKey = email
      ? email.toLowerCase()
      : `${sourceLabel}:${fullName}:${rowIndex}`

    candidates.push({
      org_id: orgId,
      full_name: fullName,
      email,
      phone,
      source,
      tags,
      source_system: SOURCE_SYSTEM,
      source_key: sourceKey,
    })
  })

  let inserted = 0
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)
    const { error } = await v2
      .from('candidates')
      .upsert(batch, { onConflict: 'source_system,source_key' })
    if (error) return { inserted, skipped, error: error.message }
    inserted += batch.length
  }

  return { inserted, skipped, error: null }
}
