-- ============================================================================
-- Clinilytics ATS v2 — Region isolation (restores per-recruiter territory RLS)
-- ----------------------------------------------------------------------------
-- v2's base RLS (02_rls.sql) is org-scoped only: every recruiter would see every
-- candidate in the org. The OLD schema isolated recruiters BY REGION
-- (recruiter_regions + covers_region()). This file restores that boundary on v2
-- before any production cutover. Apply after 02_rls.sql.
--
-- Model:
--   * Each facility carries a `region`. A requisition inherits its facility's
--     region; an application inherits it via its requisition.
--   * `recruiter_regions(user_id, region)` lists the territories a user covers.
--   * admin / compliance / coordinator are NOT region-limited (org-wide reach);
--     recruiters and hiring_managers are limited to their covered regions
--     (hiring managers additionally always see requisitions they own).
--   * A facility with a NULL region is "ungated" (visible org-wide) so data is
--     never accidentally hidden — migration backfills real regions.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Territory column + table
-- ---------------------------------------------------------------------------
alter table public.facilities add column if not exists region text;
create index if not exists idx_fac_region on public.facilities (region);

-- Explicit candidate ownership (the OLD schema's candidates.recruiter_id). Used
-- by the territory read policy below so a recruiter always sees candidates they
-- own, even before those candidates enter a pipeline.
alter table public.candidates add column if not exists recruiter_id uuid references public.users(id) on delete set null;
create index if not exists idx_cand_recruiter on public.candidates (recruiter_id);

create table if not exists public.recruiter_regions (
  user_id uuid not null references public.users(id) on delete cascade,
  region  text not null,
  primary key (user_id, region)
);
create index if not exists idx_recruiter_regions_user on public.recruiter_regions (user_id);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER → resolve identity without recursing through RLS)
-- ---------------------------------------------------------------------------
-- Is the caller region-limited? Only recruiters and hiring managers are.
create or replace function public.is_region_limited()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('recruiter','hiring_manager') from public.users where id = auth.uid() and active),
    false)
$$;

-- Can the caller see this region? Org-wide roles always can; region-limited
-- roles only if they have a matching recruiter_regions row.
create or replace function public.can_see_region(r text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.is_compliance()
      or not public.is_region_limited()
      or (r is null)
      or exists (
        select 1 from public.recruiter_regions
        where user_id = auth.uid() and region = r
      )
$$;

-- Can the caller see this facility (by its region, scoped to their org)?
create or replace function public.covers_facility(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.facilities f
    where f.id = fid
      and f.org_id = public.current_org()
      and public.can_see_region(f.region)
  )
$$;

-- ---------------------------------------------------------------------------
-- recruiter_regions RLS: a user sees their own rows; admins manage all in-org.
-- ---------------------------------------------------------------------------
alter table public.recruiter_regions enable row level security;

drop policy if exists rr_select on public.recruiter_regions;
create policy rr_select on public.recruiter_regions for select using (
  user_id = auth.uid()
  or exists (select 1 from public.users u where u.id = recruiter_regions.user_id and u.org_id = public.current_org() and public.is_admin())
);
drop policy if exists rr_admin on public.recruiter_regions;
create policy rr_admin on public.recruiter_regions for all
  using (exists (select 1 from public.users u where u.id = recruiter_regions.user_id and u.org_id = public.current_org() and public.is_admin()))
  with check (exists (select 1 from public.users u where u.id = recruiter_regions.user_id and u.org_id = public.current_org() and public.is_admin()));

-- ---------------------------------------------------------------------------
-- Region-scope the read policies (replaces the org-only versions in 02_rls.sql)
-- ---------------------------------------------------------------------------

-- ---- facilities: region-limited roles only see covered (or ungated) regions ----
drop policy if exists fac_select on public.facilities;
create policy fac_select on public.facilities for select using (
  org_id = public.current_org() and public.can_see_region(region)
);

-- ---- requisitions: covered facility region, or the hiring manager's own ----
drop policy if exists req_select on public.requisitions;
create policy req_select on public.requisitions for select using (
  org_id = public.current_org() and (
    not public.is_region_limited()
    or public.covers_facility(facility_id)
    or hiring_manager_id = auth.uid()
    or created_by = auth.uid()
  )
);

-- ---- applications: visible if the caller can see the parent requisition ----
drop policy if exists app_select on public.applications;
create policy app_select on public.applications for select using (
  org_id = public.current_org() and (
    not public.is_region_limited()
    or exists (
      select 1 from public.requisitions r
      where r.id = requisition_id
        and (public.covers_facility(r.facility_id) or r.hiring_manager_id = auth.uid())
    )
  )
);

-- ---- candidates: org pool gated by ownership or an application in a covered region ----
-- Org-wide roles see all; a region-limited recruiter sees a candidate they own
-- (recruiter_id/created_by) or who has an application to a requisition whose
-- facility region they cover. Sourced candidates with no application stay private
-- to their owner until placed into a pipeline.
drop policy if exists cand_select on public.candidates;
create policy cand_select on public.candidates for select using (
  org_id = public.current_org() and (
    not public.is_region_limited()
    or recruiter_id = auth.uid()
    or created_by = auth.uid()
    or exists (
      select 1 from public.applications a
      join public.requisitions r on r.id = a.requisition_id
      where a.candidate_id = candidates.id
        and public.covers_facility(r.facility_id)
    )
  )
);

-- Note: write policies remain org-scoped via is_staff()/is_admin() in 02_rls.sql.
-- Reads are the territory boundary; writes stay org-scoped (a recruiter cannot
-- write outside their org, and region-limited reads keep cross-territory rows
-- out of their UI in the first place).
