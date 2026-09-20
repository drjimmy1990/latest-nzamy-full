-- Migration: Fix 42P17 infinite recursion between firm_profiles and firm_members RLS policies
-- Date: 2026-09-16
-- Problem:
--   "firm_profiles: members can read their org" executes a query on firm_members.
--   "firm_members: firm owner can read all members" executes a query on firm_profiles.
--   When either table is queried with RLS enabled, Postgres detects cyclic recursion (code 42P17).
-- Solution:
--   Break the cycle in both directions using SECURITY DEFINER helper functions:
--   1. Use public.is_active_firm_member(id) for firm_profiles.
--   2. Introduce public.is_firm_owner(firm_id) with SECURITY DEFINER for firm_members policies.

begin;

-- 1. Helper function: is_firm_owner (SECURITY DEFINER to avoid RLS loop on firm_profiles)
create or replace function public.is_firm_owner(p_firm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_firm is not null and exists (
    select 1 from public.firm_profiles fp
     where fp.id = p_firm and fp.owner_user_id = auth.uid()
  );
$$;

-- 2. Fix firm_profiles member read policy
drop policy if exists "firm_profiles: members can read their org" on public.firm_profiles;
create policy "firm_profiles: members can read their org"
  on public.firm_profiles for select
  using (public.is_active_firm_member(id));

-- 3. Fix firm_members owner policies to use is_firm_owner
drop policy if exists "firm_members: firm owner can read all members" on public.firm_members;
create policy "firm_members: firm owner can read all members"
  on public.firm_members for select
  using (public.is_firm_owner(firm_id));

drop policy if exists "firm_members: firm owner can insert" on public.firm_members;
create policy "firm_members: firm owner can insert"
  on public.firm_members for insert
  with check (public.is_firm_owner(firm_id));

drop policy if exists "firm_members: firm owner can update" on public.firm_members;
create policy "firm_members: firm owner can update"
  on public.firm_members for update
  using (public.is_firm_owner(firm_id));

drop policy if exists "firm_members: firm owner can delete" on public.firm_members;
create policy "firm_members: firm owner can delete"
  on public.firm_members for delete
  using (public.is_firm_owner(firm_id));

commit;
