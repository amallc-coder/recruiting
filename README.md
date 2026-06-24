# Recruiting Tracker

An internal platform for the recruiting team to track job openings and candidates.
Each recruiter signs in and sees **only their own** openings and candidates;
**admins** see everything with full dashboards. All data lives in the cloud
(Supabase) — nothing critical is stored in the browser — with built-in CSV
export so you always have an independent backup.

- **Frontend:** React + TypeScript + Tailwind, hosted free on **GitHub Pages**.
- **Backend:** **Supabase** (Postgres database + authentication + Row Level Security).
- **Segmentation & security:** enforced in the database, not just hidden in the UI.

---

## How segmentation works (the important part)

A GitHub Pages site is static — its *code* is public, but your *data* is not.
Data is protected by Supabase **Row Level Security (RLS)**: every query the app
makes is filtered by the database based on who is logged in.

- **Recruiters** can read/write only the openings and candidates assigned to them.
- **Admins** can see and manage everything, and get team-wide dashboards.

Because this is enforced in the database, a recruiter cannot see another
recruiter's data even if they tamper with the browser. The two Supabase values
shipped in the frontend (`URL` + `anon key`) are **designed to be public** — they
grant nothing on their own without a valid login.

---

## One-time setup

### 1. Create the Supabase project
1. Go to <https://supabase.com> → sign up (free) → **New project**.
2. Pick a name and a strong database password. Wait ~2 minutes for it to provision.

### 2. Create the database tables
1. In Supabase: **SQL Editor → New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo, copy all of it,
   paste, and click **Run**. This creates the tables, the access rules, and the
   automatic history/audit triggers. It's safe to re-run.

### 3. Get your API keys
1. Supabase: **Project Settings → API**.
2. Copy the **Project URL** and the **anon / public** key.

### 4. Connect the deployed site (GitHub Pages)
1. In this GitHub repo: **Settings → Secrets and variables → Actions → Variables tab → New repository variable**. Add two **variables** (not secrets):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
2. In this repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. The site deploys automatically on every push to `main` (see
   `.github/workflows/deploy.yml`). The URL will be
   `https://<your-org>.github.io/recruiting/`.

> If your repo isn't named `recruiting`, set a `VITE_BASE` variable to
> `/<repo-name>/`, or change `base` in `vite.config.ts`.

### 5. Create user accounts
1. Supabase: **Authentication → Users → Add user**. Enter email + a temporary
   password and check **Auto Confirm User**.
2. The **first** person to sign in automatically becomes an **admin**.
3. Everyone else starts as a **recruiter**. Promote/demote and enable/disable
   people from the in-app **Team** screen (admins only).

That's it — share the site URL with the team and they sign in with their email
and password.

---

## Running locally (for development)

```bash
npm install
cp .env.example .env      # then fill in your Supabase URL + anon key
npm run dev               # http://localhost:5173
```

`npm run build` produces the production bundle in `dist/`. `npm run lint` type-checks.

---

## What's in the app

| Area | Recruiter | Admin |
|------|-----------|-------|
| **Dashboard** | Their own KPIs + pipeline chart | Team-wide KPIs, pipeline, openings-by-status, **workload by recruiter** |
| **Job Openings** | Their assigned openings (add/edit) | All openings, assign to any recruiter, delete |
| **Candidates** | Their candidates, move through stages | All candidates, reassign, delete |
| **Team** | — | Manage roles & access for the whole team |
| **Export** | CSV of their data | CSV of everything |

**Pipeline stages:** Applied → Screening → Interview → Offer → Hired
(plus Rejected / Withdrawn). Every stage change is recorded automatically in
`candidate_stage_history` for audit and time-in-stage reporting.

---

## Data redundancy / backups

- **Primary store:** Supabase Postgres (durable, in the cloud — not the browser).
- **Point-in-time / daily backups:** available in Supabase (Database → Backups).
- **Independent copies:** every list in the app has an **Export** button that
  downloads a CSV — a portable snapshot you can keep outside the system.
- **History table:** pipeline movements are logged automatically, so candidate
  progression is never lost even if a record is later edited.

---

## Data model (current default)

This is a sensible recruiting model that will be **refined to match the team's
two existing spreadsheets** once those are available — field names and dropdown
options can be adjusted without changing the architecture.

- `profiles` — every user, with `role` (admin/recruiter) and active flag.
- `job_openings` — title, client/department, location, status, priority, seats,
  hiring manager, salary range, assigned recruiter, key dates.
- `candidates` — name, contact, source, current stage, rating, linked opening,
  assigned recruiter.
- `candidate_stage_history` — automatic audit trail of pipeline moves.

---

## Roadmap / open items

- Tailor fields and dropdowns to the team's two Excel sheets (pending the files).
- Optional: Microsoft 365 single sign-on, file/resume uploads to Supabase Storage,
  email notifications, and time-to-fill reporting.
