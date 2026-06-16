-- ============================================================
-- Migration: 20260616_production_readiness_fixes.sql
-- Purpose:  Production readiness — schema fixes, RLS policy 
--           updates, and trigger enhancements.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ADD MISSING COLUMNS
-- ────────────────────────────────────────────────────────────

-- 1a. lawyer_profiles: add is_accepting_clients (API expects it)
ALTER TABLE public.lawyer_profiles
  ADD COLUMN IF NOT EXISTS is_accepting_clients BOOLEAN NOT NULL DEFAULT true;

-- 1b. profiles: add city column (frontend filters by city)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city TEXT;

-- 1c. lawyer_profiles: add city column
ALTER TABLE public.lawyer_profiles
  ADD COLUMN IF NOT EXISTS city TEXT;

-- ────────────────────────────────────────────────────────────
-- 2. FIX CONSTRAINTS
-- ────────────────────────────────────────────────────────────

-- 2a. attachments: make request_id nullable for general doc uploads
ALTER TABLE public.attachments
  ALTER COLUMN request_id DROP NOT NULL;

-- 2b. service_requests: add 'pending' to status constraint
--     (non-breaking: keeps all existing values + adds 'pending')
ALTER TABLE public.service_requests
  DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE public.service_requests
  ADD CONSTRAINT service_requests_status_check
  CHECK (status IN (
    'draft',
    'pending',
    'pending_payment',
    'pending_assignment',
    'assigned',
    'in_review',
    'completed',
    'cancelled'
  ));

-- ────────────────────────────────────────────────────────────
-- 3. FIX RLS POLICIES — Service Requests (Marketplace)
-- ────────────────────────────────────────────────────────────

-- Drop old restrictive policy
DROP POLICY IF EXISTS "clients read their own service requests" ON public.service_requests;
DROP POLICY IF EXISTS "service_requests_select_policy" ON public.service_requests;

-- New policy: clients see own + lawyers see assigned OR unassigned (marketplace)
CREATE POLICY "service_requests_select_policy" ON public.service_requests
  FOR SELECT
  USING (
    -- Creator can always read
    requester_user_id = auth.uid()
    -- Assigned lawyer can read
    OR assigned_to = auth.uid()
    -- Verified lawyers can browse unassigned requests in marketplace
    OR (
      EXISTS (
        SELECT 1 FROM public.lawyer_profiles
        WHERE lawyer_profiles.user_id = auth.uid()
          AND lawyer_profiles.verification_status = 'verified'
      )
      AND assigned_to IS NULL
      AND status IN ('pending', 'pending_assignment')
    )
  );

-- ────────────────────────────────────────────────────────────
-- 4. FIX RLS POLICIES — Attachments (unified)
-- ────────────────────────────────────────────────────────────

-- Drop conflicting attachment policies
DROP POLICY IF EXISTS "participants read attachments" ON public.attachments;
DROP POLICY IF EXISTS "users read own attachments" ON public.attachments;
DROP POLICY IF EXISTS "attachments_select_policy" ON public.attachments;
DROP POLICY IF EXISTS "attachments_insert_policy" ON public.attachments;

-- Unified SELECT: owner OR participant in the linked service request
CREATE POLICY "attachments_select_policy" ON public.attachments
  FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR (
      request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.service_requests
        WHERE service_requests.id = attachments.request_id
          AND (
            service_requests.requester_user_id = auth.uid()
            OR service_requests.assigned_to = auth.uid()
          )
      )
    )
  );

-- INSERT: owner must match authenticated user
CREATE POLICY "attachments_insert_policy" ON public.attachments
  FOR INSERT
  WITH CHECK (
    owner_user_id = auth.uid()
  );

-- ────────────────────────────────────────────────────────────
-- 5. UPDATE handle_new_user() TRIGGER
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  v_user_type := COALESCE(new.raw_user_meta_data->>'user_type', 'individual');

  -- Create base profile
  INSERT INTO public.profiles (id, display_name, email, user_type)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'),
    new.email,
    v_user_type
  )
  ON CONFLICT (id) DO NOTHING;

  -- Provision role-specific profiles
  IF v_user_type = 'lawyer' THEN
    INSERT INTO public.lawyer_profiles (user_id, is_accepting_clients)
    VALUES (new.id, true)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type = 'provider' THEN
    INSERT INTO public.provider_profiles (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type IN ('firm', 'corporate') THEN
    INSERT INTO public.firm_profiles (owner_user_id, name_ar, name_en)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company_name', 'جهة جديدة'),
      COALESCE(new.raw_user_meta_data->>'company_name_en', 'New Entity')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'micro' THEN
    INSERT INTO public.micro_profiles (user_id, business_name)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'business_name', 'نشاط تجاري جديد')
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Create default user settings
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 6. DONE
-- ────────────────────────────────────────────────────────────
-- Execute this file in Supabase SQL Editor.
-- Then deploy the Next.js application.
