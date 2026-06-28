# CLAUDE.md

Guidance for Claude Code (and engineers) working in this repo. Grounded in the
actual `src/`, `supabase/schema.sql`, and `supabase/functions/` — not the marketing
docs. Where `README.md` and `EXECUTIVE_BRIEFING.md` disagree, **this file and the
schema win.**

---

## What this is

**Clinilytics ATS** — a healthcare-staffing applicant tracking system for **American
Medical Administrators**, serving SNF/LTC facility coverage. It's a **static
React/Vite SPA on GitHub Pages** backed by **Supabase** (Postgres + Auth + RLS + Edge
Functions). Recruiters are region-isolated at the database layer; candidate↔job
matching and AI screening are powered by Claude.

### Reconciling the two existing docs
The schema contains **both** data models the docs describe — they are not
alternatives, they coexist:
- **Facility-coverage model:** `facilities` → `coverage_needs` (the "Have/Need"
  staffing-gap view; see `README.md`).
- **Requisition/pipeline model:** `jobs` / `positions` → `applications` →
  `interviews` → `offers` (the recruiting pipeline; see `EXECUTIVE_BRIEFING.md`).
- **Candidates** (`candidates`, `candidate_stage_history`) and the **AI layer**
  (`screenings`, `communications`) bridge both.

Don't "fix" one model to match the other — they serve different pages.

---

## Tech stack

- React 18 + TypeScript + Vite, Tailwind (utility classes inline), `lucide-react`
  icons, `recharts` for analytics, `xlsx` for import/export, `date-fns`.
- Routing: **HashRouter** (`src/App.tsx`) — deep links work on GitHub Pages with no
  server. Vite `base` defaults to `/recruiting/` (`vite.config.ts`, override with
  `VITE_BASE`).
- Backend: Supabase JS client (`src/lib/supabase.ts`); 23 Postgres tables with RLS;
  Deno edge functions in `supabase/functions/`.
- Claude: `@anthropic-ai/sdk` from esm.sh inside edge functions, model
  `claude-opus-4-8`, structured output via `output_config.format` json_schema.

## Commands

```bash
npm run dev       # vite dev server
npm run build     # tsc -b && vite build
npm run preview   # serve the production build
npm run lint      # tsc -b --noEmit  (this is the typecheck/lint gate)
```
There is no separate test runner; `npm run lint` (typecheck) is the CI gate. Build
artifacts deploy to GitHub Pages via `.github/workflows/deploy.yml` **on push to
`main` only** — PRs do not trigger a build.

---

## Data model & security (the important part)

### RLS is the security boundary, not the client
The anon key and Supabase URL are **public by design** (`.env.example` says so) —
data is protected by **Row Level Security**, not by hiding keys. Never rely on the
frontend to enforce access.

Key SQL helpers in `supabase/schema.sql` (use these patterns in new policies):
- `is_admin()` — `profiles.role = 'admin' AND active`.
- `covers_region(r text)` — admin, OR the caller has a `recruiter_regions` row for
  region `r`. This is the **per-recruiter region isolation** mechanism.
- `facility_region(fid uuid)` — resolves a facility's region for the check above.
- Triggers: `handle_new_user`, `candidate_before_save`, `log_stage_change`,
  `application_after_insert`, `audit_candidate_reassign`, `audit_role_change`,
  `touch_updated_at`. RPC: `recruiter_dashboard(days)`.

**Ownership pattern for owned rows:** `is_admin() OR recruiter_id = auth.uid() OR
created_by = auth.uid()`, plus region scoping via `covers_region()` where facilities
are involved. Edge functions re-check ownership server-side before acting.

### Tables (23)
`profiles`, `recruiter_regions`, `facilities`, `coverage_needs`, `candidates`,
`candidate_stage_history`, `positions`, `preset_admins`, `companies`, `jobs`,
`applications`, `analytics_events`, `audit_logs`, `integrations`,
`integration_credentials`, `integration_logs`, `integration_field_mappings`,
`webhook_events`, `interviews`, `offers`, `recruiting_costs`, `screenings`,
`communications`.

---

## Layout

### Pages (`src/pages/`)
`Dashboard`, `Facilities` / `FacilityDetail`, `Candidates`, `Jobs` / `JobDetail`,
`Positions`, `Matching`, `Analytics`, `Interviews`/offers (within details),
`Careers` (public career page), `Import`, `Integrations`, `Team`, `Setup`, `Login`,
`ApiDocs`.

