-- ============================================================================
-- Clinilytics ATS v2 — seed data
-- ----------------------------------------------------------------------------
-- 1 org, 4 users, 2 facilities, role families (RN/NP/MD/CNA), pipeline stages,
-- facility credential requirements, 4 requisitions, 15 candidates with varied
-- credential states, and sample applications. Dates are relative to today so
-- "expired vs current" stays meaningful whenever you run it.
--
-- NOTE: users are inserted directly into public.users for demo/testing. For real
-- logins, each id must match an auth.users row (the handle_new_user trigger syncs
-- new sign-ups automatically). Apply after 03_placement_ready.sql.
-- ============================================================================

-- ---- org & users ----
insert into public.organizations (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'American Medical Administrators', 'ama')
on conflict (id) do nothing;

insert into public.users (id, org_id, email, full_name, role) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'admin@ama.example',      'Avery Admin',       'admin'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'recruiter@ama.example',  'Riley Recruiter',   'recruiter'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'manager@ama.example',    'Morgan Manager',    'hiring_manager'),
  ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', 'compliance@ama.example', 'Casey Compliance',  'compliance')
on conflict (id) do nothing;

-- ---- role families ----
insert into public.role_families (code, label, description, sort_order) values
  ('RN',  'Registered Nurse',          'RN roles across acute & post-acute', 1),
  ('NP',  'Nurse Practitioner',        'Advanced practice providers',        2),
  ('MD',  'Physician',                 'MD/DO physicians & hospitalists',    3),
  ('CNA', 'Certified Nursing Assistant','Nurse aides / techs',               4)
on conflict (code) do nothing;

-- ---- facilities ----
insert into public.facilities (id, org_id, name, state, city, requirements) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', '11111111-1111-1111-1111-111111111111', 'St. Mary Skilled Nursing', 'OH', 'Columbus',  '{"shift":"days/nights","ratio":"1:8"}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', '11111111-1111-1111-1111-111111111111', 'Lakeside Medical Center',  'MO', 'Kansas City','{"shift":"rotating","ehr":"Epic"}')
on conflict (id) do nothing;

-- ---- pipeline stages (per role family) ----
insert into public.pipeline_stages (role_family, name, sort_order, stage_type, is_terminal)
select rf.code, s.name, s.sort, s.stype, s.terminal
from (values ('RN'),('NP'),('MD'),('CNA')) as rf(code)
cross join (values
  ('Applied',   1, 'applied',   false),
  ('Screen',    2, 'screen',    false),
  ('Interview', 3, 'interview', false),
  ('Offer',     4, 'offer',     false),
  ('Hired',     5, 'hired',     true),
  ('Rejected',  6, 'rejected',  true)
) as s(name, sort, stype, terminal)
on conflict (role_family, sort_order) do nothing;

-- ---- facility credential requirements ----
insert into public.facility_credential_requirements (facility_id, role_family, credential_type) values
  -- St. Mary (F1): RN + CNA
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'RN',  'license'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'RN',  'bls'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'RN',  'immunization'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'CNA', 'license'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'CNA', 'bls'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'CNA', 'immunization'),
  -- Lakeside (F2): NP + MD
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'NP',  'license'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'NP',  'board_cert'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'NP',  'dea'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'NP',  'bls'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'MD',  'license'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'MD',  'board_cert'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'MD',  'dea'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'MD',  'bls')
on conflict (facility_id, role_family, credential_type) do nothing;

-- ---- requisitions ----
insert into public.requisitions (id, org_id, facility_id, title, role_family, specialty, status, headcount, budget, hiring_manager_id, approval_status, opened_at) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd01', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Registered Nurse — Med/Surg',      'RN',  'Med/Surg',     'open', 3, 95000,  '22222222-2222-2222-2222-222222222203', 'approved', now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddd02', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'Nurse Practitioner — Primary Care','NP',  'Primary Care', 'open', 1, 130000, '22222222-2222-2222-2222-222222222203', 'approved', now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddd03', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'Certified Nursing Assistant',      'CNA', null,           'open', 5, 38000,  '22222222-2222-2222-2222-222222222203', 'approved', now()),
  ('dddddddd-dddd-dddd-dddd-dddddddddd04', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'Hospitalist Physician',            'MD',  'Hospital Med', 'open', 1, 280000, '22222222-2222-2222-2222-222222222203', 'approved', now())
