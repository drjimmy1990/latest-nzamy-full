-- ============================================================
-- Migration: 20260826_corporate_identity_persisted.sql
-- Owner ruling of 26 August, §3ج — "persist the real trading name, the CR
-- number, and the legal representative's name and capacity."
--
-- THE DEFECT
-- ----------
-- public.handle_new_user()'s corporate branch reads
--   COALESCE(new.raw_user_meta_data->>'company_name', 'شركة جديدة')
-- (20260716_security_hardening.sql:67-74, carried forward unchanged into
-- 20260821_fix_provider_signup_sub_role.sql).
--
-- /register/client NEVER SENT `company_name`. It sent the same string under
-- `full_name` and `display_name` instead (src/app/register/client/page.tsx).
-- So the COALESCE always took its fallback and EVERY corporate row in
-- production reads «شركة جديدة».
--
-- The CR number was worse: the form did collect it and did send it, under
-- `cr_number` (page.tsx, the `clientType === "company"` metadata spread) — but
-- the trigger's INSERT lists only (owner_user_id, company_name_ar,
-- company_name_en), so business_profiles.cr_number, a column that has existed
-- since 20260603_phase1_002_entities.sql:223, was never written by signup.
--
-- Nothing errored. A silent placeholder is the whole shape of this bug.
--
-- WHAT THIS FILE DOES — three things, in order
-- --------------------------------------------
--   1. ADDS two nullable columns to business_profiles for the legal
--      representative. `add column if not exists`, no default, no NOT NULL,
--      no destructive statement. Verified absent first: a grep for
--      legal_rep / representative / ممثل / مفوّض across supabase/migrations/
--      returns nothing, and business_members (20260603_phase1_002_entities.sql)
--      models team membership, not the signatory of record.
--
--      cr_number is NOT added — it already exists and is already indexed
--      (…_002_entities.sql:223,249-250). Only the trigger's failure to write
--      it needed fixing.
--
--   2. REPLACES public.handle_new_user() so the corporate branch reads the
--      four keys. See the carry-forward warning below.
--
--   3. BACKFILLS the existing rows from auth.users.raw_user_meta_data. See
--      "THE BACKFILL IS REAL RECOVERY" below — this invents nothing.
--
-- ⚠ CARRY-FORWARD WARNING — READ BEFORE EDITING
-- ---------------------------------------------
-- The function body below is carried forward BYTE-FOR-BYTE from
-- 20260821_fix_provider_signup_sub_role.sql, which is the current definition —
-- NOT from 20260716_security_hardening.sql. The ONLY differences are the
-- corporate branch, the v_rep_capacity declaration and its clamp.
--
-- 20260821 repaired provider signup: provider_profiles.sub_role is NOT NULL
-- with a CHECK and no default, so the old branch raised 23502 and, with no
-- EXCEPTION block, aborted the auth.users insert itself — service-provider
-- signup failed entirely. Rebuilding this function from the 20260716 text
-- would silently reinstate that. The v_sub_role clamp below is that fix; do
-- not drop it.
--
-- The 'admin'-excluding whitelist (20260716's P0-2 security fix) is likewise
-- carried forward verbatim and must not be lost.
--
-- If another migration dated 20260826 or later also replaces this function,
-- whichever is applied LAST wins in full. Both changes must be merged into one
-- body before either is applied.
--
-- WHY THE CAPACITY IS CLAMPED
-- ---------------------------
-- legal_rep_capacity carries a CHECK. raw_user_meta_data is user-supplied at
-- signUp, so a hostile or malformed value would otherwise reach that
-- constraint inside an AFTER INSERT trigger with no EXCEPTION block — and a
-- CHECK violation there aborts the entire auth.users insert. Exactly the
-- failure 20260821 documents. The branch therefore clamps anything outside the
-- list to NULL rather than passing it through. NULL is the honest value: it
-- means "not declared", and the dashboard can ask for it.
--
-- WHY company_name_en IS NO LONGER 'New Company'
-- ----------------------------------------------
-- The registration form has no English company-name field, so there is no
-- English name to store. The old branch wrote the literal 'New Company' —
-- the same fabricated-placeholder defect as «شركة جديدة», just in English.
-- It now falls back to '' (the column's own default,
-- …_002_entities.sql:222). Nothing is invented. Only the corporate branch
-- changes; firm_profiles keeps 'New Entity' because that branch is outside
-- this ruling and is carried forward untouched.
--
-- THE BACKFILL IS REAL RECOVERY, NOT INVENTION
-- --------------------------------------------
-- The task brief assumed the trading name was unrecoverable. It is not.
-- page.tsx set `full_name: displayName` where displayName is
-- `companyName || …`, and the trigger writes that into profiles.display_name.
-- It also sent `cr_number`. auth.users.raw_user_meta_data keeps both forever.
-- So for every corporate account created through this form, the real trading
-- name and the real CR are still on disk — just not where anything reads them.
--
-- The UPDATEs are guarded so they can only ever fill a hole:
--   * the name half runs ONLY where company_name_ar is still the exact
--     placeholder «شركة جديدة» — a name someone has since corrected by hand is
--     never overwritten;
--   * the CR half runs ONLY where cr_number IS NULL, independently of the
--     name half, so a row with a corrected name still gets its CR;
--   * displayName is a FALLBACK CHAIN. A corporate signup that left the
--     company field blank stored a person's name or the literal «عميل نظامي».
--     Writing that into company_name_ar would be inventing a trading name by a
--     different route, so those values are excluded by name.
--
-- The legal representative is genuinely unrecoverable — no form ever collected
-- it — and is deliberately left NULL. It must be asked for, not guessed.
--
-- Idempotent: `add column if not exists`, `create or replace function`, and
-- UPDATEs whose WHERE clauses stop matching once they have run. Safe to run
-- twice.
--
-- Rollback: `alter table public.business_profiles drop column legal_rep_name,
-- drop column legal_rep_capacity;` then re-run
-- 20260821_fix_provider_signup_sub_role.sql to restore the previous function
-- body. The backfilled names and CRs would have to be re-placeholdered by
-- hand; there is no reason to.
--
-- !! THIS FILE DOES NOT APPLY ITSELF. This repository has a history of
--    migrations written and never run — 20260821 says so about itself. Until
--    the owner executes this in the Supabase SQL Editor, corporate signup
--    keeps writing «شركة جديدة» with no CR, and the four new form fields on
--    /register/client are collected and then discarded by the trigger.
--    The form changes are harmless before it is applied (unknown metadata keys
--    are simply ignored) but they do nothing.
-- ============================================================

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The two columns that genuinely did not exist
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.business_profiles
  add column if not exists legal_rep_name text;

alter table public.business_profiles
  add column if not exists legal_rep_capacity text;

-- Added separately from the column so a re-run does not fail on an existing
-- constraint. NULL is always allowed: it is the value for "not declared yet",
-- which is what every pre-20260826 row will carry.
do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profiles_legal_rep_capacity_check'
      and conrelid = 'public.business_profiles'::regclass
  ) then
    alter table public.business_profiles
      add constraint business_profiles_legal_rep_capacity_check
      check (
        legal_rep_capacity is null
        or legal_rep_capacity in (
          'owner', 'partner', 'manager',
          'authorized_signatory', 'legal_counsel', 'other'
        )
      );
  end if;
