-- ============================================================
-- Migration: 20260821_fix_provider_signup_sub_role.sql
-- Purpose:  Repair service-provider signup, which is broken for
--           EVERY route and has been since 20260616.
--
--           public.handle_new_user()'s provider branch is, live:
--
--             INSERT INTO public.provider_profiles (user_id)
--             VALUES (new.id) ON CONFLICT (user_id) DO NOTHING;
--
--           (20260716_security_hardening.sql:53-56, carried forward
--           unchanged from 20260616_production_readiness_fixes.sql:139-142
--           and 20260630_handle_new_user_sectors.sql:42-45.)
--
--           provider_profiles.sub_role is
--             `text not null check (sub_role in ('notary','arbitrator','bailiff'))`
--           with NO default (20260603_phase1_001_profiles.sql:159-160).
--           Apart from the user_id primary key, which the insert does
--           supply, sub_role is the ONLY not-null column of that table
--           without a default — so it is the only thing missing, and
--           adding it is the whole fix. Checked column by column
--           against …_001_profiles.sql:157-173: service_areas,
--           availability, verification_status, marketplace_visible,
--           metadata, created_at and updated_at all have defaults;
--           license_number, license_expiry and hourly_rate are
--           nullable. No later migration alters this table.
--
--           So the insert above raises 23502 not_null_violation.
--           ON CONFLICT (user_id) DO NOTHING resolves UNIQUE/PK
--           conflicts only — it does not suppress a NOT NULL
--           violation — and the function has no EXCEPTION block, so
--           the error propagates out of the AFTER INSERT trigger and
--           aborts the auth.users insert itself. supabase.auth.signUp
--           returns a database error and no account is created.
--           Corroboration: there are 0 provider accounts among the
--           16 live ones.
--
--           This restores the clamp that
--           20260614_auto_create_role_profiles.sql:122-125 had and
--           20260616 dropped: read sub_role from raw_user_meta_data,
--           fall back to 'notary', and clamp anything outside the
--           CHECK list back to 'notary' so a hostile or malformed
--           metadata value can never reach the constraint.
--
--           /register/provider already sends the right value in
--           options.data (src/app/register/provider/page.tsx:393,413):
--           موثّق→'notary', محكّم→'arbitrator', معقّب→'bailiff'.
--           Nothing consumed it until this file.
--
--           EVERY OTHER BRANCH of the function is carried forward
--           byte-for-byte from 20260716_security_hardening.sql:19-110,
--           including the 'admin'-excluding whitelist at :30-35 —
--           which is a P0 security fix and must not be lost. The
--           lawyer / firm / corporate / government / ngo / micro
--           branches, the base profiles insert and the user_settings
--           insert are unchanged.
--
--           The function deliberately does NOT `SET search_path`.
--           Neither did the version this replaces. Adding it would
--           require schema-qualifying every reference and is a
--           behaviour change, not a carry-forward.
--
-- Backfill: none needed. sub_role only ever mattered at signup, and
--           signup has been failing rather than writing a wrong
--           value, so there are no provider_profiles rows to repair.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Safe to run twice.
--
-- Trigger:  NOT re-created here on purpose. on_auth_user_created is
--           bound AFTER INSERT ON auth.users in
--           20260630_handle_new_user_sectors.sql:111-114, and
--           CREATE OR REPLACE FUNCTION keeps that binding.
--
-- Rollback: re-run 20260716_security_hardening.sql — its
--           CREATE OR REPLACE of this same function restores the
--           previous (broken) body. There is no data to undo.
--
-- !! THIS FILE DOES NOT APPLY ITSELF. Until the owner runs it against
--    the live database in the Supabase SQL Editor, service-provider
--    signup by email stays broken exactly as described above, and
--    "التالي" on /register/provider stays disabled for موثّق / معقّب /
--    محكّم (src/app/register/provider/page.tsx, `roleHasAWorkingSignUp`
--    — flip it only after this has run).
-- ============================================================

