-- =============================================================================
-- Recruiting Tracker — database schema (provider-staffing model)
-- =============================================================================
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (idempotent). Models clinical/provider staffing for skilled-
-- nursing facilities: Facilities -> Coverage Needs (Have/Need by role) ->
-- Candidate recruiting pipeline.
--
-- Segmentation (enforced in the database via Row Level Security):
--   * Admins see/manage everything.
--   * Recruiters see facilities, coverage needs, and candidates in the
--     REGIONS/TERRITORIES assigned to them, plus any candidate assigned to
--     them directly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PROFILES — one row per user, linked to Supabase Auth
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

-- ---------------------------------------------------------------------------
-- RECRUITER TERRITORIES — which regions each recruiter covers
-- ---------------------------------------------------------------------------
create table if not exists public.recruiter_regions (
  recruiter_id uuid not null references public.profiles(id) on delete cascade,
  region       text not null,
  primary key (recruiter_id, region)
);

-- ---------------------------------------------------------------------------
-- FACILITIES — the unit of coverage need
-- ---------------------------------------------------------------------------
create table if not exists public.facilities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  division    text,            -- e.g. 'Missouri / Kansas', 'Ohio'
  region      text,            -- e.g. 'St Louis', 'Columbus', 'NE Ohio'
  portfolio   text,            -- e.g. 'Embassy', 'AMA LTC', 'Divine', 'Lions 10'
  city        text,
  state       text,
  zip         text,
  address     text,
  phone       text,
  fax         text,
  census      int,             -- current patient census
  capacity    int,             -- bed capacity
  active      boolean not null default true,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_facilities_region on public.facilities(region);

-- ---------------------------------------------------------------------------
-- COVERAGE NEEDS — Have / Need by role, per facility
-- ---------------------------------------------------------------------------
create table if not exists public.coverage_needs (
  id                uuid primary key default gen_random_uuid(),
  facility_id       uuid not null references public.facilities(id) on delete cascade,
  role              text not null
                      check (role in ('lpn','ma','np','pa','md','psych_np','wound','rn','tech','admin','ops')),
  have_count        int not null default 0,
  need_count        int not null default 0,
  priority          text not null default 'standard'
                      check (priority in ('standard','premium','urgent')),
  current_provider  text,          -- name(s) of provider(s) currently covering
  description       text,          -- position verbiage / requirements (for AI matching)
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (facility_id, role)
);
create index if not exists idx_coverage_facility on public.coverage_needs(facility_id);