end
$do$;

comment on column public.business_profiles.legal_rep_name is
  'اسم الممثل النظامي — the natural person who deals with نظامي on the company''s behalf. Collected at /register/client since 20260826; NULL on every earlier row and unrecoverable for them (no form ever asked).';

comment on column public.business_profiles.legal_rep_capacity is
  'صفة الممثل النظامي. CHECK-constrained; handle_new_user() clamps an unrecognised signup value to NULL rather than letting it abort the auth.users insert. Values mirrored in src/app/register/client/components/_corporateIdentity.ts (LEGAL_REP_CAPACITIES) — changing one without the other breaks the contract silently.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The trigger — carried forward from 20260821, corporate branch only
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_type TEXT;
  -- From 20260821. The clamped provider sub-role; unused by every other branch.
  v_sub_role  TEXT;
  -- New in 20260826. The clamped corporate legal-rep capacity; unused by every
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
    -- ── THE ONLY BRANCH CHANGED IN 20260826 ───────────────────────────────
    -- Clamp first, insert second. An unrecognised capacity becomes NULL here
    -- so it can never reach the CHECK and abort the auth.users insert.
    v_rep_capacity := NULLIF(new.raw_user_meta_data->>'legal_rep_capacity', '');
    IF v_rep_capacity IS NOT NULL AND v_rep_capacity NOT IN (
      'owner', 'partner', 'manager',
      'authorized_signatory', 'legal_counsel', 'other'
    ) THEN
      v_rep_capacity := NULL;
    END IF;

    -- NULLIF before COALESCE throughout: the form sends '' for a field the
    -- user cleared, and '' is not NULL, so a bare COALESCE would happily store
    -- an empty trading name in a NOT NULL column and call it a success.
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
      -- '' not 'New Company': there is no English-name field on the form, and a
      -- placeholder is what this migration exists to remove.
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
  IS 'Creates profiles + sector rows on signup. Admin type excluded from self-registration. Provider sub_role read from signup metadata and clamped to the CHECK list (20260821). Corporate trading name, CR number and legal representative read from signup metadata, capacity clamped to the CHECK list (20260826).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Backfill — recovery from auth.users.raw_user_meta_data
-- ═══════════════════════════════════════════════════════════════════════════
-- Reads auth.users, so this must run as a role that can (postgres in the
-- Supabase SQL Editor). It is a plain UPDATE; nothing is dropped or deleted.

