-- ============================================================================
-- Clinilytics ATS — v2 schema (healthcare credentialing-first redesign)
-- ----------------------------------------------------------------------------
-- Migration SQL: extensions, enums, tables, triggers, and analytics indexes.
-- RLS lives in 02_rls.sql, the placement-ready logic in 03_placement_ready.sql,
-- and seed data in 04_seed.sql. Apply in that order. See README.md.
--
-- This is a clean v2 design intended to REPLACE the current public schema. It is
-- NOT applied to production; run it against a fresh project or a Supabase branch.
-- Idempotent where practical (guards on types/tables) so it is safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  create type user_role          as enum ('admin','recruiter','coordinator','hiring_manager','compliance');
  create type requisition_status as enum ('draft','open','on_hold','filled','closed','cancelled');
  create type approval_status    as enum ('pending','approved','rejected');
  create type application_status as enum ('active','rejected','withdrawn','hired');
  create type candidate_status   as enum ('new','active','passive','placed','do_not_contact','archived');
  create type document_type      as enum ('resume','license','board_cert','dea','immunization','bls','reference','other');
  create type document_status    as enum ('pending','verified','rejected','expired');
  create type credential_type    as enum ('license','board_cert','dea','immunization','bls');
  create type verification_status as enum ('unverified','pending','verified','rejected','expired');
  create type interview_type     as enum ('phone_screen','video','onsite','panel','clinical');
  create type interview_status   as enum ('scheduled','completed','cancelled','no_show','rescheduled');
  create type comm_channel       as enum ('email','sms','call');
  create type comm_direction     as enum ('inbound','outbound');
  create type sentiment          as enum ('positive','neutral','negative');
  create type scorecard_rec      as enum ('strong_yes','yes','no','strong_no');
exception
  when duplicate_object then null;  -- re-run safe
end $$;

-- ---------------------------------------------------------------------------
-- updated_at touch trigger (attached per-table below)
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ===========================================================================
-- Core tenancy & identity
-- ===========================================================================
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- App users. id mirrors auth.users(id); a handle_new_user trigger (see 02_rls.sql)
-- syncs new auth sign-ups into this table, so it is not hard-FK'd to auth.users
-- (keeps seeding standalone). RLS keys off auth.uid() = users.id.
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        user_role not null default 'recruiter',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, email)
);

-- Role families (RN, NP, MD, CNA, …). Drives pipeline stages and credential reqs.
create table if not exists public.role_families (
  code        text primary key,            -- e.g. 'RN'
  label       text not null,               -- 'Registered Nurse'
  description text,
  sort_order  int not null default 0
);

-- ===========================================================================
-- Facilities & requirements
-- ===========================================================================
create table if not exists public.facilities (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  state        text,                       -- 2-letter US state
  city         text,
  address      text,
  -- Free-form facility-level requirements (shift patterns, ratios, EHR, etc.).
  -- Credential rules live in facility_credential_requirements below.
  requirements jsonb not null default '{}'::jsonb,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Which credential types a facility requires for a given role family.
create table if not exists public.facility_credential_requirements (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid not null references public.facilities(id) on delete cascade,
  role_family     text not null references public.role_families(code) on delete cascade,
  credential_type credential_type not null,
  is_required     boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (facility_id, role_family, credential_type)
);

-- ===========================================================================
-- Pipeline stages (per role family, ordered)
-- ===========================================================================
create table if not exists public.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  role_family text not null references public.role_families(code) on delete cascade,
  name        text not null,
  sort_order  int not null,
  -- coarse classification used by funnel/conversion analytics
  stage_type  text not null default 'in_process'
                check (stage_type in ('applied','screen','interview','offer','hired','rejected','in_process')),
  is_terminal boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (role_family, sort_order),
  unique (role_family, name)
);

-- ===========================================================================
-- Candidates
-- ===========================================================================
create table if not exists public.candidates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  full_name   text not null,
  email       text,
  phone       text,
  source      text,                        -- Indeed, Referral, Career Site, …
  status      candidate_status not null default 'new',
  tags        text[] not null default '{}',
  notes       text,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ===========================================================================