### State & data (`src/`)
- `context/AuthContext.tsx` — session/profile/role.
- `hooks/useFacilities.ts`, `hooks/useProfiles.ts`.
- `lib/supabase.ts` — client; exports `demoMode`. **Demo mode** swaps in a
  localStorage `demoClient` mock that has **no `.functions`** — guard every
  `functions.invoke(...)` with `if (!demoMode)` and provide a local fallback (see
  `lib/engage.ts`).
- `lib/` — domain logic: `ats.ts`, `analytics.ts`, `positions.ts`/`positionsSeed.ts`,
  `masterData.ts`, `match.ts` + `recruiterMatch.ts` (matching; `candidateMatchText()`
  blends résumé + `screening_summary`), `engage.ts` (screening/comms client API),
  `integrations.ts`, `import/export` (`importXlsx.ts`, `export.ts`), `geo.ts`,
  `cloudSeed.ts`, `demo.ts`, `types.ts`.
- `components/` — `Layout`, `ProtectedRoute`, `CandidateEngage` (AI screening +
  comms modal), `Combobox`, `ui`.

### Edge functions (`supabase/functions/`)
- AI: `ai-screen` (generate questionnaire + analyze responses), `ai-match`
  (Claude matching — **written, not yet deployed**), `ai-role` (role/job authoring).
- Vapi voice screening: `vapi-call` (place agentic screening call/SMS),
  `vapi-webhook` (PUBLIC, `--no-verify-jwt`; receives transcript, analyzes, fills
  per-question answers, logs, refreshes matching context). See `VAPI_SETUP.md`.
- Accounts: `recruiter-admin` (**security-hardened — do not revert**: rejects
  placeholder/`.invalid` emails, recruiter-only email updates), `recruiter-upsert`,
  `invite-user`.
- Integrations: `integration-oauth`, `integration-sync`, `integration-webhook`,
  `sync-sharepoint`. See `INTEGRATIONS_SETUP.md`.
- `_shared/` — CORS + client helpers.

---

## Conventions & rules

- **Model `claude-opus-4-8`** for all Claude calls. **Never** put that model id in
  commits, PR text, code comments, or any pushed artifact — chat only.
- **Secrets stay server-side.** Private API keys (Vapi private key, Anthropic key)
  live only in Supabase Edge Function secrets, never in the frontend or in chat. The
  anon key / public Vapi key are the only client-exposable values.
- **Deploy is push-to-`main`.** A green PR built nothing; users see changes only after
  merge to `main`.
- **Branch strategy:** develop on the assigned feature branch; never push to a
  different branch without explicit permission. `git push -u origin <branch>` with
  exponential backoff (2/4/8/16s) on network errors only.
- **Force-push is denied** by the auto-mode classifier. Reconcile a branch that
  diverged from squash-merges with the `git merge -s ours` approach, not `--force`.
- **Parallel work:** batch independent tool calls / fan out sub-agents in one message
  rather than serializing.
- Match the surrounding code's style; keep edge functions self-contained (esm.sh
  imports, inline CORS helper, `Deno.serve`).

---

## Gotchas

- **MCP servers attach only at session start** — `claude mcp add` mid-session won't
  surface the tools; restart to use them.
- **Vapi private vs public key** — "Invalid Key" usually means the public key is in
  `VAPI_API_KEY` where the private one belongs.
- **`vapi-webhook` GET must return `{"ok":true}`** — `{"error":"Method not allowed"}`
  means `vapi-call`'s code was deployed under it by mistake.
- **AI-call buttons** appear only when a screening is past `draft` (after Approve) and
  `!demoMode`.
- **US phones only** — `e164()` normalizes 10/11-digit US numbers; no phone → buttons
  disabled.

---

## Related docs
- `CLAUDE_SESSION_HANDOFF.md` — live status of the AI-screening / Vapi workstream and
  the ordered next-steps (edge-function deploys).
- `README.md` — facility-coverage framing + local setup.
- `EXECUTIVE_BRIEFING.md` — product scope / roadmap framing.
- `supabase/functions/VAPI_SETUP.md`, `INTEGRATIONS_SETUP.md` — integration setup.