-- 3a. The trading name.
--
-- Source order: `company_name` first in case any other registration path
-- already sent it, then `full_name`, then `display_name` — the last two being
-- where /register/client actually put the company name.
--
-- The recovered value is computed ONCE, in the subquery, and the guard and the
-- assignment both read that one column. Spelling the expression out twice —
-- once in SET and once in WHERE — is how a guard and an assignment drift apart
-- and how a value that passed the guard turns out not to be the value stored.
--
-- btrim's default strips ASCII whitespace only. The explicit set adds NBSP
-- (U+00A0), zero-width space (U+200B) and the LRM/RLM marks (U+200E/U+200F),
-- all of which arrive routinely from a copy-paste into an RTL form and none of
-- which the default would remove — a name of nothing but an NBSP would
-- otherwise pass every guard here and land in a NOT NULL column as a value
-- that renders blank.
--
-- They are written as \uXXXX escapes inside an E'' string on purpose: pasting
-- the characters themselves would make the trim set literally invisible in an
-- editor, and the next person to touch this line would delete one without
-- seeing it. (\uXXXX in an escape-string constant requires a UTF-8 database;
-- Supabase is one.)
--
-- The NOT IN list is the guard that keeps this honest: displayName in page.tsx
-- is a fallback chain, so a corporate signup that left the company field blank
-- stored a person's name or a generic literal. Those are excluded; the row
-- keeps its placeholder and the dashboard can ask.
update public.business_profiles bp
set company_name_ar = src.recovered_name
from (
  select
    u.id as user_id,
    nullif(
      btrim(
        coalesce(
          u.raw_user_meta_data->>'company_name',
          u.raw_user_meta_data->>'full_name',
          u.raw_user_meta_data->>'display_name',
          ''
        ),
        E' \t\r\n\u00A0\u200B\u200E\u200F'
      ),
      ''
    ) as recovered_name
  from auth.users u
) src
where src.user_id = bp.owner_user_id
  and bp.company_name_ar = 'شركة جديدة'
  and src.recovered_name is not null
  and src.recovered_name not in ('شركة جديدة', 'عميل نظامي', 'مستخدم جديد', 'New Company');

-- 3b. The CR number. Independent of 3a: a row whose name was already corrected
-- by hand still has a NULL cr_number and still deserves its number back.
-- Same one-expression-computed-once discipline as 3a.
update public.business_profiles bp
set cr_number = src.recovered_cr
from (
  select
    u.id as user_id,
    nullif(
      btrim(
        coalesce(u.raw_user_meta_data->>'cr_number', ''),
        E' \t\r\n\u00A0\u200B\u200E\u200F'
      ),
      ''
    ) as recovered_cr
  from auth.users u
) src
where src.user_id = bp.owner_user_id
  and bp.cr_number is null
  and src.recovered_cr is not null;

-- 3c. The English name. Only clears the fabricated 'New Company' literal; it
-- does not write anything, because there is nothing true to write.
update public.business_profiles
set company_name_en = ''
where company_name_en = 'New Company';

-- The legal representative is deliberately NOT backfilled. No registration
-- form ever collected it, so there is no source. Every pre-20260826 row keeps
-- NULL, which is the truth.

commit;

-- ── Verification (read-only; paste into the Supabase SQL Editor) ────────────
--
-- 1. How many corporate rows are still placeholders / still have no CR?
--    The repository cannot answer this — run it:
--
--      select
--        count(*)                                             as corporate_rows,
--        count(*) filter (where company_name_ar = 'شركة جديدة') as still_placeholder,
--        count(*) filter (where cr_number is null)             as still_no_cr,
--        count(*) filter (where legal_rep_name is null)        as no_legal_rep
--      from public.business_profiles;
--
--    After this migration, `still_placeholder` is the number of companies that
--    registered without typing a name at all — they cannot be recovered and
--    must be asked. `no_legal_rep` will equal every pre-20260826 row.
--
-- 2. The corporate branch reads the four keys, and 20260821's provider fix
--    survived:
--
--      select
--        position('legal_rep_capacity' in prosrc) > 0    as reads_capacity,
--        position('''cr_number''' in prosrc) > 0         as reads_cr,
--        position('v_sub_role' in prosrc) > 0            as provider_clamp_intact,
--        position('''micro'', ''provider'', ''government'', ''ngo''' in prosrc) > 0
--                                                        as whitelist_intact
--      from pg_proc
--      where proname = 'handle_new_user'
--        and pronamespace = 'public'::regnamespace;
--
--    Expect: t | t | t | t
--
--    Do NOT rewrite `whitelist_intact` as a search for 'admin' — the
--    explanatory comment inside the body contains that word in quotes, so such
--    a test fails on a perfectly correct function.
--
-- 3. End-to-end, after applying: register at /register/client as
--    «شركة / مؤسسة», then
--
--      select company_name_ar, company_name_en, cr_number,
--             legal_rep_name, legal_rep_capacity
--      from public.business_profiles
--      order by created_at desc limit 1;
--
--    Every column must hold what was typed. A «شركة جديدة» here means the
--    form and this file have drifted apart — check the key names against
--    src/app/register/client/components/_corporateIdentity.ts.
