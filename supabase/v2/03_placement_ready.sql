-- ============================================================================
-- Clinilytics ATS v2 — placement-ready logic
-- ----------------------------------------------------------------------------
-- A candidate is "placement-ready" for a requisition when EVERY required
-- credential type for that requisition's facility + role family is satisfied by
-- a credential that is verification_status = 'verified' AND not expired
-- (expiration_date null or >= today). Requisitions with no required credentials
-- are trivially ready.
--
-- Provided as both a boolean function (point checks) and a view (per-application
-- readiness + the list of what's missing, for the credentialing dashboard).
-- Apply after 02_rls.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Boolean point check: is this candidate placement-ready for this requisition?
-- ---------------------------------------------------------------------------
create or replace function public.placement_ready(p_candidate uuid, p_requisition uuid)
returns boolean
language sql
stable
as $$
  select not exists (
    -- a required credential type for the req's facility/role family that the
    -- candidate does NOT currently satisfy with a verified, non-expired credential
    select 1
    from public.requisitions r
    join public.facility_credential_requirements fcr
      on fcr.facility_id = r.facility_id
     and fcr.role_family = r.role_family
     and fcr.is_required
    where r.id = p_requisition
      and not exists (
        select 1
        from public.credentials c
        where c.candidate_id = p_candidate
          and c.type = fcr.credential_type
          and c.verification_status = 'verified'
          and (c.expiration_date is null or c.expiration_date >= current_date)
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Set-returning helper: the unmet required credential types for a pairing.
-- ---------------------------------------------------------------------------
create or replace function public.missing_credentials(p_candidate uuid, p_requisition uuid)
returns table (credential_type credential_type)
language sql
stable
as $$
  select fcr.credential_type
  from public.requisitions r
  join public.facility_credential_requirements fcr
    on fcr.facility_id = r.facility_id
   and fcr.role_family = r.role_family
   and fcr.is_required
  where r.id = p_requisition
    and not exists (
      select 1
      from public.credentials c
      where c.candidate_id = p_candidate
        and c.type = fcr.credential_type
        and c.verification_status = 'verified'
        and (c.expiration_date is null or c.expiration_date >= current_date)
    )
$$;

-- ---------------------------------------------------------------------------
-- Per-application readiness view (security_invoker → respects caller RLS).
-- ---------------------------------------------------------------------------
create or replace view public.v_application_placement_ready
with (security_invoker = true) as
select
  a.id            as application_id,
  a.candidate_id,
  a.requisition_id,
  r.facility_id,
  r.role_family,
  public.placement_ready(a.candidate_id, a.requisition_id) as placement_ready,
  coalesce(
    array_agg(distinct fcr.credential_type) filter (
      where fcr.is_required
        and not exists (
          select 1
          from public.credentials c
          where c.candidate_id = a.candidate_id
            and c.type = fcr.credential_type
            and c.verification_status = 'verified'
            and (c.expiration_date is null or c.expiration_date >= current_date)
        )
    ),
    '{}'
  ) as missing_credential_types
from public.applications a
join public.requisitions r on r.id = a.requisition_id
left join public.facility_credential_requirements fcr
  on fcr.facility_id = r.facility_id
 and fcr.role_family = r.role_family
group by a.id, a.candidate_id, a.requisition_id, r.facility_id, r.role_family;

comment on view public.v_application_placement_ready is
  'Per-application placement readiness: placement_ready flag + missing_credential_types[].';

-- ---------------------------------------------------------------------------
-- Optional maintenance: flag credentials whose expiration has passed. Schedule
-- via pg_cron if desired (placement_ready already treats past-dated creds as
-- unmet regardless of this status).
-- ---------------------------------------------------------------------------
create or replace function public.expire_credentials()
returns integer
language sql
as $$
  with updated as (
    update public.credentials
       set verification_status = 'expired', updated_at = now()
     where expiration_date is not null
       and expiration_date < current_date
       and verification_status <> 'expired'
    returning 1
  )
  select count(*)::int from updated
$$;
