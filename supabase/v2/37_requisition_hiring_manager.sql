-- Migration: distinct Hiring Manager on requisitions
-- The legacy requisitions.hiring_manager_id is surfaced in the UI as the
-- "Recruiter" (the owning recruiter). This adds a SEPARATE field for the
-- actual facility hiring manager (a user, typically with the hiring_manager
-- role), so requisitions can be grouped/filtered by who owns them on the
-- facility side — distinct from the recruiter.
-- Already applied to prod via apply_migration; recorded for the ledger.
alter table public.requisitions
  add column if not exists actual_hiring_manager_id uuid references public.users(id) on delete set null;
create index if not exists idx_requisitions_actual_hm on public.requisitions(actual_hiring_manager_id);
