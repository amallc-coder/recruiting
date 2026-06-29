-- ============================================================================
-- Clinilytics ATS v2 — RLS for the feature-parity tables (06) + career intake
-- ----------------------------------------------------------------------------
-- Mirrors the access model of the OLD schema:
--   * coverage_needs   — region-limited read (via facility), staff write
--   * screenings       — staff/compliance read all; recruiter reads own
--   * integrations*    — admin only; credentials are WRITE-ONLY (no select)
--   * positions        — any signed-in user reads; admin writes
--   * offers           — mirrors applications (staff/compliance + hiring mgr)
--   * recruiting_costs — staff read, admin write
--   * analytics_events — staff read, staff insert
--   * audit_logs       — admin/compliance read; inserts via definer/staff
--   * public career    — anon may read public+open requisitions (and their
--                        facility/role_family) and call apply_to_requisition()
-- Apply after 06_feature_homes.sql.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'coverage_needs','screenings','integrations','integration_credentials',
    'integration_logs','integration_field_mappings','webhook_events','positions',
    'offers','recruiting_costs','analytics_events','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---- coverage_needs (read region-limited via facility; staff write) ----
drop policy if exists cov_select on public.coverage_needs;
create policy cov_select on public.coverage_needs for select using (
  exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org())
  and public.covers_facility(facility_id)
);
drop policy if exists cov_write on public.coverage_needs;
create policy cov_write on public.coverage_needs for all
  using (public.is_staff() and exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org()))
  with check (public.is_staff() and exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org()));

-- ---- screenings (staff/compliance read all in-org; recruiter reads own) ----
drop policy if exists screen_select on public.screenings;
create policy screen_select on public.screenings for select using (
  org_id = public.current_org() and (
    not public.is_region_limited()
    or recruiter_id = auth.uid()
    or exists (select 1 from public.candidates c where c.id = candidate_id
               and (c.recruiter_id = auth.uid() or c.created_by = auth.uid()))
  )
);
drop policy if exists screen_write on public.screenings;
create policy screen_write on public.screenings for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

-- ---- integrations (admin only) ----
drop policy if exists integrations_admin on public.integrations;
create policy integrations_admin on public.integrations for all
  using (org_id = public.current_org() and public.is_admin())
  with check (org_id = public.current_org() and public.is_admin());

-- ---- integration_credentials: admins write; NO select policy (never read back) ----
drop policy if exists int_creds_insert on public.integration_credentials;
create policy int_creds_insert on public.integration_credentials for insert
  with check (exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org()) and public.is_admin());
drop policy if exists int_creds_update on public.integration_credentials;
create policy int_creds_update on public.integration_credentials for update
  using (exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org()) and public.is_admin())
  with check (exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org()) and public.is_admin());
drop policy if exists int_creds_delete on public.integration_credentials;
create policy int_creds_delete on public.integration_credentials for delete
  using (exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org()) and public.is_admin());

-- ---- integration_logs / field_mappings (admin, via parent integration's org) ----
drop policy if exists int_logs_admin on public.integration_logs;
create policy int_logs_admin on public.integration_logs for all
  using (exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org()) and public.is_admin())
  with check (exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org()) and public.is_admin());
drop policy if exists field_mappings_admin on public.integration_field_mappings;
create policy field_mappings_admin on public.integration_field_mappings for all
  using (exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org()) and public.is_admin())
  with check (exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org()) and public.is_admin());

-- ---- webhook_events (admin; org via integration, or unlinked) ----
drop policy if exists webhook_events_admin on public.webhook_events;
create policy webhook_events_admin on public.webhook_events for all
  using (public.is_admin() and (integration_id is null or exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org())))
  with check (public.is_admin() and (integration_id is null or exists (select 1 from public.integrations i where i.id = integration_id and i.org_id = public.current_org())));

-- ---- positions (any signed-in user reads in-org; admin writes) ----
drop policy if exists positions_select on public.positions;
create policy positions_select on public.positions for select using (org_id = public.current_org());
drop policy if exists positions_admin on public.positions;
create policy positions_admin on public.positions for all
  using (org_id = public.current_org() and public.is_admin())
  with check (org_id = public.current_org() and public.is_admin());

-- ---- offers (mirrors applications: staff/compliance + the req's hiring mgr) ----
drop policy if exists offers_select on public.offers;
create policy offers_select on public.offers for select using (
  org_id = public.current_org() and (
    public.is_staff() or public.is_compliance()
    or exists (select 1 from public.requisitions r where r.id = requisition_id and r.hiring_manager_id = auth.uid())
  )
);
drop policy if exists offers_write on public.offers;
create policy offers_write on public.offers for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

-- ---- recruiting_costs (staff read; admin write) ----
drop policy if exists costs_select on public.recruiting_costs;
create policy costs_select on public.recruiting_costs for select using (
  org_id = public.current_org() and (public.is_staff() or public.is_compliance())
);
drop policy if exists costs_write on public.recruiting_costs;
create policy costs_write on public.recruiting_costs for all
  using (org_id = public.current_org() and public.is_admin())
  with check (org_id = public.current_org() and public.is_admin());

-- ---- analytics_events (staff read; staff insert; definer functions also write) ----
drop policy if exists events_select on public.analytics_events;
create policy events_select on public.analytics_events for select using (
  org_id = public.current_org() and (public.is_staff() or public.is_compliance())
);
drop policy if exists events_insert on public.analytics_events;
create policy events_insert on public.analytics_events for insert
  with check (org_id = public.current_org() and public.is_staff());

-- ---- audit_logs (admin/compliance read; inserts come from definer triggers/staff) ----
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select using (
  org_id = public.current_org() and (public.is_admin() or public.is_compliance())
);
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert
  with check (org_id = public.current_org() and public.is_staff());

-- ===========================================================================
-- Public career page (anonymous reads of public, open requisitions)
-- ===========================================================================
-- Additional SELECT policies are OR'd with the authed ones, so these widen
-- access only for is_public + open rows; nothing else becomes anon-readable.
drop policy if exists req_public_select on public.requisitions;
create policy req_public_select on public.requisitions for select using (is_public and status = 'open');

drop policy if exists fac_public_select on public.facilities;
create policy fac_public_select on public.facilities for select using (
  exists (select 1 from public.requisitions r where r.facility_id = facilities.id and r.is_public and r.status = 'open')
);

-- role_families is non-sensitive lookup data; allow anon read so the career page
-- can render role labels on public postings.
drop policy if exists rf_public_select on public.role_families;
create policy rf_public_select on public.role_families for select using (true);
