-- Migration: New vs Replacement position on staffing requests
-- A facility manager indicates whether the opening is a NEW position or a
-- REPLACEMENT; if replacement, who is being replaced. Submitting still routes
-- into the review queue (status 'requested') — never auto-creates a requisition.
-- Already applied to prod via apply_migration; recorded for the ledger.
alter table public.requisition_requests
  add column if not exists position_type  text not null default 'new',  -- new|replacement
  add column if not exists replacing_name text;

-- submit_staffing_request gains position_type + replacing_name (see ledger 33/34 for prior).
drop function if exists public.submit_staffing_request(text,text,uuid,uuid,text,text,text,int,text,text,date);
create or replace function public.submit_staffing_request(
  p_requester_name  text,
  p_requester_email text,
  p_facility_id     uuid,
  p_department_id   uuid,
  p_facility_name   text,
  p_title           text,
  p_role_family     text,
  p_headcount       int,
  p_urgency         text,
  p_reason          text,
  p_position_type   text default 'new',
  p_replacing_name  text default null,
  p_target_start    date default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_org uuid; v_id uuid; v_ptype text;
begin
  if coalesce(trim(p_requester_name), '') = '' or coalesce(trim(p_title), '') = '' then
    raise exception 'Your name and what you need are required';
  end if;
  v_ptype := case when lower(coalesce(trim(p_position_type), 'new')) = 'replacement' then 'replacement' else 'new' end;
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then raise exception 'No organization'; end if;
  insert into public.requisition_requests (
    org_id, facility_id, department_id, title, role_family, headcount, urgency, reason, target_start,
    requester_name, requester_email, facility_name, position_type, replacing_name, source, status
  ) values (
    v_org, p_facility_id, p_department_id, trim(p_title), nullif(trim(coalesce(p_role_family, '')), ''),
    greatest(1, coalesce(p_headcount, 1)), coalesce(nullif(trim(coalesce(p_urgency, '')), ''), 'normal'),
    nullif(trim(coalesce(p_reason, '')), ''), p_target_start,
    trim(p_requester_name), nullif(trim(coalesce(p_requester_email, '')), ''),
    nullif(trim(coalesce(p_facility_name, '')), ''), v_ptype,
    case when v_ptype = 'replacement' then nullif(trim(coalesce(p_replacing_name, '')), '') else null end,
    'public', 'requested'
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_staffing_request(text,text,uuid,uuid,text,text,text,int,text,text,text,text,date) from public;
grant execute on function public.submit_staffing_request(text,text,uuid,uuid,text,text,text,int,text,text,text,text,date) to anon, authenticated;
