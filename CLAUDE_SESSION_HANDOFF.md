# Clinilytics ATS — Session Handoff

> Written for an engineer (or fresh Claude Code session) picking this up cold.
> Contains **no secrets** — only environment-variable *names*. Last updated by the
> session working on AI screening + Vapi voice calling.

---

## 1. OBJECTIVE

Clinilytics ATS is a production healthcare-staffing applicant tracking system for
**American Medical Administrators**, hosted on **GitHub Pages** (static React/Vite
SPA) with a **Supabase** backend (Postgres + Auth + RLS + Edge Functions). The
current workstream adds an **in-platform AI screening module**: from a candidate's
résumé + job + opening, Claude generates a screening questionnaire; a recruiter
approves it; the candidate is screened **by an AI voice agent over the phone (Vapi)**
or by text; the transcript returns automatically, Claude analyzes it (summary / fit
score / flags), and the result is folded back into **job↔candidate matching** plus a
two-way **communication log**.

---

## 2. CURRENT STATE

**Branch:** all work is on `claude/github-pages-recruiting-tracker-idpuor` (this is
the mandated dev branch — never push elsewhere without explicit permission). It has
been merged to `main` via PRs **#24–#27**. Deploy to GitHub Pages runs **only on push
to `main`** (`.github/workflows/deploy.yml`); CI does **not** run on PRs.

### Done (code complete, in repo, merged to main)
- **AI screening generate/analyze** — `supabase/functions/ai-screen/index.ts`
  (deployed, v1). Actions: `generate` (questionnaire from résumé+job) and `analyze`
  (responses → summary/score/flags/recommendation/strengths/concerns).
- **Vapi outbound call/SMS** — `supabase/functions/vapi-call/index.ts`. Places a
  fully-agentic screening call (transient inline assistant) or sends an SMS using the
  recruiter-approved questions. Latest code includes: named "Jordan" intro,
  `firstMessageMode: 'assistant-waits-for-user'` (don't talk before answered),
  AI/recording disclosure + consent, no-interruption speaking plans, configurable
  voice via `VAPI_VOICE_ID`/`VAPI_VOICE_PROVIDER`, and anon-key headers on the
  webhook `server` object so transcripts post back regardless of the Verify-JWT
  toggle.
- **Vapi webhook (transcript return)** — `supabase/functions/vapi-webhook/index.ts`
  (PUBLIC, deploy with `--no-verify-jwt`). On `end-of-call-report`: stores transcript,
  runs Claude `analyze()`, **extracts a per-question answer for each question and
  writes `screening.responses`** (so the UI answer boxes fill), logs inbound comms,
  and refreshes `candidates.screening_summary`.
- **Frontend Engage panel** — `src/components/CandidateEngage.tsx`. ScreeningTab +
  CommsTab; generate → approve → AI call / Text → analyze; answer boxes resync on
  reload via a `useEffect` keyed on `screening.updated_at`; surfaces real edge-function
  error bodies (`error.context` Response → `.json()`).
- **Matching feedback loop** — `src/lib/match.ts` `candidateMatchText()` blends
  `resume_text` + `screening_summary` into both the heuristic tokens and the AI payload.
- **Reusable theme** — `clinilytics-theme.css` (repo root) — standalone,
  framework-agnostic CSS mirroring the app's design system (delivered to the user for
  reuse on other sites).
- **Schema** — `supabase/schema.sql` includes `screenings` + `communications` DDL.

### In progress / blocked
- **Edge-function (re)deploys are the only thing left.** The running session that
  built this could **not** deploy because the Supabase MCP server was not attached to
  it (an MCP server only loads on a *fresh* Claude Code session start). The code is
  final in the repo; it just needs to be pushed to Supabase. See §6.

### Not started
- **`ai-match` is written but never deployed** — `supabase/functions/ai-match/index.ts`
  exists; live matching currently uses the heuristic fallback in `src/lib/match.ts`.
  Deploy it to enable Claude-powered matching.
