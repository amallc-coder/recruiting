# AI Governance, Fairness & Security — Posture & Gap Report

Clinilytics ATS, prepared for a regulated healthcare buyer. This document maps the
product's AI controls to the obligations a covered employer faces, and lists the
remaining gaps with an owner. The live, always-current view of everything here is
in the app under **Governance** (admin only).

## 1. Principle: AI is assistive, humans decide

Every AI capability in the product is advisory and kept under human oversight. The
high-stakes, person-affecting decisions are **never automated** — they are enforced
as *prohibited* actions in code (`src/lib/v2/agent/policy.ts`) and can only be taken
by a person in the normal UI:

- extending, changing, or accepting an **offer**
- **rejecting** a candidate or marking a **hire**
- changing **compensation**
- deleting records or sending free-form external messages

The agent (Autopilot) classifies every proposed action into `auto` (safe, reversible,
internal), `approval` (outward-facing — runs only on an explicit human click), or
`prohibited` (above). The client re-validates the model's suggested tier against the
policy table and refuses to execute anything prohibited or unrecognized.

## 2. AI system inventory

| System | Purpose | Oversight |
|---|---|---|
| Match scoring (`ai-match`) | Rank/explain candidate↔req fit | Advisory; logged to `ai_decisions` |
| Screening analysis (`ai-screen`) | Summarize screening responses | Human reviews before advancing |
| Fair-market-value comp (`ai-comp`) | Suggest offer ranges (web-grounded) | Human sets the actual offer |
| NL search / command console (`ai-search`, `ai-console`) | Read data in plain language | Read-only; no decisions; audit-logged |
| Autopilot (`ai-autopilot`) | Propose next-best actions toward a goal | Tiered policy; high-stakes actions never automated |

All Claude calls use a single pinned model and structured outputs; edge functions
that interpret/plan (`ai-search`, `ai-console`, `ai-autopilot`) never read or write
business data — they translate only, and the client executes under RLS.

## 3. Regulatory mapping

### EU AI Act (recruitment AI = high-risk, Annex III)
- **Human oversight (Art. 14)** — ✅ prohibited actions never automated; approval-tier gated on a human click.
- **Record-keeping / logging (Art. 12)** — ✅ `ai_decisions` (every decision) + `audit_logs` (every agent action) are timestamped and attributable.
- **Transparency (Art. 13)** — ◑ candidates are told AI assists screening; recruiters see rationales. *Gap: formalize the candidate-facing AI disclosure copy.*
- **Data governance (Art. 10)** — ✅ RLS isolates per org/region; only job-relevant PII stored; no protected-class data collected.

### NYC Local Law 144 (Automated Employment Decision Tools)
- **Bias audit** — ⚠️ the in-app four-fifths report is an early-warning signal over operational segments. *Gap: a compliant independent audit needs voluntary candidate self-ID (EEO) data, which the schema deliberately does not collect today.*
- **Candidate notice (≥10 days)** — ◑ the tool stays assistive (no automated hire/reject, which is what triggers AEDT obligations most directly). *Gap: wire the ≥10-day notice into the careers/application flow if automated scoring is ever made determinative.*

## 4. Fairness monitoring (adverse impact)

The Governance → **Adverse impact** tab computes selection rates (hired ÷ applied)
by group and the **four-fifths impact ratio** against the highest-selecting group,
across operational segments: candidate **source**, **role family**, and **facility
state**. Groups below a minimum sample (25) are excluded from the ratio as noise.

**Limitation (stated prominently in-product):** these are *operational* segments, not
*protected classes*. The system collects no race/gender/age/EEO data. A
legally-defensible adverse-impact audit requires voluntary self-identification data,
stored and analyzed separately under appropriate consent and access controls.

## 5. Security posture

- **Row-Level Security is the boundary**, not the client. The Governance → **Security**
  tab renders a live per-table RLS coverage report via an admin-only `security_posture()`
  function. As of this finalization, **100% of public tables (34/34) have RLS enabled
  with at least one policy.**
- Region/role isolation is enforced by `current_org()`, `is_admin()`, `is_staff()`,
  and region helpers in policy `USING`/`WITH CHECK` clauses.
- Private API keys (Anthropic, Vapi private, Checkr) live only in Edge Function
  secrets; the client holds only the public anon key (safe by RLS design).
- Edge functions require an authenticated caller; public webhooks (`vapi-webhook`)
  are explicitly scoped.

## 6. Integration QA (end-to-end)

Integrations are configured per-org in `integrations` with credentials in
`integration_credentials` (RLS-protected). Status is visible on the Integrations page.

| Integration | Path | Status |
|---|---|---|
| Vapi voice/SMS screening | `vapi-call`, `vapi-webhook` | Deployed; live test needs org Vapi keys |
| Checkr background checks | `checkr-order`, `checkr-webhook` | Deployed; live test needs Checkr keys |
| Calendar / mail OAuth | `integration-oauth`, `_shared/providers.ts` | Framework in place; per-provider creds pending |
| SharePoint sync | `sync-sharepoint` | Deployed; tenant config pending |

*Gap: full e2e runs require live third-party credentials (per-tenant), which are a
customer-onboarding step, not a code gap.*

## 7. Remaining gaps (prioritized)

1. **Candidate-facing AI disclosure + LL144 notice** in the careers/application flow (transparency).
2. **EEO self-ID capture** (optional, consented) to enable a compliant protected-class bias audit, stored separately from hiring data.
3. **Nightly KPI + governance snapshots** (pg_cron) and a scheduled compliance digest/export.
4. **Broaden Autopilot's safe-handler set** beyond `kpi.snapshot` / `screening.draft` as more reversible operations are vetted.
5. **Per-tenant integration credentials** + live e2e validation during onboarding.

Items 1–2 are policy/onboarding decisions for the buyer; 3–5 are incremental
engineering. None block the core posture: AI is assistive, every decision is logged
and overridable, high-stakes actions stay with humans, and data access is enforced by
RLS end-to-end.
