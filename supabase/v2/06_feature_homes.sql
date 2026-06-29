-- ============================================================================
-- Clinilytics ATS v2 — Feature-parity homes (full-replacement scope)
-- ----------------------------------------------------------------------------
-- The base v2 schema (01) is credentialing/requisitions-first. The production
-- app also ships seven features with no v2 home yet. The chosen cutover scope is
-- FULL PARITY, so this file adds a home for each, plus the parity tables (offers,
-- recruiting_costs, analytics_events, audit_logs) the analytics/finance pages
-- need. RLS for everything added here lives in 07_feature_rls.sql.
--
-- Features covered: coverage_needs (Have/Need) · screenings (AI + Vapi) ·
-- integrations marketplace · positions catalog · hiring-handoff checklists ·
-- public career page + intake · Excel/CSV import bookkeeping.
--
-- Apply after 05_region_isolation.sql. Idempotent where practical.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  create type coverage_priority  as enum ('standard','premium','urgent');
  create type screening_status   as enum ('draft','approved','sent','completed','analyzed','cancelled');
  create type screening_channel  as enum ('phone','sms','email','manual');
  create type integration_status as enum ('connected','disconnected','error','pending');
  create type integration_auth   as enum ('api_key','bearer','oauth2','basic','webhook_secret','custom_header','none');
  create type sync_direction     as enum ('inbound','outbound','bidirectional');
  create type webhook_status     as enum ('pending','processing','completed','failed');
  create type offer_status       as enum ('pending','sent','accepted','declined','expired','negotiating');
  create type cost_category      as enum ('job_board','agency','referral','software','recruiter','other');
exception
  when duplicate_object then null;
end $$;

-- ===========================================================================
-- Column additions to existing tables
-- ===========================================================================

-- Candidates: résumé text (matching), import-source bookkeeping (idempotent imports).
alter table public.candidates add column if not exists resume_text     text;
alter table public.candidates add column if not exists source_system   text;            -- e.g. 'sharepoint','xlsx_import'
alter table public.candidates add column if not exists source_key      text;            -- stable natural key from the sheet
alter table public.candidates add column if not exists source_modified timestamptz;     -- source row/file last-modified
create unique index if not exists uq_candidates_source
  on public.candidates (source_system, source_key)
  where source_system is not null and source_key is not null;

-- Requisitions: public career-page surface (mirrors the old jobs posting fields).
alter table public.requisitions add column if not exists slug             text;
alter table public.requisitions add column if not exists is_public        boolean not null default false;
alter table public.requisitions add column if not exists description      text;
alter table public.requisitions add column if not exists responsibilities text;
alter table public.requisitions add column if not exists requirements     text;
alter table public.requisitions add column if not exists benefits         text;
alter table public.requisitions add column if not exists location         text;
alter table public.requisitions add column if not exists employment_type  text not null default 'full_time'
  check (employment_type in ('full_time','part_time','contract','per_diem','temporary','internship'));
alter table public.requisitions add column if not exists workplace        text not null default 'onsite'
  check (workplace in ('onsite','hybrid','remote'));
alter table public.requisitions add column if not exists salary_min       numeric;
alter table public.requisitions add column if not exists salary_max       numeric;
alter table public.requisitions add column if not exists salary_unit      text not null default 'year'
  check (salary_unit in ('year','hour'));
create unique index if not exists uq_req_slug on public.requisitions (slug) where slug is not null;
create index if not exists idx_req_public on public.requisitions (is_public) where is_public;

-- Applications: career-intake extras + per-application hiring-handoff checklist.
-- `intake` holds career-form fields (linkedin, portfolio, cover_letter,
-- resume_url, custom_answers). `checklist` mirrors the old candidates.checklist
-- ({ "<step_key>": true }); the onboarding milestone dates mirror the old
-- candidate onboarding columns.
alter table public.applications add column if not exists intake                  jsonb not null default '{}'::jsonb;
alter table public.applications add column if not exists checklist               jsonb not null default '{}'::jsonb;
alter table public.applications add column if not exists background_sent_date    date;
alter table public.applications add column if not exists background_cleared_date date;
alter table public.applications add column if not exists welcome_call_done       boolean not null default false;
alter table public.applications add column if not exists start_date              date;

