-- Migration: public staffing-request intake
-- Let facility managers WITHOUT an ATS login submit a request to fill from a
-- shared link (like the public Careers page). Captures the external requester
-- (no users row) + a free-text facility name; staff triage facility_id /
-- role_family before converting. Already applied to prod via apply_migration.
alter table public.requisition_requests
  add column if not exists requester_name  text,
  add column if not exists requester_email text,
  add column if not exists facility_name   text,
  add column if not exists source          text not null default 'internal'; -- internal|public

create or replace function public.submit_staffing_request(
  p_requester_name  text,
  p_requester_email text,
  p_facility_name   text,
  p_title           text,
  p_role_family     text,
  p_headcount       int,
  p_urgency         text,
  p_reason          text,
  p_target_start    date default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid; v_id uuid;
begin
  if coalesce(trim(p_requester_name), '') = '' or coalesce(trim(p_title), '') = '' then
    raise exception 'Your name and what you need are required';
  end if;
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then raise exception 'No organization'; end if;
  insert into public.requisition_requests (
    org_id, title, role_family, headcount, urgency, reason, target_start,
    requester_name, requester_email, facility_name, source, status
  ) values (
    v_org, trim(p_title), nullif(trim(coalesce(p_role_family, '')), ''),
    greatest(1, coalesce(p_headcount, 1)), coalesce(nullif(trim(coalesce(p_urgency, '')), ''), 'normal'),
    nullif(trim(coalesce(p_reason, '')), ''), p_target_start,
    trim(p_requester_name), nullif(trim(coalesce(p_requester_email, '')), ''),
    nullif(trim(coalesce(p_facility_name, '')), ''), 'public', 'requested'
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_staffing_request(text,text,text,text,text,int,text,text,date) from public;
grant execute on function public.submit_staffing_request(text,text,text,text,text,int,text,text,date) to anon, authenticated;
