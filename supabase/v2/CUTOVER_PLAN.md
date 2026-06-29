# Clinilytics ATS — v2 full-replacement cutover plan

Goal: replace the production app + database (old schema) with **v2**. This is a
phased migration project, not a switch. Production stays live until the final
go-live window. **Nothing in this plan touches prod until Phase 4, and only with
an explicit go-ahead + a fresh backup.**

---

## 0. The two gating decisions — BOTH SETTLED

### A. Feature parity — DECISION: **FULL PARITY (rebuild all 7)**
The owner chose full parity: every production feature gets a home on v2 before
cutover; nothing is retired. Phase-1 schema homes for all of them are authored
and branch-validated (see `06_feature_homes.sql`).

| Production feature (old schema) | Decision | v2 home |
| --- | --- | --- |
| Requisitions / pipeline / applications | keep | `01` |
| Candidates | map + migrate | `01` + `recruiter_id` (`05`) |
| Facilities | map + migrate | `01` + `region` (`05`) |
| Interviews / scorecards | map + migrate | `01` |
| Communications | map + migrate | `01` + `screening_id` (`06`) |
| **Facility coverage (`coverage_needs`, Have/Need)** | **rebuild** | `coverage_needs` (`06`) |
| **AI screening + Vapi voice (`screenings`, edge fns)** | **rebuild** | `screenings` (`06`) + edge fns (Phase 3) |
| **Integrations marketplace + OAuth/webhook engine** | **rebuild** | `integrations*`, `webhook_events` (`06`) |
| **Positions catalog** | **rebuild** | `positions` (`06`) |
| **Hiring-handoff checklists** | **rebuild** | `applications.checklist` + onboarding cols (`06`) |
| **Public career page + intake** | **rebuild** | req public cols + `apply_to_requisition()` (`06`) |
| **Excel/CSV import engine** | **rebuild** | `candidates.source_*` + uq index (`06`); FE in Phase 3 |
| Offers | **rebuild** | `offers` (`06`) |
| Recruiting costs / Finance | **rebuild** | `recruiting_costs` (`06`) |
| Analytics (events + audit) | **rebuild** | `analytics_events`, `audit_logs` (`06`) |

### B. Region isolation — DONE (Phase 1)
The org-only RLS regression is fixed in `05_region_isolation.sql` +
`08_region_write_policies.sql`:
- `recruiter_regions(user_id, region)`, `region` on `facilities`,
  `candidates.recruiter_id` for ownership;
- helpers `is_region_limited()`, `can_see_region()`, `covers_facility()`;
- region-scoped read policies on facilities / requisitions / applications /
  candidates (admin, coordinator, compliance stay org-wide; recruiter +
  hiring_manager are territory-bound).

> **Bug found in validation (the reason we branch-validate):** v2's write
> policies were `FOR ALL`, and a `FOR ALL` policy's `USING` clause also governs
> `SELECT`. Because `is_staff()` is true for recruiters org-wide, those write
> policies silently re-exposed every row — defeating region isolation entirely.
> Fix: split every `FOR ALL` write policy on region-sensitive tables into
> command-specific `INSERT`/`UPDATE`/`DELETE` policies (`08`). Validated on a
> branch: a Columbus recruiter sees only Columbus reqs/facilities/apps; a Kansas
> City recruiter sees the Lakeside set (+ public postings); admin sees all.

---

## Apply order (v2 SQL files)
`01_schema` → `02_rls` → `03_placement_ready` → `05_region_isolation` →
`06_feature_homes` → `07_feature_rls` → `08_region_write_policies` →
`09_hardening` → `04_seed` (seed last; dev/test only). All branch-validated to
apply cleanly in this order.

## Phases

**Phase 1 — v2 schema completeness — DONE (branch-validated; no prod impact)**
- ✅ Region scoping (decision B): `05` + `08`.
- ✅ Homes for all full-parity features (decision A): `06` + RLS in `07`.
- ✅ Security hardening (`09`): pinned `search_path`; internal RLS helpers locked
  to `authenticated` (revoked from PUBLIC/anon); trigger/maintenance fns
  `postgres`-only. Advisor clean except the intentionally-public career RPC.
- ✅ Validated on a Supabase branch: schema applies clean; `placement_ready`
  unchanged (6 ready / 6 not); career intake (`apply_to_requisition`) creates
  candidate+application+event; region isolation enforced across admin/Columbus/KC.
- TODO (Phase 1 tail): regenerate v2 TS types to include the new tables/columns.

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

> **Prod-execution note (learned in validation): do NOT `drop schema public`.**
> Dropping/recreating the `public` schema destroys Supabase's default table/role
> grants, after which `authenticated`/`anon` get "permission denied" even with
> correct RLS. On prod, **drop/replace the old objects** (tables/functions),
> leaving the schema and its grant configuration intact — or explicitly re-grant
> `select,insert,update,delete on all tables` + `usage,select on all sequences`
> to `anon, authenticated` and re-create the default privileges after load. The
> data-migration script (Phase 2) must run as `service_role`/owner.

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
- **Decisions A (full parity) and B (region isolation) both settled.**
- **Phase 1 DONE:** full-parity schema homes + region isolation + hardening
  authored (`05`–`09`) and branch-validated. Requisitions module ships dormant
  behind `v2IsBranch`.
- **Next: Phase 2** — author the `public → v2` data-migration script and test it
  on a branch seeded from a prod snapshot. Then Phase 3 (frontend port), then the
  gated Phase 4 go-live.
- Nothing applied to prod. Phase 4 runs only with an explicit go-ahead + a fresh
  backup.
