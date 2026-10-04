-- ============================================================
-- Migration: 20260921_04_profiles_phone_e164_check.sql
--
-- PURPOSE
-- -------
-- Make `public.profiles.phone` structurally incapable of holding anything but
-- a Saudi mobile in E.164 form (`+9665XXXXXXXX`) or NULL, and make the signup
-- trigger produce that shape too.
--
-- CLOSES
-- ------
-- UAT-REG-002 (the database half).
--
-- WHY A CONSTRAINT AND NOT MORE APPLICATION CODE
-- ----------------------------------------------
-- `normalizeSaudiMobile()` (src/lib/services/saudiMobile.ts) has been wired
-- into /register/client, /register/provider, /onboarding, /login and
-- PATCH /api/v1/profile for some time, and all of them are correct. The UAT
-- still persisted `letters-and-email@example.test` into a profiles row, and
-- the audit found out why: scripts/uat/verify-profile-write-guards.ps1:49-61
-- never called the route. It PATCHed PostgREST directly
-- (`/rest/v1/profiles?id=eq.<A>`) with the anon key and the user's own JWT.
-- The RLS policy "users update own profile" permits that — RLS filters ROWS,
-- not COLUMNS — and `profiles.phone` carried no CHECK, no UNIQUE and no
-- trigger (20260603_phase1_001_profiles.sql:39, never altered since). 200 OK.
-- Any client holding a user's token can still do it. Only the database can
-- refuse it, so the refusal belongs in the database.
-- See docs/audits/2026-09-20-profiles-uat/03-registration-phone-audit.md §3-4.
--
-- PREREQUISITES
-- -------------
--   * `public.profiles` with `phone text` and `metadata jsonb not null`
--     (20260603_phase1_001_profiles.sql:39,51).
--   * `public.handle_new_user()` at its 20260827 definition
--     (20260827_signup_contact_fields.sql:118-264) — see the carry-forward
--     note below. Run 20260827 FIRST if it has not been applied; its own
--     header warns that it does not apply itself.
--   * Must run as a role that can read `auth.users` and replace a SECURITY
--     DEFINER function (postgres, i.e. the Supabase SQL Editor).
--
-- WHAT IT SUPERSEDES
-- ------------------
-- Nothing is dropped or replaced except `public.handle_new_user()`, whose
-- body is carried forward from 20260827_signup_contact_fields.sql. That file
-- stays in the chain: it still owns `profiles.city` and the city/country
-- backfill, and this file assumes it has run.
--
-- ⚠ CARRY-FORWARD WARNING — READ BEFORE EDITING (inherited from 20260827)
-- -----------------------------------------------------------------------
-- The function body in section 6 is carried forward BYTE-FOR-BYTE from
-- 20260827_signup_contact_fields.sql. The ONLY differences are: the new
-- `v_phone TEXT` declaration, the clamp that computes it, and the profiles
-- INSERT taking `v_phone` where it used to take
-- `NULLIF(COALESCE(new.raw_user_meta_data->>'phone', new.phone), '')`.
-- Everything else — the 'admin'-excluding whitelist (20260716 P0-2), the
-- provider `v_sub_role` clamp (20260821, without which provider signup raises
-- 23502 and aborts the auth.users insert), the corporate `v_rep_capacity`
-- clamp (20260826), and every sector branch — is reproduced unchanged and
-- MUST NOT be lost when this is next replaced.
--
-- WHY THE TRIGGER CLAMPS INSTEAD OF REJECTING
-- -------------------------------------------
-- `handle_new_user()` is an AFTER INSERT trigger on `auth.users` with no
-- EXCEPTION block. A 23514 raised inside it does not reject the phone number;
-- it aborts the entire `auth.users` INSERT, so the account is never created
-- and the user sees a generic signup failure. The clamp writes NULL instead
-- and the onboarding wizard asks for the number — which is what already
-- happens today for every account created between 20260614 and 20260827.
--
-- WHERE THE CLAMP IS SLIGHTLY MORE FORGIVING THAN THE APP
-- -------------------------------------------------------
-- The clamp strips EVERY non-digit, so `05.12.34.56.78` normalises here while
-- the TypeScript helper's narrower strip set rejected it. That is deliberate
-- and safe in this direction: a clamp that salvages more numbers stores fewer
-- NULLs, and it can never widen what the CHECK below accepts. (The helper's
-- strip set is widened to match in the same work package.)
--
-- DATA: NOTHING IS DELETED
-- ------------------------
-- Rows whose phone cannot be salvaged keep it, verbatim, in
-- `metadata.invalid_phone_quarantined` with a timestamp, and the column is set
-- to NULL. The value is recoverable by hand; it is simply no longer presented
-- as a number anyone can dial.
--
-- Idempotent: the UPDATEs stop matching once they have run, the constraint is
-- added with `if not exists`-equivalent guards, and the function is
-- `CREATE OR REPLACE`. Safe to run twice.
--
-- Rollback:
--   alter table public.profiles drop constraint profiles_phone_e164_saudi_mobile;
--   -- then re-run 20260827_signup_contact_fields.sql to restore the previous
--   -- function body. The quarantined values stay in metadata either way.
-- ============================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Inspect (read-only; run this ALONE, before the rest, on a real database)
-- ═══════════════════════════════════════════════════════════════════════════
-- Everything sections 2-4 are about to change, listed before it changes:
--
--   select id, phone
--     from public.profiles
--    where phone is not null
--      and btrim(phone) <> ''
--      and phone !~ '^\+9665[0-9]{8}$'
--    order by created_at;
--
-- And the shape of the problem in three numbers:
--
--   select count(*) filter (where phone is null)                     as no_phone,
--          count(*) filter (where phone ~ '^\+9665[0-9]{8}$')        as e164_ok,
--          count(*) filter (where phone is not null
--                             and phone !~ '^\+9665[0-9]{8}$')       as malformed
--     from public.profiles;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Blank and invisible-only values → NULL
-- ═══════════════════════════════════════════════════════════════════════════
-- btrim's default set is ASCII whitespace only. The explicit set adds NBSP
-- (U+00A0), zero-width space (U+200B) and the LRM/RLM marks (U+200E/U+200F),
-- all of which arrive routinely from a copy-paste into an RTL form. Written as
-- \uXXXX escapes inside an E'' string on purpose: pasting the characters
-- themselves would make the trim set literally invisible in an editor. (Same
-- reasoning, same set, as 20260827_signup_contact_fields.sql:285-289.)
--
-- An empty string is worse than NULL here: it is truthy to `coalesce`, passes
-- `is not null`, and makes the onboarding gate believe a number is on file.