- Real recruiter logins, integration OAuth credentials, SharePoint sync — operational
  config, user-side (see §6).

---

## 3. KEY DECISIONS (do not re-litigate)

- **Static SPA on GitHub Pages.** HashRouter, Vite `base: '/recruiting/'`. No SSR.
  All privileged logic lives in Supabase Edge Functions, never the client.
- **Deploy on push to `main` only.** PRs intentionally do not trigger CI. To ship,
  changes must land on `main`.
- **Vapi chosen as the voice vendor** — lowest-integration option (bundled phone
  numbers, transient inline assistants, server-side REST). Decided after researching
  "easiest vendor with little to no involvement."
- **Transient (inline) Vapi assistant**, not a persisted dashboard assistant — the
  call function builds the assistant config per call so the approved questions and
  candidate/job context are injected fresh. Voice is **env-configurable** so the
  recruiter can change it without a code change.
- **`firstMessageMode: 'assistant-waits-for-user'`** plus `startSpeakingPlan` /
  `stopSpeakingPlan` tuning — deliberately chosen to stop the agent talking before the
  call connects and to stop it interrupting the candidate. Don't revert these.
- **Webhook does the answer extraction** (not the client). `analyze()`'s schema
  includes an `answers: [{question_id, answer}]` array; the webhook maps those back
  onto the question ids and writes `screening.responses`. This is why the answer boxes
  fill automatically.
- **`recruiter-admin` hardening is intentional security — DO NOT REVERT.** It rejects
  placeholder/`.invalid` emails and confines email updates to `role==='recruiter'`
  accounts.
- **Key separation / no secrets to the frontend.** The Vapi **private** key lives only
  in Supabase secrets; the public key is the only thing that may appear client-side.
  Anthropic key is server-only.
- **Demo mode** (`demoClient`, localStorage mock) lacks `.functions`; `engage.ts`
  guards every `functions.invoke` with `if (!demoMode)` and has local fallbacks. Keep
  that guard when adding function calls.
- **Model is `claude-opus-4-8`** everywhere Claude is called. Never put that model id
  into commits, PR text, code comments, or any pushed artifact — chat replies only.

---

## 4. INTEGRATIONS & CONFIG

### Supabase
- Project ref `pcpkhdfgmjrzvwfkcznn`; functions base URL
  `https://pcpkhdfgmjrzvwfkcznn.supabase.co/functions/v1/...`. Anon key is baked into
  `src/lib/supabase.ts` (public by design).
- **Edge function secrets** (Supabase → Edge Functions → Secrets). Names only:
  - `ANTHROPIC_API_KEY` — set ✅ (used by ai-screen, vapi-webhook, ai-match).
  - `VAPI_API_KEY` — **private** Vapi key. Set ✅.
  - `VAPI_PHONE_NUMBER_ID` — caller-ID number id. Set ✅.
  - `VAPI_VOICE_ID` — e.g. `Clara`. **NOT yet set** — defaults to `Elliot`.
  - `VAPI_VOICE_PROVIDER` — e.g. `vapi` / `11labs` / `playht`. Optional; default `vapi`.
  - `VAPI_WEBHOOK_SECRET` — optional; if set, also set the assistant `server.secret`.
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — provided by the
    platform to functions.
- **Verify-JWT:** `vapi-webhook` must be deployed `--no-verify-jwt` (Vapi posts to it
  unauthenticated). All other functions keep JWT verification on.

### Vapi
- Account has a provisioned phone number (caller ID). Private key in Supabase secrets.
- The **public** key was pasted in chat during setup — recommend **rotating** it as
  hygiene once everything works.
- The call function registers the webhook URL automatically via the assistant `server`
  object — no manual webhook registration in the Vapi dashboard is needed for calls.

### GitHub
- GitHub MCP is **restricted to `amallc-coder/recruiting` only**. Do not touch other
  repos. (Note: remote-execution scope string is `amallc-coder/recruiting`.)
