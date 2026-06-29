-- ============================================================================
-- Clinilytics ATS v2 — security hardening (clears Supabase linter warnings)
-- ----------------------------------------------------------------------------
-- Two classes of advisor WARNs, addressed here so the cutover is clean:
--   1. function_search_path_mutable — pin search_path on the functions authored
--      in 01/03 that didn't set it (defense against search_path hijacking).
--   2. anon/authenticated_security_definer_function_executable — the internal
--      RLS helper functions are reachable via PostgREST /rpc. They only ever
--      report the *caller's own* context, so this isn't exploitable, but anon
--      never needs them (no anon-facing policy references a helper), so revoke
--      EXECUTE from anon. `authenticated` keeps EXECUTE because RLS policy
--      evaluation requires it. The public career RPC (apply_to_requisition)
--      intentionally stays anon-executable.
-- Apply after 08_region_write_policies.sql.
-- ============================================================================

-- 1. Pin search_path on the remaining functions.
alter function public.touch_updated_at()                         set search_path = public;
alter function public.requisition_dates()                        set search_path = public;
alter function public.log_application_stage()                    set search_path = public;
alter function public.placement_ready(uuid, uuid)                set search_path = public;
alter function public.missing_credentials(uuid, uuid)            set search_path = public;
alter function public.expire_credentials()                       set search_path = public;

-- 2. Lock down the internal helpers. Functions are granted EXECUTE to PUBLIC by
--    default, so revoking from `anon` alone is ineffective (anon inherits via
--    PUBLIC) — revoke from PUBLIC, then grant back to `authenticated` only,
--    which RLS policy evaluation requires. (Triggers still fire after revoke;
--    the trigger mechanism doesn't check the invoker's EXECUTE privilege.)
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.current_org()','public.current_role_v2()','public.is_admin()',
    'public.is_compliance()','public.is_staff()','public.is_region_limited()',
    'public.can_see_region(text)','public.covers_facility(uuid)',
    'public.placement_ready(uuid, uuid)','public.missing_credentials(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- Maintenance + trigger-only functions: not callable via the API by anyone.
revoke execute on function public.expire_credentials()    from public, anon, authenticated;
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.log_application_stage() from public, anon, authenticated;
