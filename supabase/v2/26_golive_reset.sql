-- Migration: reset_org_candidate_data
-- One-time go-live reset. Admin-only SECURITY DEFINER RPC that wipes the org's
-- candidate + pipeline data (so a clean import can replace it) while preserving
-- configuration. Deleting candidates cascades to applications, screenings,
-- offers, communications, credentials, scorecards, interviews, onboarding, etc.
-- Already applied to prod via apply_migration; recorded here for the ledger.
create or replace function public.reset_org_candidate_data()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid; n_cand int; n_app int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  v_org := public.current_org();
  if v_org is null then raise exception 'No organization for current user'; end if;

  select count(*) into n_cand from public.candidates where org_id = v_org;
  select count(*) into n_app from public.applications where org_id = v_org;

  delete from public.scheduled_screening_calls where org_id = v_org;
  delete from public.ai_decisions where org_id = v_org;
  delete from public.analytics_events where org_id = v_org;
  delete from public.candidates where org_id = v_org;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, detail)
  values (v_org, auth.uid(), 'org.reset_candidate_data', 'organization',
          jsonb_build_object('candidates_deleted', n_cand, 'applications_deleted', n_app));

  return jsonb_build_object('candidates_deleted', n_cand, 'applications_deleted', n_app);
end $$;
revoke all on function public.reset_org_candidate_data() from public;
grant execute on function public.reset_org_candidate_data() to authenticated;
