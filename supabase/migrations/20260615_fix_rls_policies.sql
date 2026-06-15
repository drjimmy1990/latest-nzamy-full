-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Fix RLS policies
-- Date: 2026-06-15
-- Issues addressed:
--   1. Entity admin policies check p.role (doesn't exist) → p.user_type
--   2. Attachments owner-based access
--   3. Admin audit events user-facing read access
--   4. Notifications user read/update access
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Fix entity admin policies: role → user_type
DROP POLICY IF EXISTS "admins read firm profiles" ON public.firm_profiles;
CREATE POLICY "admins read firm profiles"
  ON public.firm_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin'));

DROP POLICY IF EXISTS "admins read firm members" ON public.firm_members;
CREATE POLICY "admins read firm members"
  ON public.firm_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin'));

DROP POLICY IF EXISTS "admins read business profiles" ON public.business_profiles;
CREATE POLICY "admins read business profiles"
  ON public.business_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin'));

DROP POLICY IF EXISTS "admins read business members" ON public.business_members;
CREATE POLICY "admins read business members"
  ON public.business_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin'));

DROP POLICY IF EXISTS "admins read government profiles" ON public.government_profiles;
CREATE POLICY "admins read government profiles"
  ON public.government_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin'));

DROP POLICY IF EXISTS "admins read government members" ON public.government_members;
CREATE POLICY "admins read government members"
  ON public.government_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin'));

DROP POLICY IF EXISTS "admins read ngo profiles" ON public.ngo_profiles;
CREATE POLICY "admins read ngo profiles"
  ON public.ngo_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin'));

DROP POLICY IF EXISTS "admins read ngo members" ON public.ngo_members;
CREATE POLICY "admins read ngo members"
  ON public.ngo_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.user_type = 'admin'));

-- 2. Attachments: owner-based access
DROP POLICY IF EXISTS "users read own attachments" ON public.attachments;
CREATE POLICY "users read own attachments"
  ON public.attachments FOR SELECT USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own attachments" ON public.attachments;
CREATE POLICY "users insert own attachments"
  ON public.attachments FOR INSERT WITH CHECK (owner_user_id = auth.uid());

-- 3. Admin audit events: user read own actions
DROP POLICY IF EXISTS "users read own audit events" ON public.admin_audit_events;
CREATE POLICY "users read own audit events"
  ON public.admin_audit_events FOR SELECT USING (actor_user_id = auth.uid());

-- 4. Notifications: user read/update own
DROP POLICY IF EXISTS "users read own notifications" ON public.notifications;
CREATE POLICY "users read own notifications"
  ON public.notifications FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users update own notifications" ON public.notifications;
CREATE POLICY "users update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