-- ===========================================================================
-- Facility coverage (Have / Need by role family) — the "coverage" view
-- ===========================================================================
create table if not exists public.coverage_needs (
  id               uuid primary key default gen_random_uuid(),
  facility_id      uuid not null references public.facilities(id) on delete cascade,
  role_family      text not null references public.role_families(code) on delete cascade,
  have_count       int not null default 0,
  need_count       int not null default 0,
  priority         coverage_priority not null default 'standard',
  current_provider text,
  description      text,                 -- position verbiage / requirements (AI matching)
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (facility_id, role_family)
);
create index if not exists idx_coverage_facility on public.coverage_needs (facility_id);

-- ===========================================================================
-- AI screening (questionnaire + responses + Vapi voice transcripts)
-- ===========================================================================
create table if not exists public.screenings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  requisition_id uuid references public.requisitions(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  recruiter_id   uuid references public.users(id) on delete set null,
  status         screening_status not null default 'draft',
  channel        screening_channel not null default 'phone',
  questions      jsonb not null default '[]'::jsonb,
  responses      jsonb not null default '[]'::jsonb,
  ai_summary     text,
  ai_score       int,
  ai_flags       jsonb not null default '[]'::jsonb,
  transcript     text,
  external_ref   text,                   -- Vapi call id, etc.
  approved_by    uuid references public.users(id) on delete set null,
  approved_at    timestamptz,
  sent_at        timestamptz,
  completed_at   timestamptz,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_screen_candidate on public.screenings (candidate_id);
create index if not exists idx_screen_org       on public.screenings (org_id);
create index if not exists idx_screen_status    on public.screenings (status);

-- Link a communication back to the screening that produced it (parity w/ old).
alter table public.communications add column if not exists screening_id uuid references public.screenings(id) on delete set null;
alter table public.communications add column if not exists ai_generated boolean not null default false;
alter table public.communications add column if not exists external_ref text;

-- ===========================================================================
-- Integrations marketplace (OAuth / webhook engine)
-- ===========================================================================
create table if not exists public.integrations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  provider      text not null,           -- 'indeed','checkr','custom_rest', …
  category      text not null,
  status        integration_status not null default 'pending',
  auth_type     integration_auth not null default 'api_key',
  config_json   jsonb not null default '{}'::jsonb,
  credentials_reference uuid,            -- → integration_credentials.id
  base_url      text,
  webhook_url   text,
  sync_direction sync_direction not null default 'inbound',
  sync_frequency text not null default 'manual',
  last_sync_at  timestamptz,
  is_enabled    boolean not null default false,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_integrations_org on public.integrations (org_id);

-- Secrets in their own table: admins write, NOBODY reads via the API (no select
-- policy). Only Edge Functions (service role) read them.
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
create index if not exists idx_integration_logs_integration on public.integration_logs (integration_id);

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
create index if not exists idx_field_mappings_integration on public.integration_field_mappings (integration_id);

create table if not exists public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid references public.integrations(id) on delete set null,
  event_type      text,
  source_platform text,
  payload         jsonb not null default '{}'::jsonb,
  processed_status webhook_status not null default 'pending',
  error_message   text,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);
create index if not exists idx_webhook_events_status on public.webhook_events (processed_status);

-- ===========================================================================
-- Positions catalog (shared role library with AI-authored content)
-- ===========================================================================
create table if not exists public.positions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  code             text,
  title            text not null,
  category         text,
  org_types        jsonb not null default '[]'::jsonb,
  rate_min         numeric,
  rate_max         numeric,
  rate_unit        text not null default 'NA',
  responsibilities jsonb not null default '[]'::jsonb,
  requirements     jsonb not null default '[]'::jsonb,
  keywords         jsonb not null default '[]'::jsonb,
  ai_generated     boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_positions_org on public.positions (org_id);

