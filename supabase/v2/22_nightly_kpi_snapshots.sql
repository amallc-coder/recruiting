-- Migration: nightly_kpi_snapshots (+ _upsert)
-- Enables pg_cron and schedules a nightly capture of SQL-expressible core KPIs
-- per org into kpi_snapshots (org/all). Complements the on-demand browser capture
-- (captureSnapshot), giving trend baselines even if no one clicks "Capture".
-- Idempotent: upserts on the (org, metric, dimension, dimension_value, period)
-- unique key, so the nightly job and same-day on-demand captures coexist.
-- Already applied to prod via apply_migration; recorded here for the ledger.

create extension if not exists pg_cron;

create or replace function public.capture_kpi_snapshots()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer := 0; o record;
begin
  for o in select id from public.organizations loop
    insert into public.kpi_snapshots(org_id, metric, dimension, dimension_value, value, period_start, period_end)
    values (o.id, 'hires', 'org', 'all',
      (select count(*) from public.applications a where a.org_id = o.id and a.status = 'hired'),
      current_date, current_date)
    on conflict (org_id, metric, dimension, dimension_value, period_start, period_end)
      do update set value = excluded.value, captured_at = now();

    insert into public.kpi_snapshots(org_id, metric, dimension, dimension_value, value, period_start, period_end)
    select o.id, 'fill_rate', 'org', 'all',
      case when m.marketed > 0 then round(100.0 * m.filled / m.marketed) else null end,
      current_date, current_date
    from (
      select
        count(*) filter (where status not in ('draft','pending_approval')) as marketed,
        count(*) filter (where status not in ('draft','pending_approval')
          and (status = 'filled' or id in (select requisition_id from public.applications where status = 'hired'))) as filled
      from public.requisitions where org_id = o.id
    ) m
    on conflict (org_id, metric, dimension, dimension_value, period_start, period_end)
      do update set value = excluded.value, captured_at = now();

    insert into public.kpi_snapshots(org_id, metric, dimension, dimension_value, value, period_start, period_end)
    select o.id, 'time_to_fill', 'org', 'all',
      (select round(avg(extract(epoch from (h.hired_at - coalesce(r.opened_at, r.created_at))) / 86400))
         from public.requisitions r
         join (select requisition_id, max(updated_at) hired_at from public.applications where status = 'hired' group by requisition_id) h
           on h.requisition_id = r.id
        where r.org_id = o.id),
      current_date, current_date
    on conflict (org_id, metric, dimension, dimension_value, period_start, period_end)
      do update set value = excluded.value, captured_at = now();

    insert into public.kpi_snapshots(org_id, metric, dimension, dimension_value, value, period_start, period_end)
    select o.id, 'cost_of_vacancy', 'org', 'all',
      coalesce((select sum(greatest(0, (extract(epoch from (now() - coalesce(opened_at, created_at))) / 86400))::int) * 1200
        from public.requisitions where org_id = o.id and status = 'open'), 0),
      current_date, current_date
    on conflict (org_id, metric, dimension, dimension_value, period_start, period_end)
      do update set value = excluded.value, captured_at = now();

    n := n + 4;
  end loop;
  return n;
end $$;
revoke all on function public.capture_kpi_snapshots() from public;

-- Nightly at 03:05 UTC.
do $$ begin perform cron.unschedule('kpi-nightly-snapshot'); exception when others then null; end $$;
select cron.schedule('kpi-nightly-snapshot', '5 3 * * *', $$select public.capture_kpi_snapshots();$$);

-- KPI CSV export ships in the browser (Analytics → Export CSV). A scheduled
-- email digest is a follow-up (needs an email-sending provider/credentials).
