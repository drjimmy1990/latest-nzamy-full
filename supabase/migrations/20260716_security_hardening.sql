-- 20260716_security_hardening.sql  (v2 — preserves 20260630 sector provisioning)
-- Fixes three critical privilege escalation vulnerabilities:
-- 1. Remove 'admin' from the signup metadata whitelist (P0-2)
-- 2. Add a trigger to prevent users from changing their own user_type (P0-3)
-- 3. Fix RLS recursion risk in entitlement_requests by using is_admin() (P0-5)
--
-- IMPORTANT: This migration does NOT replace the full handle_new_user() body.
-- Instead, it only patches the v_user_type validation guard inside the existing
-- sector-aware function from 20260630_handle_new_user_sectors.sql.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1: Remove 'admin' from signup whitelist (P0-2)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Replaces handle_new_user() preserving ALL sector provisioning from 20260630.
-- The ONLY change is: 'admin' removed from the v_user_type validation guard.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  v_user_type := COALESCE(new.raw_user_meta_data->>'user_type', 'individual');

  -- ╔═══════════════════════════════════════════════════════════════════════╗
  -- ║  SECURITY FIX: 'admin' is INTENTIONALLY EXCLUDED from self-signup.  ║
  -- ║  Admin accounts must be created via the database or by an admin.    ║
  -- ╚═══════════════════════════════════════════════════════════════════════╝
  IF v_user_type NOT IN (
    'individual', 'lawyer', 'firm', 'corporate',
    'micro', 'provider', 'government', 'ngo'
  ) THEN
    v_user_type := 'individual';
  END IF;

  -- Create base profile (preserved from 20260630)
  INSERT INTO public.profiles (id, display_name, email, user_type)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'),
    new.email,
    v_user_type
  )
  ON CONFLICT (id) DO NOTHING;

  -- Provision role-specific profiles (preserved from 20260630)
  IF v_user_type = 'lawyer' THEN
    INSERT INTO public.lawyer_profiles (user_id, is_accepting_clients)
    VALUES (new.id, true)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type = 'provider' THEN
    INSERT INTO public.provider_profiles (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type = 'firm' THEN
    INSERT INTO public.firm_profiles (owner_user_id, name_ar, name_en)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company_name', 'جهة جديدة'),
      COALESCE(new.raw_user_meta_data->>'company_name_en', 'New Entity')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'corporate' THEN
    INSERT INTO public.business_profiles (owner_user_id, company_name_ar, company_name_en)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company_name', 'شركة جديدة'),
      COALESCE(new.raw_user_meta_data->>'company_name_en', 'New Company')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'government' THEN
    INSERT INTO public.government_profiles (owner_user_id, entity_name_ar, entity_type)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'entity_name', 'جهة حكومية جديدة'),
      COALESCE(new.raw_user_meta_data->>'entity_type', 'other')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'ngo' THEN
    INSERT INTO public.ngo_profiles (owner_user_id, org_name_ar, org_type)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'org_name', 'منظمة جديدة'),
      COALESCE(new.raw_user_meta_data->>'org_type', 'other')
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

  -- Create default user settings (preserved from 20260630)
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.handle_new_user()
  IS 'Creates profiles + sector rows on signup. Admin type excluded from self-registration.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 2: Lock user_type column against self-escalation (P0-3)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Prevents any non-admin user from changing their own user_type via profile update.
-- Service-role calls (auth.uid() IS NULL) are allowed through so backend admin
-- operations are not blocked.

CREATE OR REPLACE FUNCTION public.check_user_type_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow service-role operations (backend admin console, migrations, etc.)
  -- Service-role calls have auth.uid() = NULL.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- If user_type is being changed...
  IF OLD.user_type IS DISTINCT FROM NEW.user_type THEN
    -- Allow only if the caller is an admin (uses the existing is_admin() helper)
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Permission denied: user_type cannot be self-modified'
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_user_type_lock()
  IS 'Prevents non-admin users from escalating their own user_type. Service-role bypasses.';

-- Attach the trigger (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_lock_user_type ON public.profiles;
CREATE TRIGGER trg_lock_user_type
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_user_type_lock();


-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 3: Fix RLS recursion risk in entitlement_requests (P0-5)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Replace the admin policies that directly query public.profiles (which has its
-- own RLS policies, creating a recursion risk) with the safe is_admin() helper
-- that was created in 20260625_fix_rls_recursion.sql.

-- Drop the old policies
DROP POLICY IF EXISTS "entitlement_requests_admin_select" ON public.entitlement_requests;
DROP POLICY IF EXISTS "entitlement_requests_admin_update" ON public.entitlement_requests;

-- Recreate with safe is_admin() calls
CREATE POLICY "entitlement_requests_admin_select" ON public.entitlement_requests
  FOR SELECT USING (public.is_admin());

CREATE POLICY "entitlement_requests_admin_update" ON public.entitlement_requests
  FOR UPDATE USING (public.is_admin());

COMMIT;