update public.profiles
   set phone = null
 where phone is not null
   and btrim(phone, E' \t\r\n ​‎‏') = '';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Normalise every salvageable shape (mirrors normalizeSaudiMobile)
-- ═══════════════════════════════════════════════════════════════════════════
-- translate() folds Arabic-Indic ٠-٩ (U+0660-0669) and Extended Arabic-Indic
-- ۰-۹ (U+06F0-06F9) to ASCII; regexp_replace drops everything that is not a
-- digit — spaces, dashes, parentheses, dots, underscores, slashes, a leading
-- '+', and the invisible marks section 2 did not remove because the value was
-- not blank. What is left must be one of the four dialable shapes the owner's
-- forms accept. `right(cleaned, 9)` is the subscriber number in all four:
-- 009665XXXXXXXX (14) · 9665XXXXXXXX (12) · 05XXXXXXXX (10) · 5XXXXXXXX (9).

update public.profiles p
   set phone = '+966' || right(src.cleaned, 9)
  from (
    select id,
           regexp_replace(
             translate(phone, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
             '[^0-9]', '', 'g'
           ) as cleaned
      from public.profiles
     where phone is not null
  ) src
 where src.id = p.id
   and p.phone !~ '^\+9665[0-9]{8}$'
   and (
        src.cleaned ~ '^009665[0-9]{8}$'
     or src.cleaned ~ '^9665[0-9]{8}$'
     or src.cleaned ~ '^05[0-9]{8}$'
     or src.cleaned ~ '^5[0-9]{8}$'
   );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Quarantine whatever is left — NEVER delete
-- ═══════════════════════════════════════════════════════════════════════════
-- `letters-and-email@example.test`, a landline, a foreign number, a nine-digit
-- typo: none of these can be turned into a Saudi mobile without inventing
-- digits. The original string is preserved verbatim in metadata, with the time
-- it was taken out of the column, so support can ask that specific user what
-- their number actually is.

update public.profiles
   set metadata = metadata || jsonb_build_object(
                    'invalid_phone_quarantined', phone,
                    'invalid_phone_quarantined_at', now()
                  ),
       phone = null
 where phone is not null
   and phone !~ '^\+9665[0-9]{8}$';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The constraint
-- ═══════════════════════════════════════════════════════════════════════════
-- NULL is allowed: a profile with no phone number is a normal, expected state
-- (the onboarding gate is what chases it, src/lib/auth/onboardingGate.ts).
-- NOT VALID first, then VALIDATE, so the table is not held under an ACCESS
-- EXCLUSIVE lock for the full scan. Sections 2-4 have already made every
-- existing row conform, so the VALIDATE cannot fail — if it does, a row was
-- written between the two statements and the whole transaction rolls back.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname  = 'profiles_phone_e164_saudi_mobile'
  ) then
    alter table public.profiles
      add constraint profiles_phone_e164_saudi_mobile
      check (phone is null or phone ~ '^\+9665[0-9]{8}$') not valid;
  end if;
