# `features/` — feature-first modules

Each folder is a vertical slice of the product and exposes a small **public API**
through its `index.ts`. Code outside a feature should import from the feature
barrel (`features/<name>`), not reach into its internals.

This layer is introduced **non-destructively** on top of the existing
`pages/ • components/ • lib/ • hooks/` layout: the barrels currently re-export the
established modules so nothing has to move at once. New work can land directly in
a feature folder, and existing modules can migrate in gradually.

| Feature | Public API today | Backed by |
| --- | --- | --- |
| `auth` | `AuthProvider`, `useAuth`, `ProtectedRoute`, `useRole`, RBAC helpers | `context/AuthContext`, `components/ProtectedRoute`, `hooks/useRole`, `lib/roles` |
| `candidates` | candidate pipeline helpers | `lib/ats` |
| `jobs` | positions / requisitions catalog | `lib/positions` |
| `screening` | AI screening + comms client API | `lib/engage` |
| `matching` | candidate↔position matching | `lib/match` |

Conventions:

- **Public surface only in `index.ts`.** Keep components, hooks, and helpers in
  sibling files; export what the rest of the app may use.
- **Shared, cross-feature primitives** live in `components/primitives`, shared
  types in `types/`, and shared utilities in `lib/`.
- **RBAC:** gate UI affordances with `useRole().can(capability)` from
  `features/auth`. Capabilities are advisory — the database RLS policies are the
  real boundary.
