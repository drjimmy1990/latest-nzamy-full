-- ============================================================
-- Migration: 20260617_fix_remaining_rls.sql
-- Purpose:   Fix remaining RLS policy issues
--
--   1. Entity admin policies reference p.role instead of p.user_type
--   2. research_items has no direct user access policy (needs user_id column)
--   3. admin_audit_events has no user-facing SELECT policy
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- ISSUE 1: Entity admin READ policies use p.role instead of p.user_type
--
-- The profiles table has `user_type`, not `role`.
-- Drop and recreate on all 8 entity tables.
-- ════════════════════════════════════════════════════════════════

-- firm_profiles
DROP POLICY IF EXISTS "admins read all firm_profiles" ON public.firm_profiles;
CREATE POLICY "admins read all firm_profiles" ON public.firm_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- firm_members
DROP POLICY IF EXISTS "admins read all firm_members" ON public.firm_members;
CREATE POLICY "admins read all firm_members" ON public.firm_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- business_profiles
DROP POLICY IF EXISTS "admins read all business_profiles" ON public.business_profiles;
CREATE POLICY "admins read all business_profiles" ON public.business_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- business_members
DROP POLICY IF EXISTS "admins read all business_members" ON public.business_members;
CREATE POLICY "admins read all business_members" ON public.business_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- government_profiles
DROP POLICY IF EXISTS "admins read all government_profiles" ON public.government_profiles;
CREATE POLICY "admins read all government_profiles" ON public.government_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- government_members
DROP POLICY IF EXISTS "admins read all government_members" ON public.government_members;
CREATE POLICY "admins read all government_members" ON public.government_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- ngo_profiles
DROP POLICY IF EXISTS "admins read all ngo_profiles" ON public.ngo_profiles;
CREATE POLICY "admins read all ngo_profiles" ON public.ngo_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- ngo_members
DROP POLICY IF EXISTS "admins read all ngo_members" ON public.ngo_members;
CREATE POLICY "admins read all ngo_members" ON public.ngo_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );


-- ════════════════════════════════════════════════════════════════
-- ISSUE 2: research_items has no direct user access policy
--
-- The table only has session_id (no user_id column).
-- Desktop feature sets session_id to null, so we need a direct
-- user_id column and policies that check both paths.
-- ════════════════════════════════════════════════════════════════

-- Step 1: Add user_id column (nullable, since existing rows don't have it)
ALTER TABLE public.research_items
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Backfill user_id from research_sessions for existing rows
UPDATE public.research_items ri
SET user_id = rs.user_id
FROM public.research_sessions rs
WHERE ri.session_id = rs.id
  AND ri.user_id IS NULL;

-- Step 3: Index for the new column
CREATE INDEX IF NOT EXISTS idx_research_items_user_id ON public.research_items (user_id);

-- Step 4: Drop existing session-only policies and create new dual-path policies
DROP POLICY IF EXISTS "users read own research items" ON public.research_items;
CREATE POLICY "users read own research items" ON public.research_items
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.research_sessions rs
      WHERE rs.id = research_items.session_id
        AND rs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users manage own research items" ON public.research_items;
CREATE POLICY "users manage own research items" ON public.research_items
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ════════════════════════════════════════════════════════════════
-- ISSUE 3: admin_audit_events has no user-facing SELECT policy
--
-- Column verified: actor_id (uuid, references profiles.id)
-- Allow users to read their own audit events, admins read all.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users read own audit events" ON public.admin_audit_events;
CREATE POLICY "users read own audit events" ON public.admin_audit_events
  FOR SELECT
  USING (
    actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

COMMIT;
