-- Migration: message_templates
-- Reusable outbound message templates + simple multi-step nurture sequences,
-- org-scoped with RLS (select = current org; write = staff in current org).
-- Powers the Templates page; merge fields ({{first_name}} etc.) fill per
-- candidate at send time. Already applied to prod via apply_migration.
create table if not exists public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  category    text not null default 'outreach',   -- outreach | nurture | screening | rejection | offer | other
  channel     text not null default 'email',      -- email | sms
  subject     text,
  body        text not null default '',
  is_sequence boolean not null default false,
  steps       jsonb not null default '[]'::jsonb,  -- [{day_offset:int, channel, subject, body}]
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_message_templates_org on public.message_templates(org_id);

alter table public.message_templates enable row level security;
drop policy if exists mt_select on public.message_templates;
create policy mt_select on public.message_templates for select using (org_id = public.current_org());
drop policy if exists mt_write on public.message_templates;
create policy mt_write on public.message_templates for all
  using (org_id = public.current_org() and public.is_staff())
  with check (org_id = public.current_org() and public.is_staff());

drop trigger if exists touch_message_templates on public.message_templates;
create trigger touch_message_templates before update on public.message_templates
  for each row execute function public.touch_updated_at();

-- FOLLOW-UP: scheduled send engine + reply tracking (needs broader comms infra);
-- live SMS send already exists via the Vapi channel. Source-of-hire /
-- cost-per-source attribution shipped separately (Analytics → Sources).
