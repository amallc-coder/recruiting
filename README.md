# Clinilytics ATS

An internal platform for the recruiting team to track **clinical/provider staffing
across skilled-nursing facilities** — facility coverage needs (Have/Need by role)
and the candidate recruiting + onboarding pipeline.

Each recruiter signs in and sees **only the facilities, needs, and candidates in
their assigned regions**; **admins** see everything with full dashboards. All data
lives in the cloud (Supabase) — nothing critical is stored in the browser — with
backups and built-in CSV export.

- **Frontend:** React + TypeScript + Tailwind, hosted free on **GitHub Pages**.
- **Backend:** **Supabase** (Postgres database + authentication + Row Level Security).
- **Segmentation & security:** enforced in the database, not just hidden in the UI.

---

## The model (learned from the team's spreadsheets)

```
Facility (region, portfolio, census)
   └── Coverage Needs   →  Have / Need per role (LPN, MA, NP, PA, MD, Psych NP, Wound)
   └── Candidates       →  pipeline: Sourced → Interview → Offer → Accepted →
                           Background Sent → Cleared → Welcome Call →
                           Onboarding/Training → Active  (+ Declined / No Response)
```

- **Facilities** are grouped by **division** (Missouri / Kansas, Ohio), **region**,
  and **portfolio** (Embassy, AMA LTC, Divine, Lions 10, Tranquility, Reliant Homes).
- **Recruiters are assigned regions**; they only see data inside their territory.
- Candidates carry the **onboarding detail** the team tracks today: background
  sent/cleared dates, welcome-call completion, and start date.

---

## How segmentation works (the important part)

A GitHub Pages site is static — its *code* is public, but your *data* is not.
Data is protected by Supabase **Row Level Security (RLS)**: every query is filtered
by the database based on who is logged in.

- **Recruiters** see/edit facilities, needs, and candidates **in their assigned
  regions** (plus any candidate assigned directly to them).
- **Admins** see and manage everything, and get team-wide dashboards.

Enforced in the database, so a recruiter cannot see another region's data even by
tampering with the browser. The two Supabase values shipped in the frontend
(`URL` + `anon key`) are **designed to be public** — they grant nothing without a
valid login.

---

## Try it now — local workspace (no setup)

On the login screen, click **"Start in local mode."** The **full app** runs in
your browser with the real facility list and a coverage baseline preloaded, and a
clean slate for candidates. Everything you enter saves to this browser.

When you're ready to go live, click **"Export to Supabase"** in the top banner —
it downloads a `.sql` file with all your facilities, coverage needs, and
candidates. After you create your Supabase project and run `schema.sql`, run that
exported file in the SQL Editor and your data is in the cloud. (Don't also run
`seed.sql` — the export already contains your facilities.)

> Local mode lives only on one device and isn't shared or backed up — it's for
> getting started. Supabase is what makes it a shared, multi-user, cloud system.

---

## One-time setup (go live with Supabase)

### 1. Create the Supabase project
Go to <https://supabase.com> → sign up (free) → **New project**. Set a strong
database password and wait ~2 minutes.

### 2. Create the database
In Supabase: **SQL Editor → New query**, paste all of
[`supabase/schema.sql`](supabase/schema.sql), and **Run**. (Safe to re-run.)

*(Optional, recommended)* Then run [`supabase/seed.sql`](supabase/seed.sql) to
pre-load the facilities/regions/census from the existing spreadsheets, and
[`supabase/seed_coverage.sql`](supabase/seed_coverage.sql) for an approximate
Have/Need starting baseline (verify and adjust in the app).

### 3. Get your API keys
Supabase → **Project Settings → API**: copy the **Project URL** and the
**anon / public** key.

### 4. Connect the deployed site (GitHub Pages)
1. GitHub repo → **Settings → Secrets and variables → Actions → Variables tab →
   New repository variable**. Add two **variables** (not secrets):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
2. Repo → **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. Pushes to `main` auto-deploy (see `.github/workflows/deploy.yml`). Site URL:
   `https://<your-org>.github.io/recruiting/`.

