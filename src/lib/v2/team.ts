// v2 Team admin data layer. Manages org members (role / active) and each
// region-limited recruiter's covered regions — the latter is what lets a
// recruiter see facility-scoped data (facilities / coverage / requisitions),
// since region-limited roles are gated by can_see_region(). All writes go
// through RLS: the users_admin and rr_admin policies permit an active admin.
import { v2 } from './client'

// The five v2 roles. recruiter + hiring_manager are region-limited
// (see is_region_limited()); admin/coordinator/compliance see all regions.
export type TeamRole = 'admin' | 'recruiter' | 'coordinator' | 'hiring_manager' | 'compliance'
export const TEAM_ROLES: TeamRole[] = ['admin', 'recruiter', 'coordinator', 'hiring_manager', 'compliance']
export const REGION_LIMITED_ROLES: ReadonlySet<string> = new Set(['recruiter', 'hiring_manager'])

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: 'Admin',
  recruiter: 'Recruiter',
  coordinator: 'Coordinator',
  hiring_manager: 'Hiring manager',
  compliance: 'Compliance',
}

export interface TeamMember {
  id: string
  full_name: string | null
  email: string | null
  role: string
  active: boolean
}

export interface TeamData {
  members: TeamMember[]
  regionsByUser: Record<string, string[]>
  regionOptions: string[]
}

export async function loadTeam(): Promise<TeamData> {
  // All three tables are well under the 1000-row cap (≈17 users, a few dozen
  // region rows, ≈71 facilities); recruiter_regions has no `id` column so we use
  // plain selects rather than the id-ordered fetchAll().
  const [{ data: users }, { data: regions }, { data: facs }] = await Promise.all([
    v2.from('users').select('id,full_name,email,role,active'),
    v2.from('recruiter_regions').select('user_id,region'),
    v2.from('facilities').select('region'),
  ])

  const regionsByUser: Record<string, string[]> = {}
  for (const r of (regions as { user_id: string; region: string }[]) ?? []) {
    ;(regionsByUser[r.user_id] ??= []).push(r.region)
  }

  const regionOptions = Array.from(
    new Set(
      ((facs as { region: string | null }[]) ?? [])
        .map((f) => f.region?.trim())
        .filter((x): x is string => !!x),
    ),
  ).sort((a, b) => a.localeCompare(b))

  const members = ((users as TeamMember[]) ?? []).sort((a, b) =>
    (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''),
  )

  return { members, regionsByUser, regionOptions }
}

export async function setRole(id: string, role: TeamRole): Promise<{ error: string | null }> {
  const { error } = await v2.from('users').update({ role }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function setActive(id: string, active: boolean): Promise<{ error: string | null }> {
  const { error } = await v2.from('users').update({ active }).eq('id', id)
  return { error: error?.message ?? null }
}

export async function addRegion(userId: string, region: string): Promise<{ error: string | null }> {
  const { error } = await v2.from('recruiter_regions').insert({ user_id: userId, region })
  return { error: error?.message ?? null }
}

export async function removeRegion(userId: string, region: string): Promise<{ error: string | null }> {
  const { error } = await v2
    .from('recruiter_regions')
    .delete()
    .eq('user_id', userId)
    .eq('region', region)
  return { error: error?.message ?? null }
}