- Create PRs as **draft**. CI runs on push to `main`, not on PRs.

---

## 5. CONVENTIONS IN FORCE

- **Branch strategy:** develop only on `claude/github-pages-recruiting-tracker-idpuor`;
  create it locally if missing; never push to another branch without explicit
  permission. `git push -u origin <branch>` with exponential-backoff retry (2/4/8/16s)
  on network errors only.
- **Force-push is denied** by the auto-mode classifier. To reconcile a branch that has
  diverged from squash-merges, use the `git merge -s ours` approach: reset to
  origin/main, cherry-pick new commits, `git merge -s ours` the remote branch, then
  fast-forward push. Do **not** attempt `push --force`.
- **RLS pattern** on owned rows: `is_admin() OR recruiter_id = auth.uid() OR
  created_by = auth.uid()`. Edge functions re-check ownership server-side before acting.
- **Key separation:** secrets are write-only / server-only; never echo a private key
  back to the user or into the frontend.
- **Claude calls:** `@anthropic-ai/sdk@0.70.0` from esm.sh, model `claude-opus-4-8`,
  structured output via `output_config: { format: { type: 'json_schema', schema } }`.
- **Parallel sub-agent orchestration:** when work decomposes into independent units,
  fan out concurrent sub-agents / batch independent tool calls in a single message
  rather than serializing them.
- **Model id hygiene:** `claude-opus-4-8` never appears in commits, PRs, code, or any
  pushed artifact.

---

## 6. OPEN ITEMS / NEXT STEPS (ordered — start here)

These all require Supabase access. If you are a fresh Claude Code session, the
Supabase MCP tools (`mcp__Supabase__deploy_edge_function`, `...get_logs`,
`...execute_sql`, etc.) should now be attached — load them via ToolSearch first. If
they are still not present, the user must do the dashboard steps manually.

