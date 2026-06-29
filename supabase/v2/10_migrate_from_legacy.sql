-- ============================================================================
-- Clinilytics ATS v2 — data migration: legacy (old schema) → v2 (public)
-- ----------------------------------------------------------------------------
-- Transforms the OLD production schema into v2. Idempotent (on conflict do
-- nothing) and re-runnable. READS from schema `legacy`, WRITES to schema
-- `public` (where v2 01–09 have already been applied).
--
-- WHY a `legacy` schema: the old and v2 schemas both use `public` and share
-- table names with different shapes (candidates, facilities, applications,
-- communications, recruiting_costs). They cannot coexist in one schema, so the
-- cutover renames the old `public` → `legacy`, stands up a fresh v2 `public`,
-- then runs this script. (Renaming preserves the old data + FKs; see
-- CUTOVER_PLAN "Prod-execution note" for the grant re-establishment step.)
--
-- KEY MAPPING DECISIONS (documented so they can be reviewed):
--   * Single tenant: the first `legacy.companies` row is THE organization;
--     everything is attached to it.
--   * Role families: one v2 role_family per distinct old role code (code =
--     upper(old role)); the 6 standard pipeline stages are created for each.
--   * Old candidate.current_stage (a pipeline stage) maps to BOTH a v2
--     candidate.status and the candidate's application stage (see CASE maps).
--   * candidate ↔ requisition: old career `applications` migrate directly
--     (candidate → migrated job). Old candidates with NO career application get
--     an application to a synthetic "Talent Pool — {role} @ {facility}"
--     requisition, one per (facility, role_family). This guarantees every old
--     candidate lands in a v2 pipeline at the right stage.
--   * The per-candidate checklist + onboarding dates move from the old
--     candidate onto its (primary) v2 application.
--   * Detailed stage HISTORY is not replayed; the current stage is preserved via
--     the application's current_stage_id (the insert trigger opens a history
--     row). Pre-cutover transition history stays queryable in `legacy`.
--   * credentials have no old source → start empty (nothing is wrongly
--     placement-ready; verification must happen in v2).
--
-- Apply (at cutover, or on a test branch) after 09_hardening.sql, with the old
-- data present in schema `legacy`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Organization (single tenant)
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug)
select id, name, coalesce(slug, 'org')
from legacy.companies
order by created_at
limit 1
on conflict (id) do nothing;

-- If the old DB had no companies row, synthesize one so FKs resolve.
insert into public.organizations (id, name, slug)
select '00000000-0000-0000-0000-000000000001', 'American Medical Administrators', 'ama'
where not exists (select 1 from public.organizations)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Users  (legacy.profiles → public.users)
-- ---------------------------------------------------------------------------
insert into public.users (id, org_id, email, full_name, role, active, created_at)
select p.id, (select id from public.organizations order by created_at limit 1),
       nullif(p.email,''), coalesce(p.full_name,''),
       (case when p.role = 'admin' then 'admin' else 'recruiter' end)::user_role,
       p.active, p.created_at