-- Requisitions
-- ===========================================================================
create table if not exists public.requisitions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  facility_id      uuid not null references public.facilities(id) on delete restrict,
  title            text not null,
  role_family      text not null references public.role_families(code) on delete restrict,
  specialty        text,
  status           requisition_status not null default 'draft',
  headcount        int not null default 1 check (headcount >= 1),
  budget           numeric(12,2),
  hiring_manager_id uuid references public.users(id) on delete set null,
  approval_status  approval_status not null default 'pending',
  opened_at        timestamptz,
  filled_at        timestamptz,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ===========================================================================
-- Applications & stage history
-- ===========================================================================
create table if not exists public.applications (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  candidate_id     uuid not null references public.candidates(id) on delete cascade,
  requisition_id   uuid not null references public.requisitions(id) on delete cascade,
  current_stage_id uuid references public.pipeline_stages(id) on delete set null,
  status           application_status not null default 'active',
  applied_at       timestamptz not null default now(),
  reject_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (candidate_id, requisition_id)
);

-- One row per stage entry. exited_at null = currently in that stage. Drives the
-- time-in-stage analytics (duration = coalesce(exited_at, now()) - entered_at).
create table if not exists public.application_stage_history (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_stage_id  uuid references public.pipeline_stages(id) on delete set null,
  stage_id       uuid references public.pipeline_stages(id) on delete set null,
  entered_at     timestamptz not null default now(),
  exited_at      timestamptz,
  changed_by     uuid references public.users(id) on delete set null
);

