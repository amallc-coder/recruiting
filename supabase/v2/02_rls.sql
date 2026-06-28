-- ============================================================================
-- Clinilytics ATS v2 — Row Level Security
-- ----------------------------------------------------------------------------
-- Role model: admin, recruiter, coordinator, hiring_manager, compliance.
--   admin       — full access within their organization
--   recruiter   — owns candidates / applications / interviews / comms
--   coordinator — same operational reach as recruiter (scheduling support)
--   hiring_mgr  — reads requisitions they own + that pipeline; no PII edits
--   compliance  — read-everything + manages credential verification (audit)
--
-- Everything is org-scoped: a user only ever sees rows in their own org. Helper
-- functions are SECURITY DEFINER so they read public.users without recursing
-- through these policies. Apply after 01_schema.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER → bypass RLS when resolving the caller's identity)
-- ---------------------------------------------------------------------------
create or replace function public.current_org()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.users where id = auth.uid() and active
$$;

create or replace function public.current_role_v2()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and active and role = 'admin')
$$;

create or replace function public.is_compliance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and active and role = 'compliance')
$$;

-- Operational staff who may create/edit candidates, applications, etc.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and active and role in ('admin','recruiter','coordinator')
  )
$$;

-- ---------------------------------------------------------------------------
-- Sync new auth users into public.users (first user → admin; org/role from
-- invite metadata, else the sole org / recruiter). Keeps RLS keyed on auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_org uuid := nullif(new.raw_user_meta_data->>'org_id','')::uuid;
  meta_role  text := new.raw_user_meta_data->>'role';
  assigned   user_role;
begin
  if target_org is null then
    select id into target_org from public.organizations order by created_at limit 1;
  end if;
  if target_org is null then
    return new;  -- no org yet; nothing to attach to
  end if;

  if (select count(*) from public.users) = 0 then
    assigned := 'admin';
  elsif meta_role in ('admin','recruiter','coordinator','hiring_manager','compliance') then
    assigned := meta_role::user_role;
  else
    assigned := 'recruiter';
  end if;

  insert into public.users (id, org_id, email, full_name, role)
  values (new.id, target_org, coalesce(new.email,''),
          coalesce(new.raw_user_meta_data->>'full_name',''), assigned)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Internal bookkeeping trigger must bypass RLS when writing history.
alter function public.log_application_stage() security definer;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','users','role_families','facilities','facility_credential_requirements',
    'pipeline_stages','candidates','requisitions','applications','application_stage_history',
    'candidate_documents','credentials','interviews','scorecards','scorecard_responses',
    'communications','ai_decisions','kpi_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- organizations ----
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select using (id = public.current_org());
drop policy if exists org_write on public.organizations;
create policy org_write on public.organizations for all
  using (id = public.current_org() and public.is_admin())
  with check (id = public.current_org() and public.is_admin());

-- ---- users ----
drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (org_id = public.current_org());          -- everyone sees their org's roster
drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users for update
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists users_admin on public.users;
create policy users_admin on public.users for all
  using (org_id = public.current_org() and public.is_admin())
  with check (org_id = public.current_org() and public.is_admin());

-- ---- role_families & pipeline_stages (global lookups) ----
drop policy if exists rf_select on public.role_families;
create policy rf_select on public.role_families for select using (auth.uid() is not null);
drop policy if exists rf_write on public.role_families;
create policy rf_write on public.role_families for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists ps_select on public.pipeline_stages;
create policy ps_select on public.pipeline_stages for select using (auth.uid() is not null);
drop policy if exists ps_write on public.pipeline_stages;
create policy ps_write on public.pipeline_stages for all using (public.is_admin()) with check (public.is_admin());

-- ---- facilities ----
drop policy if exists fac_select on public.facilities;
create policy fac_select on public.facilities for select using (org_id = public.current_org());
drop policy if exists fac_write on public.facilities;
create policy fac_write on public.facilities for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

-- ---- facility_credential_requirements (via facility's org) ----
drop policy if exists fcr_select on public.facility_credential_requirements;
create policy fcr_select on public.facility_credential_requirements for select using (
  exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org())
);
drop policy if exists fcr_write on public.facility_credential_requirements;
create policy fcr_write on public.facility_credential_requirements for all
  using (exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org())
         and (public.is_admin() or public.is_compliance()))
  with check (exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org())
         and (public.is_admin() or public.is_compliance()));

-- ---- candidates ----
drop policy if exists cand_select on public.candidates;
create policy cand_select on public.candidates for select using (org_id = public.current_org());
drop policy if exists cand_write on public.candidates;
create policy cand_write on public.candidates for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

-- ---- requisitions (all roles read in-org; staff write; hiring mgr edits theirs) ----
drop policy if exists req_select on public.requisitions;
create policy req_select on public.requisitions for select using (org_id = public.current_org());
drop policy if exists req_write on public.requisitions;
create policy req_write on public.requisitions for all
  using (org_id = public.current_org() and (public.is_staff() or hiring_manager_id = auth.uid()))
  with check (org_id = public.current_org() and (public.is_staff() or hiring_manager_id = auth.uid()));

-- ---- applications ----
-- read: staff + compliance see all in-org; hiring managers see their reqs' apps.
drop policy if exists app_select on public.applications;
create policy app_select on public.applications for select using (
  org_id = public.current_org() and (
    public.is_staff() or public.is_compliance()
    or exists (select 1 from public.requisitions r where r.id = requisition_id and r.hiring_manager_id = auth.uid())
  )
);
drop policy if exists app_write on public.applications;
create policy app_write on public.applications for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