-- ===========================================================================
-- Offers (parity — base v2 has interviews/scorecards but no offers table)
-- ===========================================================================
create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  requisition_id uuid references public.requisitions(id) on delete set null,
  salary         numeric,
  bonus          numeric,
  equity         text,
  start_date     date,
  status         offer_status not null default 'pending',
  approved_by    uuid references public.users(id) on delete set null,
  approved_at    timestamptz,
  sent_at        timestamptz,
  signed_url     text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_offers_candidate on public.offers (candidate_id);
create index if not exists idx_offers_app       on public.offers (application_id);

-- ===========================================================================
-- Recruiting costs (Finance / cost-per-hire dashboard)
-- ===========================================================================
create table if not exists public.recruiting_costs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  category    cost_category not null,
  vendor      text,
  amount      numeric not null default 0,
  period      date,                       -- first-of-month bucket
  notes       text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_costs_period on public.recruiting_costs (period);

-- ===========================================================================
-- Analytics events + audit log (raw event stream + audit trail, parity)
-- ===========================================================================
create table if not exists public.analytics_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.organizations(id) on delete cascade,
  event_type     text not null,
  candidate_id   uuid,
  application_id uuid,
  requisition_id uuid,
  user_id        uuid,
  from_stage     text,
  to_stage       text,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_events_org     on public.analytics_events (org_id);
create index if not exists idx_events_type    on public.analytics_events (event_type);
create index if not exists idx_events_created on public.analytics_events (created_at);

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade,
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null,              -- 'candidate_reassign','role_change', …
  entity_type text,
  entity_id   uuid,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_org    on public.audit_logs (org_id);
create index if not exists idx_audit_entity on public.audit_logs (entity_type, entity_id);

-- ===========================================================================
-- updated_at triggers for the new mutable tables
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'coverage_needs','screenings','integrations','integration_credentials',
    'integration_field_mappings','positions','offers','recruiting_costs'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ===========================================================================
-- Public career-page intake (anonymous apply → candidate + application)
-- ===========================================================================
-- SECURITY DEFINER so an unauthenticated career-page submission can create the
-- candidate + application without broad RLS grants. Only applies to a public,
-- open requisition. De-dupes the candidate by email within the org.
create or replace function public.apply_to_requisition(
  p_requisition_id uuid,
  p_full_name      text,
  p_email          text,
  p_phone          text default null,
  p_resume_text    text default null,
  p_source         text default 'Career Site',
  p_intake         jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid;
  v_rf     text;
  v_cand   uuid;
  v_stage  uuid;
  v_app    uuid;
begin
  select org_id, role_family into v_org, v_rf
    from public.requisitions
   where id = p_requisition_id and is_public and status = 'open';
  if v_org is null then
    raise exception 'Requisition is not open to public applications';
  end if;

  -- Reuse an existing candidate (same org + email), else create one.
  if p_email is not null and length(trim(p_email)) > 0 then
    select id into v_cand from public.candidates
     where org_id = v_org and lower(email) = lower(p_email) limit 1;
  end if;
  if v_cand is null then
    insert into public.candidates (org_id, full_name, email, phone, source, status, resume_text)
    values (v_org, p_full_name, p_email, p_phone, p_source, 'new', p_resume_text)
    returning id into v_cand;
  end if;

  -- First pipeline stage for the requisition's role family (lowest sort_order).
  select id into v_stage from public.pipeline_stages
   where role_family = v_rf order by sort_order limit 1;

  -- One application per (candidate, requisition).
  insert into public.applications (org_id, candidate_id, requisition_id, current_stage_id, status, intake)
  values (v_org, v_cand, p_requisition_id, v_stage, 'active', coalesce(p_intake,'{}'::jsonb))
  on conflict (candidate_id, requisition_id) do update set intake = excluded.intake
  returning id into v_app;

  insert into public.analytics_events (org_id, event_type, candidate_id, application_id, requisition_id, payload)
  values (v_org, 'career_application', v_cand, v_app, p_requisition_id, jsonb_build_object('source', p_source));

  return v_app;
end $$;

grant execute on function public.apply_to_requisition(uuid,text,text,text,text,text,jsonb) to anon, authenticated;