from legacy.profiles p
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Recruiter regions (territory) — direct
-- ---------------------------------------------------------------------------
insert into public.recruiter_regions (user_id, region)
select rr.recruiter_id, rr.region
from legacy.recruiter_regions rr
where exists (select 1 from public.users u where u.id = rr.recruiter_id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Role families + standard pipeline stages (one family per old role code)
-- ---------------------------------------------------------------------------
insert into public.role_families (code, label, sort_order)
select distinct upper(r.role),
       initcap(replace(r.role,'_',' ')),
       0
from (
  select role from legacy.candidates where role is not null
  union select role from legacy.coverage_needs where role is not null
  union select role from legacy.jobs where role is not null
) r
on conflict (code) do nothing;

insert into public.pipeline_stages (role_family, name, sort_order, stage_type, is_terminal)
select rf.code, s.name, s.sort, s.stype, s.terminal
from public.role_families rf
cross join (values
  ('Applied',1,'applied',false),('Screen',2,'screen',false),('Interview',3,'interview',false),
  ('Offer',4,'offer',false),('Hired',5,'hired',true),('Rejected',6,'rejected',true)
) as s(name, sort, stype, terminal)
on conflict (role_family, sort_order) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Facilities  (legacy.facilities → public.facilities; old has `region`)
-- ---------------------------------------------------------------------------
insert into public.facilities (id, org_id, name, state, city, address, region, requirements, active, created_at)
select f.id, (select id from public.organizations order by created_at limit 1),
       f.name, f.state, f.city, f.address, f.region,
       jsonb_strip_nulls(jsonb_build_object('division', f.division, 'portfolio', f.portfolio,
                                             'census', f.census, 'capacity', f.capacity)),
       coalesce(f.active, true), f.created_at
from legacy.facilities f
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Coverage needs (Have/Need)  — role → role_family
-- ---------------------------------------------------------------------------
insert into public.coverage_needs (facility_id, role_family, have_count, need_count, priority, current_provider, description, notes, created_at)
select c.facility_id, upper(c.role), coalesce(c.have_count,0), coalesce(c.need_count,0),
       coalesce(c.priority,'standard')::coverage_priority, c.current_provider, c.description, c.notes, c.created_at
from legacy.coverage_needs c
where exists (select 1 from public.facilities f where f.id = c.facility_id)
on conflict (facility_id, role_family) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Requisitions
--    (a) real reqs from legacy.jobs
--    (b) synthetic "Talent Pool" reqs per (facility, role_family) for candidates
--        that have no career application
-- ---------------------------------------------------------------------------
insert into public.requisitions
  (id, org_id, facility_id, title, role_family, status, headcount, budget,
   hiring_manager_id, approval_status, slug, is_public, description, responsibilities,
   requirements, benefits, employment_type, workplace, salary_min, salary_max, salary_unit,
   created_by, created_at)
select j.id, (select id from public.organizations order by created_at limit 1),
       j.facility_id, j.title, upper(coalesce(j.role,'ops')),
       (case j.status when 'published' then 'open' when 'paused' then 'on_hold'
                      when 'closed' then 'closed' when 'archived' then 'closed'
                      else 'draft' end)::requisition_status,
       greatest(coalesce(j.openings,1),1), j.salary_max,
       j.hiring_manager_id, 'approved'::approval_status,
       j.slug, (coalesce(j.visibility,'public') = 'public'),
       j.description, j.responsibilities, j.requirements, j.benefits,
       coalesce(j.employment_type,'full_time'), coalesce(j.workplace,'onsite'),
       j.salary_min, j.salary_max, coalesce(j.salary_unit,'year'),
       j.created_by, j.created_at
from legacy.jobs j
where (j.facility_id is null or exists (select 1 from public.facilities f where f.id = j.facility_id))
  and exists (select 1 from public.role_families rf where rf.code = upper(coalesce(j.role,'ops')))
on conflict (id) do nothing;

-- Requisitions referencing a NULL facility can't satisfy the NOT NULL FK, so
-- ensure a synthetic "General" facility exists to host pool reqs / facility-less jobs.
insert into public.facilities (id, org_id, name, region, requirements, active)
select '00000000-0000-0000-0000-0000000000fa', (select id from public.organizations order by created_at limit 1),
       'General / Unassigned', null, '{}'::jsonb, true
where not exists (select 1 from public.facilities where id = '00000000-0000-0000-0000-0000000000fa');

-- (b) synthetic talent-pool reqs: one per (facility, role_family) actually used
-- by a candidate that has no career application.
with pool_keys as (
  select distinct coalesce(c.facility_id, '00000000-0000-0000-0000-0000000000fa') as facility_id,
                  upper(c.role) as role_family
  from legacy.candidates c
  where not exists (select 1 from legacy.applications a where a.candidate_id = c.id)
    and exists (select 1 from public.role_families rf where rf.code = upper(c.role))
)
insert into public.requisitions
  (id, org_id, facility_id, title, role_family, status, headcount, approval_status, created_at)
select gen_random_uuid(), (select id from public.organizations order by created_at limit 1),
       pk.facility_id,
       'Talent Pool — ' || pk.role_family || ' @ ' || coalesce((select name from public.facilities f where f.id = pk.facility_id), 'General'),
       pk.role_family, 'open'::requisition_status, 1, 'approved'::approval_status, now()
from pool_keys pk
where not exists (
  select 1 from public.requisitions r
  where r.facility_id = pk.facility_id and r.role_family = pk.role_family
    and r.title like 'Talent Pool — %'
);

-- ---------------------------------------------------------------------------
-- 7. Candidates  (legacy.candidates → public.candidates)
--    current_stage → candidate.status; checklist/onboarding carried on the app.
-- ---------------------------------------------------------------------------
insert into public.candidates
  (id, org_id, full_name, email, phone, source, status, recruiter_id, notes,
   resume_text, source_system, source_key, source_modified, created_by, created_at)
select c.id, (select id from public.organizations order by created_at limit 1),
       c.full_name, c.email, c.phone, c.source,
       (case
          when c.current_stage in ('accepted','background','cleared','welcome_call','training','active') then 'placed'
          when c.current_stage in ('declined','no_response') then 'archived'
          when c.current_stage in ('sourced') then 'new'
          else 'active' end)::candidate_status,
       c.recruiter_id, c.notes, c.resume_text, c.source_system, c.source_key, c.source_modified,
       c.created_by, c.created_at
from legacy.candidates c
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Applications
--    (a) from legacy.applications (career/job apps)
--    (b) synthetic: each candidate with no career app → its talent-pool req,
--        carrying the candidate's stage, checklist, and onboarding dates.
-- ---------------------------------------------------------------------------
-- helper: map an old stage string → a v2 stage NAME
-- (inlined as CASE below; sourced→Applied, interview→Interview, offer→Offer,
--  accepted/onboarding→Hired, declined/no_response→Rejected, else Applied)

-- (a) career applications
insert into public.applications
  (id, org_id, candidate_id, requisition_id, current_stage_id, status, applied_at, intake, created_at)
select a.id, (select id from public.organizations order by created_at limit 1),
       a.candidate_id, a.job_id,
       (select ps.id from public.pipeline_stages ps
         join public.requisitions r on r.id = a.job_id
        where ps.role_family = r.role_family
          and ps.name = (case
              when a.stage in ('interview') then 'Interview'
              when a.stage in ('offer') then 'Offer'
              when a.stage in ('accepted','background','cleared','welcome_call','training','active') then 'Hired'
              when a.stage in ('declined','no_response') then 'Rejected'
              else 'Applied' end)),
       (case when a.stage in ('declined','no_response') then 'rejected'
             when a.stage in ('accepted','background','cleared','welcome_call','training','active') then 'hired'
             else 'active' end)::application_status,
       a.created_at,
       jsonb_strip_nulls(jsonb_build_object('linkedin', a.linkedin, 'portfolio', a.portfolio,
            'cover_letter', a.cover_letter, 'resume_url', a.resume_url, 'source', a.source,
            'custom_answers', a.custom_answers)),
       a.created_at
from legacy.applications a
where a.candidate_id is not null
  and exists (select 1 from public.requisitions r where r.id = a.job_id)
  and exists (select 1 from public.candidates c where c.id = a.candidate_id)
on conflict (candidate_id, requisition_id) do nothing;

-- (b) synthetic pool applications for candidates with no career app
insert into public.applications
  (org_id, candidate_id, requisition_id, current_stage_id, status, applied_at,
   checklist, background_sent_date, background_cleared_date, welcome_call_done, start_date, created_at)
select (select id from public.organizations order by created_at limit 1),
       c.id, r.id,
       (select ps.id from public.pipeline_stages ps
         where ps.role_family = r.role_family
           and ps.name = (case
               when c.current_stage in ('interview') then 'Interview'
               when c.current_stage in ('offer') then 'Offer'
               when c.current_stage in ('accepted','background','cleared','welcome_call','training','active') then 'Hired'
               when c.current_stage in ('declined','no_response') then 'Rejected'
               else 'Applied' end)),
       (case when c.current_stage in ('declined','no_response') then 'rejected'
             when c.current_stage in ('accepted','background','cleared','welcome_call','training','active') then 'hired'
             else 'active' end)::application_status,
       c.created_at,
       coalesce(c.checklist, '{}'::jsonb),
       c.background_sent_date, c.background_cleared_date, coalesce(c.welcome_call_done,false), c.start_date,
       c.created_at
from legacy.candidates c
join public.requisitions r
  on r.facility_id = coalesce(c.facility_id, '00000000-0000-0000-0000-0000000000fa')
 and r.role_family = upper(c.role)
 and r.title like 'Talent Pool — %'
where not exists (select 1 from legacy.applications a where a.candidate_id = c.id)
on conflict (candidate_id, requisition_id) do nothing;

-- ---------------------------------------------------------------------------
-- 9. Interviews  (re-keyed candidate/job → the candidate's v2 application)
-- ---------------------------------------------------------------------------
insert into public.interviews (id, application_id, scheduled_at, type, interviewers, status, location, duration_min, created_by, created_at)
select iv.id,
       coalesce(
         (select a.id from public.applications a where a.id = iv.application_id),
         (select a.id from public.applications a where a.candidate_id = iv.candidate_id
            and (iv.job_id is null or a.requisition_id = iv.job_id) order by a.applied_at limit 1)),
       iv.scheduled_at, 'phone_screen'::interview_type,
       case when iv.interviewer_id is not null then array[iv.interviewer_id] else '{}'::uuid[] end,
       (case iv.status when 'completed' then 'completed' when 'cancelled' then 'cancelled'
                       when 'no_show' then 'no_show' when 'rescheduled' then 'rescheduled'
                       else 'scheduled' end)::interview_status,
       iv.location, coalesce(iv.duration_min,30), iv.created_by, iv.created_at
from legacy.interviews iv
where exists (select 1 from public.applications a where a.candidate_id = iv.candidate_id)
on conflict (id) do nothing;

-- scorecards from old interview feedback/score
insert into public.scorecards (application_id, interview_id, reviewer_id, overall_rating, submitted_at, created_at)
select i.application_id, iv.id, iv.interviewer_id, iv.score, iv.updated_at, iv.created_at
from legacy.interviews iv
join public.interviews i on i.id = iv.id
where iv.score is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 10. Offers  (legacy.offers → public.offers; req via the candidate's app)
-- ---------------------------------------------------------------------------
insert into public.offers (id, org_id, application_id, candidate_id, requisition_id, salary, bonus, equity, start_date, status, approved_by, approved_at, sent_at, signed_url, created_by, created_at)
select o.id, (select id from public.organizations order by created_at limit 1),
       coalesce(o.application_id, (select a.id from public.applications a where a.candidate_id = o.candidate_id order by a.applied_at limit 1)),
       o.candidate_id,
       coalesce(o.job_id, (select a.requisition_id from public.applications a where a.candidate_id = o.candidate_id order by a.applied_at limit 1)),
       o.salary, o.bonus, o.equity, o.start_date,
       (case o.status when 'sent' then 'sent' when 'accepted' then 'accepted' when 'declined' then 'declined'
                      when 'expired' then 'expired' when 'negotiating' then 'negotiating' else 'pending' end)::offer_status,
       o.approved_by, o.approved_at, o.sent_at, o.signed_url, o.created_by, o.created_at
from legacy.offers o
where exists (select 1 from public.candidates c where c.id = o.candidate_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 11. Screenings  (legacy.screenings → public.screenings)
-- ---------------------------------------------------------------------------
insert into public.screenings (id, org_id, candidate_id, requisition_id, recruiter_id, status, channel, questions, responses, ai_summary, ai_score, ai_flags, transcript, external_ref, approved_by, approved_at, sent_at, completed_at, created_by, created_at)
select s.id, (select id from public.organizations order by created_at limit 1),
       s.candidate_id,
       (select r.id from public.requisitions r where r.id = s.job_id),
       s.recruiter_id,
       (case when s.status in ('draft','approved','sent','completed','analyzed','cancelled') then s.status else 'draft' end)::screening_status,
       (case when s.channel in ('phone','sms','email','manual') then s.channel else 'phone' end)::screening_channel,
       coalesce(s.questions,'[]'::jsonb), coalesce(s.responses,'[]'::jsonb),
       s.ai_summary, s.ai_score, coalesce(s.ai_flags,'[]'::jsonb), s.transcript, s.external_ref,
       s.approved_by, s.approved_at, s.sent_at, s.completed_at, s.created_by, s.created_at
from legacy.screenings s
where exists (select 1 from public.candidates c where c.id = s.candidate_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 12. Communications  (legacy.communications → public.communications)
--     channel 'note' has no v2 equivalent → mapped to 'email' (body prefixed).
-- ---------------------------------------------------------------------------
insert into public.communications (id, candidate_id, channel, direction, subject, body, screening_id, ai_generated, external_ref, occurred_at, created_by, created_at)
select cm.id, cm.candidate_id,
       (case when cm.channel in ('email','sms','call') then cm.channel else 'email' end)::comm_channel,
       (case when cm.direction = 'inbound' then 'inbound' else 'outbound' end)::comm_direction,
       cm.subject,
       (case when cm.channel = 'note' then '[note] ' || coalesce(cm.body,'') else cm.body end),
       cm.screening_id, coalesce(cm.ai_generated,false), cm.external_ref, cm.occurred_at, cm.created_by, cm.created_at
from legacy.communications cm
where exists (select 1 from public.candidates c where c.id = cm.candidate_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 13. Positions catalog  (legacy.positions → public.positions)
-- ---------------------------------------------------------------------------
insert into public.positions (id, org_id, code, title, category, org_types, rate_min, rate_max, rate_unit, responsibilities, requirements, keywords, ai_generated, active, created_at)
select p.id, (select id from public.organizations order by created_at limit 1),
       p.code, p.title, p.category, coalesce(p.org_types,'[]'::jsonb), p.rate_min, p.rate_max,
       coalesce(p.rate_unit,'NA'), coalesce(p.responsibilities,'[]'::jsonb), coalesce(p.requirements,'[]'::jsonb),
       coalesce(p.keywords,'[]'::jsonb), coalesce(p.ai_generated,false), coalesce(p.active,true), p.created_at
from legacy.positions p
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 14. Recruiting costs  (legacy.recruiting_costs → public.recruiting_costs)
-- ---------------------------------------------------------------------------
insert into public.recruiting_costs (id, org_id, category, vendor, amount, period, notes, created_by, created_at)
select rc.id, (select id from public.organizations order by created_at limit 1),
       (case when rc.category in ('job_board','agency','referral','software','recruiter','other') then rc.category else 'other' end)::cost_category,
       rc.vendor, coalesce(rc.amount,0), rc.period, rc.notes, rc.created_by, rc.created_at
from legacy.recruiting_costs rc
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 15. Integrations marketplace  (legacy.integrations* → public.integrations*)
-- ---------------------------------------------------------------------------
insert into public.integrations (id, org_id, name, provider, category, status, auth_type, config_json, credentials_reference, base_url, webhook_url, sync_direction, sync_frequency, last_sync_at, is_enabled, created_by, created_at)
select i.id, (select id from public.organizations order by created_at limit 1),
       i.name, i.provider, i.category,
       (case when i.status in ('connected','disconnected','error','pending') then i.status else 'pending' end)::integration_status,
       (case when i.auth_type in ('api_key','bearer','oauth2','basic','webhook_secret','custom_header','none') then i.auth_type else 'api_key' end)::integration_auth,
       coalesce(i.config_json,'{}'::jsonb), i.credentials_reference, i.base_url, i.webhook_url,
       (case when i.sync_direction in ('inbound','outbound','bidirectional') then i.sync_direction else 'inbound' end)::sync_direction,
       coalesce(i.sync_frequency,'manual'), i.last_sync_at, coalesce(i.is_enabled,false), i.created_by, i.created_at
from legacy.integrations i
on conflict (id) do nothing;

insert into public.integration_credentials (id, integration_id, encrypted_credentials, created_at)
select ic.id, ic.integration_id, coalesce(ic.encrypted_credentials,'{}'::jsonb), ic.created_at
from legacy.integration_credentials ic
where exists (select 1 from public.integrations i where i.id = ic.integration_id)
on conflict (id) do nothing;

insert into public.integration_field_mappings (id, integration_id, source_field, target_field, transformation_rule, is_required, created_at)
select m.id, m.integration_id, m.source_field, m.target_field, m.transformation_rule, coalesce(m.is_required,false), m.created_at
from legacy.integration_field_mappings m
where exists (select 1 from public.integrations i where i.id = m.integration_id)
on conflict (id) do nothing;

insert into public.integration_logs (id, integration_id, event_type, status, message, request_payload, response_payload, created_at)
select l.id, l.integration_id, l.event_type, l.status, l.message, l.request_payload, l.response_payload, l.created_at
from legacy.integration_logs l
where exists (select 1 from public.integrations i where i.id = l.integration_id)
on conflict (id) do nothing;

insert into public.webhook_events (id, integration_id, event_type, source_platform, payload, processed_status, error_message, created_at, processed_at)
select w.id, w.integration_id, w.event_type, w.source_platform, coalesce(w.payload,'{}'::jsonb),
       (case when w.processed_status in ('pending','processing','completed','failed') then w.processed_status else 'pending' end)::webhook_status,
       w.error_message, w.created_at, w.processed_at
from legacy.webhook_events w
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Done. Run 11_migrate_assert.sql (or the inline checks) to verify row counts.
-- ============================================================================