1. **Deploy `vapi-webhook`** with the latest code (`--no-verify-jwt`). Verify a
   browser GET to `https://pcpkhdfgmjrzvwfkcznn.supabase.co/functions/v1/vapi-webhook`
   returns `{"ok":true}` (NOT `{"error":"Method not allowed"}` — that string means the
   *call* function's code is wrongly deployed under the webhook; see §7).
2. **Deploy `vapi-call`** with the latest code (wait-for-answer, configurable voice,
   anon-key headers, disclosure, named intro).
3. **Set secret `VAPI_VOICE_ID=Clara`** (add `VAPI_VOICE_PROVIDER` if Clara isn't a
   native Vapi voice).
4. **Test one live call** end-to-end and confirm: agent waits for the candidate to
   answer; uses the Clara voice; transcript returns; **each answer box populates**;
   analysis (summary/score/flags) appears; inbound + outbound communications are logged.
5. **Deploy `ai-match`** so live matching uses Claude instead of the heuristic
   fallback. Confirm `src/lib/match.ts` / `src/lib/recruiterMatch.ts` invoke it only
   when `!demoMode`.
6. **Operational (user-side):** give real recruiters logins (Team admin → set their
   emails; remember recruiter-admin rejects placeholder/`.invalid` emails); configure
   integration OAuth apps (`integration-oauth`); set up SharePoint sync
   (`sync-sharepoint`).
7. **Hygiene:** rotate the Vapi public key that was shared in chat.

---

## 7. GOTCHAS

- **The "Method not allowed" bug.** During setup the *call* function's code was once
  pasted into the *webhook* function in the dashboard. Symptom: all Vapi POSTs to the
  webhook returned 401 and a browser GET returned `{"error":"Method not allowed"}`
  (that 405 string is `vapi-call`'s signature, not the webhook's). Always sanity-check
  each function's deployed code matches its file. Correct webhook GET response is
  `{"ok":true}`.
- **MCP servers attach only at session start.** A `claude mcp add` mid-session does
  **not** make the tools appear in the running session. If Supabase tools are missing,
  restart the session. This blocked all deploys in the prior session.
- **CI doesn't run on PRs** — only on push to `main`. A green PR means nothing was
  built; the user sees changes only after merge to `main`.
- **Branch diverges from squash-merges.** Every PR merge squashes, so the dev branch's
  history diverges from `main`. Reconcile with `git merge -s ours` (see §5) — never
  force-push (it's classifier-denied).
- **Vapi private vs public key.** "Invalid Key" from Vapi almost always means the
  public key is in `VAPI_API_KEY` where the private key belongs (or vice-versa). The
  call REST API needs the **private** key.
- **demoClient has no `.functions`.** Any new `functions.invoke` must be guarded by
  `if (!demoMode)` or it throws in demo mode.
- **Call/answer-box buttons** only show when a screening is **not** `draft`
  (`!demoMode && screening.status !== 'draft'`) — i.e. after Approve. If a user "can't
  see the AI call option," check the screening status first.
- **US phone numbers only** — `e164()` normalizes 10/11-digit US numbers; candidates
  without a valid phone get the call/text buttons disabled.

---

## 8. FILE MAP

### Edge functions (`supabase/functions/`)
- `ai-screen/index.ts` — generate questionnaire + analyze responses (Claude). Deployed.
- `vapi-call/index.ts` — place agentic screening call / SMS via Vapi. **Redeploy.**
- `vapi-webhook/index.ts` — PUBLIC; receive transcript, analyze, fill answers, log,
  refresh matching context. **Redeploy `--no-verify-jwt`.**
- `ai-match/index.ts` — Claude-powered job↔candidate matching. **Never deployed.**
- `ai-role/index.ts` — AI assist for role/job authoring.
- `recruiter-admin/index.ts` — admin user management; **security-hardened, do not
  revert.**
- `recruiter-upsert/index.ts`, `invite-user/index.ts` — recruiter account provisioning.
- `integration-oauth/`, `integration-sync/`, `integration-webhook/`,
  `sync-sharepoint/` — external-integration plumbing (OAuth, sync, inbound webhooks).
- `_shared/` — shared helpers (CORS, clients).
- `VAPI_SETUP.md` — Vapi setup + flow guide.
- `INTEGRATIONS_SETUP.md` — integrations setup guide.

### Frontend (`src/`)
- `components/CandidateEngage.tsx` — Engage modal: ScreeningTab + CommsTab; the whole
  screening UX (generate/approve/call/text/analyze, answer boxes, comms log).
- `components/Layout.tsx`, `ProtectedRoute.tsx`, `Combobox.tsx`, `ui.tsx` — shell,
  auth gate, shared UI.
- `lib/engage.ts` — screening + comms client API (generate/analyze/create/update/list,
  logCommunication, refreshCandidateContext, completeAndAnalyze); demo-mode fallbacks.
- `lib/match.ts` — heuristic + AI matching; `candidateMatchText()` blends resume +
  screening summary.
- `lib/recruiterMatch.ts` — recruiter-side matching.
- `lib/supabase.ts` — Supabase client (anon key baked in) + `demoClient` mock +
  `demoMode` flag.
- `lib/types.ts` — Screening, ScreeningQuestion, ScreeningResponse, ScreeningFlag,
  Communication; candidate `screening_summary` / `last_screened_at`.
- `lib/ats.ts`, `analytics.ts`, `positions.ts`, `masterData.ts`, `geo.ts`,
  `export.ts`, `importXlsx.ts`, `integrations.ts`, `cloudSeed.ts`, `demo.ts`,
  `positionsSeed.ts` — domain data, analytics, import/export, seeds.

### Other
- `supabase/schema.sql` — full DB schema incl. `screenings` + `communications`.
- `clinilytics-theme.css` — standalone reusable theme (palette, fonts, components).
- `.github/workflows/deploy.yml` — GitHub Pages deploy, push-to-`main` only.
