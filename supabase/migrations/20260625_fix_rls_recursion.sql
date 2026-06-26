-- =============================================================================
-- Migration: 20260625_fix_rls_recursion.sql
-- Purpose:   Resolve infinite recursion in RLS policies for:
--            1. public.profiles (self-referencing admin read policy)
--            2. public.groups and public.group_members (circular references)
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. FIX: public.profiles Infinite Recursion
-- ═════════════════════════════════════════════════════════════════════════════

-- Create a security definer helper to check if a user is an admin.
-- Since it runs with definer security, it bypasses RLS checks on profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_type = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS 'Bypasses RLS to safely check if the current user is an admin.';

-- Drop the old policy that was self-referential
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;

-- Create the new non-recursive policy
CREATE POLICY "admins read all profiles" ON public.profiles
  FOR SELECT
  USING (public.is_admin());


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. FIX: public.groups & public.group_members Circular Reference
-- ═════════════════════════════════════════════════════════════════════════════

-- Create a security definer helper to check group ownership or active membership.
-- This breaks the cycle where groups select checks group_members and vice versa.
CREATE OR REPLACE FUNCTION public.is_group_member_or_owner(p_group_id uuid, p_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = p_group_id AND owner_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id AND status = 'active'
  );
$$;

COMMENT ON FUNCTION public.is_group_member_or_owner(uuid, uuid) IS 'Bypasses RLS to check group ownership or active membership.';

-- Drop old circular policies
DROP POLICY IF EXISTS "group members read their groups" ON public.groups;
DROP POLICY IF EXISTS "group members read membership" ON public.group_members;

-- Recreate with non-recursive security definer function checks
CREATE POLICY "group members read their groups" ON public.groups
  FOR SELECT
  USING (
    public.is_group_member_or_owner(id, auth.uid())
  );

CREATE POLICY "group members read membership" ON public.group_members
  FOR SELECT
  USING (
    public.is_group_member_or_owner(group_id, auth.uid())
  );

COMMIT;
