-- Extend RBAC to the full app role set — additive and RLS-safe.
--
-- App roles: admin, recruiter, coordinator, hiring_manager, compliance.
--   * Widens profiles.role CHECK to add `coordinator` + `compliance`, keeping the
--     previously-allowed values (incl. legacy supervisor/interviewer/viewer) so
--     no existing row is invalidated.
--   * Adds has_role(target) for future per-role policies (admin always passes).
--   * Lets admin invites assign any app role via user metadata (was admin/recruiter).
--
-- No existing row or RLS policy is changed; the new roles are least-privilege
-- until explicit per-role policies are added. Idempotent — safe to re-run.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'admin','recruiter','coordinator','hiring_manager','compliance',
    'supervisor','interviewer','viewer'
  ));

-- Reusable predicate for future per-role RLS policies (admin always passes).
create or replace function public.has_role(target text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and (role = 'admin' or role = target)
  );
$$;

-- Accept any app role from admin-invite metadata (otherwise it falls back to
-- 'recruiter'). Body is unchanged except the widened meta_role IN (...) list.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assigned_role text;
  meta_role text := new.raw_user_meta_data->>'role';
begin
  if exists (select 1 from public.preset_admins where lower(email) = lower(coalesce(new.email, ''))) then
    assigned_role := 'admin';
  elsif (select count(*) from public.profiles) = 0 then
    assigned_role := 'admin';
  elsif meta_role in ('admin','recruiter','coordinator','hiring_manager','compliance','supervisor','interviewer','viewer') then
    assigned_role := meta_role;
  else
    assigned_role := 'recruiter';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    assigned_role
  )
  on conflict (id) do nothing;

  -- Apply any regions the inviting admin attached (comma-separated in metadata).
  if new.raw_user_meta_data->>'regions' is not null then
    insert into public.recruiter_regions (recruiter_id, region)
    select new.id, trim(r)
    from unnest(string_to_array(new.raw_user_meta_data->>'regions', ',')) as r
    where trim(r) <> ''
    on conflict do nothing;
  end if;

  return new;
end;
$$;
