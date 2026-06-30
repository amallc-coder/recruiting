-- Migration: requisition_requests (hiring-manager / facility portal)
-- Lightweight "request to fill" a hiring manager submits before a formal
-- requisition exists; staff (recruiter/admin) review and convert it into a
-- requisition. Org-scoped with RLS. Already applied to prod via apply_migration;
-- recorded for the ledger.
create table if not exists public.requisition_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  facility_id    uuid references public.facilities(id) on delete set null,
  title          text not null,
  role_family    text,
  headcount      int not null default 1,
  urgency        text not null default 'normal',   -- low|normal|high|urgent
  reason         text,
  target_start   date,
  status         text not null default 'requested', -- requested|approved|declined|converted
  requisition_id uuid references public.requisitions(id) on delete set null,
  review_note    text,
  requested_by   uuid references public.users(id) on delete set null,
  reviewed_by    uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_req_requests_org on public.requisition_requests(org_id);
create index if not exists idx_req_requests_status on public.requisition_requests(org_id, status);

alter table public.requisition_requests enable row level security;
drop policy if exists reqreq_select on public.requisition_requests;
create policy reqreq_select on public.requisition_requests for select using (org_id = public.current_org());
drop policy if exists reqreq_insert on public.requisition_requests;
create policy reqreq_insert on public.requisition_requests for insert
  with check (org_id = public.current_org() and requested_by = auth.uid());
drop policy if exists reqreq_update on public.requisition_requests;
create policy reqreq_update on public.requisition_requests for update
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());
drop policy if exists reqreq_delete on public.requisition_requests;
create policy reqreq_delete on public.requisition_requests for delete
  using (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_requisition_requests on public.requisition_requests;
create trigger touch_requisition_requests before update on public.requisition_requests
  for each row execute function public.touch_updated_at();

create or replace function public.convert_requisition_request(p_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare r record; v_req uuid; v_org uuid;
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  v_org := public.current_org();
  select * into r from public.requisition_requests where id = p_id and org_id = v_org;
  if not found then raise exception 'Request not found'; end if;
  if r.status = 'converted' then raise exception 'Already converted'; end if;
  if r.facility_id is null or coalesce(trim(r.role_family), '') = '' then
    raise exception 'A facility and role family are required before converting';
  end if;
  insert into public.requisitions (org_id, facility_id, title, role_family, headcount, status, created_by, hiring_manager_id)
  values (v_org, r.facility_id, r.title, r.role_family, greatest(1, r.headcount), 'draft', auth.uid(), r.requested_by)
  returning id into v_req;
  update public.requisition_requests
    set status = 'converted', requisition_id = v_req, reviewed_by = auth.uid()
    where id = p_id;
  return v_req;
end $$;
revoke all on function public.convert_requisition_request(uuid) from public;
grant execute on function public.convert_requisition_request(uuid) to authenticated;
