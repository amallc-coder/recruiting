# Clinilytics ATS — v2 full-replacement cutover plan

Goal: replace the production app + database (old schema) with **v2**. This is a
phased migration project, not a switch. Production stays live until the final
go-live window. **Nothing in this plan touches prod until Phase 4, and only with
an explicit go-ahead + a fresh backup.**

---

## 0. The two gating decisions

### A. Feature parity (the big one)
v2 is a credentialing/requisitions redesign and does **not** currently cover
large parts of the live product. For each, we either **rebuild on v2** or
**retire** it:

| Production feature (old schema) | In v2 today? | Decision needed |
| --- | --- | --- |
| Requisitions / pipeline / applications | ✅ (this module) | — |
| Candidates | ✅ (different shape) | map + migrate |
| Facilities | ✅ (different shape) | map + migrate |
| Interviews / offers / scorecards | ✅ | map + migrate |
| Communications | ✅ | map + migrate |
| **Facility coverage (`coverage_needs`, Have/Need)** | ❌ | rebuild or retire |
| **AI screening + Vapi voice calls (`screenings`, edge fns)** | ❌ | rebuild or retire |
| **Integrations marketplace + OAuth/webhook engine** | ❌ | rebuild or retire |
| **Positions catalog** | ❌ | rebuild or retire |
| **Hiring-handoff checklists** | ❌ | rebuild or retire |
| **Public career page + applications intake** | ❌ | rebuild or retire |
| **Excel/CSV import engine** | ❌ | rebuild or retire |
| Analytics dashboards (Exec/Pipeline/Interviews/Offers/Finance) | ⚪ partial (v2 has the tables/indexes) | re-point to v2 |

> **Until this matrix is settled, the schema scope and the frontend port can't be
> finalized.** "Lean v2" (retire the ❌ rows) is weeks; "full parity" (rebuild
> them on v2) is materially larger.

### B. Region isolation (a security regression to fix first)
Today recruiters are isolated **by region** (`recruiter_regions` +
`covers_region()`). v2's RLS is **org-scoped only** → every recruiter would see
every candidate in the org. v2 must regain region scoping before cutover:
- add `recruiter_regions(user_id, region)` + `covers_region(region)` to v2,
- add `region` to `facilities` (and derive candidate/application region via the
  requisition's facility),
- region-scope the candidate/application/requisition read policies.

---

## Phases

**Phase 1 — v2 schema completeness** (no prod impact; validated on a branch)
- Region scoping (decision B).
- Homes for every kept feature from decision A (new tables/columns or explicit
  "retired").
- Extend `supabase/v2/*` + types accordingly.

**Phase 2 — data-migration script** (no prod impact; tested on a branch seeded
from a prod snapshot)
- `public.*` → `v2.*` transforms (mapping below).
- Idempotent, re-runnable, with row-count assertions and a dry-run mode.

**Phase 3 — frontend port** (no prod impact; behind the `v2IsBranch`/flag)
- Re-point every page + lib module from the old client/tables to the v2 client +
  schema, page by page, each verified.
- Auth: `profiles` → v2 `users`; keep the existing `auth.users` (only re-point
  the sync trigger).

**Phase 4 — go-live window** (the only prod-touching step)
1. Announce a maintenance window; freeze writes.
2. **Full DB backup** (Supabase PITR / snapshot) — the rollback anchor.
3. Run the migration `public → v2` on prod (in a transaction where possible).
4. Deploy the v2 frontend; flip config to point at v2.
5. Smoke-test the acceptance flows; spot-check region isolation + row counts.
6. Lift the freeze. Monitor.
- **Rollback:** restore the backup + redeploy the previous frontend build.

---

## Data mapping (old → v2) — first pass

| Old | v2 | Notes |
| --- | --- | --- |
| `profiles` | `users` (+ one `organizations` row) | role enum already aligned; first user → admin |
| `recruiter_regions` | `recruiter_regions` (v2) | Phase-1 addition |
| `companies` | `organizations` | single tenant today |
| `jobs` / `positions` | `requisitions` (+ `role_families`) | status/approval mapping; positions catalog → retire or a lookup |
| `candidates` | `candidates` (+ `applications`) | old single `current_stage` → an application's `current_stage_id`; **needs a rule** for which requisition each candidate maps to (or create a synthetic "general" req per role/facility) |
| `candidate_stage_history` | `application_stage_history` | re-key to applications |
| `applications` (old ATS) | `applications` (v2) | column remap |
| `interviews` / `offers` | `interviews` / `offers`(*) | (*) v2 has interviews/scorecards; offers table to add if kept |
| `communications` | `communications` | + `sentiment` default null |
| `screenings` | — | **decision A** (rebuild table+edge fns, or retire) |
| `coverage_needs` | — | **decision A** |
| credentials | (no source) | start empty; `verification_status='unverified'` so nothing is wrongly placement-ready |
| `recruiting_costs` | `recruiting_costs` (v2) | direct |

Ambiguities to resolve in Phase 2: candidate↔requisition assignment, and any
old-only data with no v2 home (per decision A).

---

## Status
- v2 schema (requisitions/pipeline/credentials/placement-ready) authored +
  branch-validated; requisitions module built (ships dormant behind `v2IsBranch`).
- **Blocked on decision A (feature parity)** to size Phases 1–3.
- Nothing applied to prod.
