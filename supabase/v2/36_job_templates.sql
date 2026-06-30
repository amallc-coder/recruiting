-- Migration: job_templates (job-ad / job-description template library)
-- A reusable library of marketing job descriptions per role. Built three ways:
-- AI-authored (intro/responsibilities/benefits + editable facility blanks),
-- uploaded from a PDF/XML job ad, or written by hand. Org-scoped with RLS;
-- organizable by category ("type"/folder).
-- Already applied to prod via apply_migration; recorded for the ledger.
create table if not exists public.job_templates (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  role_family      text,                                   -- role_families.code (loose)
  category         text,                                   -- grouping/folder, e.g. "Nursing", "Physician Practice"
  intro            text,
  responsibilities text[] not null default '{}',
  benefits         text[] not null default '{}',
  requirements     text[] not null default '{}',
  blanks           jsonb  not null default '[]',           -- [{key,label}] facility-specific fill-ins
  body             text,                                   -- assembled markdown or raw uploaded text
  source           text   not null default 'manual',       -- ai|upload|manual
  file_name        text,
  file_type        text,                                   -- pdf|xml|txt
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_job_templates_org on public.job_templates(org_id);
create index if not exists idx_job_templates_category on public.job_templates(org_id, category);

alter table public.job_templates enable row level security;
drop policy if exists job_templates_select on public.job_templates;
create policy job_templates_select on public.job_templates for select using (org_id = public.current_org());
drop policy if exists job_templates_write on public.job_templates;
create policy job_templates_write on public.job_templates for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_job_templates on public.job_templates;
create trigger touch_job_templates before update on public.job_templates
  for each row execute function public.touch_updated_at();
