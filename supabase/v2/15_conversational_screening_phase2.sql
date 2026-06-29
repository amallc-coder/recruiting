-- ============================================================================
-- Conversational screening, phase 2 (applied as migrations
-- `conversational_screening_phase2` + `sms_webhook_phone_lookup`):
--   (1) per-requisition auto-screen-on-apply (opt-in)
--   (2) candidate self-scheduling (interview slots + token + public RPCs)
--   (3) phone -> candidate lookup for the inbound SMS agent
-- Additive + nullable-safe; defaults keep existing behavior unchanged.
--
-- Companion edge functions (deployed separately, verify_jwt off):
--   auto-screen-dispatch — places the Vapi voice call / SMS for an auto screening
--   sms-webhook          — inbound text-screening agent (Vapi number)
-- ============================================================================

create extension if not exists pg_net;

-- ---- (1) auto-screen config on requisitions (opt-in, default OFF) ----
alter table public.requisitions
  add column if not exists auto_screen boolean not null default false;
alter table public.requisitions
  add column if not exists auto_screen_channel text not null default 'both';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'requisitions_auto_screen_channel_chk') then
    alter table public.requisitions
      add constraint requisitions_auto_screen_channel_chk
      check (auto_screen_channel in ('sms','phone','both'));
  end if;
end $$;

-- ---- (2a) opaque per-application self-scheduling token ----
alter table public.applications
  add column if not exists schedule_token uuid not null default gen_random_uuid();
create unique index if not exists idx_applications_schedule_token
  on public.applications(schedule_token);

-- ---- (2b) interview slots for candidate self-scheduling ----
create table if not exists public.interview_slots (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  requisition_id        uuid references public.requisitions(id) on delete cascade,
  facility_id           uuid references public.facilities(id) on delete set null,
  starts_at             timestamptz not null,
  duration_min          int not null default 30,
  location              text,
  type                  public.interview_type not null default 'phone_screen',
  booked_by_application uuid references public.applications(id) on delete set null,
  booked_at             timestamptz,
  created_by            uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default now()
);
create index if not exists idx_interview_slots_req on public.interview_slots(requisition_id, starts_at);
alter table public.interview_slots enable row level security;
drop policy if exists slot_select on public.interview_slots;
create policy slot_select on public.interview_slots for select using (org_id = public.current_org());
drop policy if exists slot_write on public.interview_slots;
create policy slot_write on public.interview_slots for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

-- ---- (2c) public scheduling RPCs (SECURITY DEFINER, keyed on the opaque token) ----
create or replace function public.schedule_context(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_app record; v_title text; v_facility text; v_name text; v_slots jsonb; v_booked jsonb;
begin
  select * into v_app from public.applications where schedule_token = p_token and status = 'active';
  if v_app is null then return jsonb_build_object('error', 'This scheduling link is not valid or has expired.'); end if;
  select r.title, f.name into v_title, v_facility
    from public.requisitions r left join public.facilities f on f.id = r.facility_id
    where r.id = v_app.requisition_id;
  select full_name into v_name from public.candidates where id = v_app.candidate_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'starts_at', s.starts_at, 'duration_min', s.duration_min,
           'location', s.location, 'type', s.type) order by s.starts_at), '[]'::jsonb)
    into v_slots from public.interview_slots s
    where s.requisition_id = v_app.requisition_id and s.booked_by_application is null and s.starts_at > now();
  select jsonb_build_object('starts_at', s.starts_at, 'location', s.location, 'duration_min', s.duration_min)
    into v_booked from public.interview_slots s where s.booked_by_application = v_app.id limit 1;
  return jsonb_build_object(
    'candidate_name', v_name, 'requisition_title', v_title, 'facility', v_facility,
    'slots', v_slots, 'booked', v_booked);
end $$;

