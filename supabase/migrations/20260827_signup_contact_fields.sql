-- ============================================================
-- Migration: 20260827_signup_contact_fields.sql
--
-- Audit of 27 August, wave 3 — three fields that /register/client asks every
-- registrant for and that reach nothing.
--
-- THE DEFECT — a REGRESSION, not an omission
-- ------------------------------------------
-- The ORIGINAL handle_new_user() wrote the phone number:
--
--     insert into public.profiles (id, user_type, display_name,
--                                  display_name_en, email, phone)
--     values (..., coalesce(new.raw_user_meta_data ->> 'phone', new.phone));
--                                                    ^^^^^^^
--     (20260603_phase1_001_profiles.sql:286-300)
--
-- Six later migrations replace that function — 20260614, 20260616, 20260630,
-- 20260716, 20260821, 20260826 — and every one of them rebuilt the profiles
-- INSERT with FOUR columns (id, display_name, email, user_type). `phone`,
-- `display_name_en` and `country_code` were dropped somewhere in that chain and
-- nobody noticed, because a missing column in an INSERT is not an error.
--
-- `profiles.phone` is not cosmetic. It is the ONLY phone number the outbound
-- notification payload carries: the dispatch path reads it straight off the
-- profiles row (src/app/api/v1/service-requests/[id]/route.ts) and copies it
-- into the webhook recipient block for WhatsApp
-- (src/lib/n8n/payload.ts), omitting the field entirely when it is absent. It
-- is also half of the onboarding gate (src/lib/auth/onboardingGate.ts): a user
-- with no phone is sent back through the wizard. So every account registered
-- since 20260614 was both unreachable by WhatsApp AND pushed through an
-- onboarding wizard to re-type a number it had already given.
--
-- AND A SECOND, SEPARATE HALF — the form never sent it either
-- ----------------------------------------------------------
-- src/app/register/client/page.tsx passed the number as a TOP-LEVEL `phone`
-- argument to supabase.auth.signUp(), beside `email`. That signature is a
-- union — `{ email, password }` OR `{ phone, password }` — and the SDK
-- branches on `email` first, so the phone was dropped in the browser and never
-- reached raw_user_meta_data at all. The form fix in the same commit moves it
-- into `options.data.phone`, which is what this function reads.
--
-- CONSEQUENCE FOR THE BACKFILL, stated plainly: city and country_code ARE
-- recoverable (the form has always sent both inside options.data). The PHONE
-- IS NOT — it was never stored anywhere for any account created through this
-- form. Existing users must be asked, and the onboarding wizard is already the
-- place that asks. Nothing here invents one.
--
-- WHAT THIS FILE DOES
-- -------------------
--   1. `add column if not exists public.profiles.city`. Production already has
--      this column and no migration in this repository creates it, so it was
--      added out of band. Adding it here is a no-op against production and
--      stops a fresh database from diverging.
--   2. REPLACES public.handle_new_user() so the profiles INSERT carries
--      phone, city, country_code and display_name_en again.
--   3. BACKFILLS city and country_code from auth.users.raw_user_meta_data,
--      guarded so it can only ever fill a hole.
--
-- ⚠ CARRY-FORWARD WARNING — READ BEFORE EDITING
-- ---------------------------------------------
-- The function body below is carried forward BYTE-FOR-BYTE from
-- 20260826_corporate_identity_persisted.sql, which is the current definition.
-- The ONLY difference is the `INSERT INTO public.profiles` statement.
-- Everything else — the 'admin'-excluding whitelist (20260716's P0-2 security
-- fix), the provider `v_sub_role` clamp (20260821, without which service
-- provider signup raises 23502 and aborts the auth.users insert outright), and
-- the corporate branch with its `v_rep_capacity` clamp (20260826) — is
-- reproduced unchanged and MUST NOT be lost when this is next replaced.
--
-- WHY EVERY VALUE IS WRAPPED IN NULLIF
-- ------------------------------------
-- The form sends '' for a field the user cleared, and '' is not NULL. Without
-- NULLIF, `profiles.phone` fills with the empty string — which is truthy to
-- `coalesce`, passes `is not null`, and makes the onboarding gate believe a
-- number is on file. An empty string is a worse answer than no answer.
--
-- WHY country_code STILL FALLS BACK TO 'SA'
-- -----------------------------------------
-- `country_code text not null default 'SA'` (20260603_phase1_001_profiles.sql).
-- Passing NULL into a NOT NULL column raises 23502 inside an AFTER INSERT
-- trigger with no EXCEPTION block, which aborts the whole signup — the exact
-- failure mode 20260821 exists to document. The fallback is the column's own
-- declared default, not a guess this migration is making.
--
-- Idempotent: `add column if not exists`, `create or replace function`, and an
-- UPDATE whose WHERE clause stops matching once it has run. Safe to run twice.
--
-- Rollback: re-run 20260826_corporate_identity_persisted.sql to restore the
-- previous function body. The backfilled cities would have to be re-nulled by
-- hand; there is no reason to.
--
-- !! THIS FILE DOES NOT APPLY ITSELF. Until it is executed in the Supabase SQL
--    Editor, every new registration still lands with no phone number, and the
--    WhatsApp notification for that account's first order has no recipient.
--    The form change shipped alongside it is harmless before then — an unknown
--    metadata key is simply ignored — but it does nothing.
-- ============================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The column this repository never created
-- ═══════════════════════════════════════════════════════════════════════════
-- Verified present in production on 2026-08-27 (a REST projection of
-- public.profiles returns it) and absent from every file under
-- supabase/migrations/. A no-op there, a divergence fix anywhere else.