-- ===========================================================================
-- Documents & credentials
-- ===========================================================================
create table if not exists public.candidate_documents (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  type         document_type not null,
  -- Reference into Supabase Storage (bucket/path), not the bytes themselves.
  storage_path text,
  file_name    text,
  status       document_status not null default 'pending',
  uploaded_by  uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.credentials (
  id                    uuid primary key default gen_random_uuid(),
  candidate_id          uuid not null references public.candidates(id) on delete cascade,
  type                  credential_type not null,
  number                text,
  issuing_state         text,
  issue_date            date,
  expiration_date       date,
  verification_status   verification_status not null default 'unverified',
  primary_source_verified boolean not null default false,
  verified_by           uuid references public.users(id) on delete set null,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ===========================================================================
-- Interviews & scorecards
-- ===========================================================================
create table if not exists public.interviews (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  scheduled_at   timestamptz,
  type           interview_type not null default 'phone_screen',
  interviewers   uuid[] not null default '{}',  -- user ids
  status         interview_status not null default 'scheduled',
  location       text,
  duration_min   int default 30,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.scorecards (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  interview_id   uuid references public.interviews(id) on delete set null,
  reviewer_id    uuid references public.users(id) on delete set null,
  recommendation scorecard_rec,
  overall_rating int check (overall_rating between 1 and 5),
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.scorecard_responses (
  id           uuid primary key default gen_random_uuid(),
  scorecard_id uuid not null references public.scorecards(id) on delete cascade,
  criterion    text not null,
  rating       int check (rating between 1 and 5),
  comment      text
);

-- ===========================================================================
-- Communications
-- ===========================================================================
create table if not exists public.communications (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  channel        comm_channel not null,
  direction      comm_direction not null,
  subject        text,
  body           text,
  transcript     text,
  sentiment      sentiment,
  occurred_at    timestamptz not null default now(),
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ===========================================================================
-- AI governance / audit
-- ===========================================================================
create table if not exists public.ai_decisions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  entity_type      text not null,           -- 'candidate' | 'application' | 'credential' | …
  entity_id        uuid not null,
  model            text,                    -- e.g. 'claude-opus'
  score            numeric,
  rationale        text,
  checklist        jsonb not null default '{}'::jsonb,
  created_by_agent text,                    -- which agent/automation produced it
  human_override   boolean not null default false,
  overridden_by    uuid references public.users(id) on delete set null,
  overridden_at    timestamptz,
  created_at       timestamptz not null default now()
);

-- ===========================================================================
-- KPI snapshots (trend storage)
-- ===========================================================================
create table if not exists public.kpi_snapshots (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  metric          text not null,            -- 'time_to_fill', 'avg_time_in_stage', …
  dimension       text,                     -- 'facility' | 'source' | 'stage' | null
  dimension_value text,
  value           numeric,
  period_start    date not null,
  period_end      date not null,
  captured_at     timestamptz not null default now(),
  unique (org_id, metric, dimension, dimension_value, period_start, period_end)
);

-- ===========================================================================
-- Triggers
-- ===========================================================================
-- updated_at on every mutable table
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','users','facilities','candidates','requisitions','applications',
    'candidate_documents','credentials','interviews','scorecards'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Requisition status → date stamping.
create or replace function public.requisition_dates()
returns trigger language plpgsql as $$
begin
  if new.status = 'open' and new.opened_at is null then
    new.opened_at := now();
  end if;
  if new.status = 'filled' and new.filled_at is null then
    new.filled_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_requisition_dates on public.requisitions;
create trigger trg_requisition_dates before insert or update on public.requisitions
  for each row execute function public.requisition_dates();

-- Application stage history: open a row on insert; on stage change, close the
-- open row and open the next. This is the spine of time-in-stage analytics.
create or replace function public.log_application_stage()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_stage_history (application_id, stage_id, entered_at)
    values (new.id, new.current_stage_id, now());
  elsif tg_op = 'UPDATE' and new.current_stage_id is distinct from old.current_stage_id then
    update public.application_stage_history
       set exited_at = now()
     where application_id = new.id and exited_at is null;
    insert into public.application_stage_history (application_id, from_stage_id, stage_id, entered_at)
    values (new.id, old.current_stage_id, new.current_stage_id, now());
  end if;
  return new;
end $$;
drop trigger if exists trg_log_application_stage on public.applications;
create trigger trg_log_application_stage after insert or update of current_stage_id on public.applications
  for each row execute function public.log_application_stage();

-- ===========================================================================
-- Indexes — tuned for the KPI/analytics module
-- ===========================================================================
-- time-in-stage
create index if not exists idx_ash_application   on public.application_stage_history (application_id);
create index if not exists idx_ash_stage         on public.application_stage_history (stage_id);
create index if not exists idx_ash_entered_at    on public.application_stage_history (entered_at);
create index if not exists idx_ash_open          on public.application_stage_history (application_id) where exited_at is null;

-- pipeline / funnel
create index if not exists idx_app_requisition   on public.applications (requisition_id);
create index if not exists idx_app_candidate     on public.applications (candidate_id);
create index if not exists idx_app_stage         on public.applications (current_stage_id);
create index if not exists idx_app_status        on public.applications (status);
create index if not exists idx_app_applied_at    on public.applications (applied_at);
create index if not exists idx_app_org           on public.applications (org_id);

-- source & facility analytics
create index if not exists idx_cand_source       on public.candidates (source);
create index if not exists idx_cand_org          on public.candidates (org_id);
create index if not exists idx_cand_status       on public.candidates (status);
create index if not exists idx_cand_tags         on public.candidates using gin (tags);
create index if not exists idx_req_facility      on public.requisitions (facility_id);
create index if not exists idx_req_role_family   on public.requisitions (role_family);
create index if not exists idx_req_status        on public.requisitions (status);
create index if not exists idx_req_opened_at     on public.requisitions (opened_at);
create index if not exists idx_req_filled_at     on public.requisitions (filled_at);

-- credentials (placement-ready checks + expiry sweeps)
create index if not exists idx_cred_candidate    on public.credentials (candidate_id);
create index if not exists idx_cred_type         on public.credentials (type);
create index if not exists idx_cred_expiration   on public.credentials (expiration_date);
create index if not exists idx_cred_status       on public.credentials (verification_status);
create index if not exists idx_fcr_facility_rf   on public.facility_credential_requirements (facility_id, role_family);

-- comms / interviews / kpis
create index if not exists idx_comm_candidate    on public.communications (candidate_id);
create index if not exists idx_comm_occurred_at  on public.communications (occurred_at);
create index if not exists idx_interview_app     on public.interviews (application_id);
create index if not exists idx_kpi_lookup        on public.kpi_snapshots (org_id, metric, dimension, period_start);
create index if not exists idx_ai_entity         on public.ai_decisions (entity_type, entity_id);
