import { v2, fetchAll } from './client'
import { currentOrgId } from './org'
import type { Candidate, CandidateStatus } from './types'

const CANDIDATE_SELECT = 'id,full_name,email,phone,source,status,tags'

/** Strip characters that would break a PostgREST `.or(...)` ilike filter. */
function sanitizeTerm(term: string): string {
  return term.replace(/[%,()]/g, '').trim()
}

export async function listCandidates(opts?: {
  search?: string
  /** Multi-select: empty/undefined means all statuses. */
  statuses?: CandidateStatus[]
}): Promise<Candidate[]> {
  const search = sanitizeTerm(opts?.search ?? '')
  const statuses = opts?.statuses ?? []

  // Paginate past PostgREST's 1000-row cap so the full talent pool (1k+ rows)
  // is returned. fetchAll orders by id for stable paging; we re-sort by name.
  const rows = await fetchAll<Candidate>('candidates', CANDIDATE_SELECT, (q) => {
    let query = q
    if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
    if (statuses.length) query = query.in('status', statuses)
    return query
  })
  return rows.sort((a, b) => a.full_name.localeCompare(b.full_name))
}

export interface CandidateInput {
  full_name: string
  email?: string | null
  phone?: string | null
  source?: string | null
  status?: CandidateStatus
  tags?: string[]
}

export async function createCandidate(
  input: CandidateInput,
): Promise<{ error: string | null }> {
  const org_id = await currentOrgId()
  if (!org_id) return { error: 'No organization found for the current user.' }
  const { error } = await v2.from('candidates').insert({
    ...input,
    org_id,
    status: input.status ?? 'new',
    tags: input.tags ?? [],
  })
  return { error: error?.message ?? null }
}

export async function updateCandidate(
  id: string,
  patch: Partial<CandidateInput>,
): Promise<{ error: string | null }> {
  const { error } = await v2.from('candidates').update(patch).eq('id', id)
  return { error: error?.message ?? null }
}

export async function deleteCandidate(id: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('candidates').delete().eq('id', id)
  return { error: error?.message ?? null }
}