alter table public.profiles
  add column if not exists city text;

comment on column public.profiles.city is
  'المدينة — collected at /register/client and by the onboarding wizard. Written by handle_new_user() since 20260827; NULL on rows created between 20260614 and then unless the backfill in that migration recovered it.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The trigger — carried forward from 20260826, profiles INSERT only
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_type TEXT;
  -- From 20260821. The clamped provider sub-role; unused by every other branch.
  v_sub_role  TEXT;
  -- From 20260826. The clamped corporate legal-rep capacity; unused by every
  -- other branch.
  v_rep_capacity TEXT;
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

  -- ── THE ONLY STATEMENT CHANGED IN 20260827 ─────────────────────────────
  -- phone, city, country_code and display_name_en are back. See the header:
  -- the first and the last were in the original 20260603 definition and were
  -- lost in a rewrite, not by a decision.
  INSERT INTO public.profiles (
    id,
    display_name,
    display_name_en,
    email,
    user_type,
    phone,
    city,
    country_code
  )
  VALUES (
    new.id,
    COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), 'مستخدم جديد'),
    COALESCE(NULLIF(new.raw_user_meta_data->>'display_name_en', ''), ''),
    new.email,
    v_user_type,
    -- new.phone is the column auth.users itself carries for a phone signup.
    -- It is NULL for every email signup, so it is a fallback, never the
    -- primary source — exactly as 20260603 had it.
    NULLIF(COALESCE(new.raw_user_meta_data->>'phone', new.phone), ''),
    NULLIF(new.raw_user_meta_data->>'city', ''),
    -- NOT NULL with default 'SA'. A NULL here raises 23502 and aborts signup.
    COALESCE(NULLIF(new.raw_user_meta_data->>'country_code', ''), 'SA')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Provision role-specific profiles (preserved from 20260630)
  IF v_user_type = 'lawyer' THEN
    INSERT INTO public.lawyer_profiles (user_id, is_accepting_clients)
    VALUES (new.id, true)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type = 'provider' THEN
    -- ── 20260821's fix, carried forward UNCHANGED ─────────────────────────
    -- Do not simplify this away. provider_profiles.sub_role is NOT NULL with a
    -- CHECK and no default; without the clamp the insert raises 23502 and
    -- aborts the whole auth.users insert, and provider signup fails outright.
    v_sub_role := COALESCE(new.raw_user_meta_data->>'sub_role', 'notary');
    IF v_sub_role NOT IN ('notary', 'arbitrator', 'bailiff') THEN
      v_sub_role := 'notary';
    END IF;

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
    -- ── Carried forward from 20260826, unchanged ──────────────────────────
    -- Clamp first, insert second. An unrecognised capacity becomes NULL here
    -- so it can never reach the CHECK and abort the auth.users insert.
    v_rep_capacity := NULLIF(new.raw_user_meta_data->>'legal_rep_capacity', '');
    IF v_rep_capacity IS NOT NULL AND v_rep_capacity NOT IN (
      'owner', 'partner', 'manager',
      'authorized_signatory', 'legal_counsel', 'other'
    ) THEN
      v_rep_capacity := NULL;
    END IF;

    INSERT INTO public.business_profiles (
      owner_user_id,
      company_name_ar,
      company_name_en,
      cr_number,
      legal_rep_name,
      legal_rep_capacity
    )
    VALUES (
      new.id,
      COALESCE(NULLIF(new.raw_user_meta_data->>'company_name', ''), 'شركة جديدة'),
      COALESCE(NULLIF(new.raw_user_meta_data->>'company_name_en', ''), ''),
      NULLIF(new.raw_user_meta_data->>'cr_number', ''),
      NULLIF(new.raw_user_meta_data->>'legal_rep_name', ''),
      v_rep_capacity
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'government' THEN
    INSERT INTO public.government_profiles (owner_user_id, entity_name_ar, entity_type)
    VALUES (
      new.id,
      COALESCE(NULLIF(new.raw_user_meta_data->>'entity_name', ''), 'جهة حكومية جديدة'),
      COALESCE(new.raw_user_meta_data->>'entity_type', 'other')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'ngo' THEN
    INSERT INTO public.ngo_profiles (owner_user_id, org_name_ar, org_type)
    VALUES (
      new.id,
      COALESCE(NULLIF(new.raw_user_meta_data->>'org_name', ''), 'منظمة جديدة'),
      COALESCE(new.raw_user_meta_data->>'org_type', 'other')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'micro' THEN
    INSERT INTO public.micro_profiles (user_id, business_name)
    VALUES (
      new.id,
      COALESCE(NULLIF(new.raw_user_meta_data->>'business_name', ''), 'نشاط تجاري جديد')
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
  IS 'Creates profiles + sector rows on signup. Admin type excluded from self-registration. Provider sub_role clamped to the CHECK list (20260821). Corporate trading name, CR number and legal representative read from signup metadata, capacity clamped (20260826). Phone, city, country_code and display_name_en restored to the profiles INSERT (20260827) after six rewrites had silently dropped them.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Backfill — city and country_code only
-- ═══════════════════════════════════════════════════════════════════════════
-- Reads auth.users, so this must run as a role that can (postgres in the
-- Supabase SQL Editor). It is a plain UPDATE; nothing is dropped or deleted.
--
-- The phone is deliberately NOT backfilled and there is nothing to backfill it
-- from: the browser dropped it before signUp ever left the page. Inventing one
-- from an email local-part or a display name is not a recovery, it is a
-- fabrication, and the WhatsApp dispatch would then send a real client's order
-- notification to a stranger's number.
--
-- Guarded so it can only ever fill a hole: a value someone has since corrected
-- by hand is never overwritten, because the WHERE clause requires the current
-- value to be absent (or, for country_code, still the untouched default).
--
-- btrim's default set strips ASCII whitespace only. The explicit set adds NBSP
-- (U+00A0), zero-width space (U+200B) and the LRM/RLM marks (U+200E/U+200F),
-- all of which arrive routinely from a copy-paste into an RTL form. Written as
-- \uXXXX escapes inside an E'' string on purpose: pasting the characters
-- themselves would make the trim set literally invisible in an editor.

update public.profiles p
set city = src.recovered_city
from (
  select
    u.id as user_id,
    nullif(
      btrim(coalesce(u.raw_user_meta_data->>'city', ''), E' \t\r\n ​‎‏'),
      ''
    ) as recovered_city
  from auth.users u
) src
where src.user_id = p.id
  and p.city is null
  and src.recovered_city is not null;

update public.profiles p
set country_code = src.recovered_country
from (
  select
    u.id as user_id,
    nullif(
      btrim(coalesce(u.raw_user_meta_data->>'country_code', ''), E' \t\r\n ​‎‏'),
      ''
    ) as recovered_country
  from auth.users u
) src
where src.user_id = p.id
  -- Only where the column still holds its own untouched default. A country
  -- someone has since set by hand — including someone who set it back to 'SA'
  -- deliberately — is indistinguishable from the default here, and that is
  -- accepted: the recovered value for such a row is what they typed at signup,
  -- so the write is a no-op or a correction, never a loss.
  and p.country_code = 'SA'
  and src.recovered_country is not null
  and src.recovered_country <> 'SA';

commit;

-- ── Verification (read-only; paste into the Supabase SQL Editor) ────────────
--
-- 1. How many accounts still have no phone number anyone can reach them on?
--
--      select
--        count(*)                                as accounts,
--        count(*) filter (where phone is null
--                            or btrim(phone) = '') as no_phone,
--        count(*) filter (where city is null)     as no_city
--      from public.profiles;
--
--    `no_phone` will not fall for EXISTING accounts — there is no source to
--    recover it from. It should stop growing for accounts created after this
--    migration and the matching form change are both live.
--
-- 2. The profiles INSERT carries all eight columns, and the three earlier
--    fixes survived the rewrite:
--
--      select
--        position('country_code' in prosrc) > 0        as writes_country,
--        position('new.phone' in prosrc) > 0           as writes_phone,
--        position('v_sub_role' in prosrc) > 0          as provider_clamp_intact,
--        position('legal_rep_capacity' in prosrc) > 0  as corporate_intact,
--        position('''micro'', ''provider'', ''government'', ''ngo''' in prosrc) > 0
--                                                      as whitelist_intact
--      from pg_proc
--      where proname = 'handle_new_user'
--        and pronamespace = 'public'::regnamespace;
--
--    Expect: t | t | t | t | t
--
-- 3. End-to-end, after applying: register a new individual at /register/client
--    with a phone number and a city, then
--
--      select display_name, phone, city, country_code
--      from public.profiles order by created_at desc limit 1;
--
--    A NULL phone here means the FORM half did not ship — check that
--    src/app/register/client/page.tsx sends the number inside
--    `options.data.phone` and not as a top-level signUp argument.
