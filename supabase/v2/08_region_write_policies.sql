-- ============================================================================
-- Clinilytics ATS v2 — split FOR ALL write policies (region-isolation fix)
-- ----------------------------------------------------------------------------
-- BUG this fixes (caught in branch validation): a Postgres `FOR ALL` policy's
-- USING clause is applied to SELECT *as well as* UPDATE/DELETE. The base RLS
-- (02) and feature RLS (07) define write policies as
--     create policy x_write ... for all using (org AND is_staff()) ...
-- Because is_staff() is true for recruiters org-wide, that USING clause re-grants
-- SELECT visibility to every row in the org — silently defeating the region
-- `_select` policies in 05/07. Net effect: region isolation did NOT hold.
--
-- Fix: on the six region-sensitive tables, replace each `FOR ALL` write policy
-- with command-specific INSERT / UPDATE / DELETE policies. Now only the dedicated
-- `_select` policies govern reads. UPDATE/DELETE USING is set to the SAME
-- predicate as the table's `_select` (S) so a user can only modify rows they can
-- see (region-limited roles stay bounded; org-wide roles are unaffected because
-- S collapses to the org check for them). INSERT WITH CHECK keeps the prior
-- write-eligibility (Wmin) so inserts behave as before.
--
-- Apply after 07_feature_rls.sql.
-- ============================================================================

-- ---- facilities ----
drop policy if exists fac_write on public.facilities;
create policy fac_insert on public.facilities for insert
  with check (org_id = public.current_org() and public.is_staff());
create policy fac_update on public.facilities for update
  using (org_id = public.current_org() and public.can_see_region(region))
  with check (org_id = public.current_org() and public.is_staff());
create policy fac_delete on public.facilities for delete
  using (org_id = public.current_org() and public.is_staff() and public.can_see_region(region));

-- ---- requisitions ----
drop policy if exists req_write on public.requisitions;
create policy req_insert on public.requisitions for insert
  with check (org_id = public.current_org() and (public.is_staff() or hiring_manager_id = auth.uid()));
create policy req_update on public.requisitions for update
  using (org_id = public.current_org() and (not public.is_region_limited() or public.covers_facility(facility_id) or hiring_manager_id = auth.uid() or created_by = auth.uid()))
  with check (org_id = public.current_org() and (public.is_staff() or hiring_manager_id = auth.uid()));
create policy req_delete on public.requisitions for delete
  using (org_id = public.current_org() and (public.is_staff() or hiring_manager_id = auth.uid())
         and (not public.is_region_limited() or public.covers_facility(facility_id) or hiring_manager_id = auth.uid() or created_by = auth.uid()));

-- ---- applications ----
drop policy if exists app_write on public.applications;
create policy app_insert on public.applications for insert
  with check (org_id = public.current_org() and public.is_staff());
create policy app_update on public.applications for update
  using (org_id = public.current_org() and (not public.is_region_limited()
         or exists (select 1 from public.requisitions r where r.id = requisition_id and (public.covers_facility(r.facility_id) or r.hiring_manager_id = auth.uid()))))
  with check (org_id = public.current_org() and public.is_staff());
create policy app_delete on public.applications for delete
  using (org_id = public.current_org() and public.is_staff() and (not public.is_region_limited()
         or exists (select 1 from public.requisitions r where r.id = requisition_id and (public.covers_facility(r.facility_id) or r.hiring_manager_id = auth.uid()))));

-- ---- candidates ----
drop policy if exists cand_write on public.candidates;
create policy cand_insert on public.candidates for insert
  with check (org_id = public.current_org() and public.is_staff());
create policy cand_update on public.candidates for update
  using (org_id = public.current_org() and (not public.is_region_limited() or recruiter_id = auth.uid() or created_by = auth.uid()
         or exists (select 1 from public.applications a join public.requisitions r on r.id = a.requisition_id where a.candidate_id = candidates.id and public.covers_facility(r.facility_id))))
  with check (org_id = public.current_org() and public.is_staff());
create policy cand_delete on public.candidates for delete
  using (org_id = public.current_org() and public.is_staff() and (not public.is_region_limited() or recruiter_id = auth.uid() or created_by = auth.uid()
         or exists (select 1 from public.applications a join public.requisitions r on r.id = a.requisition_id where a.candidate_id = candidates.id and public.covers_facility(r.facility_id))));

-- ---- coverage_needs ----
drop policy if exists cov_write on public.coverage_needs;
create policy cov_insert on public.coverage_needs for insert
  with check (public.is_staff() and exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org()));
create policy cov_update on public.coverage_needs for update
  using (exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org()) and public.covers_facility(facility_id))
  with check (public.is_staff() and exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org()));
create policy cov_delete on public.coverage_needs for delete
  using (public.is_staff() and exists (select 1 from public.facilities f where f.id = facility_id and f.org_id = public.current_org()) and public.covers_facility(facility_id));

-- ---- screenings ----
drop policy if exists screen_write on public.screenings;
create policy screen_insert on public.screenings for insert
  with check (org_id = public.current_org() and public.is_staff());
create policy screen_update on public.screenings for update
  using (org_id = public.current_org() and (not public.is_region_limited() or recruiter_id = auth.uid()
         or exists (select 1 from public.candidates c where c.id = candidate_id and (c.recruiter_id = auth.uid() or c.created_by = auth.uid()))))
  with check (org_id = public.current_org() and public.is_staff());
create policy screen_delete on public.screenings for delete
  using (org_id = public.current_org() and public.is_staff() and (not public.is_region_limited() or recruiter_id = auth.uid()
         or exists (select 1 from public.candidates c where c.id = candidate_id and (c.recruiter_id = auth.uid() or c.created_by = auth.uid()))));
