-- Migration: org hierarchy (Division → Facility → Department → Role)
-- Divisions group facilities; departments live under a facility; "role" is the
-- existing role_families catalog. Requisitions + requests can target a
-- department. Anon org_hierarchy() feeds the public staffing-request cascade.
-- Already applied to prod via apply_migration; recorded for the ledger.
create table if not exists public.divisions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_divisions_org on public.divisions(org_id);

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_departments_org on public.departments(org_id);
create index if not exists idx_departments_facility on public.departments(facility_id);

alter table public.facilities            add column if not exists division_id   uuid references public.divisions(id) on delete set null;
alter table public.requisitions          add column if not exists department_id uuid references public.departments(id) on delete set null;
alter table public.requisition_requests  add column if not exists department_id uuid references public.departments(id) on delete set null;

alter table public.divisions enable row level security;
drop policy if exists divisions_select on public.divisions;
create policy divisions_select on public.divisions for select using (org_id = public.current_org());
drop policy if exists divisions_write on public.divisions;
create policy divisions_write on public.divisions for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

alter table public.departments enable row level security;
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select using (org_id = public.current_org());
drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_divisions on public.divisions;
create trigger touch_divisions before update on public.divisions for each row execute function public.touch_updated_at();
drop trigger if exists touch_departments on public.departments;
create trigger touch_departments before update on public.departments for each row execute function public.touch_updated_at();

create or replace function public.org_hierarchy()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_org uuid; v_divs jsonb; v_other jsonb; v_roles jsonb;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then return jsonb_build_object('ok', false, 'divisions', '[]'::jsonb, 'role_families', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(d order by d->>'name'), '[]'::jsonb) into v_divs from (
    select jsonb_build_object(
      'id', dv.id, 'name', dv.name,
      'facilities', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', f.id, 'name', f.name,
          'departments', coalesce((select jsonb_agg(jsonb_build_object('id', dp.id, 'name', dp.name) order by dp.name) from public.departments dp where dp.facility_id = f.id), '[]'::jsonb)
        ) order by f.name)
        from public.facilities f where f.division_id = dv.id and f.org_id = v_org
      ), '[]'::jsonb)
    ) as d
    from public.divisions dv where dv.org_id = v_org
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object(
       'id', f.id, 'name', f.name,
       'departments', coalesce((select jsonb_agg(jsonb_build_object('id', dp.id, 'name', dp.name) order by dp.name) from public.departments dp where dp.facility_id = f.id), '[]'::jsonb)
     ) order by f.name), '[]'::jsonb)
  into v_other from public.facilities f where f.org_id = v_org and f.division_id is null;

  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label) order by sort_order), '[]'::jsonb)
  into v_roles from public.role_families;

  if jsonb_array_length(v_other) > 0 then
    v_divs := v_divs || jsonb_build_array(jsonb_build_object('id', null, 'name', 'Other facilities', 'facilities', v_other));
  end if;

  return jsonb_build_object('ok', true, 'divisions', v_divs, 'role_families', v_roles);
end $$;
revoke all on function public.org_hierarchy() from public;
grant execute on function public.org_hierarchy() to anon, authenticated;

-- submit_staffing_request gains facility_id + department_id (see ledger 33 for v1).
drop function if exists public.submit_staffing_request(text,text,text,text,text,int,text,text,date);
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
  p_target_start    date default null
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_org uuid; v_id uuid;
begin
  if coalesce(trim(p_requester_name), '') = '' or coalesce(trim(p_title), '') = '' then
    raise exception 'Your name and what you need are required';
  end if;
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then raise exception 'No organization'; end if;
  insert into public.requisition_requests (
    org_id, facility_id, department_id, title, role_family, headcount, urgency, reason, target_start,
    requester_name, requester_email, facility_name, source, status
  ) values (
    v_org, p_facility_id, p_department_id, trim(p_title), nullif(trim(coalesce(p_role_family, '')), ''),
    greatest(1, coalesce(p_headcount, 1)), coalesce(nullif(trim(coalesce(p_urgency, '')), ''), 'normal'),
    nullif(trim(coalesce(p_reason, '')), ''), p_target_start,
    trim(p_requester_name), nullif(trim(coalesce(p_requester_email, '')), ''),
    nullif(trim(coalesce(p_facility_name, '')), ''), 'public', 'requested'
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_staffing_request(text,text,uuid,uuid,text,text,text,int,text,text,date) from public;
grant execute on function public.submit_staffing_request(text,text,uuid,uuid,text,text,text,int,text,text,date) to anon, authenticated;
