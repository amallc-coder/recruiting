-- Migration: job_ad_campaigns (programmatic ad optimization)
-- Per-channel job-ad campaigns with spend + funnel metrics, so source ROI can
-- drive budget reallocation. Org-scoped RLS. Live auto-posting to ad networks
-- stays inert until per-channel creds exist; this captures spend/applies/hires
-- and powers the recommendation engine. Already applied to prod via
-- apply_migration; recorded for the ledger.
create table if not exists public.job_ad_campaigns (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  requisition_id uuid references public.requisitions(id) on delete set null,
  name           text not null,
  channel        text not null default 'indeed',  -- indeed|ziprecruiter|linkedin|facebook|google|other
  status         text not null default 'active',  -- active|paused|ended
  budget         numeric,
  spend          numeric not null default 0,
  impressions    int not null default 0,
  clicks         int not null default 0,
  applies        int not null default 0,
  hires          int not null default 0,
  start_date     date,
  end_date       date,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_ad_campaigns_org on public.job_ad_campaigns(org_id);

alter table public.job_ad_campaigns enable row level security;
drop policy if exists adcampaign_select on public.job_ad_campaigns;
create policy adcampaign_select on public.job_ad_campaigns for select using (org_id = public.current_org());
drop policy if exists adcampaign_write on public.job_ad_campaigns;
create policy adcampaign_write on public.job_ad_campaigns for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_job_ad_campaigns on public.job_ad_campaigns;
create trigger touch_job_ad_campaigns before update on public.job_ad_campaigns
  for each row execute function public.touch_updated_at();
