-- Migration: comp_benchmarks
-- Cached fair-market-value compensation benchmarks for a role in an area.
-- Populated on demand by the ai-comp edge function (web-search grounded via
-- Claude) and read by the Offers "suggested offer" card. Keyed loosely by
-- org/role_family/state; the newest row per key wins. Additive + org-scoped.
create table if not exists public.comp_benchmarks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  role_family    text not null,
  specialty      text,
  state          text,
  city           text,
  currency       text not null default 'USD',
  hourly_low     numeric,
  hourly_median  numeric,
  hourly_high    numeric,
  annual_low     numeric,
  annual_median  numeric,
  annual_high    numeric,
  sources        jsonb not null default '[]'::jsonb,
  rationale      text,
  confidence     text,
  model          text,
  fetched_at     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index if not exists idx_comp_benchmarks_key
  on public.comp_benchmarks(org_id, role_family, state, fetched_at desc);
alter table public.comp_benchmarks enable row level security;
drop policy if exists comp_select on public.comp_benchmarks;
create policy comp_select on public.comp_benchmarks for select using (org_id = public.current_org());
drop policy if exists comp_write on public.comp_benchmarks;
create policy comp_write on public.comp_benchmarks for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());
