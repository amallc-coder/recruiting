import { useAuth } from '../context/AuthContext'
import { roleCan, type Capability } from '../lib/roles'
import type { Role } from '../lib/types'

/**
 * Role/permission helper for components. Reads the signed-in profile and exposes
 * capability + role checks. UI-only — the database RLS policies still enforce
 * access on the server.
 */
export function useRole() {
  const { profile } = useAuth()
  const role = profile?.role ?? null
  return {
    role,
    isAdmin: role === 'admin',
    can: (capability: Capability) => roleCan(role, capability),
    is: (...roles: Role[]) => role != null && roles.includes(role),
  }
}