end $$;

alter table public.profiles validate constraint profiles_phone_e164_saudi_mobile;

comment on constraint profiles_phone_e164_saudi_mobile on public.profiles is
  'رقم الجوال يُحفظ بصيغة E.164 السعودية فقط (+9665XXXXXXXX) أو NULL. يطابق normalizeSaudiMobile() في src/lib/services/saudiMobile.ts. التطبيع مسؤولية التطبيق؛ قاعدة البيانات ترفض أي صيغة أخرى. أُضيف بعد UAT-REG-002.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. handle_new_user() — body carried forward from 20260827, phone clamped
-- ═══════════════════════════════════════════════════════════════════════════
-- Without this, section 5 turns a bad number typed at signup into a 23514
-- inside an AFTER INSERT trigger on auth.users, which aborts the account
-- creation. Read the ⚠ carry-forward warning in the header before editing.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_type TEXT;
  -- From 20260821. The clamped provider sub-role; unused by every other branch.
  v_sub_role  TEXT;
  -- From 20260826. The clamped corporate legal-rep capacity; unused by every
  -- other branch.
  v_rep_capacity TEXT;
  -- NEW in 20260921_04. The clamped Saudi mobile in E.164 form, or NULL.
  v_phone     TEXT;
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

  -- ── THE ONLY CHANGE IN 20260921_04 ─────────────────────────────────────
  -- Clamp, never raise. This runs inside an AFTER INSERT trigger on
  -- auth.users with no EXCEPTION block: a 23514 from the new CHECK below
  -- would abort the whole signup, which is the failure mode 20260821 exists
  -- to document. So an unusable number becomes NULL and the onboarding wizard
  -- asks for it — the same answer the user gets today, minus the garbage row.
  -- Mirrors normalizeSaudiMobile() in src/lib/services/saudiMobile.ts: Arabic
  -- ٠-٩ and Extended ۰-۹ digits to ASCII, everything non-numeric dropped, the
  -- four accepted shapes (00966… / 966… / 05… / 5…) folded to +9665XXXXXXXX.
  v_phone := regexp_replace(
               translate(
                 COALESCE(new.raw_user_meta_data->>'phone', new.phone, ''),
                 '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
                 '01234567890123456789'
               ),
               '[^0-9]', '', 'g'
             );
  IF v_phone ~ '^(00966|966|0)?5[0-9]{8}$' THEN
    v_phone := '+966' || right(v_phone, 9);
  ELSE
    v_phone := NULL;
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
    -- primary source — exactly as 20260603 had it. 20260921_04 moved the
    -- expression into v_phone above so it can be clamped to E.164.
    v_phone,
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
  IS 'Creates profiles + sector rows on signup. Admin type excluded from self-registration. Provider sub_role clamped to the CHECK list (20260821). Corporate trading name, CR number and legal representative read from signup metadata, capacity clamped (20260826). Phone, city, country_code and display_name_en restored to the profiles INSERT (20260827). Phone clamped to Saudi E.164 or NULL, never raising, so it can satisfy profiles_phone_e164_saudi_mobile (20260921_04).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Verify — fails the transaction if any of it is untrue
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_validated boolean;
  v_violations bigint;
  v_has_clamp boolean;
  v_no_phone bigint;
  v_e164_ok bigint;
  v_quarantined bigint;
begin
  select convalidated into v_validated
    from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and conname  = 'profiles_phone_e164_saudi_mobile';

  if v_validated is null then
    raise exception
      '20260921_04: constraint profiles_phone_e164_saudi_mobile is missing after the migration';
  end if;

  if not v_validated then
    raise exception
      '20260921_04: constraint profiles_phone_e164_saudi_mobile exists but is NOT VALID — old rows were never checked';
  end if;

  select count(*) into v_violations
    from public.profiles
   where phone is not null
     and phone !~ '^\+9665[0-9]{8}$';

  if v_violations <> 0 then
    raise exception
      '20260921_04: % profiles row(s) still hold a non-E.164 phone after the backfill', v_violations;
  end if;

  select position('v_phone' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0
    into v_has_clamp;

  if not v_has_clamp then
    raise exception
      '20260921_04: public.handle_new_user() has no v_phone clamp — section 6 did not take effect, and the next signup with a bad number will abort the auth.users insert';
  end if;

  -- The three counts from the audit appendix, for the record.
  select count(*) filter (where phone is null),
         count(*) filter (where phone ~ '^\+9665[0-9]{8}$'),
         count(*) filter (where metadata ? 'invalid_phone_quarantined')
    into v_no_phone, v_e164_ok, v_quarantined
    from public.profiles;

  raise notice '20260921_04 OK — no_phone=% e164_ok=% quarantined=%',
    v_no_phone, v_e164_ok, v_quarantined;
end $$;

commit;
