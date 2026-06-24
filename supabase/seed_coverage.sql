-- =============================================================================
-- Recruiting Tracker — Have/Need coverage starter (OPTIONAL, APPROXIMATE)
-- =============================================================================
-- Run AFTER schema.sql + seed.sql (it matches facilities by name).
--
-- IMPORTANT — read before running:
--   The source spreadsheets express coverage in a free-form layout that does
--   not map cleanly to exact per-facility/per-role numbers. This seed therefore
--   lays down a SENSIBLE STARTING BASELINE, not verified counts:
--     * LPN: need = 1 at every facility, reflecting the org-wide active LPN
--       recruiting push evident in the pipeline. Zero out facilities that are
--       already covered.
--     * NP: need = 1 (premium) only at facilities explicitly flagged
--       OPEN / Need / PREMIUM in the Ohio coverage tab.
--   Adjust everything from the in-app Facility screen — that's the source of
--   truth going forward. Guarded to run only when coverage_needs is empty.
-- =============================================================================
do $$
begin
if (select count(*) from public.coverage_needs) = 0 then

  -- LPN baseline: one open need at every facility (verify & zero-out the filled ones).
  insert into public.coverage_needs (facility_id, role, have_count, need_count, priority)
  select id, 'lpn', 0, 1, 'standard'
  from public.facilities
  on conflict (facility_id, role) do nothing;

  -- NP gaps explicitly flagged OPEN / Need / PREMIUM in the Ohio coverage tab.
  insert into public.coverage_needs (facility_id, role, have_count, need_count, priority)
  select id, 'np', 0, 1, 'premium'
  from public.facilities
  where name in (
    'Cambridge', 'Valley View', 'Logan', 'Willard SNF', 'Willard ALF',
    'Willard Detox Center', 'Crystal Care', 'Fostoria', 'Fostoria AL'
  )
  on conflict (facility_id, role) do nothing;

end if;
end $$;

-- =============================================================================
-- Done. Open each facility to confirm Have/Need by role and set current providers.
-- =============================================================================
