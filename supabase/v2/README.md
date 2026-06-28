# Clinilytics ATS — v2 schema (credentialing-first redesign)

A clean, healthcare-credentialing-first Postgres schema intended to **replace**
the current `supabase/schema.sql` model. **Not applied to production** — these
are design artifacts. Apply them to a **fresh Supabase project** or an isolated
**Supabase branch** to evaluate, then plan a cutover (below).

> ⚠️ Do **not** run these against the live project as-is: v2 reuses helper names
> (`is_admin`, `handle_new_user`, …) and table names (`candidates`, `facilities`,
> `applications`, `interviews`, `communications`) that already exist in the live
> `public` schema with different shapes. Running it there would replace those
> objects and is destructive to real data.

## Files & apply order

| # | File | Contents |
|---|------|----------|
| 1 | `01_schema.sql` | extensions, enums, tables, `updated_at` + stage-history triggers, analytics indexes |
| 2 | `02_rls.sql` | role-aligned RLS helpers + policies, `handle_new_user` auth sync |
| 3 | `03_placement_ready.sql` | `placement_ready()` function, `missing_credentials()`, `v_application_placement_ready` view, `expire_credentials()` |
| 4 | `04_seed.sql` | 1 org, 4 users, 2 facilities, RN/NP/MD/CNA families + stages, requirements, 4 requisitions, 15 candidates with varied credential states, sample applications |
| — | `types.ts` | matching TypeScript types (enums + row interfaces + the view row) |

```bash
# against a fresh project / branch, in order:
psql "$DATABASE_URL" -f 01_schema.sql
psql "$DATABASE_URL" -f 02_rls.sql
psql "$DATABASE_URL" -f 03_placement_ready.sql
psql "$DATABASE_URL" -f 04_seed.sql   # optional
```

The DDL targets a **fresh** database. The enum-creation block is guarded for
re-runs, but a clean target is the intended path.

## Model at a glance

```
organizations ─┬─ users (role: admin/recruiter/coordinator/hiring_manager/compliance)
               ├─ facilities ── facility_credential_requirements ─┐
               ├─ role_families ── pipeline_stages                │ (facility, role_family)
               ├─ candidates ─┬─ credentials ─────────────────────┘
               │              ├─ candidate_documents
               │              └─ communications
               └─ requisitions ── applications ─┬─ application_stage_history (time-in-stage)
                                                 ├─ interviews ── scorecards ── scorecard_responses
                                                 └─ (placement_ready join)
   ai_decisions (governance/audit) · kpi_snapshots (trend storage)
```

## Roles & RLS

Everything is **org-scoped** (a user only sees rows in their org). Helper
functions are `SECURITY DEFINER` so they resolve identity without recursing
through policies.

| Role | Reach |
|------|-------|
| `admin` | full access within the org |
| `recruiter` / `coordinator` | create/edit candidates, applications, interviews, comms |
| `hiring_manager` | read requisitions they own + that pipeline; no PII edits |
| `compliance` | read everything + manages credential verification (audit) |

## placement_ready

A candidate is **placement-ready** for a requisition when **every required**
credential type (`facility_credential_requirements` for the requisition's
facility + role family, `is_required = true`) is satisfied by a credential that
is `verification_status = 'verified'` **and** not expired (`expiration_date`
null or ≥ today). Requisitions with no required credentials are trivially ready.

- `placement_ready(candidate, requisition) → boolean` — point check
- `missing_credentials(candidate, requisition)` — the unmet required types
- `v_application_placement_ready` — per-application flag + `missing_credential_types[]`

The seed is built so the result is verifiable, e.g.:

```sql
select * from v_application_placement_ready order by application_id;
-- Olivia/Hassan/Aisha (RN), Sara (CNA), Nina (NP), Robert (MD) → ready = true
-- Marcus (BLS expired), Priya (license pending), David (missing immunization),
-- Greg (DEA expired), Maya (board_cert pending), Elena (missing BLS),
-- Tom (BLS expired), Grace (immunization pending), Liam (no creds) → ready = false
```

## Analytics indexes

Indexed for the KPI module: **time-in-stage** (`application_stage_history` by
application / stage / entered_at, plus a partial index on open stages),
**source** (`candidates.source`), **facility** (`requisitions.facility_id`),
funnel (`applications` by requisition/stage/status/applied_at), and credential
expiry sweeps. `kpi_snapshots` stores rolled-up trends for fast dashboards.

## Cutover plan (current schema → v2)

This is a **redesign that supersedes** the current model, so adoption is a
migration project, not a drop-in. Suggested path:

1. **Stand up v2 in isolation** — apply `01–03` to a Supabase **branch** (or a
   new project) and validate with `04_seed.sql`. Nothing touches prod.
2. **Map the old model to v2** (the non-obvious renames):
   - `profiles` → `users` (+ `organizations`; role enum extended)
   - `companies` → `organizations`
   - `jobs` / `positions` → `requisitions` (+ `role_families`)
   - `candidates`/`applications`/`interviews`/`communications` → same names, new columns (e.g. `applications.current_stage_id`, `reject_reason`; `communications.sentiment`/`transcript`)
   - stage enum (`candidates.current_stage`) → data-driven `pipeline_stages` + `applications.current_stage_id`
   - **new** concepts with no source today: `credentials`, `facility_credential_requirements`, `candidate_documents`, `scorecards`, `ai_decisions`, `kpi_snapshots`
3. **Write a data-migration script** (separate from this DDL) that backfills v2
   tables from the current ones into a **new schema/project**, defaulting the
   org to a single tenant and seeding `pipeline_stages` per role family.
4. **Backfill credentials** from existing candidate fields/documents where
   possible; default `verification_status = 'unverified'` so nothing is wrongly
   marked placement-ready.
5. **Dual-read / verify**, then cut the app over (new `types.ts`, new queries),
   and retire the old schema once parity is confirmed.

Risks to weigh before committing: it reuses `public` object names (so it can't
co-exist with the current schema in the same database), candidate↔requisition
becomes the unit of pipeline state (vs. a single stage on the candidate today),
and credential data must be sourced/verified before placement-ready gating is
trustworthy.

_Generated as a design deliverable; nothing here has been applied to the live
project._
