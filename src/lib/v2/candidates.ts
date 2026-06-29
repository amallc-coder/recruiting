import { v2 } from './client'
import { currentOrgId } from './org'
import type { Candidate, CandidateStatus } from './types'

const CANDIDATE_SELECT = 'id,full_name,email,phone,source,status,tags'

/** Strip characters that would break a PostgREST `.or(...)` ilike filter. */
function sanitizeTerm(term: string): string {
  return term.replace(/[%,()]/g, '').trim()
}

export async function listCandidates(opts?: {
  search?: string
  status?: CandidateStatus | 'all'
}): Promise<Candidate[]> {
  let query = v2.from('candidates').select(CANDIDATE_SELECT)

  const search = sanitizeTerm(opts?.search ?? '')
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }
  if (opts?.status && opts.status !== 'all') {
    query = query.eq('status', opts.status)
  }

  const { data } = await query.order('full_name')
  return (data as Candidate[]) ?? []
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
