-- Migration: portal_context (candidate mobile portal)
-- A token-gated status view. Given any of the candidate's application
-- schedule_tokens, return that candidate's full application picture (role,
-- facility, status, stage) plus each application's own schedule_token so they
-- can self-schedule. SECURITY DEFINER, anon-callable, minimal exposure (no other
-- candidates' data). Already applied to prod via apply_migration; for the ledger.
create or replace function public.portal_context(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_cand uuid; v_name text; v_apps jsonb;
begin
  select candidate_id into v_cand from public.applications where schedule_token = p_token;
  if v_cand is null then return jsonb_build_object('ok', false, 'error', 'This link is invalid or has expired.'); end if;
  select full_name into v_name from public.candidates where id = v_cand;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'title', r.title,
           'facility', f.name,
           'status', a.status,
           'stage', ps.stage_type,
           'schedule_token', a.schedule_token,
           'applied_at', a.applied_at
         ) order by a.created_at desc), '[]'::jsonb)
    into v_apps
  from public.applications a
  left join public.requisitions r on r.id = a.requisition_id
  left join public.facilities f on f.id = r.facility_id
  left join public.pipeline_stages ps on ps.id = a.current_stage_id
  where a.candidate_id = v_cand;
  return jsonb_build_object('ok', true, 'candidate_name', v_name, 'applications', v_apps);
end $$;
revoke all on function public.portal_context(uuid) from public;
grant execute on function public.portal_context(uuid) to anon, authenticated;
