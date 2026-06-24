-- =============================================================================
-- Recruiting Tracker — database schema
-- =============================================================================
-- Run this once in your Supabase project:
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- It is safe to re-run: every object uses IF NOT EXISTS / CREATE OR REPLACE or
-- is dropped-and-recreated. No data is deleted on re-run.
--
-- Segmentation model
--   * Every user has a row in public.profiles with a role: 'admin' or 'recruiter'.
--   * Admins see and manage everything.
--   * Recruiters see/manage only the openings + candidates assigned to them.
--   This is enforced by Row Level Security (RLS) IN THE DATABASE, so it holds
--   even if someone bypasses the UI.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES — one row per user, linked to Supabase Auth
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text not null default '',
  role        text not null default 'recruiter' check (role in ('admin', 'recruiter')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Helper: is the current user an admin? SECURITY DEFINER avoids RLS recursion
-- when policies on other tables need to check the caller's role.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- Auto-create a profile whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    -- First user to ever sign up becomes admin; everyone else a recruiter.
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'recruiter' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. JOB OPENINGS
-- ---------------------------------------------------------------------------
create table if not exists public.job_openings (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  department            text,
  client               text,                 -- the hiring company/client, if agency-style
  location              text,
  employment_type       text,                -- Full-time, Part-time, Contract, Temp
  status                text not null default 'open'
                          check (status in ('open','on_hold','filled','closed','cancelled')),
  priority              text default 'medium' check (priority in ('low','medium','high','urgent')),
  openings_count        int not null default 1,
  hiring_manager        text,
  salary_min            numeric,
  salary_max            numeric,
  description           text,
  notes                 text,
  assigned_recruiter_id uuid references public.profiles(id) on delete set null,
  date_opened           date not null default current_date,
  target_fill_date      date,
  date_filled           date,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_openings_recruiter on public.job_openings(assigned_recruiter_id);
create index if not exists idx_openings_status    on public.job_openings(status);

-- ---------------------------------------------------------------------------
-- 3. CANDIDATES
-- ---------------------------------------------------------------------------
create table if not exists public.candidates (
  id            uuid primary key default gen_random_uuid(),
  opening_id    uuid references public.job_openings(id) on delete set null,
  full_name     text not null,
  email         text,
  phone         text,
  location      text,
  source        text,                          -- LinkedIn, Referral, Job Board, etc.
  current_stage text not null default 'applied'
                  check (current_stage in
                    ('applied','screening','interview','offer','hired','rejected','withdrawn')),
  status        text not null default 'active' check (status in ('active','inactive')),
  resume_url    text,
  linkedin_url  text,
  expected_salary numeric,
  rating        int check (rating between 1 and 5),
  notes         text,
  recruiter_id  uuid references public.profiles(id) on delete set null,
  applied_date  date not null default current_date,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_candidates_recruiter on public.candidates(recruiter_id);
create index if not exists idx_candidates_opening   on public.candidates(opening_id);
create index if not exists idx_candidates_stage     on public.candidates(current_stage);

-- ---------------------------------------------------------------------------
-- 4. STAGE HISTORY — every pipeline move, for time-in-stage metrics + audit
-- ---------------------------------------------------------------------------
create table if not exists public.candidate_stage_history (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  from_stage   text,
  to_stage     text not null,
  note         text,
  changed_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_stage_history_candidate on public.candidate_stage_history(candidate_id);

-- Record a history row automatically whenever a candidate's stage changes.
create or replace function public.log_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.candidate_stage_history (candidate_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.current_stage, auth.uid());
  elsif (new.current_stage is distinct from old.current_stage) then
    insert into public.candidate_stage_history (candidate_id, from_stage, to_stage, changed_by)
    values (new.id, old.current_stage, new.current_stage, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_stage_change on public.candidates;
create trigger trg_log_stage_change
  after insert or update on public.candidates
  for each row execute function public.log_stage_change();

-- ---------------------------------------------------------------------------
-- 5. updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_openings on public.job_openings;
create trigger trg_touch_openings before update on public.job_openings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_candidates on public.candidates;
create trigger trg_touch_candidates before update on public.candidates
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- 6. ROW LEVEL SECURITY
-- ===========================================================================
alter table public.profiles                enable row level security;
alter table public.job_openings            enable row level security;
alter table public.candidates              enable row level security;
alter table public.candidate_stage_history enable row level security;

-- ---- profiles -------------------------------------------------------------
drop policy if exists "profiles: read own or admin reads all" on public.profiles;
create policy "profiles: read own or admin reads all" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: user updates own" on public.profiles;
create policy "profiles: user updates own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles: admin updates any" on public.profiles;
create policy "profiles: admin updates any" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "profiles: admin inserts" on public.profiles;
create policy "profiles: admin inserts" on public.profiles
  for insert with check (public.is_admin() or id = auth.uid());

-- ---- job_openings ---------------------------------------------------------
drop policy if exists "openings: read assigned or admin" on public.job_openings;
create policy "openings: read assigned or admin" on public.job_openings
  for select using (assigned_recruiter_id = auth.uid() or public.is_admin());

drop policy if exists "openings: insert admin or self-assign" on public.job_openings;
create policy "openings: insert admin or self-assign" on public.job_openings
  for insert with check (public.is_admin() or assigned_recruiter_id = auth.uid());

drop policy if exists "openings: update assigned or admin" on public.job_openings;
create policy "openings: update assigned or admin" on public.job_openings
  for update using (assigned_recruiter_id = auth.uid() or public.is_admin())
  with check (assigned_recruiter_id = auth.uid() or public.is_admin());

drop policy if exists "openings: delete admin only" on public.job_openings;
create policy "openings: delete admin only" on public.job_openings
  for delete using (public.is_admin());

-- ---- candidates -----------------------------------------------------------
drop policy if exists "candidates: read own or admin" on public.candidates;
create policy "candidates: read own or admin" on public.candidates
  for select using (recruiter_id = auth.uid() or public.is_admin());

drop policy if exists "candidates: insert own or admin" on public.candidates;
create policy "candidates: insert own or admin" on public.candidates
  for insert with check (public.is_admin() or recruiter_id = auth.uid());

drop policy if exists "candidates: update own or admin" on public.candidates;
create policy "candidates: update own or admin" on public.candidates
  for update using (recruiter_id = auth.uid() or public.is_admin())
  with check (recruiter_id = auth.uid() or public.is_admin());

drop policy if exists "candidates: delete own or admin" on public.candidates;
create policy "candidates: delete own or admin" on public.candidates
  for delete using (recruiter_id = auth.uid() or public.is_admin());

-- ---- candidate_stage_history (read-only to users; written by triggers) ----
drop policy if exists "history: read if candidate visible" on public.candidate_stage_history;
create policy "history: read if candidate visible" on public.candidate_stage_history
  for select using (
    public.is_admin() or exists (
      select 1 from public.candidates c
      where c.id = candidate_id and c.recruiter_id = auth.uid()
    )
  );

-- =============================================================================
-- Done. Next: create your users in Supabase Auth, then the first sign-in
-- becomes admin automatically (see README). Promote/demote others from the
-- in-app Admin -> Team screen, or with:
--   update public.profiles set role = 'admin' where email = 'someone@example.com';
-- =============================================================================