create or replace function public.book_interview_slot(p_token uuid, p_slot_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_app record; v_slot record;
begin
  select * into v_app from public.applications where schedule_token = p_token and status = 'active';
  if v_app is null then return jsonb_build_object('error', 'This scheduling link is not valid or has expired.'); end if;
  update public.interview_slots set booked_by_application = null, booked_at = null
    where booked_by_application = v_app.id;
  update public.interview_slots set booked_by_application = v_app.id, booked_at = now()
    where id = p_slot_id and requisition_id = v_app.requisition_id
      and booked_by_application is null and starts_at > now()
    returning * into v_slot;
  if v_slot is null then return jsonb_build_object('error', 'That time was just taken. Please choose another.'); end if;
  insert into public.interviews (application_id, scheduled_at, type, interviewers, status, location, duration_min)
    values (v_app.id, v_slot.starts_at, v_slot.type, '{}', 'scheduled', v_slot.location, v_slot.duration_min);
  insert into public.communications (candidate_id, application_id, channel, direction, body, ai_generated, occurred_at)
    values (v_app.candidate_id, v_app.id, 'sms', 'inbound',
            'Candidate self-scheduled an interview for ' || to_char(v_slot.starts_at, 'YYYY-MM-DD HH24:MI'),
            false, now());
  return jsonb_build_object('ok', true, 'scheduled_at', v_slot.starts_at);
end $$;

grant execute on function public.schedule_context(uuid) to anon, authenticated;
grant execute on function public.book_interview_slot(uuid, uuid) to anon, authenticated;

-- ---- (1) auto-screen-on-apply trigger (creates a ready screening + async dispatch) ----
-- Fully exception-wrapped: auto-screen must NEVER block the application insert.
create or replace function public.auto_screen_on_apply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_auto_screen boolean; v_channel_cfg text; v_qs jsonb; v_org uuid;
  v_questions jsonb; v_responses jsonb; v_channel screening_channel; v_screening uuid;
begin
  if new.status <> 'active' then return new; end if;

  select auto_screen, auto_screen_channel, screening_questions, org_id
    into v_auto_screen, v_channel_cfg, v_qs, v_org
    from public.requisitions where id = new.requisition_id;
  if not coalesce(v_auto_screen, false) then return new; end if;

  if exists (select 1 from public.screenings where application_id = new.id and external_ref = 'auto-screen') then
    return new;
  end if;

  v_questions := coalesce(v_qs, '[]'::jsonb);
  if jsonb_array_length(v_questions) = 0 then
    v_questions := jsonb_build_array(
      jsonb_build_object('id','q1','question','Can you confirm your active license/certification and its expiration date?','competency','Licensure'),
      jsonb_build_object('id','q2','question','How many years of relevant experience do you have, and in what settings?','competency','Experience'),
      jsonb_build_object('id','q3','question','What is your earliest available start date, and which shifts can you work?','competency','Availability')
    );
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('question_id', q->>'id', 'answer', '')), '[]'::jsonb)
    into v_responses from jsonb_array_elements(v_questions) q;

  v_channel := case when v_channel_cfg = 'sms' then 'sms'::screening_channel else 'phone'::screening_channel end;

  insert into public.screenings
      (org_id, candidate_id, requisition_id, application_id, status, channel, questions, responses, external_ref)
    values
      (coalesce(v_org, new.org_id), new.candidate_id, new.requisition_id, new.id,
       'approved', v_channel, v_questions, v_responses, 'auto-screen')
    returning id into v_screening;

  begin
    perform net.http_post(
      url := 'https://pcpkhdfgmjrzvwfkcznn.supabase.co/functions/v1/auto-screen-dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('screening_id', v_screening, 'channel', coalesce(v_channel_cfg, 'both'))
    );
  exception when others then null;
  end;

  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_auto_screen_on_apply on public.applications;
create trigger trg_auto_screen_on_apply after insert on public.applications
  for each row execute function public.auto_screen_on_apply();

-- ---- (3) phone -> candidate lookup for the inbound SMS agent (service-role only) ----
create or replace function public.find_candidate_by_phone(p_last10 text)
returns table(id uuid, org_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select id, org_id, full_name
  from public.candidates
  where p_last10 is not null and length(regexp_replace(p_last10, '\D', '', 'g')) >= 10
    and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)
        = right(regexp_replace(p_last10, '\D', '', 'g'), 10)
  order by updated_at desc nulls last
  limit 1
$$;
revoke all on function public.find_candidate_by_phone(text) from public, anon, authenticated;
grant execute on function public.find_candidate_by_phone(text) to service_role;
