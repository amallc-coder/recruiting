-- Checkr background-check integration — per-application Checkr identifiers + status.
-- Additive and nullable; existing rows are unaffected. The existing
-- background_sent_date / background_cleared_date columns are reused (sent on
-- order, cleared when Checkr reports 'clear'). Applied to prod via migration
-- `checkr_background_check_fields`.

alter table public.applications
  add column if not exists checkr_candidate_id text,
  add column if not exists checkr_report_id   text,
  add column if not exists checkr_status      text;

comment on column public.applications.checkr_status is
  'Checkr report status: pending | clear | consider | suspended | dispute | canceled';

create index if not exists applications_checkr_candidate_idx
  on public.applications (checkr_candidate_id) where checkr_candidate_id is not null;
create index if not exists applications_checkr_report_idx
  on public.applications (checkr_report_id) where checkr_report_id is not null;
