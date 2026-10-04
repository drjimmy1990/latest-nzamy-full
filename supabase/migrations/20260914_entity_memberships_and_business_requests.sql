-- Migration: entity memberships and business-owned service requests
-- Safe deploy order: apply this migration in staging, verify, then deploy code.
-- Do not run on production without a current backup and a reviewed rollback.

begin;

-- A company request belongs to the company, not merely to the employee who
-- submitted it. The API derives this value from auth.uid(); clients never send it.
alter table public.service_requests
  add column if not exists business_id uuid
  references public.business_profiles(id) on delete set null;

create index if not exists idx_service_requests_business
  on public.service_requests (business_id);

-- Make every company owner an explicit member. This gives the UI and all RLS
-- checks one source of truth for roles instead of relying on user_metadata.
create unique index if not exists uq_business_members_business_user
  on public.business_members (business_id, user_id);

create or replace function public.ensure_business_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.business_members
    (business_id, user_id, role, status, accepted_at)
  values
    (new.id, new.owner_user_id, 'owner', 'active', now())
  on conflict (business_id, user_id) do update
    set role = 'owner', status = 'active', accepted_at = coalesce(public.business_members.accepted_at, now());
  return new;
end;
$$;

drop trigger if exists trg_business_profiles_owner_membership on public.business_profiles;
create trigger trg_business_profiles_owner_membership
  after insert on public.business_profiles
  for each row execute function public.ensure_business_owner_membership();

insert into public.business_members
  (business_id, user_id, role, status, accepted_at)
select bp.id, bp.owner_user_id, 'owner', 'active', now()
  from public.business_profiles bp
on conflict (business_id, user_id) do update
  set role = 'owner', status = 'active', accepted_at = coalesce(public.business_members.accepted_at, now());

-- Additive SELECT policy: existing requester/assignee/marketplace policies stay
-- unchanged. Only an active member of the exact business_id can use this arm.
drop policy if exists "business members read business service requests"
  on public.service_requests;
create policy "business members read business service requests"
  on public.service_requests for select
  using (
    business_id is not null
    and public.is_active_business_member(business_id)
  );

commit;

-- Read-only verification after staging apply:
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='service_requests'
--    and column_name='business_id';
-- select count(*) as owners_without_membership
--   from public.business_profiles bp
--  where not exists (
--    select 1 from public.business_members bm
--     where bm.business_id=bp.id and bm.user_id=bp.owner_user_id
--       and bm.role='owner' and bm.status='active'
--  );
-- select polname from pg_policy
--  where polrelid='public.service_requests'::regclass
--    and polname='business members read business service requests';