-- ---------------------------------------------------------------------------
-- CANDIDATES — recruiting + onboarding pipeline
-- ---------------------------------------------------------------------------
create table if not exists public.candidates (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  role          text not null default 'lpn'
                  check (role in ('lpn','ma','np','pa','md','psych_np','wound','rn','tech','admin','ops')),
  email         text,
  phone         text,
  source        text,
  facility_id   uuid references public.facilities(id) on delete set null,
  region        text,            -- denormalized for territory-based access
  recruiter_id  uuid references public.profiles(id) on delete set null,
  current_stage text not null default 'sourced'
                  check (current_stage in
                    ('sourced','interview','offer','accepted','background',
                     'cleared','welcome_call','training','active',
                     'declined','no_response')),
  -- onboarding detail mirrored from the spreadsheets
  background_sent_date    date,
  background_cleared_date date,
  welcome_call_done       boolean not null default false,
  start_date              date,
  resume_text   text,          -- pasted resume / profile summary (for AI matching)
  -- per-candidate hiring-handoff checklist; keys map to steps defined in the app
  -- (LPN flow vs NP/PA flow). Stored as { "<step_key>": true } for completed steps.
  checklist     jsonb not null default '{}'::jsonb,
  rating        int check (rating between 1 and 5),
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_candidates_recruiter on public.candidates(recruiter_id);
create index if not exists idx_candidates_region    on public.candidates(region);
create index if not exists idx_candidates_facility  on public.candidates(facility_id);
create index if not exists idx_candidates_stage     on public.candidates(current_stage);

-- For databases created before the checklist column existed.
alter table public.candidates add column if not exists checklist jsonb not null default '{}'::jsonb;
alter table public.candidates add column if not exists resume_text text;
alter table public.coverage_needs add column if not exists description text;

-- SharePoint sync bookkeeping: identify where a record came from and when the
-- source last changed, so repeated pulls de-duplicate and only newer data wins.
alter table public.candidates add column if not exists source_system text;          -- e.g. 'sharepoint'
alter table public.candidates add column if not exists source_key    text;          -- stable natural key from the sheet
alter table public.candidates add column if not exists source_modified timestamptz; -- source row/file last-modified
-- One row per (source, key) => repeated syncs upsert instead of duplicating.
create unique index if not exists uq_candidates_source
  on public.candidates(source_system, source_key)
  where source_system is not null and source_key is not null;

-- ---------------------------------------------------------------------------
-- STAGE HISTORY — audit trail of pipeline moves (auto-written by trigger)
-- ---------------------------------------------------------------------------
create table if not exists public.candidate_stage_history (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  from_stage   text,
  to_stage     text not null,
  changed_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_stage_history_candidate on public.candidate_stage_history(candidate_id);

-- ---------------------------------------------------------------------------
-- POSITIONS — shared catalog of roles (practice / SNF / mgmt / lab / hospital)
-- with AI-generated responsibilities. Reference data: readable by all signed-in
-- users; only admins add/edit.
-- ---------------------------------------------------------------------------
create table if not exists public.positions (
  id               uuid primary key default gen_random_uuid(),
  code             text,
  title            text not null,
  category         text,
  org_types        jsonb not null default '[]'::jsonb,
  rate_min         numeric,
  rate_max         numeric,
  rate_unit        text default 'NA',
  responsibilities jsonb not null default '[]'::jsonb,
  requirements     jsonb not null default '[]'::jsonb,
  keywords         jsonb not null default '[]'::jsonb,
  ai_generated     boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
-- RLS policies for positions are defined below, after is_admin() exists.

-- ===========================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
-- ===========================================================================
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- Positions catalog RLS (defined here, now that is_admin() exists):
-- any signed-in user can read; only admins write.
alter table public.positions enable row level security;
drop policy if exists "positions_read" on public.positions;
create policy "positions_read" on public.positions
  for select using (auth.uid() is not null);
drop policy if exists "positions_admin_write" on public.positions;
create policy "positions_admin_write" on public.positions
  for all using (public.is_admin()) with check (public.is_admin());

-- Does the current user cover this region (or is an admin)?
create or replace function public.covers_region(r text)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_admin() or exists (
    select 1 from public.recruiter_regions
    where recruiter_id = auth.uid() and region = r
  );
$$;

-- Region of a facility (definer-run so callers needn't have facility access).
create or replace function public.facility_region(fid uuid)
returns text language sql security definer set search_path = public stable as $$
  select region from public.facilities where id = fid;
$$;

-- Preset super-admins: these emails always become admin on first sign-in,
-- regardless of order. Add/remove rows to manage who is auto-admin.
create table if not exists public.preset_admins (
  email text primary key
);
insert into public.preset_admins (email) values
  ('npatel@amadministrators.com')
on conflict (email) do nothing;

-- Don't expose the admin email list publicly; only admins can read it.
alter table public.preset_admins enable row level security;
drop policy if exists "preset_admins_admin_only" on public.preset_admins;
create policy "preset_admins_admin_only" on public.preset_admins
  for all using (public.is_admin()) with check (public.is_admin());

-- Assign each new auth user a role:
--   1. a preset super-admin email  -> admin
--   2. the very first user          -> admin (bootstrap)
--   3. a role passed in invite metadata (admin invites set this) -> that role
--   4. otherwise                    -> recruiter
-- NOTE: for (3) to be safe, disable open self-sign-ups in Supabase Auth so the
-- only way to create a user is an admin invite (Authentication -> Providers ->
-- Email -> turn OFF "Allow new users to sign up").
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assigned_role text;
  meta_role text := new.raw_user_meta_data->>'role';
begin
  if exists (select 1 from public.preset_admins where lower(email) = lower(coalesce(new.email, ''))) then
    assigned_role := 'admin';
  elsif (select count(*) from public.profiles) = 0 then
    assigned_role := 'admin';
  elsif meta_role in ('admin', 'recruiter') then
    assigned_role := meta_role;
  else
    assigned_role := 'recruiter';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    assigned_role
  )
  on conflict (id) do nothing;

  -- Apply any regions the inviting admin attached (comma-separated in metadata).
  if new.raw_user_meta_data->>'regions' is not null then
    insert into public.recruiter_regions (recruiter_id, region)
    select new.id, trim(r)
    from unnest(string_to_array(new.raw_user_meta_data->>'regions', ',')) as r
    where trim(r) <> ''
    on conflict do nothing;
  end if;

  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep candidate.region in sync with its facility, and log stage changes.
create or replace function public.candidate_before_save()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.facility_id is not null then
    new.region := public.facility_region(new.facility_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_candidate_region on public.candidates;
create trigger trg_candidate_region
  before insert or update on public.candidates
  for each row execute function public.candidate_before_save();

create or replace function public.log_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
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

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_facilities on public.facilities;
create trigger trg_touch_facilities before update on public.facilities
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_coverage on public.coverage_needs;
create trigger trg_touch_coverage before update on public.coverage_needs
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_candidates on public.candidates;
create trigger trg_touch_candidates before update on public.candidates
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================
alter table public.profiles                enable row level security;
alter table public.recruiter_regions       enable row level security;
alter table public.facilities              enable row level security;
alter table public.coverage_needs          enable row level security;
alter table public.candidates              enable row level security;
alter table public.candidate_stage_history enable row level security;

-- ---- profiles ----
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (public.is_admin() or id = auth.uid());

-- ---- recruiter_regions ----
drop policy if exists "regions_select" on public.recruiter_regions;
create policy "regions_select" on public.recruiter_regions
  for select using (recruiter_id = auth.uid() or public.is_admin());
drop policy if exists "regions_write" on public.recruiter_regions;
create policy "regions_write" on public.recruiter_regions
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- facilities ----
drop policy if exists "facilities_select" on public.facilities;
create policy "facilities_select" on public.facilities
  for select using (public.covers_region(region));
drop policy if exists "facilities_insert" on public.facilities;
create policy "facilities_insert" on public.facilities
  for insert with check (public.is_admin());
drop policy if exists "facilities_update" on public.facilities;
create policy "facilities_update" on public.facilities
  for update using (public.covers_region(region)) with check (public.covers_region(region));
drop policy if exists "facilities_delete" on public.facilities;
create policy "facilities_delete" on public.facilities
  for delete using (public.is_admin());

-- ---- coverage_needs ----
drop policy if exists "coverage_select" on public.coverage_needs;
create policy "coverage_select" on public.coverage_needs
  for select using (public.covers_region(public.facility_region(facility_id)));
drop policy if exists "coverage_write" on public.coverage_needs;
create policy "coverage_write" on public.coverage_needs
  for all using (public.covers_region(public.facility_region(facility_id)))
  with check (public.covers_region(public.facility_region(facility_id)));

-- ---- candidates ----
drop policy if exists "candidates_select" on public.candidates;
create policy "candidates_select" on public.candidates
  for select using (
    public.is_admin() or recruiter_id = auth.uid() or public.covers_region(region)
  );
drop policy if exists "candidates_insert" on public.candidates;
create policy "candidates_insert" on public.candidates
  for insert with check (
    public.is_admin() or recruiter_id = auth.uid() or public.covers_region(region)
  );
drop policy if exists "candidates_update" on public.candidates;
create policy "candidates_update" on public.candidates
  for update using (
    public.is_admin() or recruiter_id = auth.uid() or public.covers_region(region)
  ) with check (
    public.is_admin() or recruiter_id = auth.uid() or public.covers_region(region)
  );
drop policy if exists "candidates_delete" on public.candidates;
create policy "candidates_delete" on public.candidates
  for delete using (
    public.is_admin() or recruiter_id = auth.uid() or public.covers_region(region)
  );

-- ---- candidate_stage_history (read-only; written by trigger) ----
drop policy if exists "history_select" on public.candidate_stage_history;
create policy "history_select" on public.candidate_stage_history
  for select using (
    public.is_admin() or exists (
      select 1 from public.candidates c
      where c.id = candidate_id
        and (c.recruiter_id = auth.uid() or public.covers_region(c.region))
    )
  );

-- =============================================================================
-- ATS EXTENSION — generic company / jobs / applications / analytics
-- =============================================================================
-- Adds the generic Applicant Tracking layer (companies -> jobs -> applications)
-- on top of the provider-staffing core. Forward-looking columns
-- (company_id, assigned_recruiter_id, created_by, updated_by) are included now
-- so the later RBAC-isolation and analytics phases bolt on without a migration.
-- Idempotent: safe to re-run.

-- Widen the role set to support the full RBAC model later. Existing rows keep
-- their role; the app still treats only 'admin' specially for now.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','recruiter','supervisor','hiring_manager','interviewer','viewer'));

-- ---------------------------------------------------------------------------
-- COMPANIES — multi-tenant root (one default company for now)
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
insert into public.companies (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'American Medical Administrators', 'ama')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- JOBS — openings posted by a company
-- ---------------------------------------------------------------------------
create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null default '00000000-0000-0000-0000-000000000001'
                    references public.companies(id) on delete cascade,
  title           text not null,
  department      text,
  location        text,
  employment_type text not null default 'full_time'
                    check (employment_type in ('full_time','part_time','contract','per_diem','temporary','internship')),
  workplace       text not null default 'onsite'
                    check (workplace in ('onsite','hybrid','remote')),
  salary_min      numeric,
  salary_max      numeric,
  salary_unit     text not null default 'year' check (salary_unit in ('year','hour')),
  description      text,
  responsibilities text,
  requirements    text,
  benefits        text,
  hiring_manager_id     uuid references public.profiles(id) on delete set null,
  assigned_recruiter_id uuid references public.profiles(id) on delete set null,
  facility_id     uuid references public.facilities(id) on delete set null,
  role            text check (role in ('lpn','ma','np','pa','md','psych_np','wound','rn','tech','admin','ops')),
  status          text not null default 'draft'
                    check (status in ('draft','published','paused','closed','archived')),
  visibility      text not null default 'public' check (visibility in ('public','internal')),
  slug            text,
  open_date       date,
  close_date      date,
  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_jobs_company   on public.jobs(company_id);
create index if not exists idx_jobs_status     on public.jobs(status);
create index if not exists idx_jobs_recruiter  on public.jobs(assigned_recruiter_id);
create unique index if not exists uq_jobs_slug on public.jobs(slug) where slug is not null;

-- ---------------------------------------------------------------------------
-- APPLICATIONS — a person applying to a job (career page or manual add)
-- ---------------------------------------------------------------------------
create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default '00000000-0000-0000-0000-000000000001'
                  references public.companies(id) on delete cascade,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  candidate_id  uuid references public.candidates(id) on delete set null,
  full_name     text not null,
  email         text,
  phone         text,
  linkedin      text,
  portfolio     text,
  cover_letter  text,
  resume_url    text,
  resume_text   text,
  source        text default 'Career Site',
  custom_answers jsonb not null default '{}'::jsonb,
  stage         text not null default 'sourced',
  assigned_recruiter_id uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_applications_job       on public.applications(job_id);
create index if not exists idx_applications_candidate on public.applications(candidate_id);

-- ---------------------------------------------------------------------------
-- ANALYTICS_EVENTS — immutable event log powering future dashboards
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references public.companies(id) on delete cascade,
  event_type     text not null,
  candidate_id   uuid,
  job_id         uuid,
  application_id uuid,
  user_id        uuid,
  from_stage     text,
  to_stage       text,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_events_company on public.analytics_events(company_id);
create index if not exists idx_events_type    on public.analytics_events(event_type);
create index if not exists idx_events_created on public.analytics_events(created_at);

-- On application insert: auto-create a linked candidate (so the applicant lands
-- in the existing pipeline) and log an immutable event. SECURITY DEFINER so an
-- anonymous career-page submission can create the candidate without broad RLS.
create or replace function public.application_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_candidate_id uuid;
  job_role text;
  job_facility uuid;
  job_recruiter uuid;
begin
  if new.candidate_id is null then
    select role, facility_id, assigned_recruiter_id
      into job_role, job_facility, job_recruiter
      from public.jobs where id = new.job_id;

    insert into public.candidates
      (full_name, role, email, phone, source, facility_id, recruiter_id,
       current_stage, resume_text, created_by)
    values
      (new.full_name, coalesce(job_role, 'lpn'), new.email, new.phone,
       coalesce(new.source, 'Career Site'), job_facility,
       coalesce(new.assigned_recruiter_id, job_recruiter),
       coalesce(new.stage, 'sourced'),
       coalesce(new.resume_text, new.full_name), new.created_by)
    returning id into new_candidate_id;

    update public.applications set candidate_id = new_candidate_id where id = new.id;
  end if;

  insert into public.analytics_events
    (company_id, event_type, candidate_id, job_id, application_id, user_id, to_stage, payload)
  values
    (new.company_id, 'application_submitted',
     coalesce(new.candidate_id, new_candidate_id), new.job_id, new.id, auth.uid(),
     coalesce(new.stage, 'sourced'), jsonb_build_object('source', new.source));
  return new;
end;
$$;
drop trigger if exists trg_application_after_insert on public.applications;
create trigger trg_application_after_insert
  after insert on public.applications
  for each row execute function public.application_after_insert();

-- updated_at touch triggers for the new tables.
drop trigger if exists trg_touch_companies on public.companies;
create trigger trg_touch_companies before update on public.companies
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_jobs on public.jobs;
create trigger trg_touch_jobs before update on public.jobs
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_applications on public.applications;
create trigger trg_touch_applications before update on public.applications
  for each row execute function public.touch_updated_at();

-- ---- RLS for the ATS tables ----
alter table public.companies        enable row level security;
alter table public.jobs             enable row level security;
alter table public.applications     enable row level security;
alter table public.analytics_events enable row level security;

-- companies: any signed-in user reads; only admins write.
drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies
  for select using (auth.uid() is not null);
drop policy if exists "companies_admin" on public.companies;
create policy "companies_admin" on public.companies
  for all using (public.is_admin()) with check (public.is_admin());

-- jobs: the public (incl. anonymous) can read PUBLISHED + PUBLIC jobs for the
-- career page; any signed-in user can browse all jobs (refined in the RBAC
-- phase); admins and the assigned recruiter can write.
drop policy if exists "jobs_read" on public.jobs;
create policy "jobs_read" on public.jobs
  for select using (
    (status = 'published' and visibility = 'public')
    or auth.uid() is not null
  );
drop policy if exists "jobs_write" on public.jobs;
create policy "jobs_write" on public.jobs
  for all using (public.is_admin() or assigned_recruiter_id = auth.uid())
  with check (public.is_admin() or assigned_recruiter_id = auth.uid());

-- applications: anyone may INSERT (career-page apply); admins and the owning
-- recruiter / hiring manager can read and manage.
drop policy if exists "applications_insert_public" on public.applications;
create policy "applications_insert_public" on public.applications
  for insert with check (true);
drop policy if exists "applications_select" on public.applications;
create policy "applications_select" on public.applications
  for select using (
    public.is_admin()
    or assigned_recruiter_id = auth.uid()
    or exists (select 1 from public.jobs j where j.id = job_id
               and (j.assigned_recruiter_id = auth.uid() or j.hiring_manager_id = auth.uid()))
  );
drop policy if exists "applications_update" on public.applications;
create policy "applications_update" on public.applications
  for update using (
    public.is_admin()
    or assigned_recruiter_id = auth.uid()
    or exists (select 1 from public.jobs j where j.id = job_id and j.assigned_recruiter_id = auth.uid())
  ) with check (true);
drop policy if exists "applications_delete" on public.applications;
create policy "applications_delete" on public.applications
  for delete using (public.is_admin());

-- analytics_events: admins read; authenticated app code + definer triggers write.
drop policy if exists "events_read" on public.analytics_events;
create policy "events_read" on public.analytics_events
  for select using (public.is_admin());
drop policy if exists "events_insert" on public.analytics_events;
create policy "events_insert" on public.analytics_events
  for insert with check (true);

-- =============================================================================
-- ANALYTICS & RBAC BENCHMARKING
-- =============================================================================
-- Audit trail of permission-sensitive actions + a SECURITY DEFINER benchmark
-- function so a recruiter can see how they rank WITHOUT their client ever
-- reading peers' raw rows (the function returns aggregates + anonymous labels
-- only). Idempotent.

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs(created_at);
create index if not exists idx_audit_action  on public.audit_logs(action);

alter table public.audit_logs enable row level security;
drop policy if exists "audit_admin_read" on public.audit_logs;
create policy "audit_admin_read" on public.audit_logs
  for select using (public.is_admin());
drop policy if exists "audit_insert" on public.audit_logs;
create policy "audit_insert" on public.audit_logs
  for insert with check (auth.uid() is not null);

-- Audit candidate reassignment and role changes (definer-run so the row is
-- always written regardless of the actor's table privileges).
create or replace function public.audit_candidate_reassign()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'UPDATE' and new.recruiter_id is distinct from old.recruiter_id) then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, meta)
    values (auth.uid(), 'candidate_reassigned', 'candidate', new.id,
            jsonb_build_object('from', old.recruiter_id, 'to', new.recruiter_id));
  end if;
  return new;
end; $$;
drop trigger if exists trg_audit_candidate_reassign on public.candidates;
create trigger trg_audit_candidate_reassign after update on public.candidates
  for each row execute function public.audit_candidate_reassign();

create or replace function public.audit_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'UPDATE' and new.role is distinct from old.role) then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, meta)
    values (auth.uid(), 'role_changed', 'profile', new.id,
            jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end; $$;
drop trigger if exists trg_audit_role_change on public.profiles;
create trigger trg_audit_role_change after update on public.profiles
  for each row execute function public.audit_role_change();

-- Recruiter benchmark: returns the caller's own metrics plus team aggregates and
-- an ANONYMOUS leaderboard (peers shown as "Peer N" by rank, never by id/name).
-- SECURITY DEFINER so it can read across recruiters to compute aggregates while
-- exposing nothing that identifies a peer. Recruiters call this instead of
-- selecting peer rows (which RLS forbids).
create or replace function public.recruiter_dashboard(days int default null)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare
  uid uuid := auth.uid();
  since timestamptz := case when days is null then '-infinity'::timestamptz
                            else now() - make_interval(days => days) end;
  me_activity numeric;
  cnt int;
  rnk int;
  result jsonb;
begin
  create temp table _act on commit drop as
    select p.id as rid,
           count(c.*) filter (where c.created_at >= since) as activity,
           count(c.*) filter (where c.current_stage = 'active') as hires,
           count(c.*) filter (where c.current_stage in ('offer','accepted')) as offers,
           count(c.*) filter (where c.current_stage not in ('active','declined','no_response')) as pipeline
    from public.profiles p
    left join public.candidates c on c.recruiter_id = p.id
    where p.active and p.role = 'recruiter'
    group by p.id;

  select activity into me_activity from _act where rid = uid;
  me_activity := coalesce(me_activity, 0);
  select count(*) into cnt from _act;
  select count(*) + 1 into rnk from _act where activity > me_activity;

  result := jsonb_build_object(
    'me', coalesce((select to_jsonb(x) from (
             select coalesce(activity,0) as activity, coalesce(hires,0) as hires,
                    coalesce(offers,0) as offers, coalesce(pipeline,0) as pipeline
             from _act where rid = uid) x), '{"activity":0,"hires":0,"offers":0,"pipeline":0}'::jsonb),
    'rank', rnk,
    'of', cnt,
    'percentile', case when cnt > 1 then round(100.0 * (cnt - rnk) / (cnt - 1)) else 100 end,
    'benchmark', (select jsonb_build_object(
                    'avg', round(coalesce(avg(activity),0), 1),
                    'median', coalesce(percentile_cont(0.5) within group (order by activity), 0),
                    'top', coalesce(max(activity), 0)) from _act),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'value', activity) order by activity desc)
      from (
        select activity,
               case when rid = uid then 'You'
                    else 'Peer ' || row_number() over (order by activity desc) end as label
        from _act
      ) z), '[]'::jsonb)
  );
  return result;
