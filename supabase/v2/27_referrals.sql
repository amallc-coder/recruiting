-- Migration: referrals (referral engine)
-- Worker/employee referrals, org-scoped with RLS, tracked through to hire +
-- reward payout. Public "refer someone" link submits via a SECURITY DEFINER RPC
-- (no login). Already applied to prod via apply_migration; recorded for the ledger.
create table if not exists public.referrals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  referrer_user_id uuid references public.users(id) on delete set null,
  referrer_name    text not null,
  referrer_email   text,
  referrer_phone   text,
  candidate_id     uuid references public.candidates(id) on delete set null,
  requisition_id   uuid references public.requisitions(id) on delete set null,
  candidate_name   text not null,
  candidate_email  text,
  candidate_phone  text,
  role_interest    text,
  relationship     text,
  note             text,
  status           text not null default 'submitted',  -- submitted|reviewing|contacted|hired|rejected|paid
  reward_amount    numeric,
  reward_status    text not null default 'pending',     -- pending|approved|paid|void
  source           text not null default 'staff',       -- staff|public
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_referrals_org on public.referrals(org_id);
create index if not exists idx_referrals_status on public.referrals(org_id, status);

alter table public.referrals enable row level security;
drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals for select using (org_id = public.current_org());
drop policy if exists referrals_write on public.referrals;
create policy referrals_write on public.referrals for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_referrals on public.referrals;
create trigger touch_referrals before update on public.referrals
  for each row execute function public.touch_updated_at();

create or replace function public.submit_referral(
  p_referrer_name  text,
  p_referrer_email text,
  p_referrer_phone text,
  p_candidate_name text,
  p_candidate_email text,
  p_candidate_phone text,
  p_role_interest  text,
  p_relationship   text,
  p_note           text,
  p_requisition_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid; v_id uuid;
begin
  if coalesce(trim(p_referrer_name), '') = '' or coalesce(trim(p_candidate_name), '') = '' then
    raise exception 'Referrer name and candidate name are required';
  end if;
  if p_requisition_id is not null then
    select org_id into v_org from public.requisitions where id = p_requisition_id;
  end if;
  if v_org is null then
    select id into v_org from public.organizations order by created_at limit 1;
  end if;
  if v_org is null then raise exception 'No organization'; end if;
  insert into public.referrals (
    org_id, referrer_name, referrer_email, referrer_phone,
    candidate_name, candidate_email, candidate_phone,
    role_interest, relationship, note, requisition_id, source
  ) values (
    v_org, trim(p_referrer_name), p_referrer_email, p_referrer_phone,
    trim(p_candidate_name), p_candidate_email, p_candidate_phone,
    p_role_interest, p_relationship, p_note, p_requisition_id, 'public'
  ) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_referral(text,text,text,text,text,text,text,text,text,uuid) from public;
grant execute on function public.submit_referral(text,text,text,text,text,text,text,text,text,uuid) to anon, authenticated;
