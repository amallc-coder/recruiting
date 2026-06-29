// Sourcing & CRM data layer: natural-language talent search, talent rediscovery
// for a requisition (reusing the match engine), and a credential-renewal
// re-engagement queue. All queries run under the caller's RLS via the v2 client.
import { v2, fetchAll } from './client'
import { demoMode } from '../supabase'
import { tokenize, candidateText, matchCandidatesForRequisition, type RankedCandidate } from './matching'

// ---- Natural-language search ----------------------------------------------

export interface SearchFilter {
  role_keywords: string[]
  states: string[]
  credential_types: string[]
  require_active_credentials: boolean
  available_within_days: number
  keywords: string[]
  summary: string
}

export interface SearchResult {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  status: string
  score: number
  matched: string[]
  credentials: { type: string; issuing_state: string | null; active: boolean }[]
}

interface SearchCandidate {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  tags: string[] | null
  resume_text: string | null
  screening_summary: string | null
  status: string
}

interface CredRow {
  candidate_id: string
  type: string
  issuing_state: string | null
  verification_status: string
  expiration_date: string | null
}

const SEARCH_FIELDS = 'id,full_name,email,phone,tags,resume_text,screening_summary,status'

/** Translate a plain-language query into a structured filter (ai-search edge fn). */
export async function parseSearch(query: string): Promise<{ filter: SearchFilter | null; error: string | null }> {
  if (demoMode) return { filter: null, error: 'Natural-language search is unavailable in local mode.' }
  try {
    const { data, error } = await v2.functions.invoke('ai-search', { body: { query } })
    if (error) return { filter: null, error: error.message }
    if (!data || data.ok === false) return { filter: null, error: data?.error ?? 'Could not interpret that search.' }
    return { filter: data.filter as SearchFilter, error: null }
  } catch (e) {
    return { filter: null, error: e instanceof Error ? e.message : 'Search failed' }
  }
}

/** Resolve a plain-language query into ranked candidates over candidate + credential data. */
export async function runTalentSearch(
  query: string,
): Promise<{ filter: SearchFilter | null; results: SearchResult[]; error: string | null }> {
  const { filter, error } = await parseSearch(query)
  if (error || !filter) return { filter: null, results: [], error: error ?? 'Search failed' }

  const cands = await fetchAll<SearchCandidate>(
    'candidates',
    SEARCH_FIELDS,
    (q) => q.not('status', 'in', '("archived","do_not_contact")'),
  )

  // Credential constraint → the set of candidates that qualify, plus their matching creds.
  let allowed: Set<string> | null = null
  const credsByCand = new Map<string, { type: string; issuing_state: string | null; active: boolean }[]>()
  if (filter.credential_types.length || filter.states.length) {
    let cq = v2.from('credentials').select('candidate_id,type,issuing_state,verification_status,expiration_date')
    if (filter.credential_types.length) cq = cq.in('type', filter.credential_types)
    if (filter.states.length) cq = cq.in('issuing_state', filter.states)
    const { data } = await cq
    const now = Date.now()
    allowed = new Set()
    for (const r of (data as CredRow[]) ?? []) {
      const active = r.verification_status === 'verified' && (!r.expiration_date || new Date(r.expiration_date).getTime() > now)
      if (filter.require_active_credentials && !active) continue
      allowed.add(r.candidate_id)
      const list = credsByCand.get(r.candidate_id) ?? []
      list.push({ type: r.type, issuing_state: r.issuing_state, active })
      credsByCand.set(r.candidate_id, list)
    }
  }

  const terms = tokenize([...filter.role_keywords, ...filter.keywords].join(' '))
  const results: SearchResult[] = cands
    .filter((c) => (allowed ? allowed.has(c.id) : true))
    .map((c) => {
      const candSet = new Set(tokenize(candidateText({ ...c, tags: c.tags ?? [] })))
      const matched = terms.filter((t) => candSet.has(t))
      // Keyword overlap drives the score; a credential-only match (no terms) still surfaces.
      const score = terms.length ? Math.round((100 * matched.length) / terms.length) : allowed ? 60 : 0
      return {
        id: c.id, full_name: c.full_name, email: c.email, phone: c.phone, status: c.status,
        score, matched: matched.slice(0, 6),
        credentials: credsByCand.get(c.id) ?? [],
      }
    })
    .filter((r) => r.score > 0 || r.credentials.length > 0)
    .sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name))
    .slice(0, 50)

  return { filter, results, error: null }
}

// ---- Talent rediscovery (reuses the match engine) -------------------------

/** Rank past candidates against a requisition, excluding those already in its pipeline. */
export async function listRediscovery(
  requisitionId: string,
): Promise<{ requisition: { id: string; title: string; role_family: string } | null; ranked: RankedCandidate[] }> {
  const { requisition, ranked } = await matchCandidatesForRequisition(requisitionId)
  const { data } = await v2.from('applications').select('candidate_id').eq('requisition_id', requisitionId)
  const applied = new Set(((data as { candidate_id: string }[]) ?? []).map((a) => a.candidate_id))
  return { requisition, ranked: ranked.filter((r) => !applied.has(r.id)) }
}

// ---- Re-engagement queue (credential renewals) ----------------------------

export interface ReEngageRow {
  credential_id: string
  candidate_id: string
  full_name: string
  email: string | null
  phone: string | null
  type: string
  issuing_state: string | null
  expiration_date: string
  days: number
  bucket: 30 | 60 | 90
}

/** Candidates whose credential (e.g. a license/DEA) renews within 90 days — the
 *  living-database signal that auto-populates the re-engagement queue. */
export async function listReEngagement(): Promise<ReEngageRow[]> {
  const today = new Date()
  const horizon = new Date(today.getTime() + 90 * 86_400_000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const { data } = await v2
    .from('credentials')
    .select('id,candidate_id,type,issuing_state,expiration_date, candidate:candidates(full_name,email,phone,status)')
    .not('expiration_date', 'is', null)
    .gte('expiration_date', iso(today))
    .lte('expiration_date', iso(horizon))
    .order('expiration_date', { ascending: true })

  const rows = (data as unknown as {
    id: string; candidate_id: string; type: string; issuing_state: string | null; expiration_date: string
    candidate: { full_name: string; email: string | null; phone: string | null; status: string } | null
  }[]) ?? []

  return rows
    .filter((r) => r.candidate && r.candidate.status !== 'archived')
    .map((r) => {
      const days = Math.max(0, Math.ceil((new Date(r.expiration_date).getTime() - today.getTime()) / 86_400_000))
      const bucket: 30 | 60 | 90 = days <= 30 ? 30 : days <= 60 ? 60 : 90
      return {
        credential_id: r.id, candidate_id: r.candidate_id,
        full_name: r.candidate!.full_name, email: r.candidate!.email, phone: r.candidate!.phone,
        type: r.type, issuing_state: r.issuing_state, expiration_date: r.expiration_date, days, bucket,
      }
    })
}