end; $$;

-- =============================================================================
-- INTEGRATIONS — modular framework for external platform connections
-- =============================================================================
-- Stores integration configs, (server-managed) credentials, field mappings,
-- activity/error logs, and inbound webhook events. Admin-only via RLS. Live API
-- calls + OAuth + webhook verification run in Edge Functions (service role);
-- the frontend never reads raw credential values back. Idempotent.

create table if not exists public.integrations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null default '00000000-0000-0000-0000-000000000001'
                  references public.companies(id) on delete cascade,
  name          text not null,
  provider      text not null,         -- 'indeed','checkr','custom_rest', …
  category      text not null,
  status        text not null default 'pending'
                  check (status in ('connected','disconnected','error','pending')),
  auth_type     text not null default 'api_key'
                  check (auth_type in ('api_key','bearer','oauth2','basic','webhook_secret','custom_header','none')),
  config_json   jsonb not null default '{}'::jsonb,
  credentials_reference uuid,          -- -> integration_credentials.id
  base_url      text,
  webhook_url   text,
  sync_direction text default 'inbound'
                  check (sync_direction in ('inbound','outbound','bidirectional')),
  sync_frequency text default 'manual',
  last_sync_at  timestamptz,
  is_enabled    boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_integrations_company on public.integrations(company_id);

