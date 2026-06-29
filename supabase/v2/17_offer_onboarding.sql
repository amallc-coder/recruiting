-- Migration: offer_decline_and_onboarding
-- Offer decline reason (feeds offer-acceptance analytics) + onboarding handoff.
-- On offer acceptance the app generates onboarding_tasks (a facility/role
-- template) and carries the candidate's verified credentials forward as
-- already-done items (no re-entry). Additive + org-scoped.
alter table public.offers add column if not exists decline_reason text;

create table if not exists public.onboarding_tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  label          text not null,
  category       text not null default 'general',
  source         text not null default 'template',   -- 'template' | 'credential'
  required       boolean not null default true,
  status         text not null default 'pending',     -- 'pending' | 'done' | 'na'
  created_at     timestamptz not null default now()
);
create index if not exists idx_onboarding_tasks_app on public.onboarding_tasks(application_id);
alter table public.onboarding_tasks enable row level security;
drop policy if exists onb_select on public.onboarding_tasks;
create policy onb_select on public.onboarding_tasks for select using (org_id = public.current_org());
drop policy if exists onb_write on public.onboarding_tasks;
create policy onb_write on public.onboarding_tasks for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());
