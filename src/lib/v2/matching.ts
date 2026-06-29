// v2 candidate ↔ requisition matching.
//
// Transparent token-overlap scoring that runs in the browser against the v2
// schema. Adapted from the legacy heuristic (résumé + screening_summary blend)
// but written fresh against the v2 client — no old imports.
//
// We score a candidate by how much of the requisition's text vocabulary their
// own text covers, so the ranking is explainable: `matched` lists the very
// keywords that drove the score.
import { v2 } from './client'
import { listRequisitions } from './requisitions'
import type { RequisitionRow } from './types'

// What we actually select from `candidates` for matching. resume_text and
// screening_summary are columns on the v2 table; we pull them explicitly.
export interface MatchCandidate {
  id: string
  full_name: string
  tags: string[] | null
  resume_text: string | null
  screening_summary: string | null
  status: string
}

// The requisition fields we reason over.
interface MatchRequisition {
  id: string
  title: string
  role_family: string
  specialty: string | null
  description: string | null
  requirements: string | null
  org_id: string
}

export interface RankedCandidate {
  id: string
  full_name: string
  status: string
  tags: string[]
  score: number
  matched: string[]
}

// Small stopword set so common filler doesn't inflate overlap.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'a', 'an', 'to', 'of', 'in', 'on', 'or', 'at',
  'is', 'are', 'be', 'as', 'by', 'we', 'our', 'you', 'your', 'will', 'must',
  'have', 'has', 'this', 'that', 'they', 'their', 'who', 'can', 'all', 'per',
  'from', 'work', 'role', 'position', 'job', 'candidate', 'experience', 'years',
])

const MIN_TOKEN_LEN = 3

/** Blend of everything we know about a candidate, lowercased. */
export function candidateText(c: MatchCandidate): string {
  return [c.full_name, (c.tags ?? []).join(' '), c.resume_text ?? '', c.screening_summary ?? '']
    .filter((s) => s && s.trim())
    .join('\n')
    .toLowerCase()
}

/** The requisition's full text vocabulary, lowercased. */
export function reqText(r: {
  title: string
  role_family: string
  specialty: string | null
  description: string | null
  requirements: string | null
}): string {
  return [r.title, r.role_family, r.specialty ?? '', r.description ?? '', r.requirements ?? '']
    .filter((s) => s && s.trim())
    .join('\n')
    .toLowerCase()
}

/** Split on non-alphanumerics, drop short/stopword tokens, dedupe. */
export function tokenize(s: string): string[] {
  const seen = new Set<string>()
  for (const raw of (s || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < MIN_TOKEN_LEN) continue
    if (STOPWORDS.has(raw)) continue
    seen.add(raw)
  }
  return [...seen]
}

const TOP_N = 25
const MAX_MATCHED = 6
const ROLE_TAG_BONUS = 8

const REQ_FIELDS = 'id,title,role_family,specialty,description,requirements,org_id'
const CAND_FIELDS = 'id,full_name,tags,resume_text,screening_summary,status'

export async function matchCandidatesForRequisition(
  requisitionId: string,
): Promise<{ requisition: { id: string; title: string; role_family: string } | null; ranked: RankedCandidate[] }> {
  const { data: reqData } = await v2
    .from('requisitions')
    .select(REQ_FIELDS)
    .eq('id', requisitionId)
    .maybeSingle()
  const requisition = (reqData as MatchRequisition | null) ?? null
  if (!requisition) return { requisition: null, ranked: [] }

  const { data: candData } = await v2
    .from('candidates')
    .select(CAND_FIELDS)
    .not('status', 'in', '("archived","do_not_contact")')
  const candidates = (candData as MatchCandidate[] | null) ?? []

  const reqTokens = tokenize(reqText(requisition))
  const denom = Math.max(1, reqTokens.length)
  const roleFamily = requisition.role_family.toLowerCase()

  const ranked: RankedCandidate[] = candidates.map((c) => {
    const tags = c.tags ?? []
    const candSet = new Set(tokenize(candidateText(c)))
    const overlap = reqTokens.filter((t) => candSet.has(t))
    let score = Math.round((100 * overlap.length) / denom)
    // Small bonus when a candidate tag is the requisition's role family.
    if (roleFamily && tags.some((t) => t.toLowerCase() === roleFamily)) {
      score = Math.min(100, score + ROLE_TAG_BONUS)
    }
    return {
      id: c.id,
      full_name: c.full_name,
      status: c.status,
      tags,
      score,
      matched: overlap.slice(0, MAX_MATCHED),
    }
  })

  ranked.sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name))
  return {
    requisition: { id: requisition.id, title: requisition.title, role_family: requisition.role_family },
    ranked: ranked.slice(0, TOP_N),
  }
}

/** Open requisitions for the picker. Reuses the requisitions module. */
export async function listOpenRequisitions(): Promise<RequisitionRow[]> {
  const rows = await listRequisitions()
  return rows.filter((r) => r.status === 'open')
}
