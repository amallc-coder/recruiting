// App-wide type barrel. `lib/types.ts` remains the source of truth for domain
// models, labels, and reference data; this re-exports it (plus the RBAC role
// model) so feature code can import from a single `types/` entry point.
export * from '../lib/types'
export type { Capability, RoleMeta } from '../lib/roles'
export { APP_ROLES, ROLE_META, ROLE_CAPABILITIES, roleCan, roleLabel } from '../lib/roles'
