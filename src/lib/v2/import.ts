// In-browser spreadsheet import for the v2 `candidates` table. Parses an uploaded
// .xlsx/.xls/.csv entirely client-side (SheetJS — same parsing approach as the v1
// importer) and writes candidates into the org-scoped v2 schema.
//
// Two behaviours in one pass, keyed on email:
//   * ENRICH  — a row whose email matches an existing candidate UPDATES that
//               candidate (résumé text, notes, phone). This is how the migrated
//               talent pool gets résumé text without creating duplicates.
//   * CREATE  — a row with no email match is inserted as a new candidate
//               (idempotent via the unique (source_system, source_key) index).
import * as XLSX from 'xlsx'
import { v2, fetchAll } from './client'
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
  resume_text?: string
  notes?: string
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
    } else if (
      !map.resume_text &&
      (n === 'resume' || n === 'résumé' || n === 'resume text' || n === 'résumé text' || n === 'cv' || n === 'summary' || n === 'profile' || n === 'experience' || n === 'work history' || n === 'bio')
    ) {
      map.resume_text = h
    } else if (!map.notes && (n === 'notes' || n === 'note' || n === 'comments')) {
      map.notes = h
    }
  }
  // Fall back to the first header for the required name field if nothing matched.
  if (!map.full_name && headers.length) map.full_name = headers[0]
  return map
}

export interface ImportResult {
  /** New candidates inserted (no email match found). */
  created: number
  /** Existing candidates enriched (matched by email). */
  updated: number
  /** Rows skipped (no name on a new row, or nothing to write on a match). */
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
  resume_text: string | null
  notes: string | null
  source_system: string
  source_key: string
}

const SOURCE_SYSTEM = 'xlsx_import'
const BATCH_SIZE = 200
const UPDATE_CONCURRENCY = 25

/**
 * Build candidate rows from parsed rows + a field mapping, then:
 *   - UPDATE existing candidates whose email matches (enrichment), and
 *   - INSERT the rest as new candidates (deduped on source_system + source_key).
 * Rows with no name AND no email match are skipped.
 */
export async function importCandidates(
  rows: ParsedRow[],
  map: FieldMap,
  sourceLabel: string,
): Promise<ImportResult> {
  const orgId = await currentOrgId()
  if (!orgId) return { created: 0, updated: 0, skipped: 0, error: 'no org' }

  // Email → existing candidate id, paginated past the 1000-row cap so matches
  // are found across the whole talent pool (not just the first 1000).
  const existing = await fetchAll<{ id: string; email: string | null }>('candidates', 'id,email')
  const byEmail = new Map<string, string>()
  for (const c of existing) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id)
  }

  const inserts: CandidateInsert[] = []
  const updates: { id: string; patch: Record<string, unknown> }[] = []
  let skipped = 0

  const cell = (row: ParsedRow, key?: string) => (key ? (row[key] ?? '').trim() : '')

  rows.forEach((row, rowIndex) => {
    const fullName = cell(row, map.full_name)
    const email = cell(row, map.email)
    const phone = cell(row, map.phone)
    const resume = cell(row, map.resume_text)
    const notes = cell(row, map.notes)
    const source = cell(row, map.source) || sourceLabel || null
    const tags = cell(row, map.tags)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    const emailKey = email.toLowerCase()
    const existingId = emailKey ? byEmail.get(emailKey) : undefined

    // ENRICH: email matches an existing candidate → update only the fields present.
    if (existingId) {
      const patch: Record<string, unknown> = {}
      if (resume) patch.resume_text = resume
      if (notes) patch.notes = notes
      if (phone) patch.phone = phone
      if (Object.keys(patch).length === 0) {
        skipped++
        return
      }
      updates.push({ id: existingId, patch })
      return
    }

    // CREATE: no email match → new candidate (requires a name).
    if (!fullName) {
      skipped++
      return
    }
    const sourceKey = emailKey || `${sourceLabel}:${fullName}:${rowIndex}`
    inserts.push({
      org_id: orgId,
      full_name: fullName,
      email: email || null,
      phone: phone || null,
      source,
      tags,
      resume_text: resume || null,
      notes: notes || null,
      source_system: SOURCE_SYSTEM,
      source_key: sourceKey,
    })
  })

  let created = 0
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE)
    const { error } = await v2
      .from('candidates')
      .upsert(batch, { onConflict: 'source_system,source_key' })
    if (error) return { created, updated: 0, skipped, error: error.message }
    created += batch.length
  }

  // Supabase has no bulk update-by-id; run the per-row updates in small parallel
  // chunks so enriching the full talent pool stays responsive.
  let updated = 0
  for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
    const chunk = updates.slice(i, i + UPDATE_CONCURRENCY)
    const results = await Promise.all(
      chunk.map((u) => v2.from('candidates').update(u.patch).eq('id', u.id)),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) return { created, updated, skipped, error: failed.error.message }
    updated += chunk.length
  }

  return { created, updated, skipped, error: null }
}

/**
 * GO-LIVE RESET (admin only). Wipes the org's candidate + pipeline data so a fresh
 * import can replace it. Calls the SECURITY DEFINER reset_org_candidate_data() RPC,
 * which deletes candidates (cascading applications, screenings, offers, comms,
 * credentials, scorecards, interviews, onboarding). Requisitions, facilities, team,
 * role families, pipeline stages, and integrations are preserved.
 */
export async function resetOrgCandidateData(): Promise<{ candidates: number; applications: number; error: string | null }> {
  const { data, error } = await v2.rpc('reset_org_candidate_data')
  if (error) return { candidates: 0, applications: 0, error: error.message }
  const d = (data ?? {}) as { candidates_deleted?: number; applications_deleted?: number }
  return { candidates: d.candidates_deleted ?? 0, applications: d.applications_deleted ?? 0, error: null }
}