begin;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_type TEXT;
  -- New in 20260821. The clamped provider sub-role; unused by every
  -- other branch.
  v_sub_role  TEXT;
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
    -- ── THE ONLY CHANGED BRANCH (20260821) ────────────────────────────────
    -- Restores the clamp from 20260614_auto_create_role_profiles.sql:122-125.
    -- Two steps, both load-bearing:
    --   1. COALESCE — raw_user_meta_data->>'sub_role' is NULL when the key is
    --      absent (an OAuth signup) AND when it is JSON null
    --      (src/app/register/client/page.tsx:240 sends exactly that, though
    --      never with user_type='provider'). Either way 'notary' is used.
    --   2. The IN test — anything outside the CHECK list, including a value
    --      a caller crafted by hand, is replaced rather than passed through.
    --      raw_user_meta_data is user-supplied at signUp, so the constraint
    --      must never be the thing that catches it: a violation here aborts
    --      the whole auth.users insert.
    -- Only these two lines and the column list below differ from the body in
    -- 20260716_security_hardening.sql:53-56.
    v_sub_role := COALESCE(new.raw_user_meta_data->>'sub_role', 'notary');
    IF v_sub_role NOT IN ('notary', 'arbitrator', 'bailiff') THEN
      v_sub_role := 'notary';
    END IF;

    -- verification_status and marketplace_visible are deliberately NOT set:
    -- they take their column defaults of 'pending' and false
    -- (20260603_phase1_001_profiles.sql:165-168). Signup never grants a
    -- verified badge or marketplace visibility — only an admin decision does
    -- (src/app/api/v1/admin/verifications/[id]/route.ts).
    INSERT INTO public.provider_profiles (user_id, sub_role)
    VALUES (new.id, v_sub_role)
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
  IS 'Creates profiles + sector rows on signup. Admin type excluded from self-registration. Provider sub_role read from signup metadata and clamped to the CHECK list (20260821).';

commit;

-- ── Verification (read-only; paste into the Supabase SQL Editor) ────────────
--
-- 1. The clamp is present and the admin exclusion survived:
--
--      select
--        position('v_sub_role' in prosrc) > 0            as has_sub_role_clamp,
--        position('provider_profiles (user_id, sub_role)' in prosrc) > 0
--                                                        as inserts_sub_role,
--        position('''micro'', ''provider'', ''government'', ''ngo''' in prosrc) > 0
--                                                        as whitelist_intact
--      from pg_proc
--      where proname = 'handle_new_user'
--        and pronamespace = 'public'::regnamespace;
--
--    Expect: t | t | t
--
--    `whitelist_intact` matches the second half of the eight-value guard that
--    20260716_security_hardening.sql:30-35 installed. That guard is a closed
--    list of the eight self-registerable types, so 'admin' is excluded by not
--    being in it. Do NOT "improve" this into `position('''admin''' in prosrc)
--    = 0` — the explanatory comment inside the function body contains the word
--    'admin' in quotes, so that test fails on a perfectly correct function.
--    To read the guard with your own eyes instead:
--
--      select prosrc from pg_proc
--      where proname = 'handle_new_user'
--        and pronamespace = 'public'::regnamespace;
--
-- 2. Every branch is still there — expect all eight to be t:
--
--      select
--        position('lawyer_profiles'     in prosrc) > 0 as lawyer,
--        position('provider_profiles'   in prosrc) > 0 as provider,
--        position('firm_profiles'       in prosrc) > 0 as firm,
--        position('business_profiles'   in prosrc) > 0 as corporate,
--        position('government_profiles' in prosrc) > 0 as government,
--        position('ngo_profiles'        in prosrc) > 0 as ngo,
--        position('micro_profiles'      in prosrc) > 0 as micro,
--        position('user_settings'       in prosrc) > 0 as settings
--      from pg_proc
--      where proname = 'handle_new_user'
--        and pronamespace = 'public'::regnamespace;
--
-- 3. The trigger is still bound (this file does not re-create it):
--
--      select tgname, tgenabled
--      from pg_trigger
--      where tgrelid = 'auth.users'::regclass
--        and tgname = 'on_auth_user_created';
--
--    Expect one row: on_auth_user_created | O
--
-- 4. The real proof — register a service provider at /register/provider
--    (موثّق، معقّب or محكّم) and then check the row was created with the
--    matching specialty:
--
--      select p.email, pr.sub_role, pr.verification_status, pr.marketplace_visible
--      from public.provider_profiles pr
--      join public.profiles p on p.id = pr.user_id
--      order by pr.created_at desc
--      limit 5;
--
--    Expect sub_role to be the specialty that was chosen on screen
--    (معقّب is stored as 'bailiff'), verification_status 'pending' and
--    marketplace_visible false.
