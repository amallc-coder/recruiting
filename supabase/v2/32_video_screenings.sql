-- Migration: video_screenings (async one-way video screening)
-- Candidate records answers to prompts on a token-gated page; recordings land in
-- a PRIVATE storage bucket; staff review + optional AI scoring. Uploads are tied
-- to a valid PENDING screening token so the bucket can't be spammed anonymously.
-- Already applied to prod via apply_migration; recorded for the ledger.
create table if not exists public.video_screenings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  requisition_id uuid references public.requisitions(id) on delete set null,
  token          text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  status         text not null default 'pending',   -- pending|completed|reviewed
  questions      jsonb not null default '[]'::jsonb, -- [{id,prompt,limit_sec}]
  recordings     jsonb,                              -- [{question_id,path,transcript,duration_sec}]
  ai_score       int,
  ai_summary     text,
  ai_strengths   jsonb,
  ai_concerns    jsonb,
  ai_recommendation text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists idx_video_screenings_org on public.video_screenings(org_id);
create index if not exists idx_video_screenings_candidate on public.video_screenings(candidate_id);

alter table public.video_screenings enable row level security;
drop policy if exists vscreen_select on public.video_screenings;
create policy vscreen_select on public.video_screenings for select using (org_id = public.current_org());
drop policy if exists vscreen_write on public.video_screenings;
create policy vscreen_write on public.video_screenings for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_video_screenings on public.video_screenings;
create trigger touch_video_screenings before update on public.video_screenings
  for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public)
values ('video-screenings', 'video-screenings', false)
on conflict (id) do nothing;

drop policy if exists "video upload by token" on storage.objects;
create policy "video upload by token" on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'video-screenings'
    and exists (
      select 1 from public.video_screenings v
      where v.status = 'pending' and v.token = (storage.foldername(name))[1]
    )
  );
drop policy if exists "video read staff" on storage.objects;
create policy "video read staff" on storage.objects for select to authenticated
  using (bucket_id = 'video-screenings' and public.is_staff());

create or replace function public.video_screening_context(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  select v.status, v.questions, c.full_name as candidate_name, o.name as org_name
    into r
  from public.video_screenings v
  join public.candidates c on c.id = v.candidate_id
  join public.organizations o on o.id = v.org_id
  where v.token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'This link is invalid or has expired.'); end if;
  return jsonb_build_object('ok', true, 'status', r.status, 'questions', r.questions, 'candidate_name', r.candidate_name, 'org_name', r.org_name);
end $$;
revoke all on function public.video_screening_context(text) from public;
grant execute on function public.video_screening_context(text) to anon, authenticated;

create or replace function public.submit_video_screening(p_token text, p_recordings jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  select id, status into r from public.video_screenings where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'This link is invalid.'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'This video screening has already been submitted.'); end if;
  update public.video_screenings
    set recordings = p_recordings, status = 'completed', completed_at = now()
    where id = r.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.submit_video_screening(text,jsonb) from public;
grant execute on function public.submit_video_screening(text,jsonb) to anon, authenticated;