on conflict (id) do nothing;

-- ---- candidates (15, varied) ----
insert into public.candidates (id, org_id, full_name, email, phone, source, status, tags, created_by) values
  ('cccccccc-cccc-cccc-cccc-cccccccccc01','11111111-1111-1111-1111-111111111111','Olivia Bennett','olivia.bennett@example.com','6145550101','Indeed',     'active', '{RN,OH}',          '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02','11111111-1111-1111-1111-111111111111','Marcus Lee',    'marcus.lee@example.com',    '6145550102','Referral',   'active', '{RN,OH}',          '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc03','11111111-1111-1111-1111-111111111111','Priya Nair',    'priya.nair@example.com',    '6145550103','Career Site','active', '{RN}',             '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc04','11111111-1111-1111-1111-111111111111','David Kim',     'david.kim@example.com',     '6145550104','LinkedIn',   'active', '{RN}',             '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc05','11111111-1111-1111-1111-111111111111','Sara Cohen',    'sara.cohen@example.com',    '6145550105','Indeed',     'active', '{CNA,OH}',         '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc06','11111111-1111-1111-1111-111111111111','Tom Rivera',    'tom.rivera@example.com',    '6145550106','Agency',     'active', '{CNA}',            '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc07','11111111-1111-1111-1111-111111111111','Nina Patel',    'nina.patel@example.com',    '8165550107','Referral',   'active', '{NP,MO}',          '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc08','11111111-1111-1111-1111-111111111111','Greg Olsen',    'greg.olsen@example.com',    '8165550108','LinkedIn',   'active', '{NP}',             '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc09','11111111-1111-1111-1111-111111111111','Maya Singh',    'maya.singh@example.com',    '8165550109','Career Site','passive','{NP}',             '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc10','11111111-1111-1111-1111-111111111111','Robert Frost',  'robert.frost@example.com',  '8165550110','Referral',   'active', '{MD,MO}',          '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc11','11111111-1111-1111-1111-111111111111','Elena Diaz',    'elena.diaz@example.com',    '8165550111','Indeed',     'active', '{MD}',             '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc12','11111111-1111-1111-1111-111111111111','Hassan Ali',    'hassan.ali@example.com',    '6145550112','Indeed',     'active', '{RN,OH}',          '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc13','11111111-1111-1111-1111-111111111111','Grace Park',    'grace.park@example.com',    '6145550113','Agency',     'active', '{CNA}',            '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc14','11111111-1111-1111-1111-111111111111','Liam Walsh',    'liam.walsh@example.com',    '8165550114','Career Site','new',    '{NP}',             '22222222-2222-2222-2222-222222222202'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc15','11111111-1111-1111-1111-111111111111','Aisha Khan',    'aisha.khan@example.com',    '6145550115','Referral',   'active', '{RN,OH,float}',    '22222222-2222-2222-2222-222222222202')
on conflict (id) do nothing;

-- ---- credentials (varied: verified+current, expired, pending, missing) ----
-- Helper date shorthands used below: current_date +/- intervals.
insert into public.credentials (candidate_id, type, number, issuing_state, issue_date, expiration_date, verification_status, primary_source_verified) values
  -- 01 Olivia (RN)  -> READY for F1/RN
  ('cccccccc-cccc-cccc-cccc-cccccccccc01','license','RN-OH-10001','OH',(current_date - interval '2 years')::date,(current_date + interval '2 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc01','bls','BLS-10001',null,(current_date - interval '6 months')::date,(current_date + interval '18 months')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc01','immunization','IMM-10001','OH',(current_date - interval '1 year')::date,(current_date + interval '1 year')::date,'verified',false),
  -- 02 Marcus (RN)  -> NOT ready (BLS expired)
  ('cccccccc-cccc-cccc-cccc-cccccccccc02','license','RN-OH-10002','OH',(current_date - interval '3 years')::date,(current_date + interval '1 year')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02','bls','BLS-10002',null,(current_date - interval '2 years')::date,(current_date - interval '10 days')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02','immunization','IMM-10002','OH',(current_date - interval '1 year')::date,(current_date + interval '1 year')::date,'verified',false),
  -- 03 Priya (RN)   -> NOT ready (license unverified)
  ('cccccccc-cccc-cccc-cccc-cccccccccc03','license','RN-OH-10003','OH',(current_date - interval '1 year')::date,(current_date + interval '2 years')::date,'pending',false),
  ('cccccccc-cccc-cccc-cccc-cccccccccc03','bls','BLS-10003',null,(current_date - interval '3 months')::date,(current_date + interval '21 months')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc03','immunization','IMM-10003','OH',(current_date - interval '8 months')::date,(current_date + interval '1 year')::date,'verified',false),
  -- 04 David (RN)   -> NOT ready (missing immunization)
  ('cccccccc-cccc-cccc-cccc-cccccccccc04','license','RN-OH-10004','OH',(current_date - interval '2 years')::date,(current_date + interval '2 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc04','bls','BLS-10004',null,(current_date - interval '4 months')::date,(current_date + interval '20 months')::date,'verified',true),
  -- 05 Sara (CNA)   -> READY for F1/CNA
  ('cccccccc-cccc-cccc-cccc-cccccccccc05','license','CNA-OH-20005','OH',(current_date - interval '1 year')::date,(current_date + interval '1 year')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc05','bls','BLS-20005',null,(current_date - interval '2 months')::date,(current_date + interval '22 months')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc05','immunization','IMM-20005','OH',(current_date - interval '6 months')::date,(current_date + interval '18 months')::date,'verified',false),
  -- 06 Tom (CNA)    -> NOT ready (BLS expired)
  ('cccccccc-cccc-cccc-cccc-cccccccccc06','license','CNA-OH-20006','OH',(current_date - interval '1 year')::date,(current_date + interval '1 year')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc06','bls','BLS-20006',null,(current_date - interval '3 years')::date,(current_date - interval '5 days')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc06','immunization','IMM-20006','OH',(current_date - interval '7 months')::date,(current_date + interval '1 year')::date,'verified',false),
  -- 07 Nina (NP)    -> READY for F2/NP
  ('cccccccc-cccc-cccc-cccc-cccccccccc07','license','NP-MO-30007','MO',(current_date - interval '2 years')::date,(current_date + interval '2 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc07','board_cert','BC-30007',null,(current_date - interval '3 years')::date,(current_date + interval '4 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc07','dea','DEA-30007','MO',(current_date - interval '1 year')::date,(current_date + interval '2 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc07','bls','BLS-30007',null,(current_date - interval '5 months')::date,(current_date + interval '19 months')::date,'verified',true),
  -- 08 Greg (NP)    -> NOT ready (DEA expired)
  ('cccccccc-cccc-cccc-cccc-cccccccccc08','license','NP-MO-30008','MO',(current_date - interval '2 years')::date,(current_date + interval '2 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc08','board_cert','BC-30008',null,(current_date - interval '2 years')::date,(current_date + interval '5 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc08','dea','DEA-30008','MO',(current_date - interval '4 years')::date,(current_date - interval '1 month')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc08','bls','BLS-30008',null,(current_date - interval '6 months')::date,(current_date + interval '18 months')::date,'verified',true),
  -- 09 Maya (NP)    -> NOT ready (board_cert pending)
  ('cccccccc-cccc-cccc-cccc-cccccccccc09','license','NP-MO-30009','MO',(current_date - interval '1 year')::date,(current_date + interval '3 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc09','board_cert','BC-30009',null,(current_date - interval '1 month')::date,(current_date + interval '5 years')::date,'pending',false),
  ('cccccccc-cccc-cccc-cccc-cccccccccc09','dea','DEA-30009','MO',(current_date - interval '1 year')::date,(current_date + interval '2 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc09','bls','BLS-30009',null,(current_date - interval '2 months')::date,(current_date + interval '22 months')::date,'verified',true),
  -- 10 Robert (MD)  -> READY for F2/MD
  ('cccccccc-cccc-cccc-cccc-cccccccccc10','license','MD-MO-40010','MO',(current_date - interval '5 years')::date,(current_date + interval '3 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc10','board_cert','BC-40010',null,(current_date - interval '6 years')::date,(current_date + interval '4 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc10','dea','DEA-40010','MO',(current_date - interval '2 years')::date,(current_date + interval '1 year')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc10','bls','BLS-40010',null,(current_date - interval '7 months')::date,(current_date + interval '17 months')::date,'verified',true),
  -- 11 Elena (MD)   -> NOT ready (missing BLS)
  ('cccccccc-cccc-cccc-cccc-cccccccccc11','license','MD-MO-40011','MO',(current_date - interval '4 years')::date,(current_date + interval '3 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc11','board_cert','BC-40011',null,(current_date - interval '5 years')::date,(current_date + interval '4 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc11','dea','DEA-40011','MO',(current_date - interval '1 year')::date,(current_date + interval '2 years')::date,'verified',true),
  -- 12 Hassan (RN)  -> READY for F1/RN
  ('cccccccc-cccc-cccc-cccc-cccccccccc12','license','RN-OH-10012','OH',(current_date - interval '3 years')::date,(current_date + interval '1 year')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc12','bls','BLS-10012',null,(current_date - interval '1 month')::date,(current_date + interval '23 months')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc12','immunization','IMM-10012','OH',(current_date - interval '5 months')::date,(current_date + interval '19 months')::date,'verified',false),
  -- 13 Grace (CNA)  -> NOT ready (immunization pending)
  ('cccccccc-cccc-cccc-cccc-cccccccccc13','license','CNA-OH-20013','OH',(current_date - interval '1 year')::date,(current_date + interval '1 year')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc13','bls','BLS-20013',null,(current_date - interval '2 months')::date,(current_date + interval '22 months')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc13','immunization','IMM-20013','OH',(current_date - interval '1 month')::date,(current_date + interval '1 year')::date,'pending',false),
  -- 14 Liam (NP)    -> NOT ready (no credentials on file yet)
  -- (intentionally none)
  -- 15 Aisha (RN)   -> READY for F1/RN (extra DEA beyond requirements)
  ('cccccccc-cccc-cccc-cccc-cccccccccc15','license','RN-OH-10015','OH',(current_date - interval '1 year')::date,(current_date + interval '3 years')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc15','bls','BLS-10015',null,(current_date - interval '2 months')::date,(current_date + interval '22 months')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc15','immunization','IMM-10015','OH',(current_date - interval '4 months')::date,(current_date + interval '20 months')::date,'verified',true),
  ('cccccccc-cccc-cccc-cccc-cccccccccc15','dea','DEA-10015','OH',(current_date - interval '1 year')::date,(current_date + interval '2 years')::date,'verified',true)
on conflict do nothing;

-- ---- applications (varied stages; the stage-history trigger fills history) ----
insert into public.applications (org_id, candidate_id, requisition_id, current_stage_id, status, applied_at)
select '11111111-1111-1111-1111-111111111111', x.cand, x.req,
       (select id from public.pipeline_stages where role_family = x.rf and name = x.stage),
       'active', now() - x.age
from (values
  ('cccccccc-cccc-cccc-cccc-cccccccccc01','dddddddd-dddd-dddd-dddd-dddddddddd01','RN','Interview', interval '12 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc02','dddddddd-dddd-dddd-dddd-dddddddddd01','RN','Screen',    interval '9 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc03','dddddddd-dddd-dddd-dddd-dddddddddd01','RN','Applied',   interval '4 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc12','dddddddd-dddd-dddd-dddd-dddddddddd01','RN','Interview', interval '7 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc15','dddddddd-dddd-dddd-dddd-dddddddddd01','RN','Offer',     interval '15 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc07','dddddddd-dddd-dddd-dddd-dddddddddd02','NP','Offer',     interval '20 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc09','dddddddd-dddd-dddd-dddd-dddddddddd02','NP','Screen',    interval '6 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc14','dddddddd-dddd-dddd-dddd-dddddddddd02','NP','Applied',   interval '2 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc05','dddddddd-dddd-dddd-dddd-dddddddddd03','CNA','Screen',   interval '5 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc13','dddddddd-dddd-dddd-dddd-dddddddddd03','CNA','Applied',  interval '3 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc10','dddddddd-dddd-dddd-dddd-dddddddddd04','MD','Interview', interval '11 days'),
  ('cccccccc-cccc-cccc-cccc-cccccccccc11','dddddddd-dddd-dddd-dddd-dddddddddd04','MD','Screen',    interval '8 days')
) as x(cand, req, rf, stage, age)
on conflict (candidate_id, requisition_id) do nothing;