> If the repo isn't named `recruiting`, set a `VITE_BASE` variable to
> `/<repo-name>/`, or change `base` in `vite.config.ts`.

### 5. Create users & assign regions
- **Preset super-admin:** `npatel@amadministrators.com` becomes admin
  automatically on first sign-in (configured in `schema.sql`). The first user to
  sign in is also made admin as a bootstrap.
- **Invite teammates by email:** on the **Team → Invite teammate** screen, enter
  an email, role, and regions — they get a link to set their own password.
  Requires the `invite-user` Edge Function (see
  [`docs/setup-auth-and-sync.md`](docs/setup-auth-and-sync.md)).
- **Or add users manually:** Supabase → Authentication → Users → Add user, then
  set role/regions on the Team screen.

### 6. (Optional) One-click SharePoint sync
A **Sync SharePoint** button can pull candidates straight from the team's Excel
file via Microsoft Graph — de-duplicated, newest-wins. Needs an Entra app
registration and a tabular worksheet; full setup in
[`docs/setup-auth-and-sync.md`](docs/setup-auth-and-sync.md).

---

## Running locally

```bash
npm install
cp .env.example .env      # fill in your Supabase URL + anon key
npm run dev               # http://localhost:5173
```

`npm run build` produces the production bundle in `dist/`; `npm run lint` type-checks.

---

## What's in the app

| Area | Recruiter | Admin |
|------|-----------|-------|
| **Dashboard** | KPIs for their territory: open needs, premium gaps, pipeline, hires; charts | Team-wide: needs by role/region, **pipeline by recruiter** |
| **Facilities & Needs** | Facilities in their regions; edit Have/Need coverage by role | All facilities; create/delete |
| **Facility detail** | Coverage editor (Have/Need/priority/current provider) + candidates there | same |
| **Candidates** | Pipeline as a **table or Kanban board**; stages, onboarding fields, **hiring-handoff checklist**, résumé text | All candidates; reassign recruiter |
| **AI Matching** | Pick an open position → ranked candidate matches with scores, strengths, and gaps | same |
| **Team** | — | Manage roles + assign recruiter regions |
| **Export** | CSV of their data | CSV of everything |

**AI candidate matching.** On the **AI Matching** screen, pick an open position
(a role with Need ≥ 1 on a facility), describe its requirements, and the app ranks
candidates by fit — with a 0–100 score, strengths, and gaps. It runs a built-in
heuristic offline (works in local mode immediately), and automatically upgrades to
**Claude (Opus 4.8)** scoring when the `ai-match` Edge Function is deployed with an
`ANTHROPIC_API_KEY` (the key stays server-side). See
[`docs/setup-auth-and-sync.md`](docs/setup-auth-and-sync.md).

Every candidate stage change is logged automatically in `candidate_stage_history`
for audit and time-in-stage reporting.

**Hiring-handoff checklists** are built into each candidate, following the team's
documented flows — LPN/MA (Recruiter → Tonja onboarding → Corby welcome call →
loop Amber) and NP/PA (Recruiter screen → packet to Kiyara cc Rob → start date to
Corby → welcome call). The candidate list shows each person's checklist progress.

---

## Data redundancy / backups

- **Primary store:** Supabase Postgres (durable, cloud — not the browser).
- **Backups:** Supabase Database → Backups (point-in-time / daily).
- **Independent copies:** every list has an **Export** button (CSV snapshot).
- **History table:** pipeline moves are logged automatically.

---

## Data model

- `profiles` — users (admin/recruiter) + active flag.
- `recruiter_regions` — which regions each recruiter covers (drives segmentation).
- `facilities` — name, division, region, portfolio, location, census, contact.
- `coverage_needs` — Have/Need per role per facility, priority, current provider.
- `candidates` — name, role, contact, target facility/region, recruiter, stage,
  background sent/cleared, welcome call, start date.
- `candidate_stage_history` — automatic audit trail of pipeline moves.

---

## Roadmap / open items

- Refine portfolio mapping and verify the seeded Have/Need numbers.
- Optional: Microsoft 365 SSO, resume/document uploads (Supabase Storage),
  email notifications, and time-to-fill / time-in-stage reporting.
