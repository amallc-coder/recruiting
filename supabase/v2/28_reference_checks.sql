-- Migration: reference_requests (reference-check automation)
-- Structured reference requests per candidate, collected via a token-gated
-- public form (no login), with AI summary + flags. Already applied to prod via
-- apply_migration; recorded for the ledger.
create table if not exists public.reference_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  referee_name   text not null,
  referee_email  text,
  referee_phone  text,
  referee_title  text,
  relationship   text,
  token          text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  status         text not null default 'pending',   -- pending|completed|declined
  questions      jsonb not null default '[]'::jsonb, -- [{id,prompt}]
  responses      jsonb,                              -- {qid: answer}
  rating         int,                                -- 1-5 overall
  would_rehire   boolean,
  ai_summary     text,
  ai_flags       jsonb,                              -- [{severity,note}]
  created_by     uuid,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists idx_reference_requests_org on public.reference_requests(org_id);
create index if not exists idx_reference_requests_candidate on public.reference_requests(candidate_id);

alter table public.reference_requests enable row level security;
drop policy if exists refreq_select on public.reference_requests;
create policy refreq_select on public.reference_requests for select using (org_id = public.current_org());
drop policy if exists refreq_write on public.reference_requests;
create policy refreq_write on public.reference_requests for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_reference_requests on public.reference_requests;
create trigger touch_reference_requests before update on public.reference_requests
  for each row execute function public.touch_updated_at();

create or replace function public.reference_context(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  select rr.status, rr.referee_name, rr.relationship, rr.questions,
         c.full_name as candidate_name, o.name as org_name
    into r
  from public.reference_requests rr
  join public.candidates c on c.id = rr.candidate_id
  join public.organizations o on o.id = rr.org_id
  where rr.token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'This reference link is invalid.'); end if;
  return jsonb_build_object(
    'ok', true, 'status', r.status, 'referee_name', r.referee_name,
    'relationship', r.relationship, 'candidate_name', r.candidate_name,
    'org_name', r.org_name, 'questions', r.questions
  );
end $$;
revoke all on function public.reference_context(text) from public;
grant execute on function public.reference_context(text) to anon, authenticated;

create or replace function public.submit_reference(
  p_token text, p_responses jsonb, p_rating int, p_would_rehire boolean, p_declined boolean default false
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  select id, status into r from public.reference_requests where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'This reference link is invalid.'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'This reference has already been submitted.'); end if;
  if p_declined then
    update public.reference_requests set status = 'declined', completed_at = now() where id = r.id;
  else
    update public.reference_requests
      set responses = p_responses, rating = p_rating, would_rehire = p_would_rehire,
          status = 'completed', completed_at = now()
      where id = r.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.submit_reference(text,jsonb,int,boolean,boolean) from public;
grant execute on function public.submit_reference(text,jsonb,int,boolean,boolean) to anon, authenticated;
