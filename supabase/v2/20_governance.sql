-- Migration: security_posture_fn (governance & security finalization)
--
-- Admin-only RLS coverage report for the Governance dashboard. SECURITY DEFINER
-- so it can read pg_catalog (pg_class / pg_policy); the public.is_admin() gate in
-- the WHERE clause means a non-admin caller gets zero rows (no catalog leak).
-- Already applied to prod via apply_migration; recorded here for the ledger.

create or replace function public.security_posture()
returns table(table_name text, rls_enabled boolean, policies bigint)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select c.relname::text,
         c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and public.is_admin()
  order by c.relname;
$$;

revoke all on function public.security_posture() from public;
grant execute on function public.security_posture() to authenticated;

-- The Governance dashboard also reads existing tables directly under RLS:
--   ai_decisions  — AI decision log (model, rationale, human_override)
--   audit_logs    — agent action trail (console.query / autopilot.plan / autopilot.execute)
--   applications + candidates + requisitions + facilities — adverse-impact (four-fifths)
--     selection-rate analysis over OPERATIONAL segments (source/role/state). The schema
--     intentionally collects NO protected-class (EEO) data; a legally-defensible bias
--     audit requires voluntary self-ID data stored & analyzed separately (see GOVERNANCE.md).
