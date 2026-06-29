-- Migration: apply_with_prescreening
-- Public career-site applications now capture pre-application screening answers.
-- apply_to_requisition() gains p_screening (array of {question_id, question,
-- answer}); when present it persists a completed `screenings` row tied to the new
-- application (channel='manual', status='completed'), so the answers flow into
-- the screening tab + matching context. Already applied to prod via
-- apply_migration; recorded here for the ledger.
drop function if exists public.apply_to_requisition(uuid, text, text, text, text, text, jsonb);

create or replace function public.apply_to_requisition(
  p_requisition_id uuid,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_resume_text text default null,
  p_source text default 'Career Site',
  p_intake jsonb default '{}'::jsonb,
  p_screening jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_rf text; v_cand uuid; v_stage uuid; v_app uuid;
begin
  select org_id, role_family into v_org, v_rf
    from public.requisitions where id = p_requisition_id and is_public and status = 'open';
  if v_org is null then raise exception 'Requisition is not open to public applications'; end if;

  if p_email is not null and length(trim(p_email)) > 0 then
    select id into v_cand from public.candidates where org_id = v_org and lower(email) = lower(p_email) limit 1;
  end if;
  if v_cand is null then
    insert into public.candidates (org_id, full_name, email, phone, source, status, resume_text)
    values (v_org, p_full_name, p_email, p_phone, p_source, 'new', p_resume_text) returning id into v_cand;
  end if;

  select id into v_stage from public.pipeline_stages where role_family = v_rf order by sort_order limit 1;

  insert into public.applications (org_id, candidate_id, requisition_id, current_stage_id, status, intake)
  values (v_org, v_cand, p_requisition_id, v_stage, 'active', coalesce(p_intake,'{}'::jsonb))
  on conflict (candidate_id, requisition_id) do update set intake = excluded.intake
  returning id into v_app;

  insert into public.analytics_events (org_id, event_type, candidate_id, application_id, requisition_id, payload)
  values (v_org, 'career_application', v_cand, v_app, p_requisition_id, jsonb_build_object('source', p_source));

  if p_screening is not null and jsonb_typeof(p_screening) = 'array' and jsonb_array_length(p_screening) > 0
     and not exists (select 1 from public.screenings where application_id = v_app) then
    insert into public.screenings (org_id, candidate_id, requisition_id, application_id, channel, status, questions, responses)
    select v_org, v_cand, p_requisition_id, v_app, 'manual', 'completed',
      (select coalesce(jsonb_agg(jsonb_build_object('id', coalesce(e.elem->>'question_id', 'q'||e.ord), 'question', e.elem->>'question')), '[]'::jsonb)
         from jsonb_array_elements(p_screening) with ordinality as e(elem, ord)),
      (select coalesce(jsonb_agg(jsonb_build_object('question_id', coalesce(e.elem->>'question_id', 'q'||e.ord), 'answer', e.elem->>'answer')), '[]'::jsonb)
         from jsonb_array_elements(p_screening) with ordinality as e(elem, ord));
  end if;

  return v_app;
end $function$;

grant execute on function public.apply_to_requisition(uuid, text, text, text, text, text, jsonb, jsonb) to anon, authenticated;
