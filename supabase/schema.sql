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
                      check (role in ('lpn','ma','np','pa','md','psych_np','wound')),
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
                  check (role in ('lpn','ma','np','pa','md','psych_np','wound')),
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
-- Done. Create users in Supabase Auth (first sign-in becomes admin), then use
-- the in-app Team screen to set roles and assign each recruiter's regions.
-- =============================================================================
