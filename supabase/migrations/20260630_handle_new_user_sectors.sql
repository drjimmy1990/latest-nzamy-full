-- ============================================================
-- Migration: 20260630_handle_new_user_sectors.sql
-- Purpose:  Fix handle_new_user() trigger to provision the
--           missing sector profiles on signup:
--             - government  -> government_profiles
--             - ngo         -> ngo_profiles
--             - corporate   -> business_profiles (was firm_profiles)
--           Keeps lawyer / provider / firm / micro branches and
--           user_settings insert identical to 20260616.
--           Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- handle_new_user() — sector-aware version
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

  ELSIF v_user_type = 'firm' THEN
    INSERT INTO public.firm_profiles (owner_user_id, name_ar, name_en)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company_name', 'جهة جديدة'),
      COALESCE(new.raw_user_meta_data->>'company_name_en', 'New Entity')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'corporate' THEN
    -- Corporate entities use business_profiles (NOT firm_profiles).
    -- Required NOT NULL column without default: company_name_ar.
    INSERT INTO public.business_profiles (owner_user_id, company_name_ar, company_name_en)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company_name', 'شركة جديدة'),
      COALESCE(new.raw_user_meta_data->>'company_name_en', 'New Company')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'government' THEN
    -- Required NOT NULL columns without defaults: entity_name_ar, entity_type.
    -- entity_type must satisfy CHECK (court|prosecution|ministry|authority|
    -- commission|municipality|other) -> fallback 'other'.
    INSERT INTO public.government_profiles (owner_user_id, entity_name_ar, entity_type)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'entity_name', 'جهة حكومية جديدة'),
      COALESCE(new.raw_user_meta_data->>'entity_type', 'other')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'ngo' THEN
    -- Required NOT NULL columns without defaults: org_name_ar, org_type.
    -- org_type must satisfy CHECK (charity|waqf|foundation|campaign|
    -- association|other) -> fallback 'other'.
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

  -- Create default user settings
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- Rebind the auth trigger (idempotent)
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

commit;

-- ============================================================
-- Execute this file in Supabase SQL Editor.
-- ============================================================