-- Secrets live in their own table so RLS can lock them down hard. In production
-- these are encrypted and only read by Edge Functions (service role); the
-- frontend writes them but never selects them back.
create table if not exists public.integration_credentials (
  id             uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  encrypted_credentials jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.integration_logs (
  id             uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  event_type     text,
  status         text,
  message        text,
  request_payload  jsonb,
  response_payload jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_integration_logs_integration on public.integration_logs(integration_id);

create table if not exists public.integration_field_mappings (
  id             uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  source_field   text not null,
  target_field   text not null,
  transformation_rule text,
  is_required    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_field_mappings_integration on public.integration_field_mappings(integration_id);

create table if not exists public.webhook_events (
  id             uuid primary key default gen_random_uuid(),
  integration_id uuid references public.integrations(id) on delete set null,
  event_type     text,
  source_platform text,
  payload        jsonb not null default '{}'::jsonb,
  processed_status text not null default 'pending'
                  check (processed_status in ('pending','processing','completed','failed')),
  error_message  text,
  created_at     timestamptz not null default now(),
  processed_at   timestamptz
);
create index if not exists idx_webhook_events_status on public.webhook_events(processed_status);

drop trigger if exists trg_touch_integrations on public.integrations;
create trigger trg_touch_integrations before update on public.integrations
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_int_creds on public.integration_credentials;
create trigger trg_touch_int_creds before update on public.integration_credentials
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_field_mappings on public.integration_field_mappings;
create trigger trg_touch_field_mappings before update on public.integration_field_mappings
  for each row execute function public.touch_updated_at();

-- RLS: integrations are admin-only. Credentials are the most sensitive — admins
-- may write them, but a read policy is intentionally NOT granted to anon/auth
-- (only the service role used by Edge Functions can read them).
alter table public.integrations              enable row level security;
alter table public.integration_credentials   enable row level security;
alter table public.integration_logs          enable row level security;
alter table public.integration_field_mappings enable row level security;
alter table public.webhook_events            enable row level security;

drop policy if exists "integrations_admin" on public.integrations;
create policy "integrations_admin" on public.integrations
  for all using (public.is_admin()) with check (public.is_admin());

-- Credentials: admins may INSERT/UPDATE/DELETE but there is no SELECT policy,
-- so credential values can never be read back through the public API.
drop policy if exists "int_creds_admin_write" on public.integration_credentials;
create policy "int_creds_admin_write" on public.integration_credentials
  for insert with check (public.is_admin());
drop policy if exists "int_creds_admin_update" on public.integration_credentials;
create policy "int_creds_admin_update" on public.integration_credentials
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "int_creds_admin_delete" on public.integration_credentials;
create policy "int_creds_admin_delete" on public.integration_credentials
  for delete using (public.is_admin());

drop policy if exists "integration_logs_admin" on public.integration_logs;
create policy "integration_logs_admin" on public.integration_logs
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "field_mappings_admin" on public.integration_field_mappings;
create policy "field_mappings_admin" on public.integration_field_mappings
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "webhook_events_admin" on public.webhook_events;
create policy "webhook_events_admin" on public.webhook_events
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- INTERVIEWS & OFFERS
-- =============================================================================
-- Interview scheduling/feedback and offer management, feeding the interview and
-- offer analytics dashboards. Access mirrors candidates: admins + the candidate's
-- recruiter (or territory) can manage. Idempotent.

create table if not exists public.interviews (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default '00000000-0000-0000-0000-000000000001'
                   references public.companies(id) on delete cascade,
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  job_id         uuid references public.jobs(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  interviewer_id uuid references public.profiles(id) on delete set null,
  scheduled_at   timestamptz,
  duration_min   int not null default 30,
  location       text,                 -- room or video link
  status         text not null default 'scheduled'
                   check (status in ('scheduled','completed','cancelled','rescheduled','no_show')),
  feedback       text,
  score          int check (score between 1 and 5),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_interviews_candidate on public.interviews(candidate_id);
create index if not exists idx_interviews_job on public.interviews(job_id);

create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default '00000000-0000-0000-0000-000000000001'
                   references public.companies(id) on delete cascade,
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  job_id         uuid references public.jobs(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  salary         numeric,
  bonus          numeric,
  equity         text,
  start_date     date,
  status         text not null default 'pending'
                   check (status in ('pending','sent','accepted','declined','expired','negotiating')),
  approved_by    uuid references public.profiles(id) on delete set null,
  approved_at    timestamptz,
  sent_at        timestamptz,
  signed_url     text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_offers_candidate on public.offers(candidate_id);
create index if not exists idx_offers_job on public.offers(job_id);

drop trigger if exists trg_touch_interviews on public.interviews;
create trigger trg_touch_interviews before update on public.interviews
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_touch_offers on public.offers;
create trigger trg_touch_offers before update on public.offers
  for each row execute function public.touch_updated_at();

alter table public.interviews enable row level security;
alter table public.offers     enable row level security;

-- Access mirrors candidates: admin, the candidate's recruiter, or territory.
drop policy if exists "interviews_access" on public.interviews;
create policy "interviews_access" on public.interviews
  for all using (
    public.is_admin() or exists (
      select 1 from public.candidates c where c.id = candidate_id
        and (c.recruiter_id = auth.uid() or public.covers_region(c.region))
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.candidates c where c.id = candidate_id
        and (c.recruiter_id = auth.uid() or public.covers_region(c.region))
    )
  );
drop policy if exists "offers_access" on public.offers;
create policy "offers_access" on public.offers
  for all using (
    public.is_admin() or exists (
      select 1 from public.candidates c where c.id = candidate_id
        and (c.recruiter_id = auth.uid() or public.covers_region(c.region))
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.candidates c where c.id = candidate_id
        and (c.recruiter_id = auth.uid() or public.covers_region(c.region))
    )
  );

-- =============================================================================
-- Done. Create users in Supabase Auth (first sign-in becomes admin), then use
-- the in-app Team screen to set roles and assign each recruiter's regions.
-- =============================================================================