-- ---- application_stage_history (visible if the application is) ----
drop policy if exists ash_select on public.application_stage_history;
create policy ash_select on public.application_stage_history for select using (
  exists (select 1 from public.applications a where a.id = application_id and a.org_id = public.current_org())
);
-- writes come from the SECURITY DEFINER trigger; allow staff to backfill too.
drop policy if exists ash_write on public.application_stage_history;
create policy ash_write on public.application_stage_history for all
  using (public.is_staff() and exists (select 1 from public.applications a where a.id = application_id and a.org_id = public.current_org()))
  with check (public.is_staff() and exists (select 1 from public.applications a where a.id = application_id and a.org_id = public.current_org()));

-- ---- candidate_documents (via candidate's org) ----
drop policy if exists doc_select on public.candidate_documents;
create policy doc_select on public.candidate_documents for select using (
  exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org())
);
drop policy if exists doc_write on public.candidate_documents;
create policy doc_write on public.candidate_documents for all
  using (exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org())
         and (public.is_staff() or public.is_compliance()))
  with check (exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org())
         and (public.is_staff() or public.is_compliance()));

-- ---- credentials (staff read; compliance + admin manage verification) ----
drop policy if exists cred_select on public.credentials;
create policy cred_select on public.credentials for select using (
  exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org())
);
drop policy if exists cred_write on public.credentials;
create policy cred_write on public.credentials for all
  using (exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org())
         and (public.is_admin() or public.is_compliance() or public.is_staff()))
  with check (exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org())
         and (public.is_admin() or public.is_compliance() or public.is_staff()));

-- ---- interviews (staff + hiring mgr + listed interviewers) ----
drop policy if exists iv_select on public.interviews;
create policy iv_select on public.interviews for select using (
  exists (select 1 from public.applications a where a.id = application_id and a.org_id = public.current_org())
  and (public.is_staff() or public.is_compliance() or auth.uid() = any(interviewers)
       or exists (select 1 from public.applications a join public.requisitions r on r.id = a.requisition_id
                  where a.id = application_id and r.hiring_manager_id = auth.uid()))
);
drop policy if exists iv_write on public.interviews;
create policy iv_write on public.interviews for all
  using (public.is_staff() and exists (select 1 from public.applications a where a.id = application_id and a.org_id = public.current_org()))
  with check (public.is_staff() and exists (select 1 from public.applications a where a.id = application_id and a.org_id = public.current_org()));

-- ---- scorecards & responses (reviewer writes own; staff/hiring mgr read) ----
drop policy if exists sc_select on public.scorecards;
create policy sc_select on public.scorecards for select using (
  exists (select 1 from public.applications a where a.id = application_id and a.org_id = public.current_org())
);
drop policy if exists sc_write on public.scorecards;
create policy sc_write on public.scorecards for all
  using (reviewer_id = auth.uid() or public.is_staff())
  with check ((reviewer_id = auth.uid() or public.is_staff())
              and exists (select 1 from public.applications a where a.id = application_id and a.org_id = public.current_org()));

drop policy if exists scr_select on public.scorecard_responses;
create policy scr_select on public.scorecard_responses for select using (
  exists (select 1 from public.scorecards s join public.applications a on a.id = s.application_id
          where s.id = scorecard_id and a.org_id = public.current_org())
);
drop policy if exists scr_write on public.scorecard_responses;
create policy scr_write on public.scorecard_responses for all
  using (exists (select 1 from public.scorecards s where s.id = scorecard_id and (s.reviewer_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.scorecards s where s.id = scorecard_id and (s.reviewer_id = auth.uid() or public.is_staff())));

-- ---- communications ----
drop policy if exists comm_select on public.communications;
create policy comm_select on public.communications for select using (
  exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org())
);
drop policy if exists comm_write on public.communications;
create policy comm_write on public.communications for all
  using (public.is_staff() and exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org()))
  with check (public.is_staff() and exists (select 1 from public.candidates c where c.id = candidate_id and c.org_id = public.current_org()));

-- ---- ai_decisions (governance: staff read+insert; admin/compliance override) ----
drop policy if exists ai_select on public.ai_decisions;
create policy ai_select on public.ai_decisions for select using (org_id = public.current_org());
drop policy if exists ai_insert on public.ai_decisions;
create policy ai_insert on public.ai_decisions for insert
  with check (org_id = public.current_org() and (public.is_staff() or public.is_compliance()));
drop policy if exists ai_override on public.ai_decisions;
create policy ai_override on public.ai_decisions for update
  using (org_id = public.current_org() and (public.is_admin() or public.is_compliance()))
  with check (org_id = public.current_org() and (public.is_admin() or public.is_compliance()));

-- ---- kpi_snapshots ----
drop policy if exists kpi_select on public.kpi_snapshots;
create policy kpi_select on public.kpi_snapshots for select using (org_id = public.current_org());
drop policy if exists kpi_write on public.kpi_snapshots;
create policy kpi_write on public.kpi_snapshots for all
  using (org_id = public.current_org() and (public.is_admin() or public.is_staff()))
  with check (org_id = public.current_org() and (public.is_admin() or public.is_staff()));
