-- ============================================================================
-- SUPERSEDED — DO NOT APPLY.
-- Superseded by 20260921_03_entity_rls_recursion_fix.sql.
-- Why: (1) CREATE OR REPLACE FUNCTION cannot rename an input parameter — the
--      20260903 helpers use p_firm/p_business/p_gov/p_ngo, this file redeclares
--      them as *_id => ERROR 42P13 and the whole begin/commit block rolls back;
--      (2) DROP POLICY IF EXISTS targets names that never existed, so the
--      recursive 20260616 policies would survive even if (1) were fixed.
-- Evidence: docs/audits/2026-09-20-profiles-uat/01-rls-audit.md §4
-- Leading underscore = excluded from `supabase db push` (same as _verify.sql).
-- ============================================================================

-- ==============================================================================
-- Migration: Fix 42P17 Infinite Recursion across ALL Multi-Member Entities
-- Date: 2026-09-16
-- Tables:
--   1. business_profiles <-> business_members
--   2. government_profiles <-> government_members
--   3. ngo_profiles <-> ngo_members
--   4. firm_profiles <-> firm_members
--
-- Root Cause:
--   Entity profile read policy checks members table: EXISTS (SELECT 1 FROM [entity]_members WHERE ...).
--   Entity members read policy checks profile table: EXISTS (SELECT 1 FROM [entity]_profiles WHERE ...).
--   When either table is queried with RLS enabled, Postgres detects cyclic recursion (code 42P17).
--   Additionally, "active members can read co-members" performs self-referential SELECT on the same members table.
--
-- Solution:
--   1. Create SECURITY DEFINER helper functions for owner checks and membership checks.
--   2. Replace inline subqueries in RLS policies with these SECURITY DEFINER functions.
-- ==============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BUSINESS ENTITIES
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_business_id is not null and exists (
    select 1 from public.business_profiles bp
    where bp.id = p_business_id and bp.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_business_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_business_id is not null and exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  );
$$;

drop policy if exists "business_profiles: members can read their business" on public.business_profiles;
create policy "business_profiles: members can read their business"
  on public.business_profiles for select
  using (public.is_active_business_member(id));

drop policy if exists "business_members: business owner can read all members" on public.business_members;
create policy "business_members: business owner can read all members"
  on public.business_members for select
  using (public.is_business_owner(business_id));

drop policy if exists "business_members: active members can read co-members" on public.business_members;
create policy "business_members: active members can read co-members"
  on public.business_members for select
  using (public.is_active_business_member(business_id));

drop policy if exists "business_members: business owner can insert" on public.business_members;
create policy "business_members: business owner can insert"
  on public.business_members for insert
  with check (public.is_business_owner(business_id));

drop policy if exists "business_members: business owner can update" on public.business_members;
create policy "business_members: business owner can update"
  on public.business_members for update
  using (public.is_business_owner(business_id));

drop policy if exists "business_members: business owner can delete" on public.business_members;
create policy "business_members: business owner can delete"
  on public.business_members for delete
  using (public.is_business_owner(business_id));


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. GOVERNMENT ENTITIES
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_government_owner(p_gov_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_gov_id is not null and exists (
    select 1 from public.government_profiles gp
    where gp.id = p_gov_id and gp.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_government_member(p_gov_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_gov_id is not null and exists (
    select 1 from public.government_members gm
    where gm.gov_id = p_gov_id
      and gm.user_id = auth.uid()
      and gm.status = 'active'
  );
$$;

drop policy if exists "government_profiles: members can read their entity" on public.government_profiles;
create policy "government_profiles: members can read their entity"
  on public.government_profiles for select
  using (public.is_active_government_member(id));

drop policy if exists "government_members: entity owner can read all members" on public.government_members;
create policy "government_members: entity owner can read all members"
  on public.government_members for select
  using (public.is_government_owner(gov_id));

drop policy if exists "government_members: active members can read co-members" on public.government_members;
create policy "government_members: active members can read co-members"
  on public.government_members for select
  using (public.is_active_government_member(gov_id));

drop policy if exists "government_members: entity owner can insert" on public.government_members;
create policy "government_members: entity owner can insert"
  on public.government_members for insert
  with check (public.is_government_owner(gov_id));

drop policy if exists "government_members: entity owner can update" on public.government_members;
create policy "government_members: entity owner can update"
  on public.government_members for update
  using (public.is_government_owner(gov_id));

drop policy if exists "government_members: entity owner can delete" on public.government_members;
create policy "government_members: entity owner can delete"
  on public.government_members for delete
  using (public.is_government_owner(gov_id));


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. NGO / NON-PROFIT ENTITIES
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_ngo_owner(p_ngo_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_ngo_id is not null and exists (
    select 1 from public.ngo_profiles np
    where np.id = p_ngo_id and np.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_ngo_member(p_ngo_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_ngo_id is not null and exists (
    select 1 from public.ngo_members nm
    where nm.ngo_id = p_ngo_id
      and nm.user_id = auth.uid()
      and nm.status = 'active'
  );
$$;

drop policy if exists "ngo_profiles: members can read their org" on public.ngo_profiles;
create policy "ngo_profiles: members can read their org"
  on public.ngo_profiles for select
  using (public.is_active_ngo_member(id));

drop policy if exists "ngo_members: org owner can read all members" on public.ngo_members;
create policy "ngo_members: org owner can read all members"
  on public.ngo_members for select
  using (public.is_ngo_owner(ngo_id));

drop policy if exists "ngo_members: active members can read co-members" on public.ngo_members;
create policy "ngo_members: active members can read co-members"
  on public.ngo_members for select
  using (public.is_active_ngo_member(ngo_id));

drop policy if exists "ngo_members: org owner can insert" on public.ngo_members;
create policy "ngo_members: org owner can insert"
  on public.ngo_members for insert
  with check (public.is_ngo_owner(ngo_id));

drop policy if exists "ngo_members: org owner can update" on public.ngo_members;
create policy "ngo_members: org owner can update"
  on public.ngo_members for update
  using (public.is_ngo_owner(ngo_id));

drop policy if exists "ngo_members: org owner can delete" on public.ngo_members;
create policy "ngo_members: org owner can delete"
  on public.ngo_members for delete
  using (public.is_ngo_owner(ngo_id));


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. LAW FIRM ENTITIES
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_firm_owner(p_firm_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_firm_id is not null and exists (
    select 1 from public.firm_profiles fp
    where fp.id = p_firm_id and fp.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_firm_member(p_firm_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_firm_id is not null and exists (
    select 1 from public.firm_members fm
    where fm.firm_id = p_firm_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

drop policy if exists "firm_profiles: members can read their org" on public.firm_profiles;
create policy "firm_profiles: members can read their org"
  on public.firm_profiles for select
  using (public.is_active_firm_member(id));

drop policy if exists "firm_members: firm owner can read all members" on public.firm_members;
create policy "firm_members: firm owner can read all members"
  on public.firm_members for select
  using (public.is_firm_owner(firm_id));

drop policy if exists "firm_members: active members can read co-members" on public.firm_members;
create policy "firm_members: active members can read co-members"
  on public.firm_members for select
  using (public.is_active_firm_member(firm_id));

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
