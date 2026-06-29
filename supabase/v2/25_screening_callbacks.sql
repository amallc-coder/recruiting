-- Migration: scheduled_screening_calls (+ callback dispatch cron)
-- Screening-call callbacks: when a candidate says it's not a good time, the Vapi
-- voice agent (female voice) captures a specific callback day/time; the
-- vapi-webhook resolves it to a timestamp and inserts a row here. A pg_cron job
-- pings the screening-call-dispatch edge function every 5 minutes, which places
-- any due calls by invoking vapi-call with the service-role key (internal path).
-- Already applied to prod via apply_migration; recorded here for the ledger.

create table if not exists public.scheduled_screening_calls (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  screening_id   uuid references public.screenings(id) on delete cascade,
  candidate_id   uuid references public.candidates(id) on delete set null,
  requisition_id uuid references public.requisitions(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  scheduled_at   timestamptz not null,
  status         text not null default 'pending',            -- pending | placed | failed | cancelled
  source         text not null default 'candidate_requested',-- candidate_requested | manual
  note           text,
  attempts       int not null default 0,
  call_id        text,
  placed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_ssc_due on public.scheduled_screening_calls(status, scheduled_at);
create index if not exists idx_ssc_screening on public.scheduled_screening_calls(screening_id);

alter table public.scheduled_screening_calls enable row level security;
drop policy if exists ssc_select on public.scheduled_screening_calls;
create policy ssc_select on public.scheduled_screening_calls for select using (org_id = public.current_org());
drop policy if exists ssc_write on public.scheduled_screening_calls;
create policy ssc_write on public.scheduled_screening_calls for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_ssc on public.scheduled_screening_calls;
create trigger touch_ssc before update on public.scheduled_screening_calls
  for each row execute function public.touch_updated_at();

-- Dispatcher cron (every 5 min). Uses the PUBLIC anon key to ping the edge
-- function; the function does the privileged work with its own service role.
do $$ begin perform cron.unschedule('screening-callback-dispatch'); exception when others then null; end $$;
select cron.schedule(
  'screening-callback-dispatch', '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://pcpkhdfgmjrzvwfkcznn.supabase.co/functions/v1/screening-call-dispatch',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ANON_PUBLIC_KEY>','apikey','<ANON_PUBLIC_KEY>'),
       body := '{}'::jsonb) $$
);

-- Female voice: vapi-call defaults VAPI_VOICE_ID to a female Vapi voice ("Paige").
-- Override with the VAPI_VOICE_ID / VAPI_VOICE_PROVIDER secrets.
-- Activity log: the webhook also writes communications (candidate timeline) +
-- an audit_logs 'screening.callback_scheduled' row (Governance → AI activity).
