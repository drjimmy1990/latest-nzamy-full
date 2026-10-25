-- _verify.sql — READ-ONLY schema/RLS assertions run by deploy.sh.
-- This is NOT a migration (leading underscore keeps it out of `supabase db push`).
-- Confirms the prerequisite migrations 20260616 + 20260630 actually landed in
-- the live DB. Every statement is a SELECT, or a DO block whose only effect is
-- RAISE; nothing is written. A RAISE makes deploy.sh stop — that is the point
-- of the 2026-09-21 section at the bottom, which covers the objects a bulk
-- apply can silently skip (and the one step that is not a migration at all).

SELECT 'lawyer_profiles.is_accepting_clients' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                 AND column_name = 'is_accepting_clients') AS present;

SELECT 'lawyer_profiles.city' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                 AND column_name = 'city') AS present;

SELECT 'profiles.city' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'profiles'
                 AND column_name = 'city') AS present;

SELECT 'handle_new_user fn' AS check,
       EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') AS present;

SELECT 'on_auth_user_created trigger' AS check,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') AS present;

SELECT 'service_requests RLS enabled' AS check,
       (SELECT relrowsecurity FROM pg_class
        WHERE oid = 'public.service_requests'::regclass) AS present;

SELECT 'platform_settings.payments_gateway seeded' AS check,
       EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'payments_gateway') AS present;


-- =============================================================================
-- 2026-09-21 — WP-1 additions (plan §3, UAT-SEC-001 · UAT-SUB-001 ·
-- UAT-STORAGE-001 · UAT-TEAM-001 · UAT-BIZ-001 · UAT-COST-001)
-- Same contract as above: reads only. The DO blocks RAISE so deploy.sh stops
-- when a file in the apply order was skipped.
-- =============================================================================

-- ── 20260906_court_costs_and_firm_profile_fields.sql (UAT-COST-001) ────────
SELECT 'court_cost_notices table' AS check,
       to_regclass('public.court_cost_notices') IS NOT NULL AS present;

SELECT 'case_disbursements table' AS check,
       to_regclass('public.case_disbursements') IS NOT NULL AS present;

SELECT 'firm_profiles.cr_number' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'firm_profiles'
                 AND column_name = 'cr_number') AS present;

-- ── 20260914_entity_memberships_and_business_requests.sql (UAT-BIZ-001) ────
SELECT 'service_requests.business_id' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'service_requests'
                 AND column_name = 'business_id') AS present;

SELECT 'business members read business service requests policy' AS check,
       EXISTS (SELECT 1 FROM pg_policy
               WHERE polrelid = 'public.service_requests'::regclass
                 AND polname = 'business members read business service requests') AS present;

-- ── 20260921_03_entity_rls_recursion_fix.sql (UAT-TEAM-001) ───────────────
SELECT 'entity RLS helper functions (expect 8)' AS check,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef AND p.pronargs = 1
           AND p.proname IN ('is_active_firm_member', 'is_active_business_member',
                             'is_active_government_member', 'is_active_ngo_member',
                             'is_firm_owner', 'is_business_owner',
                             'is_government_owner', 'is_ngo_owner')) AS present;

SELECT 'policies on the 8 entity tables that read an entity table inline (expect 0)' AS check,
       (SELECT count(*) FROM pg_policy pol
          JOIN pg_class c ON c.oid = pol.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname IN ('firm_profiles', 'firm_members',
                             'business_profiles', 'business_members',
                             'government_profiles', 'government_members',
                             'ngo_profiles', 'ngo_members')
           AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
                coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
               ~* '(from|join)[[:space:]]+(public\.)?(firm|business|government|ngo)_(members|profiles)') AS present;

-- ── 20260921_01_profiles_rls_lockdown.sql (UAT-SEC-001) ───────────────────
SELECT 'public.profiles policy count (expect 3)' AS check,
       (SELECT count(*) FROM pg_policy
         WHERE polrelid = 'public.profiles'::regclass) AS present;

-- Writes are gated here unconditionally. anon's SELECT is gated by the
-- 20261016_09 section at the end of this file (plan item N21): until that
-- migration re-created the sixteen inline admin policies TO authenticated,
-- anon had to keep SELECT (20261016_08), and that section passes with a
-- NOTICE while 20261016_09 is not applied yet.
SELECT 'anon write grants on public.profiles (expect 0)' AS check,
       (SELECT count(*) FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'profiles'
           AND grantee = 'anon'
           AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')) AS present;

SELECT 'public.profiles policies that reach anon / PUBLIC (expect 0)' AS check,
       (SELECT count(*) FROM pg_policy
         WHERE polrelid = 'public.profiles'::regclass
           AND (polroles = '{0}'::oid[] OR 'anon'::regrole::oid = ANY (polroles))) AS present;

-- ── 20260921_02_subscriptions_write_revoke.sql (UAT-SUB-001) ──────────────
SELECT 'subscriptions INSERT/UPDATE policies (expect 0)' AS check,
       (SELECT count(*) FROM pg_policy
         WHERE polrelid = 'public.subscriptions'::regclass
           AND polcmd IN ('a', 'w')) AS present;

SELECT 'authenticated/anon write grants on subscriptions+credit_transactions (expect 0)' AS check,
       (SELECT count(*) FROM information_schema.role_table_grants
         WHERE table_schema = 'public'
           AND table_name IN ('subscriptions', 'credit_transactions')
           AND grantee IN ('authenticated', 'anon')
           AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')) AS present;

-- ── hard gates: deploy.sh stops here when something above is missing ───────
DO $$
DECLARE
  n       int;
  missing text[] := '{}';
BEGIN
  IF to_regclass('public.court_cost_notices') IS NULL THEN
    missing := array_append(missing, 'public.court_cost_notices (20260906_court_costs_and_firm_profile_fields.sql)');
  END IF;
  IF to_regclass('public.case_disbursements') IS NULL THEN
    missing := array_append(missing, 'public.case_disbursements (20260906_court_costs_and_firm_profile_fields.sql)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'service_requests'
                    AND column_name = 'business_id') THEN
    missing := array_append(missing, 'public.service_requests.business_id (20260914_entity_memberships_and_business_requests.sql)');
  END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.prosecdef AND p.pronargs = 1
     AND p.proname IN ('is_active_firm_member', 'is_active_business_member',
                       'is_active_government_member', 'is_active_ngo_member',
                       'is_firm_owner', 'is_business_owner',
                       'is_government_owner', 'is_ngo_owner');
  IF n <> 8 THEN
    missing := array_append(missing, format('%s of 8 entity RLS helper functions (20260903_phase2… + 20260921_03)', n));
  END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION '_verify: missing deployed objects: %', array_to_string(missing, ' · ');
  END IF;
END $$;

DO $$
DECLARE
  n int;
BEGIN
  -- UAT-TEAM-001: not one policy on the eight entity tables may read any of
  -- them inline — that shape is the 42P17 bug.
  SELECT count(*) INTO n FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relname IN ('firm_profiles', 'firm_members',
                       'business_profiles', 'business_members',
                       'government_profiles', 'government_members',
                       'ngo_profiles', 'ngo_members')
     AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
          coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
         ~* '(from|join)[[:space:]]+(public\.)?(firm|business|government|ngo)_(members|profiles)';
  IF n <> 0 THEN
    RAISE EXCEPTION '_verify: % entity policy/policies still read an entity table inline — 20260921_03 was not applied (42P17 will return)', n;
  END IF;

  -- UAT-SEC-001
  SELECT count(*) INTO n FROM pg_policy WHERE polrelid = 'public.profiles'::regclass;
  IF n <> 3 THEN
    RAISE EXCEPTION '_verify: public.profiles carries % policies, expected exactly 3 — 20260921_01 was not applied', n;
  END IF;
  -- SELECT is not counted here: it is gated by the 20261016_09 section at the
  -- end of this file, keyed on that migration (before it, anon had to keep
  -- SELECT — 20261016_08). What this block guarantees on any database is that a
  -- guest can neither write a profile nor read one row of it.
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'profiles' AND grantee = 'anon'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF n <> 0 THEN
    RAISE EXCEPTION '_verify: anon still holds % write grant(s) on public.profiles — run 20261016_02 (or 20261016_08)', n;
  END IF;
  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid = 'public.profiles'::regclass
     AND (polroles = '{0}'::oid[] OR 'anon'::regrole::oid = ANY (polroles));
  IF n <> 0 THEN
    RAISE EXCEPTION '_verify: % policy/policies on public.profiles reach anon or PUBLIC — a guest can read profile rows (20260921_01 scoped all three to authenticated)', n;
  END IF;

  -- UAT-SUB-001
  SELECT count(*) INTO n FROM pg_policy
   WHERE polrelid = 'public.subscriptions'::regclass AND polcmd IN ('a', 'w');
  IF n <> 0 THEN
    RAISE EXCEPTION '_verify: public.subscriptions still has % INSERT/UPDATE policy/policies — a user can mint or upgrade a subscription', n;
  END IF;
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('subscriptions', 'credit_transactions')
     AND grantee IN ('authenticated', 'anon')
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  IF n <> 0 THEN
    RAISE EXCEPTION '_verify: % write grant(s) for authenticated/anon survive on subscriptions/credit_transactions — run 20261016_08 (the self-host restore re-granted what 20260921_02 revoked)', n;
  END IF;
END $$;

-- ── 20260921_04_profiles_phone_e164_check.sql (UAT-REG-002) ───────────────
SELECT 'profiles phone E.164 constraint (validated)' AS check,
       EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid = 'public.profiles'::regclass
                  AND conname  = 'profiles_phone_e164_saudi_mobile'
                  AND convalidated) AS present;

DO $$
DECLARE
  v_validated boolean;
  n           bigint;
BEGIN
  -- (a) the CHECK itself, and VALIDATED — a NOT VALID constraint guards new
  -- writes but says nothing about the rows that were already there.
  SELECT convalidated INTO v_validated
    FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass
     AND conname  = 'profiles_phone_e164_saudi_mobile';

  IF v_validated IS NULL THEN
    RAISE EXCEPTION '_verify: public.profiles carries no constraint profiles_phone_e164_saudi_mobile — 20260921_04_profiles_phone_e164_check.sql was not applied';
  END IF;
  IF NOT v_validated THEN
    RAISE EXCEPTION '_verify: constraint profiles_phone_e164_saudi_mobile exists but is NOT VALID — the rows that predate it were never checked';
  END IF;

  -- (b) the clamp in handle_new_user(). Without it the constraint above turns
  -- a badly typed number at signup into a 23514 inside the AFTER INSERT
  -- trigger on auth.users, i.e. it aborts the account creation itself.
  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE EXCEPTION '_verify: public.handle_new_user() does not exist — the signup trigger function is missing entirely';
  END IF;
  IF position('v_phone' IN pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '_verify: public.handle_new_user() has no v_phone clamp — 20260921_04 section 6 did not take effect, and the next signup with a bad number will abort the auth.users insert';
  END IF;

  -- (c) no row survived the backfill in a shape the constraint forbids.
  SELECT count(*) INTO n FROM public.profiles
   WHERE phone IS NOT NULL AND phone !~ '^\+9665[0-9]{8}$';
  IF n <> 0 THEN
    RAISE EXCEPTION '_verify: % profiles row(s) still hold a phone that is not Saudi E.164 — 20260921_04 sections 2-4 did not run', n;
  END IF;
END $$;

-- =============================================================================
-- supabase/storage_policies_documents.sql (UAT-STORAGE-001) — the one step that
-- is not a migration. storage.objects is owned by supabase_storage_admin, so
-- the four owner-only policies are applied by hand (Dashboard / psql as that
-- role). Everything below is what stops a deploy that skipped it.
-- =============================================================================

-- The policies may have been created by hand in the Dashboard's Storage UI, which
-- appends its own suffix to every name ("documents select own kx3f9a_0"), so the
-- gates below classify by CONTENT, never by name: a policy counts as owner-only
-- when it is permissive, granted to authenticated only, and its expression
-- restricts BOTH the bucket (bucket_id = 'documents') AND the owner folder
-- (auth.uid() = (storage.foldername(name))[1]) — USING for SELECT/UPDATE/DELETE,
-- WITH CHECK for INSERT (and for UPDATE when present).
CREATE TEMP VIEW _verify_documents_policies AS
WITH pol AS (
  SELECT p.polname, p.polcmd, p.polpermissive,
         coalesce(pg_get_expr(p.polqual, p.polrelid), '')      AS q,
         coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS wc,
         coalesce((SELECT array_agg(r.rolname::text ORDER BY r.rolname) FROM pg_roles r WHERE r.oid = ANY (p.polroles)),
                  ARRAY[]::text[]) AS roles
    FROM pg_policy p
   WHERE p.polrelid = 'storage.objects'::regclass
), classified AS (
  SELECT *,
         (polpermissive
          AND roles = ARRAY['authenticated']::text[]
          AND CASE polcmd
                WHEN 'r' THEN q  LIKE '%bucket_id = ''documents''%' AND q  LIKE '%auth.uid()%' AND q  LIKE '%storage.foldername(name))[1]%'
                WHEN 'd' THEN q  LIKE '%bucket_id = ''documents''%' AND q  LIKE '%auth.uid()%' AND q  LIKE '%storage.foldername(name))[1]%'
                WHEN 'a' THEN wc LIKE '%bucket_id = ''documents''%' AND wc LIKE '%auth.uid()%' AND wc LIKE '%storage.foldername(name))[1]%'
                WHEN 'w' THEN q  LIKE '%bucket_id = ''documents''%' AND q  LIKE '%auth.uid()%' AND q  LIKE '%storage.foldername(name))[1]%'
                          AND (wc = '' OR (wc LIKE '%bucket_id = ''documents''%' AND wc LIKE '%auth.uid()%' AND wc LIKE '%storage.foldername(name))[1]%'))
                ELSE false
              END) AS owner_only,
         (position('documents' in q || ' ' || wc) > 0 OR position('bucket_id' in q || ' ' || wc) = 0) AS can_match_documents
    FROM pol
)
SELECT * FROM classified;

SELECT 'documents owner-only storage policies (expect 4 = one each of SELECT/INSERT/UPDATE/DELETE)' AS check,
       (SELECT count(DISTINCT polcmd) FROM _verify_documents_policies WHERE owner_only) AS present;

SELECT 'other storage.objects policies that can match bucket documents (expect 0)' AS check,
       (SELECT count(*) FROM _verify_documents_policies WHERE NOT owner_only AND can_match_documents) AS present;

SELECT 'storage.objects policies (for the record)' AS check,
       string_agg(format('%s [%s%s]', polname, polcmd, CASE WHEN owner_only THEN ' owner-only' ELSE ' OTHER' END), '; ' ORDER BY polname) AS present
  FROM _verify_documents_policies;

DO $$
DECLARE
  n_cmds  int;
  n_other int;
  rls_on  boolean;
BEGIN
  -- UAT-STORAGE-001. The four policies are applied by hand (Dashboard Storage UI
  -- or psql as supabase_storage_admin — supabase/storage_policies_documents.sql);
  -- this block is what makes a skipped manual step fail the deploy.
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION '_verify: storage.objects is not visible — cannot verify the documents bucket policies';
  END IF;

  SELECT relrowsecurity INTO rls_on FROM pg_class WHERE oid = 'storage.objects'::regclass;
  IF NOT rls_on THEN
    RAISE EXCEPTION '_verify: row level security is OFF on storage.objects';
  END IF;

  SELECT count(DISTINCT polcmd) INTO n_cmds FROM _verify_documents_policies WHERE owner_only;
  IF n_cmds <> 4 THEN
    RAISE EXCEPTION '_verify: owner-only documents policies cover % of the 4 commands (SELECT/INSERT/UPDATE/DELETE) — apply supabase/storage_policies_documents.sql (Dashboard Storage UI or psql as supabase_storage_admin)', n_cmds;
  END IF;

  SELECT count(*) INTO n_other FROM _verify_documents_policies WHERE NOT owner_only AND can_match_documents;
  IF n_other <> 0 THEN
    RAISE EXCEPTION '_verify: % other policy on storage.objects can still match bucket documents — delete it (the "for the record" row above names it)', n_other;
  END IF;
END $$;

DROP VIEW IF EXISTS _verify_documents_policies;

-- =============================================================================
-- plan §3b — the three files that must NEVER be applied
-- (_staging_only_20260916_enable_test_payment_gateway.sql,
--  _superseded_20260916_fix_all_entities_rls_infinite_recursion.sql,
--  _superseded_20260916_fix_firm_profiles_and_members_rls_recursion.sql)
--
-- The leading underscore keeps them out of `supabase db push`, but nothing
-- stops a hand-run or a `psql -f migrations/*.sql`. Both leave a fingerprint,
-- and both fingerprints are cheap to read, so the deploy reads them.
-- =============================================================================

SELECT 'platform_settings.payments_gateway status/provider (expect disabled, or test/live with moyasar; never the stub on production)' AS check,
       coalesce((SELECT (value->>'status') || '/' || coalesce(value->>'provider', 'null')
                   FROM public.platform_settings
                  WHERE key = 'payments_gateway'), '(row missing)') AS present;

SELECT 'is_active_firm_member overloads taking p_firm_id (expect 0)' AS check,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'is_active_firm_member'
           AND pg_get_function_arguments(p.oid) ILIKE '%p_firm_id%') AS present;

-- >>> verify:payments_gateway — supabase/tests/rls/verify_payments_gateway.test.sql
-- extracts the lines between these two markers; keep them.
DO $$
DECLARE
  v_status   text;
  v_provider text;
BEGIN
  -- _staging_only_20260916_enable_test_payment_gateway.sql flips the LIVE
  -- gateway to a stub with ON CONFLICT DO UPDATE, i.e. it overwrites whatever
  -- is there. Live value verified 2026-09-20: {"status":"disabled",
  -- "provider":null}. Since Moyasar B1 (20261022) the legitimate production
  -- values are disabled, {"status":"test","provider":"moyasar"} (the owner's
  -- run with Moyasar TEST keys: no real money moves) and
  -- {"status":"live","provider":"moyasar"}.
  SELECT value->>'status', value->>'provider' INTO v_status, v_provider
    FROM public.platform_settings WHERE key = 'payments_gateway';

  -- The STUB is what must never reach production: provider 'stub', the old
  -- status 'stub', or status 'test' with no provider (the pre-B1 stub shape).
  -- It is LEGITIMATE on staging (20260628 documents `test`), so this is a
  -- hard stop only when the deploy declares itself production:
  --   PGOPTIONS="-c nzamy.env=production" psql … -f supabase/migrations/_verify.sql
  -- Everywhere else it is a loud WARNING in the deploy log, never a silent pass.
  IF coalesce(v_status, 'disabled') <> 'disabled'
     AND (v_provider = 'stub'
          OR v_status = 'stub'
          OR (v_status = 'test' AND coalesce(v_provider, '') = '')) THEN
    IF current_setting('nzamy.env', true) = 'production' THEN
      RAISE EXCEPTION '_verify: platform_settings.payments_gateway is status=% provider=% on PRODUCTION — _staging_only_20260916_enable_test_payment_gateway.sql was applied here, and every payment flow is now running against a stub',
        v_status, coalesce(v_provider, 'null');
    ELSE
      RAISE WARNING '_verify: platform_settings.payments_gateway is status=% provider=% — acceptable on staging only; it must read disabled or moyasar before a production deploy (set nzamy.env=production to make this fatal)',
        v_status, coalesce(v_provider, 'null');
    END IF;
  END IF;
END $$;
-- <<< verify:payments_gateway

DO $$
DECLARE
  n int;
BEGIN
  -- The two _superseded_20260916_* files redeclare the 20260903 helpers with
  -- renamed parameters (p_firm_id / p_firm instead of 20260903's p_firm), which
  -- is what makes them die with 42P13 — CREATE OR REPLACE cannot rename a
  -- parameter. A p_firm_id overload existing at all means one of them was run
  -- against a database where the rename could take (or was forced through), so
  -- the policy matrix 20260921_03 installs is no longer the one in the repo.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'is_active_firm_member'
     AND pg_get_function_arguments(p.oid) ILIKE '%p_firm_id%';
  IF n <> 0 THEN
    RAISE EXCEPTION '_verify: public.is_active_firm_member takes p_firm_id, not 20260903/20260921_03''s p_firm — a _superseded_20260916_* file was applied to this database';
  END IF;
END $$;


-- ====================================================================
-- 2026-09-22 — 20260922_01_library_grants.sql (review A4 / F01 + F13)
-- ====================================================================
-- ── 20260922_01_library_grants.sql (A4 / F01 — every law page served 0 articles) ──
-- The route reads library.articles with article_amendments and
-- article_regulations EMBEDDED, and PostgREST fails the whole query with 42501
-- when any one of them is unreadable. A missing grant here is not a degraded
-- page, it is an empty corpus answered with HTTP 200.
-- 20260929_01 (T28-21) later locks the three article tables to the server:
-- once its marker is on library.articles, this row reports the LOCK instead
-- (true = anon cannot read article_regulations), and the DO block below skips
-- the anon-readable assertions — see the 20260929_01 section at the end.
SELECT CASE WHEN coalesce(obj_description('library.articles'::regclass, 'pg_class'), '') ILIKE '%server-only since 20260929_01%'
            THEN 'library.article_regulations server-only (20260929_01 applied)'
            ELSE 'library.article_regulations readable by anon' END AS check,
       CASE WHEN coalesce(obj_description('library.articles'::regclass, 'pg_class'), '') ILIKE '%server-only since 20260929_01%'
            THEN NOT has_any_column_privilege('anon', 'library.article_regulations', 'SELECT')
            ELSE has_table_privilege('anon', 'library.article_regulations', 'SELECT') END AS present;

SELECT 'library.article_regulations writable by service_role' AS check,
       has_table_privilege('service_role', 'library.article_regulations', 'INSERT') AS present;

SELECT 'schema library default privileges set' AS check,
       EXISTS (SELECT 1
                 FROM pg_default_acl d
                 JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
                WHERE ns.nspname = 'library' AND d.defaclobjtype = 'r') AS present;

DO $$
DECLARE
  n integer;
  -- 20260929_01 (T28-21) revokes anon/authenticated on the article tables and
  -- drops their read policies ON PURPOSE; the routes read them with the
  -- service role since that commit. Keyed on the marker comment it leaves.
  text_locked boolean := coalesce(obj_description('library.articles'::regclass, 'pg_class'), '')
                         ILIKE '%server-only since 20260929_01%';
BEGIN
  IF to_regclass('library.article_regulations') IS NULL THEN
    RAISE EXCEPTION '_verify: library.article_regulations is missing — 20260730_article_regulations.sql was never applied to this database';
  END IF;

  IF NOT text_locked
     AND (NOT has_table_privilege('anon', 'library.article_regulations', 'SELECT')
          OR NOT has_table_privilege('authenticated', 'library.article_regulations', 'SELECT')) THEN
    RAISE EXCEPTION '_verify: library.article_regulations is not readable by anon/authenticated — 20260922_01_library_grants.sql was not applied, and EVERY law page is serving 0 articles with HTTP 200';
  END IF;

  IF NOT has_table_privilege('service_role', 'library.article_regulations', 'INSERT') THEN
    RAISE EXCEPTION '_verify: service_role cannot write library.article_regulations — scripts/seed-library.ts cannot seed regulations (20260922_01 not applied)';
  END IF;

  -- 20260922_01 also turns RLS ON for this table (schema convention: all 17
  -- sibling content tables have it). With RLS on, the SELECT grant above is
  -- necessary but NOT sufficient: no policy means anon reads ZERO ROWS with no
  -- error at all — byte-for-byte the outage this gate exists to catch.
  -- (Skipped once 20260929_01 is applied: no public-read policy is then the
  -- intended state, asserted in the 20260929_01 section below.)
  IF NOT text_locked
     AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'library.article_regulations'::regclass)
     AND NOT EXISTS (SELECT 1
                       FROM pg_policies
                      WHERE schemaname = 'library'
                        AND tablename  = 'article_regulations'
                        AND cmd IN ('SELECT', 'ALL')
                        AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])) THEN
    RAISE EXCEPTION '_verify: RLS is enabled on library.article_regulations with no public-read policy — anon holds SELECT but reads zero rows, so every law page still serves 0 articles with HTTP 200';
  END IF;

  -- 20260922_04 takes anon/authenticated back OFF this matview (unpopulated,
  -- no reader), so the 01 gate asserts only the service_role half of the grant.
  IF to_regclass('library.cross_section_search') IS NOT NULL
     AND NOT has_table_privilege('service_role', 'library.cross_section_search', 'SELECT') THEN
    RAISE EXCEPTION '_verify: the matview library.cross_section_search is ungranted to service_role — 20260922_01 not applied';
  END IF;

  -- 20261004_01 closes this view to the API roles ON PURPOSE (it projects the
  -- column-locked official metadata); asserted in its own section at the end.
  IF to_regclass('library.v_laws_enactment_status') IS NOT NULL
     AND coalesce(obj_description('library.laws'::regclass, 'pg_class'), '') NOT ILIKE '%column-locked since 20261004_01%'
     AND NOT has_table_privilege('anon', 'library.v_laws_enactment_status', 'SELECT') THEN
    RAISE EXCEPTION '_verify: library.v_laws_enactment_status is ungranted — 20260922_01 not applied';
  END IF;

  -- count(DISTINCT rolname) with `< 2`, NEVER count(*) with `<> 2`.
  -- pg_default_acl holds one row per GRANTOR role, so a database where a second
  -- role has ALSO set default SELECT on this schema yields 4 grantee rows for
  -- the same 2 roles. An equality test would abort the deploy (psql exit 3)
  -- against a database that is MORE correctly granted, not less.
  SELECT count(DISTINCT r.rolname) INTO n
    FROM pg_default_acl d
    JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles r ON r.oid = a.grantee
   WHERE ns.nspname = 'library'
     AND d.defaclobjtype = 'r'
     AND a.privilege_type = 'SELECT'
     AND r.rolname IN ('anon', 'authenticated');
  IF n < 2 THEN
    RAISE EXCEPTION '_verify: schema library carries default SELECT for only % of the 2 request roles (anon, authenticated) — the next table added to the schema will blank the law pages exactly as article_regulations did', n;
  END IF;
END $$;

-- MIGRATION VALIDATION (Docker, postgres:16-alpine, throwaway container
-- `nz_a4_fix`, removed afterwards; docker server 28.1.1). The stub reproduces
-- the real 20260626-before-20260730 ordering: roles anon/authenticated/
-- service_role (service_role WITH BYPASSRLS, as Supabase's is), schema library,
-- laws/chapters/articles/article_amendments with RLS + public-read policies,
-- THEN the 20260626 §7 one-shot grants, THEN article_regulations + the
-- cross_section_search matview + the v_laws_enactment_status view, plus one
-- law/article/amendment/regulation row.
--   0. stub                                                     exit 0 ("stub OK")
--   A. THIS GATE, before the migration            RAISES, psql exit 3 (deploy stops)
--   B. defect reproduced: anon has SELECT on library.articles and NOT on
--      article_regulations                                                exit 0
--   C. PRE-FIX file (count(*) + "<> 2"), run 1 as postgres               exit 0
--   D. PRE-FIX file, run as a SECOND granting role r2 -> ERROR "...reaches only
--      4 of the 2 request roles", whole transaction ROLLS BACK,  psql exit 3
--      (the wording is the fixed file's: the sed swapped only the comparison)
--   E. anon_can_read was still t afterwards ONLY because run C had already
--      committed the grants; on a database whose FIRST apply is by that second
--      role, the rollback leaves NOTHING granted — that is the production
--      hazard the must-fix removes
--   F. FIXED file, run 1 as postgres                                     exit 0
--   G. FIXED file, run 2 as postgres (idempotent)                        exit 0
--   H. FIXED file, run 3 as r2, two grantors present                     exit 0
--   I. pg_default_acl then shows 4 rows: postgres{r,S} and r2{r,S}
--   J. behaviour: PASS 1 named grants are read-for-request-roles /
--      full-for-service_role (anon got NO insert/update/delete); PASS 2 RLS on
--      with exactly one anon/authenticated read policy; PASS 3 anon runs the
--      law-detail embed (articles=1, amendments=1, regulations=1) — this is F01
--      itself; PASS 4 service_role inserts and deletes through RLS (the
--      seeder); PASS 5 a table, a sequence and a matview created AFTER the
--      migration all inherit the grants                                   exit 0
--   K. THIS GATE again, after the migration, WITH TWO GRANTORS            exit 0
-- Nothing was applied to production; the developer applies the migration by
-- hand in the SQL Editor.


-- ====================================================================
-- 2026-09-22 — 20260922_02_members_accept_own_invitation.sql (review A5 / F03)
-- ====================================================================
-- ── 20260922_02_members_accept_own_invitation.sql (review 2026-09-21 A5 / F03) ──
-- Consent on the company/firm roster, both halves of it.
-- POST /api/v1/{business,firm}/members now writes `status = 'invited'`, and
-- this migration is what makes that mean anything: without it NOTHING can
-- answer the row (20260921_03's matrix lets only owner/admin UPDATE a
-- *_members row), so every invitation on the platform is permanently
-- unanswerable — and the owner can still flip it to `active` themselves, which
-- is the bypass the whole finding is about.
DO $$
DECLARE
  t    text;
  n    int;
  bad  text;
  body text;
  -- 20261016_02 (owner decision ٣٠) drops the four "<t>: owner or admin can
  -- delete" policies on purpose: a member is ended, never hard-deleted. Once its
  -- marker is on public.profiles.email, each table carries 4 policies, not 5.
  delete_dropped boolean := coalesce(col_description('public.profiles'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.profiles'::regclass AND attname = 'email')), '')
       ILIKE '%server-write-only since 20261016_02%';
  expected int := CASE WHEN delete_dropped THEN 4 ELSE 5 END;
BEGIN
  FOREACH t IN ARRAY ARRAY['firm_members', 'business_members', 'government_members', 'ngo_members']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO n
      FROM pg_policy
     WHERE polrelid = ('public.' || t)::regclass
       AND polname = t || ': invitee can answer own invitation'
       AND polcmd = 'w';
    IF n <> 1 THEN
      RAISE EXCEPTION '_verify: public.% has no "invitee can answer own invitation" UPDATE policy — 20260922_02 was not applied, so every roster invitation is unanswerable (A5/F03)', t;
    END IF;

    SELECT count(*) INTO n FROM pg_policy WHERE polrelid = ('public.' || t)::regclass;
    IF n <> expected THEN
      RAISE EXCEPTION '_verify: public.% carries % policies, expected exactly % (20260921_03''s four + 20260922_02''s invitee arm%)',
        t, n, expected, CASE WHEN delete_dropped THEN ', minus the DELETE policy 20261016_02 drops' ELSE '' END;
    END IF;
    IF delete_dropped AND EXISTS (SELECT 1 FROM pg_policy
                                   WHERE polrelid = ('public.' || t)::regclass AND polcmd = 'd') THEN
      RAISE EXCEPTION '_verify: public.% has a DELETE policy again — 20261016_02 removed it (members are ended, never hard-deleted)', t;
    END IF;

    -- RLS filters ROWS, not COLUMNS, and `authenticated` holds the table-level
    -- UPDATE grant. Without this trigger an invitee can accept as a role they
    -- were never offered, or move their own invitation row onto an entity that
    -- never invited them — and the company owner can answer the invitation on
    -- the invitee's behalf, which re-opens A5 in full.
    SELECT count(*) INTO n
      FROM pg_trigger
     WHERE tgrelid = ('public.' || t)::regclass
       AND tgname = 'trg_' || t || '_invitation_answer'
       AND NOT tgisinternal;
    IF n <> 1 THEN
      RAISE EXCEPTION '_verify: public.% is missing trg_%_invitation_answer — an invitee could accept as any role, and the owner could accept for them (A5/F03)', t, t;
    END IF;
  END LOOP;

  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'entity_member_invitation_answer_guard'
     AND p.prosecdef;
  IF n <> 1 THEN
    RAISE EXCEPTION '_verify: public.entity_member_invitation_answer_guard() is missing or is not SECURITY DEFINER — the invitee UPDATE arm has no column guard behind it';
  END IF;

  -- The guard EXISTING is not enough: an earlier draft of 20260922_02 guarded
  -- only the invitee and left `PATCH /api/v1/business/members/{id}
  -- {"status":"active"}` working for the owner, which is the finding itself.
  -- These two assertions are what distinguish the two versions.
  SELECT pg_get_functiondef(p.oid) INTO body
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'entity_member_invitation_answer_guard';
  IF body !~ 'a membership cannot be active while accepted_at is null' THEN
    RAISE EXCEPTION '_verify: the invitation-answer guard does not carry the consent invariant — a company owner can still flip an invitation to active without asking (A5/F03)';
  END IF;
  IF body !~ 'jsonb_build_object\(''accepted_at''' THEN
    RAISE EXCEPTION '_verify: the invitation-answer guard does not pin accepted_at against a third party — the consent invariant is one PostgREST field away from being bypassed (A5/F03)';
  END IF;

  -- The inline-read gate elsewhere in this file catches `from <entity>`; this
  -- catches a subquery of any kind, which is 20260921_03's own 4c check and the
  -- property 20260922_02's new arm had to preserve.
  SELECT string_agg(format('%s.%s', c.relname, pol.polname), ', ') INTO bad
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relname IN ('firm_profiles', 'firm_members',
                       'business_profiles', 'business_members',
                       'government_profiles', 'government_members',
                       'ngo_profiles', 'ngo_members')
     AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
          coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
         ~* '\([[:space:]]*select';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '_verify: an entity policy contains a subquery (the 42P17 shape 20260921_03 removed): %', bad;
  END IF;

  RAISE NOTICE '_verify: 20260922_02 OK — invitee UPDATE arm, column guard and the consent invariant present on every membership table';
END $$;


-- ====================================================================
-- 2026-09-22 — 20260922_03_lawyer_provider_column_grants.sql (review A6 / F04)
-- ====================================================================
-- ====================================================================
-- 2026-09-22 — 20260922_03_lawyer_provider_column_grants.sql (review A6 / F04)
-- ====================================================================
-- ── 20260922_03_lawyer_provider_column_grants.sql (review 2026-09-21 A6 / F04) ──
-- "Any lawyer can self-verify and self-credit", and the same shape on every
-- other profile table. Each of the seven carries a row-scoped "owner can
-- update" policy with NO column list, and `authenticated` holds Supabase's
-- default table-level UPDATE, so before this migration the row check was the
-- ONLY check: a raw `PATCH /rest/v1/lawyer_profiles?user_id=eq.<me>
-- {"verification_status":"verified","credit_balance":999999}` succeeded, and so
-- did the firm/business/government/ngo equivalents on `verification_status`,
-- `plan_id`, `role` and `restricted_from`.
--
-- A column-level REVOKE alone is a NO-OP while the table-level grant stands, so
-- "the grants look right" is not the question this block asks.
-- has_column_privilege() is: it answers for the role as it actually resolves,
-- including privileges reaching it through role membership or PUBLIC, which is
-- exactly the class of bug ("the REVOKE looked applied and was a no-op") the
-- migration exists to close.
--
-- DUPLICATED ON PURPOSE: section 8 of
-- supabase/migrations/20260922_03_lawyer_provider_column_grants.sql carries the
-- same allowed/forbidden arrays. Widen a grant there and you must widen it HERE
-- TOO - otherwise this block stops the next deploy on "authenticated can UPDATE
-- <table> columns outside the 20260922_03 allowlist". That drift is fail-closed,
-- but it surfaces on someone else's change, so touch both copies in one edit.
--
-- KNOWN WEAKNESS, deliberately left as-is so this block stays a mirror of
-- section 8: the two "leak" checks below enumerate information_schema.columns,
-- which is privilege-filtered - it shows only the columns the CURRENT user owns
-- or holds some privilege on. Run as the table owner (the migration path, and
-- deploy.sh today) it is exact; run by a lesser role it would return no rows and
-- those two assertions would pass vacuously. The catalog-level form that is
-- immune is the one in the re-check comment at the foot of 20260922_03. Swap
-- BOTH copies together or not at all.
DO $$
DECLARE
  spec   record;
  c      text;
  leaked text;
  n      int;
  tables int := 0;
BEGIN
  -- The prerequisite, named specifically. 20260826_corporate_identity_persisted
  -- .sql says of itself that it does not apply itself, and 20260922_03 grants
  -- its two columns BY NAME — so on a database without 20260826 the migration
  -- dies on 42703 and rolls back whole. Without this check the symptom below
  -- would be the confusing "authenticated LOST UPDATE on legal_rep_name".
  IF to_regclass('public.business_profiles') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'business_profiles'
                        AND column_name = 'legal_rep_name') THEN
    RAISE EXCEPTION '_verify: business_profiles.legal_rep_name is missing — 20260826_corporate_identity_persisted.sql was never applied, so 20260922_03 cannot have been applied either (it grants that column by name and would die on 42703)';
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('lawyer_profiles',
       ARRAY['bio_ar','bio_en','specialties','years_experience','hourly_rate',
             'license_number','bar_association','city','marketplace_visible',
             'is_accepting_clients','show_contact','slug','education','courts',
             'languages','headline_ar','license_issued_on','office_address',
             'display_mode','updated_at',
             -- 20261016_05 (owner decision ١٦٨); checked in (b) only once the column exists
             'show_hourly_rate']::text[],
       ARRAY['verification_status','credit_balance','credit_package','credit_expiry',
             'free_briefs_remaining','active_roles','metadata','user_id']::text[],
       'lawyers update own profile'),
      ('provider_profiles',
       ARRAY['metadata','updated_at']::text[],
       ARRAY['verification_status','sub_role','license_number','license_expiry',
             'hourly_rate','service_areas','availability','marketplace_visible',
             'user_id']::text[],
       'providers update own profile'),
      ('firm_profiles',
       ARRAY['display_mode','metadata','updated_at']::text[],
       ARRAY['verification_status','plan_id','annual_points_budget','points_spent',
             'max_seats','license_number','license_expiry','name_ar','branding',
             'owner_user_id']::text[],
       'firm_profiles: owner can update'),
      ('business_profiles',
       ARRAY['company_name_ar','cr_number','legal_rep_name','legal_rep_capacity',
             'service_model','has_legal_dept','metadata','updated_at']::text[],
       ARRAY['verification_status','plan_id','size','legal_structure',
             'company_name_en','owner_user_id']::text[],
       'business_profiles: owner can update'),
      ('government_profiles',
       ARRAY['metadata','updated_at']::text[],
       ARRAY['verification_status','role','restricted_from','integrations',
             'entity_type','plan_id','owner_user_id']::text[],
       'government_profiles: owner can update'),
      ('ngo_profiles',
       ARRAY['metadata','updated_at']::text[],
       ARRAY['verification_status','compliance_status','plan_id','org_type',
             'board_seats','owner_user_id']::text[],
       'ngo_profiles: owner can update'),
      ('micro_profiles',
       ARRAY['metadata','updated_at']::text[],
       ARRAY['litigation_boundary','requirements_score','license_count',
             'employee_count','user_id']::text[],
       'micro owners update own profile')
    ) AS t(tbl, allowed, forbidden, policy_name)
  LOOP
    -- Not CONTINUE: all seven are 20260603 tables and exist on every
    -- environment this file is ever pointed at. An absent one is a deploy
    -- failure or a typo in this list, and both must be loud.
    IF to_regclass('public.' || spec.tbl) IS NULL THEN
      RAISE EXCEPTION '_verify: public.% does not exist — the profile schema is not the one 20260922_03 was written against', spec.tbl;
    END IF;
    tables := tables + 1;

    -- (a) the trust/money columns are unwritable, for BOTH request roles.
    --     `anon` is checked on every table, not just the first: a REVOKE that
    --     names `authenticated` and forgets `anon` leaves the key that ships to
    --     every browser holding the whole surface.
    FOREACH c IN ARRAY spec.forbidden LOOP
      IF has_column_privilege('authenticated', 'public.' || spec.tbl, c, 'UPDATE') THEN
        RAISE EXCEPTION '_verify: authenticated can UPDATE public.%.% — 20260922_03 was not applied, and an account can write its own % (A6/F04)', spec.tbl, c, c;
      END IF;
      IF has_column_privilege('anon', 'public.' || spec.tbl, c, 'UPDATE') THEN
        RAISE EXCEPTION '_verify: anon can UPDATE public.%.% — the revoke reached authenticated only (A6/F04)', spec.tbl, c;
      END IF;
    END LOOP;

    -- (b) every column the RLS-scoped routes DO write is still writable. A
    --     missing grant here is not a security hole but a dead settings screen:
    --     PATCH /api/v1/profile and PATCH /api/v1/settings/preferences would
    --     start answering an Arabic 500 on a 42501.
    FOREACH c IN ARRAY spec.allowed LOOP
      CONTINUE WHEN c = 'show_hourly_rate'
                AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                                 WHERE table_schema = 'public' AND table_name = spec.tbl
                                   AND column_name = c);
      IF NOT has_column_privilege('authenticated', 'public.' || spec.tbl, c, 'UPDATE') THEN
        RAISE EXCEPTION '_verify: authenticated LOST UPDATE on public.%.% — its write path would 500 (over-revoked, or a column renamed under 20260922_03)', spec.tbl, c;
      END IF;
    END LOOP;

    -- (c) nothing OUTSIDE the allowlist is writable by authenticated. This is
    --     the assertion that survives the future: a column added by a later
    --     migration inherits the table default and shows up here, instead of
    --     quietly becoming self-writable.
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO leaked
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = spec.tbl
       AND NOT (column_name = ANY (spec.allowed))
       AND has_column_privilege('authenticated', 'public.' || spec.tbl, column_name, 'UPDATE');
    IF leaked IS NOT NULL THEN
      RAISE EXCEPTION '_verify: authenticated can UPDATE % columns outside the 20260922_03 allowlist: %', spec.tbl, leaked;
    END IF;

    --     … and NOTHING AT ALL is writable by anon. anon has no legitimate
    --     write on any of these tables, so its allowlist is empty and this is
    --     the symmetric form of the check above.
    SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO leaked
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = spec.tbl
       AND has_column_privilege('anon', 'public.' || spec.tbl, column_name, 'UPDATE');
    IF leaked IS NOT NULL THEN
      RAISE EXCEPTION '_verify: anon can UPDATE % columns: %', spec.tbl, leaked;
    END IF;

    -- (d) INSERT is gone for both roles. Every one of these rows is born in
    --     handle_new_user() or through the service client at
    --     /api/v1/onboarding/account-type; nothing self-service creates one.
    IF has_table_privilege('authenticated', 'public.' || spec.tbl, 'INSERT') THEN
      RAISE EXCEPTION '_verify: authenticated can INSERT into public.% — 20260922_03 was not applied', spec.tbl;
    END IF;
    IF has_table_privilege('anon', 'public.' || spec.tbl, 'INSERT') THEN
      RAISE EXCEPTION '_verify: anon can INSERT into public.% — 20260922_03 was not applied', spec.tbl;
    END IF;
    --     … and SELECT survived: the profile screens, the lawyer directory and
    --     every membership lookup read these tables under RLS.
    --     lawyer_profiles is column-locked for reads since 20261016_10: the API
    --     roles keep SELECT on its 13 public columns only (gated exactly in the
    --     20261016_10 section below), so a column grant on user_id counts here.
    IF NOT has_table_privilege('authenticated', 'public.' || spec.tbl, 'SELECT')
       AND NOT (spec.tbl = 'lawyer_profiles'
                AND has_column_privilege('authenticated', 'public.lawyer_profiles', 'user_id', 'SELECT')) THEN
      RAISE EXCEPTION '_verify: authenticated LOST SELECT on public.% — the profile and directory reads would 401', spec.tbl;
    END IF;

    -- (e) the row-scoping policy is still there. The column layer replaces
    --     nothing; it is added beneath it, and a run that lost the policy would
    --     let any account write any other account's row on an allowed column.
    --     polcmd 'w' = FOR UPDATE.
    SELECT count(*) INTO n
      FROM pg_policy
     WHERE polrelid = ('public.' || spec.tbl)::regclass
       AND polname  = spec.policy_name
       AND polcmd   = 'w';
    IF n <> 1 THEN
      RAISE EXCEPTION '_verify: the row-scoped UPDATE policy "%" on public.% is missing — the column grants alone would let any owner write any row', spec.policy_name, spec.tbl;
    END IF;
  END LOOP;

  IF tables <> 7 THEN
    RAISE EXCEPTION '_verify: checked % profile tables, expected 7', tables;
  END IF;

  RAISE NOTICE '_verify: 20260922_03 OK — UPDATE column-scoped and INSERT revoked on all 7 profile tables (lawyer 20 columns, business 8, firm 3, provider/government/ngo/micro 2 each); anon may write nothing on any of them';
END $$;


-- ====================================================================
-- 2026-09-22 — 20260922_04_library_view_security_invoker.sql (Supabase advisor: security_definer_view)
-- ====================================================================
SELECT 'library.v_laws_enactment_status runs as the caller (security_invoker)' AS check,
       EXISTS (SELECT 1 FROM pg_class c
                CROSS JOIN LATERAL pg_options_to_table(c.reloptions) o
               WHERE c.oid = 'library.v_laws_enactment_status'::regclass
                 AND o.option_name = 'security_invoker'
                 AND lower(o.option_value) IN ('true','on','1','yes')) AS present;

SELECT 'library.cross_section_search hidden from anon/authenticated' AS check,
       NOT has_table_privilege('anon', 'library.cross_section_search', 'SELECT')
       AND NOT has_table_privilege('authenticated', 'library.cross_section_search', 'SELECT') AS present;

DO $$
DECLARE ok boolean;
BEGIN
  IF to_regclass('library.v_laws_enactment_status') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM pg_class c
                    CROSS JOIN LATERAL pg_options_to_table(c.reloptions) o
                   WHERE c.oid = 'library.v_laws_enactment_status'::regclass
                     AND o.option_name = 'security_invoker'
                     AND lower(o.option_value) IN ('true','on','1','yes')) INTO ok;
    IF NOT ok THEN
      RAISE EXCEPTION '_verify: library.v_laws_enactment_status is still a SECURITY DEFINER view — 20260922_04 was not applied';
    END IF;
  END IF;
  IF to_regclass('library.cross_section_search') IS NOT NULL
     AND (has_table_privilege('anon', 'library.cross_section_search', 'SELECT')
          OR has_table_privilege('authenticated', 'library.cross_section_search', 'SELECT')) THEN
    RAISE EXCEPTION '_verify: an API role can SELECT the unpopulated matview library.cross_section_search — 20260922_04 was not applied';
  END IF;
  RAISE NOTICE '_verify: 20260922_04 OK — exposed views run as the caller; cross_section_search is out of the API surface';
END $$;


-- ====================================================================
-- 2026-09-29 — 20260929_01_library_text_server_only.sql (owner decision T28-21)
-- ====================================================================
-- The article text is server-only: anon/authenticated hold no privilege and
-- no read policy on library.articles / article_regulations /
-- article_amendments; the Next routes read them with the service role. Keyed
-- on the marker comment the migration leaves on library.articles, so a deploy
-- that runs this file BEFORE the migration is applied still passes (the code
-- works either way — deploy order is code first, then the migration).
SELECT '20260929_01 marker on library.articles (article text server-only)' AS check,
       coalesce(obj_description('library.articles'::regclass, 'pg_class'), '')
         ILIKE '%server-only since 20260929_01%' AS present;

DO $$
DECLARE
  t       text;
  r       text;
  missing text := '';
BEGIN
  IF coalesce(obj_description('library.articles'::regclass, 'pg_class'), '')
       NOT ILIKE '%server-only since 20260929_01%' THEN
    RAISE NOTICE '_verify: 20260929_01 is not applied yet — the article tables are still anon-readable (the pre-lock posture; apply it after the code deploy)';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['library.articles', 'library.article_regulations', 'library.article_amendments']
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF has_any_column_privilege(r, t, 'SELECT') THEN
        missing := missing || format(' %s can SELECT %s;', r, t);
      END IF;
    END LOOP;
    IF NOT has_table_privilege('service_role', t, 'SELECT') THEN
      missing := missing || format(' service_role cannot SELECT %s (every law page would 500);', t);
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass) THEN
      missing := missing || format(' RLS is off on %s;', t);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1
               FROM pg_policies
              WHERE schemaname = 'library'
                AND tablename IN ('articles', 'article_regulations', 'article_amendments')
                AND cmd IN ('SELECT', 'ALL')
                AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) THEN
    missing := missing || ' a public read policy is back on an article table (was 20260922_01 or the self-host schema re-applied?);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the article text is readable outside the server again —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20260929_01 OK — articles / article_regulations / article_amendments are server-only; service_role reads them';
END $$;


-- ====================================================================
-- 2026-10-04 — 20261004_01_library_column_lock.sql (owner question ١٦٢)
-- ====================================================================
-- library.laws / judicial_collections / principles are column-locked: the
-- API roles read an explicit allow-list only (no official metadata, no
-- `metadata`; `fts` stays readable — public searches filter on it), and
-- v_laws_enactment_status is closed to them. Keyed
-- on the marker comment on library.laws, so a deploy that runs this file
-- BEFORE the migration is applied still passes (code first, then migration).
-- The allow-lists here MUST match the migration's grant lists.
SELECT '20261004_01 marker on library.laws (library column lock)' AS check,
       coalesce(obj_description('library.laws'::regclass, 'pg_class'), '')
         ILIKE '%column-locked since 20261004_01%' AS present;

DO $$
DECLARE
  spec    record;
  r       text;
  col     text;
  missing text := '';
BEGIN
  IF coalesce(obj_description('library.laws'::regclass, 'pg_class'), '')
       NOT ILIKE '%column-locked since 20261004_01%' THEN
    RAISE NOTICE '_verify: 20261004_01 is not applied yet — library.laws / judicial_collections / principles are still readable column-for-column by anon (the pre-lock posture; apply it after the code deploy)';
    RETURN;
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('library.laws', ARRAY[
        'slug', 'title', 'title_en', 'type', 'description', 'section_code', 'section_name',
        'status', 'total_articles', 'has_merged_regulation',
        'effective_date_hijri', 'effective_date_gregorian',
        'supersedes_law_slug', 'instrument_id', 'parent_law_id', 'parent_law', 'enabling_article',
        'fts', 'created_at', 'updated_at']),
      -- library.principles below is 20261004_01's list; once 20261016_01's
      -- marker is on library.principles the narrower list in the 20261016_01
      -- section at the end applies instead, and this row is skipped.
      ('library.judicial_collections', ARRAY[
        'id', 'title', 'court', 'year_hijri', 'part', 'source_id', 'series_id', 'track', 'description',
        'ruling_count', 'free', 'progress', 'created_at', 'updated_at']),
      ('library.principles', ARRAY[
        'id', 'collection_id', 'principle_number', 'issuing_body', 'session_date',
        'decision_number', 'reference', 'text', 'ruling_basis', 'facts', 'reasons', 'ruling',
        'year_hijri', 'order_index', 'classification_keywords', 'hashtags', 'is_redacted',
        'fts', 'created_at', 'updated_at'])
    ) AS v(tbl, allowed)
  LOOP
    CONTINUE WHEN spec.tbl = 'library.principles'
              AND coalesce(obj_description('library.principles'::regclass, 'pg_class'), '')
                    ILIKE '%text server-only since 20261016_01%';
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF has_table_privilege(r, spec.tbl, 'SELECT') THEN
        missing := missing || format(' %s holds table-level SELECT on %s (was 20260922_01 §3 or the self-host schema re-applied?);', r, spec.tbl);
      END IF;
      FOREACH col IN ARRAY spec.allowed
      LOOP
        IF NOT has_column_privilege(r, spec.tbl, col, 'SELECT') THEN
          missing := missing || format(' %s cannot read allowed column %s.%s (the page that shows it now fails);', r, spec.tbl, col);
        END IF;
      END LOOP;
      FOR col IN
        SELECT att.attname::text
          FROM pg_attribute att
         WHERE att.attrelid = spec.tbl::regclass
           AND att.attnum > 0
           AND NOT att.attisdropped
      LOOP
        IF NOT (col = ANY (spec.allowed)) AND has_column_privilege(r, spec.tbl, col, 'SELECT') THEN
          missing := missing || format(' %s can read locked column %s.%s;', r, spec.tbl, col);
        END IF;
      END LOOP;
    END LOOP;
    IF NOT has_table_privilege('service_role', spec.tbl, 'SELECT') THEN
      missing := missing || format(' service_role cannot SELECT %s (the law page, catalogue and search would fail);', spec.tbl);
    END IF;
    IF NOT EXISTS (SELECT 1
                     FROM pg_policies pol
                    WHERE pol.schemaname || '.' || pol.tablename = spec.tbl
                      AND pol.cmd IN ('SELECT', 'ALL')
                      AND pol.roles && ARRAY['anon', 'public']::name[]) THEN
      missing := missing || format(' no read policy for anon on %s (every guest read returns 0 rows);', spec.tbl);
    END IF;
  END LOOP;

  IF to_regclass('library.v_laws_enactment_status') IS NOT NULL
     AND (has_any_column_privilege('anon', 'library.v_laws_enactment_status', 'SELECT')
          OR has_any_column_privilege('authenticated', 'library.v_laws_enactment_status', 'SELECT')) THEN
    missing := missing || ' an API role can SELECT library.v_laws_enactment_status again;';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the library column lock is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261004_01 OK — laws / judicial_collections / principles column-locked for anon/authenticated (allow-list only); v_laws_enactment_status closed; service_role reads all three';
END $$;

-- 20261004_02 (two-level chapters) — checked only once the column exists.
DO $$
DECLARE
  missing text := '';
  r text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'library' AND table_name = 'chapters' AND column_name = 'level') THEN
    RAISE NOTICE '_verify: 20261004_02 not applied yet (library.chapters has no level column) — skipped';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'library' AND table_name = 'chapters' AND column_name = 'parent_chapter_id') THEN
    missing := missing || ' library.chapters.parent_chapter_id is missing;';
  END IF;
  IF EXISTS (SELECT 1 FROM library.chapters WHERE level NOT IN (1, 2)) THEN
    missing := missing || ' a chapter has a level outside 1..2;';
  END IF;
  IF EXISTS (SELECT 1 FROM library.chapters c
               JOIN library.chapters p ON p.id = c.parent_chapter_id
              WHERE c.law_slug IS DISTINCT FROM p.law_slug OR p.level <> 1 OR c.level <> 2) THEN
    missing := missing || ' a parent link crosses laws or does not go level 2 → level 1;';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_column_privilege(r, 'library.chapters', 'level', 'SELECT')
       OR NOT has_column_privilege(r, 'library.chapters', 'parent_chapter_id', 'SELECT') THEN
      missing := missing || format(' %s cannot read the chapter level columns;', r);
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: two-level chapters (20261004_02) —%', missing;
  END IF;
  RAISE NOTICE '_verify: 20261004_02 OK — chapter levels valid, parents stay inside their law';
END $$;


-- ====================================================================
-- 2026-10-16 — 20261016_01_library_principles_text_lock.sql (owner decision ١٧١)
-- ====================================================================
-- A principle's text, ruling basis, facts, reasons, ruling and `fts`, and every
-- principle_paragraphs row, are server-only: the API roles read the catalogue
-- columns below and nothing else. Keyed on the marker comment on
-- library.principles, so a deploy that runs this file BEFORE the migration is
-- applied still passes (code first, then migration).
-- The allow-list here MUST match the migration's grant list.
SELECT '20261016_01 marker on library.principles (principle text server-only)' AS check,
       coalesce(obj_description('library.principles'::regclass, 'pg_class'), '')
         ILIKE '%text server-only since 20261016_01%' AS present;

DO $$
DECLARE
  spec    record;
  r       text;
  col     text;
  missing text := '';
BEGIN
  IF coalesce(obj_description('library.principles'::regclass, 'pg_class'), '')
       NOT ILIKE '%text server-only since 20261016_01%' THEN
    RAISE NOTICE '_verify: 20261016_01 is not applied yet — principle text and paragraphs are still anon-readable (the pre-lock posture; apply it after the code deploy)';
    RETURN;
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('library.principles', ARRAY[
        'id', 'collection_id', 'principle_number', 'issuing_body', 'session_date',
        'decision_number', 'reference', 'year_hijri', 'order_index',
        'classification_keywords', 'hashtags', 'is_redacted', 'created_at', 'updated_at'])
    ) AS v(tbl, allowed)
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF has_table_privilege(r, spec.tbl, 'SELECT') THEN
        missing := missing || format(' %s holds table-level SELECT on %s (was 20261004_01, 20260922_01 §3 or the self-host schema re-applied?);', r, spec.tbl);
      END IF;
      FOREACH col IN ARRAY spec.allowed
      LOOP
        IF NOT has_column_privilege(r, spec.tbl, col, 'SELECT') THEN
          missing := missing || format(' %s cannot read public column %s.%s;', r, spec.tbl, col);
        END IF;
      END LOOP;
      FOR col IN
        SELECT att.attname::text
          FROM pg_attribute att
         WHERE att.attrelid = spec.tbl::regclass
           AND att.attnum > 0
           AND NOT att.attisdropped
      LOOP
        IF NOT (col = ANY (spec.allowed)) AND has_column_privilege(r, spec.tbl, col, 'SELECT') THEN
          missing := missing || format(' %s can read locked column %s.%s (20261004_01 re-run? re-run 20261016_01);', r, spec.tbl, col);
        END IF;
      END LOOP;
      IF has_any_column_privilege(r, 'library.principle_paragraphs', 'SELECT') THEN
        missing := missing || format(' %s can SELECT library.principle_paragraphs;', r);
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'library.principles', 'SELECT')
     OR NOT has_table_privilege('service_role', 'library.principle_paragraphs', 'SELECT') THEN
    missing := missing || ' service_role cannot read principles / principle_paragraphs (every precedent page would 500);';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'library' AND tablename = 'principle_paragraphs'
                AND cmd IN ('SELECT', 'ALL')
                AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) THEN
    missing := missing || ' a public read policy is back on library.principle_paragraphs;';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'library' AND tablename = 'principles'
                    AND cmd IN ('SELECT', 'ALL')
                    AND roles && ARRAY['anon', 'public']::name[]) THEN
    missing := missing || ' no read policy for anon on library.principles (every guest catalogue read returns 0 rows);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the principle text lock is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261016_01 OK — principle text, judgment, fts and paragraphs are server-only; the catalogue columns stay public';
END $$;


-- ====================================================================
-- 2026-10-16 — 20261016_02_profiles_members_write_lock.sql (owner decisions ٢٩ + ٣٠)
-- ====================================================================
-- authenticated may UPDATE only the 11 settings columns of public.profiles
-- (never email / verified_at / nafath_verified / metadata / user_type) — plus
-- national_address once 20261017_10 has added it (owner ٥٦/٥٧; checked in its
-- own section at the end of this file) — and the
-- API roles cannot hard-DELETE a row of the four entity membership tables.
-- Keyed on the marker comment on public.profiles.email, so a deploy that runs
-- this file BEFORE the migration is applied still passes.
SELECT '20261016_02 marker on public.profiles.email (profiles / members write lock)' AS check,
       coalesce(col_description('public.profiles'::regclass,
         (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.profiles'::regclass AND attname = 'email')), '')
         ILIKE '%server-write-only since 20261016_02%' AS present;

DO $$
DECLARE
  editable text[] := ARRAY[
    'display_name', 'display_name_en', 'phone', 'avatar_url', 'language',
    'calendar_type', 'theme', 'country_code', 'city', 'onboarding_completed', 'nationality'];
  -- Columns a later migration made self-editable: allowed when present, not
  -- required (20261017_10 may not have run yet).
  later_editable text[] := ARRAY['national_address'];
  col     text;
  t       text;
  missing text := '';
BEGIN
  IF coalesce(col_description('public.profiles'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.profiles'::regclass AND attname = 'email')), '')
       NOT ILIKE '%server-write-only since 20261016_02%' THEN
    RAISE NOTICE '_verify: 20261016_02 is not applied yet — users can still edit their own email / verification flags, and entity owners can hard-delete members';
    RETURN;
  END IF;

  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN
    missing := missing || ' authenticated holds table-level UPDATE on public.profiles again;';
  END IF;
  FOR col IN
    SELECT att.attname::text FROM pg_attribute att
     WHERE att.attrelid = 'public.profiles'::regclass AND att.attnum > 0 AND NOT att.attisdropped
  LOOP
    IF has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE')
       AND NOT (col = ANY (editable) OR col = ANY (later_editable)) THEN
      missing := missing || format(' authenticated can UPDATE public.profiles.%s;', col);
    END IF;
    IF has_column_privilege('anon', 'public.profiles', col, 'UPDATE') THEN
      missing := missing || format(' anon can UPDATE public.profiles.%s;', col);
    END IF;
  END LOOP;
  FOREACH col IN ARRAY editable LOOP
    IF NOT has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE') THEN
      missing := missing || format(' authenticated cannot UPDATE public.profiles.%s (the settings page would fail);', col);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['firm_members', 'business_members', 'government_members', 'ngo_members'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    IF has_table_privilege('authenticated', 'public.' || t, 'DELETE') OR has_table_privilege('anon', 'public.' || t, 'DELETE') THEN
      missing := missing || format(' an API role can DELETE public.%s again;', t);
    END IF;
  END LOOP;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the profiles / members write lock is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261016_02 OK — profiles: the 11 settings columns (+ national_address after 20261017_10) are the only self-editable ones; no API-role hard delete on the membership tables';
END $$;


-- ====================================================================
-- 2026-10-16 — 20261016_09_admin_policies_is_admin.sql (plan item N21)
-- ====================================================================
-- anon holds no privilege of any kind on public.profiles, and no policy whose
-- expression reads public.profiles (pg_depend) applies to anon or PUBLIC — the
-- second is what makes the first safe: such a policy turns every guest read of
-- its table into 42501 "permission denied for table profiles".
-- Applied = the marker comment on public.profiles OR anon already lacks SELECT
-- (a re-run of 20260921_01 overwrites the comment and makes the same revoke).
-- Before that, the section passes with a NOTICE (anon still holds SELECT and
-- reads zero rows — the 20261016_08 posture).
SELECT '20261016_09 applied (anon holds no SELECT on public.profiles)' AS check,
       NOT has_table_privilege('anon', 'public.profiles', 'SELECT') AS present;

SELECT 'policies reading public.profiles that reach anon / PUBLIC (expect 0)' AS check,
       (SELECT count(*) FROM pg_policy p
         WHERE (p.polroles = '{0}'::oid[] OR 'anon'::regrole::oid = ANY (p.polroles))
           AND EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_policy'::regclass AND d.objid = p.oid
                          AND d.refclassid = 'pg_class'::regclass
                          AND d.refobjid = 'public.profiles'::regclass)) AS present;

DO $$
DECLARE
  offenders text;
  missing   text := '';
BEGIN
  IF coalesce(obj_description('public.profiles'::regclass, 'pg_class'), '')
       NOT ILIKE '%anon holds no privilege since 20261016_09%'
     AND has_table_privilege('anon', 'public.profiles', 'SELECT') THEN
    RAISE NOTICE '_verify: 20261016_09 is not applied yet — anon still holds SELECT on public.profiles (reads zero rows; the inline admin policies need it)';
    RETURN;
  END IF;

  SELECT string_agg(format('%s on %s', p.polname, p.polrelid::regclass), '; ')
    INTO offenders
    FROM pg_policy p
   WHERE (p.polroles = '{0}'::oid[] OR 'anon'::regrole::oid = ANY (p.polroles))
     AND EXISTS (SELECT 1 FROM pg_depend d
                  WHERE d.classid = 'pg_policy'::regclass AND d.objid = p.oid
                    AND d.refclassid = 'pg_class'::regclass
                    AND d.refobjid = 'public.profiles'::regclass);
  IF offenders IS NOT NULL THEN
    missing := missing || format(' these policies read public.profiles and apply to guests, so every guest read of their tables fails with 42501 — re-create them TO authenticated USING (public.is_admin()) (see 20261016_09): %s;', offenders);
  END IF;

  IF has_table_privilege('anon', 'public.profiles', 'SELECT')
     OR has_any_column_privilege('anon', 'public.profiles', 'SELECT')
     OR has_table_privilege('anon', 'public.profiles', 'INSERT')
     OR has_table_privilege('anon', 'public.profiles', 'UPDATE')
     OR has_table_privilege('anon', 'public.profiles', 'DELETE')
     OR has_any_column_privilege('anon', 'public.profiles', 'UPDATE') THEN
    missing := missing || ' anon holds a privilege on public.profiles again (the self-host schema or a GRANT ALL re-applied? re-run 20261016_09);';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    missing := missing || ' authenticated lost SELECT on public.profiles;';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE') THEN
    missing := missing || ' authenticated cannot EXECUTE public.is_admin() (every admin policy fails for signed-in users);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the profiles guest lock is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261016_09 OK — anon holds no privilege on public.profiles; no policy that reads profiles reaches a guest';
END $$;


-- ====================================================================
-- 2026-10-16 — 20261016_10_lawyer_profiles_select_column_lock.sql (plan item N2)
-- ====================================================================
-- anon and authenticated read only the 13 public columns of lawyer_profiles —
-- never the licence, rate (Q168), credit, contact or metadata columns — and no
-- policy that applies to them reads a locked column (that would turn every
-- query of its table into 42501). Keyed on the marker comment on
-- lawyer_profiles.license_number OR anon's missing table-level SELECT, so a run
-- BEFORE the migration passes with a NOTICE (code first, then migration).
-- The column list here MUST match the migration's grant list. Columns granted
-- by LATER migrations are listed in later_cols: allowed to be readable here,
-- and required to be readable by their own section (20261019_20 —
-- practice_kind; 20261021_50 — founder_badge), which may run before that
-- migration exists.
SELECT '20261016_10 applied (lawyer_profiles column-locked for the API roles)' AS check,
       NOT has_table_privilege('anon', 'public.lawyer_profiles', 'SELECT') AS present;

DO $$
DECLARE
  public_cols text[] := ARRAY[
    'user_id', 'slug', 'specialties', 'years_experience', 'bio_ar', 'bio_en',
    'headline_ar', 'education', 'courts', 'languages', 'verification_status',
    'marketplace_visible', 'is_accepting_clients'];
  later_cols  text[] := ARRAY['practice_kind',    -- 20261019_20 (owner ١٧٣ / ٢١٩)
                               'founder_badge'];  -- 20261021_50 (owner ٢١٨ / ٢٢٥)
  r       text;
  col     text;
  leaks   text;
  missing text := '';
BEGIN
  IF coalesce(col_description('public.lawyer_profiles'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.lawyer_profiles'::regclass AND attname = 'license_number')), '')
       NOT ILIKE '%private since 20261016_10%'
     AND has_table_privilege('anon', 'public.lawyer_profiles', 'SELECT') THEN
    RAISE NOTICE '_verify: 20261016_10 is not applied yet — anon can read every lawyer_profiles column of a listed lawyer through REST (apply it after the code deploy)';
    RETURN;
  END IF;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(r, 'public.lawyer_profiles', 'SELECT') THEN
      missing := missing || format(' %s holds table-level SELECT on lawyer_profiles again (self-host schema or a GRANT ALL re-applied? re-run 20261016_10);', r);
    END IF;
    FOREACH col IN ARRAY public_cols LOOP
      IF NOT has_column_privilege(r, 'public.lawyer_profiles', col, 'SELECT') THEN
        missing := missing || format(' %s cannot read public column lawyer_profiles.%s;', r, col);
      END IF;
    END LOOP;
    FOR col IN
      SELECT att.attname::text FROM pg_attribute att
       WHERE att.attrelid = 'public.lawyer_profiles'::regclass AND att.attnum > 0 AND NOT att.attisdropped
    LOOP
      IF NOT (col = ANY (public_cols || later_cols)) AND has_column_privilege(r, 'public.lawyer_profiles', col, 'SELECT') THEN
        missing := missing || format(' %s can read locked column lawyer_profiles.%s;', r, col);
      END IF;
    END LOOP;
  END LOOP;

  SELECT string_agg(DISTINCT format('%s on %s (lawyer_profiles.%s)', p.polname, p.polrelid::regclass, att.attname), '; ')
    INTO leaks
    FROM pg_policy p
    JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = p.oid
                    AND d.refclassid = 'pg_class'::regclass
                    AND d.refobjid = 'public.lawyer_profiles'::regclass AND d.refobjsubid > 0
    JOIN pg_attribute att ON att.attrelid = d.refobjid AND att.attnum = d.refobjsubid
   WHERE (p.polroles = '{0}'::oid[]
          OR 'anon'::regrole::oid = ANY (p.polroles)
          OR 'authenticated'::regrole::oid = ANY (p.polroles))
     AND NOT (att.attname::text = ANY (public_cols || later_cols));
  IF leaks IS NOT NULL THEN
    missing := missing || format(' policies read a locked lawyer_profiles column, so every API-role query of their table fails with 42501: %s;', leaks);
  END IF;

  IF NOT has_table_privilege('service_role', 'public.lawyer_profiles', 'SELECT') THEN
    missing := missing || ' service_role cannot read lawyer_profiles (the directory and GET /api/v1/profile would fail);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the lawyer_profiles column lock is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261016_10 OK — anon/authenticated read the 13 public lawyer_profiles columns (plus practice_kind from 20261019_20 and founder_badge from 20261021_50) only; no policy reads a locked column';
END $$;

-- ====================================================================
-- 2026-10-16 — 20261016_11_provider_profiles_guest_read_revoke.sql (N2 follow-up)
-- ====================================================================
-- No guest read of provider_profiles: "public read verified providers" is
-- gone, anon holds no privilege, and the only SELECT policies that reach the
-- API roles are the own-row and admin ones (a schema restore re-creates the
-- dropped policy and the GRANT ALL — this section names both). authenticated
-- keeps table-level SELECT (own-row reads) and UPDATE on exactly
-- (metadata, updated_at). Keyed on the marker comment on
-- provider_profiles.license_number OR anon's missing table-level SELECT, so a
-- run BEFORE the migration passes with a NOTICE.
SELECT '20261016_11 applied (no guest read of provider_profiles)' AS check,
       NOT has_table_privilege('anon', 'public.provider_profiles', 'SELECT') AS present;

DO $$
DECLARE
  update_cols text[] := ARRAY['metadata', 'updated_at'];
  select_pols text[] := ARRAY['providers read own profile', 'admins read all provider profiles'];
  priv        text;
  col         text;
  offenders   text;
  missing     text := '';
BEGIN
  IF coalesce(col_description('public.provider_profiles'::regclass,
       (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.provider_profiles'::regclass AND attname = 'license_number')), '')
       NOT ILIKE '%private since 20261016_11%'
     AND has_table_privilege('anon', 'public.provider_profiles', 'SELECT') THEN
    RAISE NOTICE '_verify: 20261016_11 is not applied yet — anon (and every signed-in account) can read every provider_profiles column of a listed provider through REST (it can run any time)';
    RETURN;
  END IF;

  SELECT string_agg(format('%s (%s)', p.polname, pg_get_expr(p.polqual, p.polrelid)), '; ')
    INTO offenders
    FROM pg_policy p
   WHERE p.polrelid = 'public.provider_profiles'::regclass
     AND p.polcmd IN ('r', '*')
     AND (p.polroles = '{0}'::oid[]
          OR 'anon'::regrole::oid = ANY (p.polroles)
          OR 'authenticated'::regrole::oid = ANY (p.polroles))
     AND NOT (p.polname = ANY (select_pols));
  IF offenders IS NOT NULL THEN
    missing := missing || format(' SELECT policies on provider_profiles hand rows to the API roles again (a schema restore? re-run 20261016_11): %s;', offenders);
  END IF;

  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    IF has_table_privilege('anon', 'public.provider_profiles', priv) THEN
      missing := missing || format(' anon holds %s on provider_profiles again (self-host schema or a GRANT ALL re-applied? re-run 20261016_11);', priv);
    END IF;
  END LOOP;
  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
    IF has_any_column_privilege('anon', 'public.provider_profiles', priv) THEN
      missing := missing || format(' anon holds column-level %s on provider_profiles;', priv);
    END IF;
  END LOOP;

  IF NOT has_table_privilege('authenticated', 'public.provider_profiles', 'SELECT') THEN
    missing := missing || ' authenticated cannot read provider_profiles (GET /api/v1/profile reads the provider''s own row with the session);';
  END IF;
  FOR col IN
    SELECT att.attname::text FROM pg_attribute att
     WHERE att.attrelid = 'public.provider_profiles'::regclass AND att.attnum > 0 AND NOT att.attisdropped
  LOOP
    IF (col = ANY (update_cols)) <> has_column_privilege('authenticated', 'public.provider_profiles', col, 'UPDATE') THEN
      missing := missing || format(' authenticated UPDATE on provider_profiles.%s is %s, expected %s (the 20260922_03 list);', col,
        has_column_privilege('authenticated', 'public.provider_profiles', col, 'UPDATE'), col = ANY (update_cols));
    END IF;
  END LOOP;

  SELECT string_agg(DISTINCT format('policy %s on %s', p.polname, p.polrelid::regclass), '; ')
    INTO offenders
    FROM pg_policy p
    JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = p.oid
                    AND d.refclassid = 'pg_class'::regclass
                    AND d.refobjid = 'public.provider_profiles'::regclass
   WHERE p.polrelid <> 'public.provider_profiles'::regclass;
  IF offenders IS NOT NULL THEN
    missing := missing || format(' policies on other tables read provider_profiles inline (guests get 42501 there): %s;', offenders);
  END IF;

  IF NOT has_table_privilege('service_role', 'public.provider_profiles', 'SELECT') THEN
    missing := missing || ' service_role cannot read provider_profiles (the admin verification queue would fail);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the provider_profiles guest-read revoke is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261016_11 OK — no guest read of provider_profiles; a provider reads the own row, an admin reads all; authenticated UPDATE is (metadata, updated_at)';
END $$;


-- ====================================================================
-- 2026-10-17 — 20261017_10_profiles_national_address.sql (owner decisions ٥٦ / ٥٧)
-- ====================================================================
-- An optional national address for invoices: public.profiles.national_address,
-- NULL or 1–300 characters, self-editable through a COLUMN grant to
-- authenticated (the 20261016_02 lock is otherwise unchanged — its own section
-- above checks that), never writable by anon, and readable only where profiles
-- rows are (the owner and admins). Before the migration the section passes with
-- a NOTICE. After it, a missing column grant means 20261016_02 was re-run after
-- 20261017_10 (a table-level REVOKE takes column grants with it): re-run
-- 20261017_10.
SELECT '20261017_10 applied (public.profiles.national_address exists)' AS check,
       EXISTS (SELECT 1 FROM pg_attribute
                WHERE attrelid = 'public.profiles'::regclass AND attname = 'national_address'
                  AND NOT attisdropped) AS present;

DO $$
DECLARE
  missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.profiles'::regclass AND attname = 'national_address'
                    AND NOT attisdropped) THEN
    RAISE NOTICE '_verify: 20261017_10 is not applied yet — no national address can be saved (the settings field would fail with 42703)';
    RETURN;
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.profiles', 'national_address', 'UPDATE') THEN
    missing := missing || ' authenticated cannot UPDATE public.profiles.national_address — was 20261016_02 re-run after 20261017_10? Re-run 20261017_10;';
  END IF;
  IF has_column_privilege('anon', 'public.profiles', 'national_address', 'UPDATE')
     OR has_column_privilege('anon', 'public.profiles', 'national_address', 'SELECT') THEN
    missing := missing || ' anon can read or write public.profiles.national_address;';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.profiles'::regclass
                    AND conname = 'profiles_national_address_length' AND convalidated) THEN
    missing := missing || ' constraint profiles_national_address_length is missing or not validated;';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy
              WHERE polrelid = 'public.profiles'::regclass
                AND polcmd IN ('r', '*')
                AND (polroles = '{0}'::oid[] OR 'anon'::regrole::oid = ANY (polroles))) THEN
    missing := missing || ' a SELECT policy on public.profiles reaches anon or PUBLIC;';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the profiles national address is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261017_10 OK — profiles.national_address is optional (≤300), self-editable, owner- and admin-readable only';
END $$;

-- ====================================================================
-- 2026-10-17 — 20261017_20_library_search_principles_page.sql (fix plan N18)
-- ====================================================================
-- The precedents search window with its own 4s statement_timeout (PostgREST
-- applies it before the call). service_role only: the function returns the
-- server-only principle text, so a GRANT to anon/authenticated (a schema
-- restore replays the default EXECUTE grants) is a leak. A run BEFORE the
-- migration passes with a NOTICE: the route falls back to its inline query.
SELECT '20261017_20 applied (time-limited precedents search)' AS check,
       to_regprocedure('library.search_principles_page(text, integer, integer, text, text, integer, text)') IS NOT NULL AS present;

DO $$
DECLARE
  fn      CONSTANT text := 'library.search_principles_page(text, integer, integer, text, text, integer, text)';
  cfg     text[];
  definer boolean;
  r       text;
  missing text := '';
BEGIN
  IF to_regprocedure(fn) IS NULL THEN
    RAISE NOTICE '_verify: 20261017_20 is not applied yet — guest precedent searches run as the service role with no statement_timeout (the route uses its inline query until then)';
    RETURN;
  END IF;

  SELECT p.proconfig, p.prosecdef INTO cfg, definer FROM pg_proc p WHERE p.oid = to_regprocedure(fn);
  IF definer THEN
    missing := missing || ' it is SECURITY DEFINER (expected INVOKER — re-run 20261017_20);';
  END IF;
  IF cfg IS NULL OR NOT ('statement_timeout=4s' = ANY (cfg)) THEN
    missing := missing || format(' proconfig %s lacks statement_timeout=4s (the time limit is gone — re-run 20261017_20);', coalesce(cfg::text, 'NULL'));
  END IF;
  IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
    missing := missing || format(' proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(r, fn, 'EXECUTE') THEN
      missing := missing || format(' %s can EXECUTE it — it returns the server-only principle text (a GRANT re-applied? re-run 20261017_20);', r);
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    missing := missing || ' service_role cannot EXECUTE it (every precedent search would fail);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the time-limited precedents search is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261017_20 OK — library.search_principles_page: INVOKER, statement_timeout 4s, service_role only';
END $$;

-- ====================================================================
-- 2026-10-17 — 20261017_21_library_fts_statistics.sql (OPTIONAL search tuning)
-- ====================================================================
-- Reports, never raises: the file is optional. It says whether each library
-- fts column carries statistics target 1000 (-1 / NULL = the default 100) —
-- a migration that drops and re-creates an fts column resets it.
DO $$
DECLARE
  t      text;
  target integer;
  report text := '';
BEGIN
  FOREACH t IN ARRAY ARRAY['library.articles', 'library.feqh_blocks', 'library.principles'] LOOP
    CONTINUE WHEN to_regclass(t) IS NULL;
    SELECT coalesce(a.attstattarget::integer, -1) INTO target
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass(t) AND a.attname = 'fts' AND NOT a.attisdropped;
    CONTINUE WHEN NOT FOUND;
    report := report || format(' %s.fts=%s', t, CASE WHEN target < 0 THEN 'default' ELSE target::text END);
  END LOOP;
  RAISE NOTICE '_verify: 20261017_21 (optional) — fts statistics targets:% (1000 = applied; default = not applied or reset)', report;
END $$;

-- 2026-10-17 — 20261017_30_business_delegations.sql (owner decisions ٣٦ + ٥)
-- ====================================================================
-- «سجل التفويضات»: the company data is edited by the owner or a delegate
-- registered in public.business_delegations. Checked: the register exists with
-- RLS on; anon holds nothing on it; authenticated reads, inserts five columns,
-- updates revoked_at only and never deletes; the owner's UPDATE policy on
-- business_profiles is untouched and the delegate's is beside it; the two
-- helpers are SECURITY DEFINER and not executable by anon; the admin-flags
-- trigger is on business_profiles. A run BEFORE the migration passes with a
-- NOTICE (the table is absent).
-- Re-running 20260921_03 drops the delegate policy with every other
-- business_profiles policy: this section then RAISES — re-run 20261017_30.
SELECT '20261017_30 applied (business_delegations exists)' AS check,
       to_regclass('public.business_delegations') IS NOT NULL AS present;

DO $$
DECLARE
  col     text;
  fn      text;
  missing text := '';
BEGIN
  IF to_regclass('public.business_delegations') IS NULL THEN
    RAISE NOTICE '_verify: 20261017_30 is not applied yet — company data stays owner-only and «التفويض» answers «سجل التفويضات غير مفعّل بعد»';
    RETURN;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.business_delegations'::regclass) THEN
    missing := missing || ' RLS is off on business_delegations;';
  END IF;
  IF has_table_privilege('anon', 'public.business_delegations', 'SELECT')
     OR has_any_column_privilege('anon', 'public.business_delegations', 'SELECT')
     OR has_any_column_privilege('anon', 'public.business_delegations', 'INSERT')
     OR has_any_column_privilege('anon', 'public.business_delegations', 'UPDATE')
     OR has_table_privilege('anon', 'public.business_delegations', 'DELETE') THEN
    missing := missing || ' anon holds a privilege on business_delegations (a GRANT ALL re-applied? re-run 20261017_30);';
  END IF;
  IF has_table_privilege('authenticated', 'public.business_delegations', 'DELETE')
     OR has_table_privilege('authenticated', 'public.business_delegations', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.business_delegations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.business_delegations', 'INSERT') THEN
    missing := missing || ' authenticated holds a table-level write or DELETE on business_delegations;';
  END IF;
  FOR col IN
    SELECT att.attname::text FROM pg_attribute att
     WHERE att.attrelid = 'public.business_delegations'::regclass AND att.attnum > 0 AND NOT att.attisdropped
  LOOP
    IF (col = 'revoked_at') <> has_column_privilege('authenticated', 'public.business_delegations', col, 'UPDATE') THEN
      missing := missing || format(' authenticated UPDATE on business_delegations.%s is wrong (only revoked_at);', col);
    END IF;
    IF (col = ANY (ARRAY['business_id', 'delegate_user_id', 'scope', 'note', 'expires_on']))
       <> has_column_privilege('authenticated', 'public.business_delegations', col, 'INSERT') THEN
      missing := missing || format(' authenticated INSERT on business_delegations.%s is wrong;', col);
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated', 'public.business_delegations', 'SELECT') THEN
    missing := missing || ' authenticated cannot read business_delegations (the register would 401);';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.business_delegations'::regclass AND polcmd IN ('d', '*')) THEN
    missing := missing || ' a DELETE/ALL policy exists on business_delegations;';
  END IF;

  IF (SELECT count(*) FROM pg_policy
       WHERE polrelid = 'public.business_profiles'::regclass AND polcmd = 'w'
         AND polname IN ('business_profiles: owner can update',
                         'business_profiles: registered delegate can update')) <> 2 THEN
    missing := missing || ' the owner or the delegate UPDATE policy on business_profiles is missing (a re-run of 20260921_03 drops the delegate one — re-run 20261017_30);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.business_profiles'::regclass AND NOT tgisinternal
                    AND tgname = 'trg_business_profiles_keep_admin_flags') THEN
    missing := missing || ' trg_business_profiles_keep_admin_flags is missing (a company could overwrite the admin console''s metadata.features);';
  END IF;

  FOREACH fn IN ARRAY ARRAY['public.is_business_profile_delegate(uuid)', 'public.is_business_profile_editor(uuid)'] LOOP
    IF to_regprocedure(fn) IS NULL OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(fn)) THEN
      missing := missing || format(' %s is missing or not SECURITY DEFINER;', fn);
    ELSIF has_function_privilege('anon', fn, 'EXECUTE') THEN
      missing := missing || format(' anon can EXECUTE %s;', fn);
    ELSIF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      missing := missing || format(' authenticated cannot EXECUTE %s (the profile routes would treat every delegate as a member);', fn);
    END IF;
  END LOOP;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the company delegation register is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261017_30 OK — business_delegations (owner grants/revokes, members read, no delete); owner + registered-delegate UPDATE on business_profiles; metadata.features pinned';
END $$;


-- ====================================================================
-- 2026-10-17 — 20261017_31_firm_reviews_opt_in.sql (owner decision ٢٠)
-- ====================================================================
-- A firm's reviews are public only when its manager opts in: the
-- firm_profiles.public_reviews flag (NOT NULL DEFAULT false, no column grant —
-- the 20260922_03 firm allowlist above stays display_mode/metadata/updated_at),
-- its only API writer set_firm_public_reviews (not executable by anon), and the
-- RESTRICTIVE SELECT policy on reviews beside the untouched permissive
-- "anyone reads active reviews" (lawyer reviews unchanged). The policy's helper
-- must stay executable by anon, or every guest review read fails 42501.
-- A run BEFORE the migration passes with a NOTICE.
SELECT '20261017_31 applied (firm_profiles.public_reviews exists)' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'firm_profiles'
                  AND column_name = 'public_reviews') AS present;

DO $$
DECLARE
  missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'firm_profiles'
                    AND column_name = 'public_reviews') THEN
    RAISE NOTICE '_verify: 20261017_31 is not applied yet — every active firm review is readable by guests through REST (it can run any time; run it before the deploy)';
    RETURN;
  END IF;

  IF has_column_privilege('authenticated', 'public.firm_profiles', 'public_reviews', 'UPDATE')
     OR has_column_privilege('anon', 'public.firm_profiles', 'public_reviews', 'UPDATE') THEN
    missing := missing || ' an API role can UPDATE firm_profiles.public_reviews directly (table-level UPDATE re-granted? re-run 20260922_03);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = 'public.reviews'::regclass AND polcmd = 'r' AND NOT polpermissive
                    AND polname = 'reviews: a firm''s reviews are public only by its opt-in') THEN
    missing := missing || ' the restrictive firm-opt-in SELECT policy on reviews is missing (firm reviews are public again);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = 'public.reviews'::regclass AND polcmd = 'r' AND polpermissive
                    AND polname = 'anyone reads active reviews') THEN
    missing := missing || ' "anyone reads active reviews" is missing (lawyer reviews would vanish);';
  END IF;
  IF to_regprocedure('public.review_row_readable(uuid,uuid)') IS NULL
     OR NOT has_function_privilege('anon', 'public.review_row_readable(uuid,uuid)', 'EXECUTE') THEN
    missing := missing || ' anon cannot EXECUTE review_row_readable (every guest review read fails 42501);';
  END IF;
  IF to_regprocedure('public.set_firm_public_reviews(boolean)') IS NULL THEN
    missing := missing || ' set_firm_public_reviews is missing (the firm manager cannot switch the opt-in);';
  ELSIF has_function_privilege('anon', 'public.set_firm_public_reviews(boolean)', 'EXECUTE') THEN
    missing := missing || ' anon can EXECUTE set_firm_public_reviews;';
  END IF;
  IF to_regprocedure('public.firm_reviews_published(uuid)') IS NULL THEN
    missing := missing || ' firm_reviews_published is missing (GET /api/v1/reviews?firm= answers empty for every firm);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the firm review opt-in is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261017_31 OK — firm reviews public only by firm_profiles.public_reviews (default off, set through set_firm_public_reviews); lawyer reviews unchanged';
END $$;

-- ====================================================================
-- 2026-10-17 — 20261017_41_notes_visibility_case_team.sql (owner decision ١٦٩)
-- ====================================================================
-- Notes are private by default and can be shared with the case team or the
-- whole firm. This section re-checks what the migration's own verify block
-- proves: the case_team scope on case_notes; case_team_members with exactly
-- three policies and no UPDATE privilege; the scope rule on every note write
-- policy; no platform-admin arm on a note SELECT policy; no guest privilege
-- on the four tables; and EXECUTE on the seven helpers kept from PUBLIC/anon.
-- Keyed on public.case_team_members, so a run BEFORE the migration passes
-- with a NOTICE.
SELECT '20261017_41 applied (case-team note scope)' AS check,
       to_regclass('public.case_team_members') IS NOT NULL AS present;

DO $$
DECLARE
  n       int;
  bad     text;
  f       text;
  t       text;
  priv    text;
  missing text := '';
BEGIN
  IF to_regclass('public.case_team_members') IS NULL THEN
    RAISE NOTICE '_verify: 20261017_41 is not applied yet — notes have two scopes (private / firm), the platform admin reads private notes, and a raw REST insert can file a note under any firm';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.case_team_members'::regclass AND relrowsecurity) THEN
    missing := missing || ' RLS is off on case_team_members;';
  END IF;
  SELECT count(*) INTO n FROM pg_policy WHERE polrelid = 'public.case_team_members'::regclass;
  IF n <> 3 THEN
    missing := missing || format(' case_team_members carries %s policies, expected 3;', n);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.case_notes'::regclass AND contype = 'c'
                    AND pg_get_constraintdef(oid) ILIKE '%case_team%') THEN
    missing := missing || ' the case_notes visibility CHECK does not admit case_team;';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = 'public.case_notes'::regclass AND polcmd = 'r'
                    AND pg_get_expr(polqual, polrelid) ILIKE '%is_case_team_member%') THEN
    missing := missing || ' the case_notes SELECT policy has no case_team arm;';
  END IF;

  SELECT string_agg(format('%s.%s', c.relname, p.polname), ', ') INTO bad
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('case_notes', 'lawyer_client_notes', 'consultation_notes')
     AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') ILIKE '%is_admin%';
  IF bad IS NOT NULL THEN
    missing := missing || format(' a note SELECT policy lets the platform admin read private notes again (a schema restore?): %s;', bad);
  END IF;
  SELECT string_agg(format('%s.%s', c.relname, p.polname), ', ') INTO bad
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relname IN ('case_notes', 'lawyer_client_notes', 'consultation_notes')
     AND p.polcmd IN ('a', 'w')
     AND coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ '(case|client|consultation)_note_scope_ok';
  IF bad IS NOT NULL THEN
    missing := missing || format(' note write policies without the scope rule: %s;', bad);
  END IF;

  FOREACH t IN ARRAY ARRAY['case_notes', 'lawyer_client_notes', 'consultation_notes', 'case_team_members'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege('anon', 'public.' || t, priv) THEN
        missing := missing || format(' anon holds %s on %s (a GRANT ALL re-applied? re-run 20261017_41);', priv, t);
      END IF;
    END LOOP;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.case_team_members', 'UPDATE') THEN
    missing := missing || ' authenticated can UPDATE case_team_members (rows are added or removed, never edited);';
  END IF;

  FOREACH f IN ARRAY ARRAY[
    'public.case_team_user_ids(text)', 'public.is_case_team_member(text)',
    'public.can_manage_case_team(text)', 'public.case_team_insert_ok(text, uuid, uuid)',
    'public.case_note_scope_ok(text, text, uuid)', 'public.client_note_scope_ok(uuid, text, uuid)',
    'public.consultation_note_scope_ok(text, text)'
  ] LOOP
    IF to_regprocedure(f) IS NULL THEN
      missing := missing || format(' %s is missing;', f);
    ELSIF has_function_privilege('public', f, 'EXECUTE') OR has_function_privilege('anon', f, 'EXECUTE') THEN
      missing := missing || format(' %s is executable by PUBLIC/anon;', f);
    ELSIF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
      missing := missing || format(' authenticated cannot execute %s (every note read would fail);', f);
    END IF;
  END LOOP;

  -- The N21 trap: anon holds no privilege on these tables now, so a policy on
  -- ANOTHER table that read one of them inline would turn every guest read of
  -- that table into 42501. None does today; this keeps it that way.
  SELECT string_agg(DISTINCT format('policy %s on %s reads %s', p.polname, p.polrelid::regclass, d.refobjid::regclass), '; ')
    INTO bad
    FROM pg_policy p
    JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = p.oid
                    AND d.refclassid = 'pg_class'::regclass
   WHERE d.refobjid IN ('public.case_notes'::regclass, 'public.lawyer_client_notes'::regclass,
                        'public.consultation_notes'::regclass, 'public.case_team_members'::regclass)
     AND p.polrelid <> d.refobjid;
  IF bad IS NOT NULL THEN
    missing := missing || format(' policies on other tables read a note table inline (guests would get 42501 there): %s;', bad);
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261017_41 note scopes are broken —%', missing;
  END IF;
  RAISE NOTICE '_verify: 20261017_41 OK — private / case_team / firm notes, scopes pinned in RLS, no admin read of private notes, no guest privilege';
END $$;

-- ====================================================================
-- 2026-10-17 — 20261017_44_test_accounts_never_listed.sql (owner decision ١١٥)
-- ====================================================================
-- Test accounts stay on the live database for testing but never reach a public
-- list: public.test_accounts is service-role only (RLS on, no policy, no API
-- privilege), and a trigger on lawyer_profiles / provider_profiles keeps a
-- registered account's marketplace_visible false. Keyed on the registry, so a
-- run BEFORE the migration passes with a NOTICE.
SELECT '20261017_44 applied (test accounts never listed)' AS check,
       to_regclass('public.test_accounts') IS NOT NULL AS present;

DO $$
DECLARE
  t       text;
  n       int;
  priv    text;
  missing text := '';
BEGIN
  IF to_regclass('public.test_accounts') IS NULL THEN
    RAISE NOTICE '_verify: 20261017_44 is not applied yet — seeded test lawyers (verified + marketplace_visible) reach the public directory API, lawyer pages and the community contributors list';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.test_accounts'::regclass AND relrowsecurity) THEN
    missing := missing || ' RLS is off on test_accounts;';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.test_accounts'::regclass) THEN
    missing := missing || ' test_accounts has a policy (it must be service-role only);';
  END IF;
  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
    IF has_table_privilege('anon', 'public.test_accounts', priv)
       OR has_table_privilege('authenticated', 'public.test_accounts', priv) THEN
      missing := missing || format(' an API role holds %s on test_accounts (a GRANT ALL re-applied? re-run 20261017_44);', priv);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['lawyer_profiles', 'provider_profiles'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL
              OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = t AND column_name = 'marketplace_visible');
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgrelid = ('public.' || t)::regclass
                      AND tgname = 'trg_' || t || '_test_account_never_listed' AND NOT tgisinternal AND tgenabled <> 'D') THEN
      missing := missing || format(' %s has no enabled test-account trigger;', t);
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I p WHERE p.marketplace_visible IS TRUE
                      AND EXISTS (SELECT 1 FROM public.test_accounts ta WHERE ta.user_id = p.user_id)', t) INTO n;
    IF n <> 0 THEN
      missing := missing || format(' %s registered test account(s) listed on %s;', n, t);
    END IF;
  END LOOP;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261017_44 test-account separation is broken —%', missing;
  END IF;
  SELECT count(*) INTO n FROM public.test_accounts;
  RAISE NOTICE '_verify: 20261017_44 OK — % registered test account(s), none marketplace-visible', n;
END $$;

-- ====================================================================
-- 2026-10-18 — 20261018_02_library_feqh_decree_text_lock.sql (owner answer ١٨٣)
-- ====================================================================
-- The fiqh text (feqh_blocks.matn, sharh, hashiyah, fts) and the decree page
-- text (decree_pages.content) are server-only; anon / authenticated read the
-- place columns below and nothing else; library.search_feqh_page is INVOKER,
-- 4s, service_role only. Keyed on the marker comment on library.feqh_blocks,
-- so a run BEFORE the migration passes with a NOTICE (code first, then
-- migration). The allow-lists here MUST match the migration's grant lists.
SELECT '20261018_02 marker on library.feqh_blocks (fiqh / decree text server-only)' AS check,
       coalesce(obj_description('library.feqh_blocks'::regclass, 'pg_class'), '')
         ILIKE '%text server-only since 20261018_02%' AS present;

DO $$
DECLARE
  spec    record;
  r       text;
  col     text;
  fn      constant text := 'library.search_feqh_page(text, integer, integer)';
  cfg     text[];
  missing text := '';
BEGIN
  IF coalesce(obj_description('library.feqh_blocks'::regclass, 'pg_class'), '')
       NOT ILIKE '%text server-only since 20261018_02%' THEN
    RAISE NOTICE '_verify: 20261018_02 is not applied yet — fiqh text and decree pages are still anon-readable (the pre-lock posture; apply it after the code deploy)';
    RETURN;
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('library.feqh_blocks', ARRAY['id', 'section_id', 'topic', 'volume_number', 'page_number', 'order_index', 'created_at', 'updated_at', 'page_label', 'volume_label', 'book_id']),
      ('library.decree_pages', ARRAY['id', 'decree_id', 'page_number', 'created_at', 'updated_at', 'number_text', 'order_index'])
    ) AS v(tbl, allowed)
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF has_table_privilege(r, spec.tbl, 'SELECT') THEN
        missing := missing || format(' %s holds table-level SELECT on %s (was 20260922_01 §3 or the self-host schema re-applied? re-run 20261018_02);', r, spec.tbl);
      END IF;
      FOREACH col IN ARRAY spec.allowed
      LOOP
        IF NOT has_column_privilege(r, spec.tbl, col, 'SELECT') THEN
          missing := missing || format(' %s cannot read public column %s.%s;', r, spec.tbl, col);
        END IF;
      END LOOP;
      FOR col IN
        SELECT att.attname::text
          FROM pg_attribute att
         WHERE att.attrelid = spec.tbl::regclass
           AND att.attnum > 0
           AND NOT att.attisdropped
      LOOP
        IF NOT (col = ANY (spec.allowed)) AND has_column_privilege(r, spec.tbl, col, 'SELECT') THEN
          missing := missing || format(' %s can read locked column %s.%s (re-run 20261018_02);', r, spec.tbl, col);
        END IF;
      END LOOP;
    END LOOP;
    IF NOT has_table_privilege('service_role', spec.tbl, 'SELECT') THEN
      missing := missing || format(' service_role cannot read %s (every book / decree page would 500);', spec.tbl);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname || '.' || tablename = spec.tbl
                      AND cmd IN ('SELECT', 'ALL')
                      AND roles && ARRAY['anon', 'public']::name[]) THEN
      missing := missing || format(' no read policy for anon on %s (every guest read of the page places returns 0 rows);', spec.tbl);
    END IF;
  END LOOP;

  SELECT p.proconfig INTO cfg FROM pg_proc p WHERE p.oid = to_regprocedure(fn);
  IF NOT FOUND THEN
    missing := missing || ' library.search_feqh_page is missing (the fiqh search would fail — re-run 20261018_02);';
  ELSE
    IF cfg IS NULL OR NOT ('statement_timeout=4s' = ANY (cfg)) THEN
      missing := missing || ' search_feqh_page lost its statement_timeout=4s;';
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      missing := missing || ' an API role can EXECUTE search_feqh_page (it returns the server-only text; a GRANT re-applied? re-run 20261018_02);';
    END IF;
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the fiqh / decree text lock is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261018_02 OK — fiqh text, its fts and decree page content are server-only; their place columns stay public; search_feqh_page is 4s and service_role only';
END $$;

-- ====================================================================
-- 2026-10-18 — 20261018_04_service_requests_session_write_guard.sql (fix plan N16)
-- ====================================================================
-- A session may insert a request only unassigned or assigned to itself, and
-- may update only its status (plus lawyer_client_id by the assignee). A run
-- before the migration passes with a NOTICE.
SELECT '20261018_04 applied (service_requests session-write guard)' AS check,
       EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'public.service_requests'::regclass
                  AND tgname = 'trg_00_service_requests_session_guard') AS present;

DO $$
DECLARE
  first_before text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.service_requests'::regclass
                    AND tgname = 'trg_00_service_requests_session_guard') THEN
    RAISE NOTICE '_verify: 20261018_04 is not applied yet — a client can still assign any lawyer to a request (and so open a chat with them) and rewrite description / metadata / payment through REST';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'public.service_requests'::regclass
                AND tgname = 'trg_00_service_requests_session_guard' AND tgenabled = 'D') THEN
    RAISE EXCEPTION '_verify: the service_requests session-write guard is DISABLED — re-run 20261018_04';
  END IF;
  SELECT t.tgname INTO first_before
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.service_requests'::regclass AND NOT t.tgisinternal AND (t.tgtype & 2) = 2
   ORDER BY t.tgname LIMIT 1;
  IF first_before <> 'trg_00_service_requests_session_guard' THEN
    RAISE EXCEPTION '_verify: % fires before the service_requests guard — rename it or re-run 20261018_04', first_before;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.guard_service_request_session_writes()'::regprocedure AND prosecdef) THEN
    RAISE EXCEPTION '_verify: guard_service_request_session_writes is SECURITY DEFINER — it must run as the caller (re-run 20261018_04)';
  END IF;
  RAISE NOTICE '_verify: 20261018_04 OK — service_requests: session inserts unassigned or self-assigned; session updates status only (+ lawyer_client_id by the assignee)';
END $$;

-- ====================================================================
-- 2026-10-19 — 20261019_10_library_access_grants.sql (owner answers ١٩٩ / ٢٠١–٢٠٣)
-- ====================================================================
-- The library subscription as its own grant: a signed-in user reads only their
-- own rows (one SELECT policy), a guest holds nothing, only the server writes.
-- Keyed on the table's existence (to_regclass, never ::regclass), so a run
-- before the migration passes with a NOTICE.
SELECT '20261019_10 applied (public.library_access_grants)' AS check,
       to_regclass('public.library_access_grants') IS NOT NULL AS present;

DO $$
DECLARE
  tbl     constant text := 'public.library_access_grants';
  r       text;
  p       text;
  col     text;
  missing text := '';
BEGIN
  IF to_regclass(tbl) IS NULL THEN
    RAISE NOTICE '_verify: 20261019_10 is not applied yet — library access still comes only from the subscription tier (no library-only grants table)';
    RETURN;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(tbl)) THEN
    missing := missing || ' RLS is off (every signed-in user would read every grant — re-run 20261019_10);';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'library_access_grants') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                     WHERE schemaname = 'public' AND tablename = 'library_access_grants'
                       AND policyname = 'own library grants' AND cmd = 'SELECT') THEN
    missing := missing || ' expected exactly one policy, "own library grants" FOR SELECT (re-run 20261019_10);';
  END IF;

  FOREACH r IN ARRAY ARRAY['anon', 'public']
  LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    LOOP
      IF has_table_privilege(r, tbl, p) THEN
        missing := missing || format(' %s holds %s (a schema restore re-applied GRANT ALL? re-run 20261019_10);', r, p);
      END IF;
    END LOOP;
    FOR col IN
      SELECT att.attname::text FROM pg_attribute att
       WHERE att.attrelid = to_regclass(tbl) AND att.attnum > 0 AND NOT att.attisdropped
    LOOP
      IF has_column_privilege(r, tbl, col, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
        missing := missing || format(' %s holds a column privilege on %s;', r, col);
      END IF;
    END LOOP;
  END LOOP;
  IF has_table_privilege('authenticated', tbl, 'INSERT, UPDATE, DELETE, TRUNCATE') THEN
    missing := missing || ' authenticated can write grants (a user could give themselves the library — re-run 20261019_10);';
  END IF;
  IF NOT has_table_privilege('service_role', tbl, 'SELECT')
     OR NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
    missing := missing || ' service_role cannot read or insert grants (library approvals would fail);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: library_access_grants is not locked —%', missing;
  END IF;
  RAISE NOTICE '_verify: 20261019_10 OK — library_access_grants: RLS on, one own-row SELECT policy, no guest privilege, no session writes';
END $$;

-- ====================================================================
-- 2026-10-19 — 20261019_20_lawyer_practice_kind.sql (owner answers ١٧٣ / ٢١٩)
-- ====================================================================
-- The independent consultant: lawyer_profiles.practice_kind ('advocate' |
-- 'consultant', default 'advocate') readable by anon and authenticated,
-- licence_image_path for the service role only, neither writable by a
-- session, and the BEFORE INSERT trigger that fills practice_kind and
-- license_number from the signup metadata. Keyed on the practice_kind column
-- (information_schema, never has_column_privilege on a missing column), so a
-- run before the migration passes with a NOTICE.
SELECT '20261019_20 applied (lawyer_profiles.practice_kind + signup fill)' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                  AND column_name = 'practice_kind') AS present;

DO $$
DECLARE
  tbl     CONSTANT text := 'public.lawyer_profiles';
  fn      CONSTANT text := 'public.lawyer_profile_from_signup()';
  r       text;
  dfl     text;
  cfg     text[];
  definer boolean;
  owner   text;
  missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                    AND column_name = 'practice_kind') THEN
    RAISE NOTICE '_verify: 20261019_20 is not applied yet — every lawyer reads as an advocate, a consultant cannot be told apart, and the licence number typed at signup is not saved';
    RETURN;
  END IF;

  -- the columns
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO dfl
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = tbl::regclass AND a.attname = 'practice_kind' AND NOT a.attisdropped;
  IF dfl IS DISTINCT FROM '''advocate''::text'
     OR NOT (SELECT attnotnull FROM pg_attribute WHERE attrelid = tbl::regclass AND attname = 'practice_kind') THEN
    missing := missing || format(' practice_kind is not NOT NULL DEFAULT ''advocate'' (default %s);', coalesce(dfl, 'none'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = tbl::regclass AND conname = 'lawyer_profiles_practice_kind_check'
                    AND contype = 'c' AND convalidated) THEN
    missing := missing || ' the CHECK lawyer_profiles_practice_kind_check is missing (re-run 20261019_20);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                    AND column_name = 'licence_image_path') THEN
    missing := missing || ' licence_image_path is missing (re-run 20261019_20);';
  ELSE
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
      IF has_column_privilege(r, tbl, 'licence_image_path', 'SELECT, INSERT, UPDATE, REFERENCES') THEN
        missing := missing || format(' %s holds a privilege on licence_image_path — the licence image path is service-role only (a GRANT re-applied? re-run 20261016_10, then 20261019_20);', r);
      END IF;
    END LOOP;
  END IF;

  -- the privileges on practice_kind
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_column_privilege(r, tbl, 'practice_kind', 'SELECT') THEN
      missing := missing || format(' %s cannot SELECT practice_kind — a public profile cannot show «مستشار قانوني» (a re-run of 20261016_10 revokes this grant: re-run 20261019_20 after it);', r);
    END IF;
    IF has_column_privilege(r, tbl, 'practice_kind', 'INSERT, UPDATE') THEN
      missing := missing || format(' %s can write practice_kind (a lawyer could switch kind himself);', r);
    END IF;
  END LOOP;

  -- the trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = tbl::regclass
                    AND t.tgname = 'trg_lawyer_profiles_from_signup'
                    AND NOT t.tgisinternal
                    AND (t.tgtype & 7) = 7          -- FOR EACH ROW | BEFORE | INSERT
                    AND t.tgfoid = to_regprocedure(fn)) THEN
    missing := missing || ' trg_lawyer_profiles_from_signup is missing or not BEFORE INSERT on lawyer_profile_from_signup() (re-run 20261019_20);';
  ELSIF EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = tbl::regclass AND tgname = 'trg_lawyer_profiles_from_signup' AND tgenabled = 'D') THEN
    missing := missing || ' trg_lawyer_profiles_from_signup is DISABLED — consultants sign up as advocates (re-run 20261019_20);';
  END IF;

  -- the function
  SELECT p.proconfig, p.prosecdef, pg_get_userbyid(p.proowner)
    INTO cfg, definer, owner
    FROM pg_proc p WHERE p.oid = to_regprocedure(fn);
  IF NOT coalesce(definer, false) THEN
    missing := missing || ' lawyer_profile_from_signup is missing or not SECURITY DEFINER;';
  END IF;
  IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
    missing := missing || format(' lawyer_profile_from_signup proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  END IF;
  IF to_regprocedure(fn) IS NOT NULL THEN
    FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
      IF has_function_privilege(r, fn, 'EXECUTE') THEN
        missing := missing || format(' %s can EXECUTE lawyer_profile_from_signup;', r);
      END IF;
    END LOOP;
  END IF;
  IF owner IS NOT NULL
     AND NOT (has_schema_privilege(owner, 'auth', 'USAGE')
              AND has_column_privilege(owner, 'auth.users', 'raw_user_meta_data', 'SELECT')) THEN
    missing := missing || format(' the function owner %s cannot read auth.users.raw_user_meta_data — the signup fill silently does nothing;', owner);
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261019_20 consultant columns are broken —%', missing;
  END IF;
  RAISE NOTICE '_verify: 20261019_20 OK — practice_kind readable by anon/authenticated, licence_image_path service role only, neither writable by a session; trg_lawyer_profiles_from_signup enabled (definer %)', owner;
END $$;

-- ====================================================================
-- 2026-10-19 — 20261019_21_consultant_court_write_guard.sql (Art. 18; owner ١٧٣ / ٢١٩)
-- ====================================================================
-- hearings, case_stages and deadlines refuse a consultant's session writes:
-- one BEFORE INSERT OR UPDATE trigger per table, enabled for normal sessions
-- (O / A, not D or replica-only R), first in line, on a SECURITY DEFINER
-- function no API role may EXECUTE, its SET NULL pointer arguments equal to
-- each table's ON DELETE SET NULL foreign keys. Keyed on the function's existence
-- (to_regprocedure, never ::regprocedure), so a run before the migration
-- passes with a NOTICE.
SELECT '20261019_21 applied (consultant court-write guard)' AS check,
       to_regprocedure('public.refuse_consultant_court_rows()') IS NOT NULL AS present;

DO $$
DECLARE
  fn      CONSTANT text := 'public.refuse_consultant_court_rows()';
  tbl     text;
  r       text;
  cfg     text[];
  definer boolean;
  first_before text;
  args    text[];
  fks     text[];
  missing text := '';
BEGIN
  IF to_regprocedure(fn) IS NULL THEN
    RAISE NOTICE '_verify: 20261019_21 is not applied yet — a consultant can still write hearings, case stages and court deadlines straight through REST (only the API routes refuse him)';
    RETURN;
  END IF;

  -- the function
  SELECT p.proconfig, p.prosecdef INTO cfg, definer FROM pg_proc p WHERE p.oid = to_regprocedure(fn);
  IF NOT coalesce(definer, false) THEN
    missing := missing || ' refuse_consultant_court_rows is not SECURITY DEFINER — it cannot read practice_kind past RLS (re-run 20261019_21);';
  END IF;
  IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
    missing := missing || format(' refuse_consultant_court_rows proconfig %s lacks search_path='''' (re-run 20261019_21);', coalesce(cfg::text, 'NULL'));
  END IF;
  FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF has_function_privilege(r, fn, 'EXECUTE') THEN
      missing := missing || format(' %s can EXECUTE refuse_consultant_court_rows (a GRANT re-applied? re-run 20261019_21);', r);
    END IF;
  END LOOP;

  -- the triggers
  FOREACH tbl IN ARRAY ARRAY['public.hearings', 'public.case_stages', 'public.deadlines'] LOOP
    IF to_regclass(tbl) IS NULL THEN
      missing := missing || format(' %s is missing;', tbl);
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                    WHERE t.tgrelid = to_regclass(tbl)
                      AND t.tgname = 'trg_00_refuse_consultant_court_rows'
                      AND NOT t.tgisinternal
                      AND (t.tgtype & 23) = 23              -- ROW | BEFORE | INSERT | UPDATE
                      AND t.tgfoid = to_regprocedure(fn)) THEN
      missing := missing || format(' %s has no trg_00_refuse_consultant_court_rows BEFORE INSERT OR UPDATE FOR EACH ROW — a consultant writes it through REST (re-run 20261019_21);', tbl);
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid = to_regclass(tbl) AND tgname = 'trg_00_refuse_consultant_court_rows'
                  AND tgenabled NOT IN ('O', 'A')) THEN   -- D = disabled, R = replica only: never fires for a session
      missing := missing || format(' the Art. 18 guard on %s is DISABLED or replica-only (re-run 20261019_21);', tbl);
    END IF;
    SELECT t.tgname INTO first_before
      FROM pg_trigger t
     WHERE t.tgrelid = to_regclass(tbl) AND NOT t.tgisinternal AND (t.tgtype & 2) = 2
     ORDER BY t.tgname LIMIT 1;
    IF first_before IS DISTINCT FROM 'trg_00_refuse_consultant_court_rows' THEN
      missing := missing || format(' %s fires before the Art. 18 guard on %s — rename it;', first_before, tbl);
    END IF;
    -- the cascade exemption's pointers (the trigger arguments) = the table's
    -- ON DELETE SET NULL foreign-key columns
    SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO args
      FROM pg_trigger t,
           unnest(array_remove(string_to_array(encode(t.tgargs, 'escape'), '\000'), '')) x
     WHERE t.tgrelid = to_regclass(tbl) AND t.tgname = 'trg_00_refuse_consultant_court_rows';
    SELECT coalesce(array_agg(a.attname::text ORDER BY a.attname), '{}') INTO fks
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(CASE WHEN coalesce(cardinality(c.confdelsetcols), 0) = 0
                                     THEN c.conkey ELSE c.confdelsetcols END) k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.conrelid = to_regclass(tbl) AND c.contype = 'f' AND c.confdeltype = 'n';
    IF args IS DISTINCT FROM fks THEN
      missing := missing || format(' %s: the guard''s SET NULL pointers %s differ from the table''s ON DELETE SET NULL foreign keys %s — a delete cascading onto a consultant-owned row would be refused (add the pointer to the trigger arguments in 20261019_21 and re-run it);', tbl, args, fks);
    END IF;
  END LOOP;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261019_21 consultant court-write guard is broken —%', missing;
  END IF;
  RAISE NOTICE '_verify: 20261019_21 OK — hearings / case_stages / deadlines: a consultant''s session writes get 42501 (contract deadlines, admins and foreign-key cascade nulls pass; the pointer lists match the SET NULL foreign keys; postgres / service_role / supabase_admin / supabase_auth_admin trusted)';
END $$;

-- ====================================================================
-- 2026-10-19 — 20261019_30_platform_staff_roles.sql (owner ٢١٠)
-- ====================================================================
-- platform_staff (super_admin / operations / auditor): RLS on, one SELECT
-- policy TO authenticated via is_admin(), no session writes; staff_role() /
-- is_super_admin() SECURITY DEFINER with search_path '', no guest EXECUTE, and
-- staff_role() reads profiles.user_type (a staff role holds only while the
-- account is an admin); admin_audit_events append-only — an INVOKER function on one BEFORE UPDATE OR
-- DELETE row trigger and one BEFORE TRUNCATE statement trigger, both enabled
-- for normal sessions (O / A) — with no API write privilege (table, column,
-- sequence) and SELECT kept. Keyed on the table's existence (to_regclass,
-- never ::regclass), so a run before the migration passes with a NOTICE.
-- An admin with no staff row (made since the first apply) is a NOTICE, not a
-- stop: requireStaff (T3.3) treats that admin as an auditor (fail-closed).
-- Every "re-run 20261019_30" hint below is safe to follow: a re-run
-- re-asserts grants, functions and triggers and PROMOTES NOBODY (the
-- super_admin backfill runs only on the first apply, while platform_staff is
-- empty).
SELECT '20261019_30 applied (public.platform_staff + append-only audit log)' AS check,
       to_regclass('public.platform_staff') IS NOT NULL AS present;

DO $$
DECLARE
  staff   CONSTANT text := 'public.platform_staff';
  audit   CONSTANT text := 'public.admin_audit_events';
  trg     CONSTANT text := 'public.admin_audit_append_only()';
  seq     text;
  tbl     text;
  fn      text;
  r       text;
  p       text;
  col     text;
  cfg     text[];
  ids     text;
  missing text := '';
BEGIN
  IF to_regclass(staff) IS NULL THEN
    RAISE NOTICE '_verify: 20261019_30 is not applied yet — every admin can do everything, and the service role can still rewrite or delete admin_audit_events rows';
    RETURN;
  END IF;

  -- platform_staff: RLS + its one policy
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(staff)) THEN
    missing := missing || ' RLS is off on platform_staff (every signed-in user would read the staff list — re-run 20261019_30, which promotes nobody);';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = to_regclass(staff)) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policy pol
                     WHERE pol.polrelid = to_regclass(staff) AND pol.polname = 'admins read platform staff'
                       AND pol.polcmd = 'r' AND pol.polroles = ARRAY['authenticated'::regrole::oid]
                       AND position('is_admin()' IN pg_get_expr(pol.polqual, pol.polrelid)) > 0) THEN
    missing := missing || ' platform_staff must carry exactly one policy, "admins read platform staff" FOR SELECT TO authenticated USING is_admin() (re-run 20261019_30, which promotes nobody);';
  END IF;

  -- effective privileges on both tables (a schema restore re-applies GRANT ALL)
  FOREACH tbl IN ARRAY ARRAY[staff, audit] LOOP
    IF to_regclass(tbl) IS NULL THEN
      missing := missing || format(' %s is missing;', tbl);
      CONTINUE;
    END IF;
    FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
      FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(r, tbl, p) THEN
          missing := missing || format(' %s holds %s on %s (a GRANT re-applied? re-run 20261019_30, which promotes nobody);', r, p, tbl);
        END IF;
      END LOOP;
      CONTINUE WHEN has_table_privilege(r, tbl, 'INSERT, UPDATE, REFERENCES');   -- reported above
      FOR col IN SELECT a.attname::text FROM pg_attribute a
                  WHERE a.attrelid = to_regclass(tbl) AND a.attnum > 0 AND NOT a.attisdropped LOOP
        IF has_column_privilege(r, tbl, col, 'INSERT, UPDATE, REFERENCES') THEN
          missing := missing || format(' %s holds a column write privilege on %s.%s;', r, tbl, col);
        END IF;
      END LOOP;
    END LOOP;
    IF NOT has_table_privilege('service_role', tbl, 'SELECT')
       OR NOT has_table_privilege('service_role', tbl, 'INSERT') THEN
      missing := missing || format(' service_role cannot read or insert %s (role changes / audit writes would fail);', tbl);
    END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['public', 'anon'] LOOP
    IF has_table_privilege(r, staff, 'SELECT') OR has_any_column_privilege(r, staff, 'SELECT') THEN
      missing := missing || format(' %s can read platform_staff (re-run 20261019_30, which promotes nobody);', r);
    END IF;
  END LOOP;
  IF NOT has_table_privilege('authenticated', staff, 'SELECT')
     OR (to_regclass(audit) IS NOT NULL AND NOT has_table_privilege('authenticated', audit, 'SELECT')) THEN
    missing := missing || ' authenticated lost SELECT on platform_staff or admin_audit_events (the admin console / the activity feed read nothing);';
  END IF;
  seq := CASE WHEN to_regclass(audit) IS NOT NULL THEN pg_get_serial_sequence(audit, 'id') END;
  IF seq IS NOT NULL THEN
    FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
      IF has_sequence_privilege(r, seq, 'USAGE, SELECT, UPDATE') THEN
        missing := missing || format(' %s holds a privilege on %s (re-run 20261019_30, which promotes nobody);', r, seq);
      END IF;
    END LOOP;
    IF NOT has_sequence_privilege('service_role', seq, 'USAGE') THEN
      missing := missing || format(' service_role lacks USAGE on %s — every audit insert fails (silently: logAdminAction never throws);', seq);
    END IF;
  END IF;

  -- the role functions
  FOREACH fn IN ARRAY ARRAY['public.staff_role()', 'public.is_super_admin()'] LOOP
    IF to_regprocedure(fn) IS NULL THEN
      missing := missing || format(' %s is missing (re-run 20261019_30, which promotes nobody);', fn);
      CONTINUE;
    END IF;
    SELECT p2.proconfig INTO cfg FROM pg_proc p2 WHERE p2.oid = to_regprocedure(fn);
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(fn))
       OR cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
      missing := missing || format(' %s is not SECURITY DEFINER with search_path '''' (proconfig %s — re-run 20261019_30, which promotes nobody);', fn, coalesce(cfg::text, 'NULL'));
    END IF;
    FOREACH r IN ARRAY ARRAY['public', 'anon'] LOOP
      IF has_function_privilege(r, fn, 'EXECUTE') THEN
        missing := missing || format(' %s can EXECUTE %s (a GRANT re-applied? re-run 20261019_30, which promotes nobody);', r, fn);
      END IF;
    END LOOP;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      missing := missing || format(' authenticated cannot EXECUTE %s;', fn);
    END IF;
  END LOOP;
  IF to_regprocedure('public.staff_role()') IS NOT NULL
     AND (SELECT position('public.profiles' IN prosrc) = 0 OR position('user_type' IN prosrc) = 0
            FROM pg_proc WHERE oid = to_regprocedure('public.staff_role()')) THEN
    missing := missing || ' staff_role() does not read profiles.user_type — a demoted admin''s leftover staff row keeps its role (re-run 20261019_30, which promotes nobody);';
  END IF;

  -- admin_audit_events: append-only
  IF to_regclass(audit) IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass(audit)
                    AND attname = 'actor_email' AND NOT attisdropped) THEN
      missing := missing || ' admin_audit_events.actor_email is missing (re-run 20261019_30, which promotes nobody);';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(audit)) THEN
      missing := missing || ' RLS is off on admin_audit_events (anon / authenticated keep SELECT — every row would be readable);';
    END IF;
    IF to_regprocedure(trg) IS NULL THEN
      missing := missing || ' admin_audit_append_only() is missing (re-run 20261019_30, which promotes nobody);';
    ELSE
      SELECT p2.proconfig INTO cfg FROM pg_proc p2 WHERE p2.oid = to_regprocedure(trg);
      IF (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure(trg)) THEN
        missing := missing || ' admin_audit_append_only is SECURITY DEFINER — every writer reads as its owner and nothing is refused (re-run 20261019_30, which promotes nobody);';
      END IF;
      IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
        missing := missing || format(' admin_audit_append_only proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
      END IF;
      IF (SELECT count(*) FROM pg_trigger t
           WHERE t.tgrelid = to_regclass(audit) AND t.tgname = 'trg_admin_audit_append_only'
             AND NOT t.tgisinternal
             AND (t.tgtype & 27) = 27                -- ROW | BEFORE | DELETE | UPDATE
             AND (t.tgtype & (4 | 32 | 64)) = 0      -- no INSERT / TRUNCATE / INSTEAD
             AND t.tgqual IS NULL                    -- no WHEN
             AND t.tgattr = ''::int2vector           -- not UPDATE OF <columns>
             AND t.tgfoid = to_regprocedure(trg)) <> 1 THEN
        missing := missing || ' admin_audit_events has no trg_admin_audit_append_only BEFORE UPDATE OR DELETE FOR EACH ROW — audit rows can be rewritten (re-run 20261019_30, which promotes nobody);';
      END IF;
      IF (SELECT count(*) FROM pg_trigger t
           WHERE t.tgrelid = to_regclass(audit) AND t.tgname = 'trg_admin_audit_no_truncate'
             AND NOT t.tgisinternal
             AND t.tgtype = (2 | 32)                 -- STATEMENT | BEFORE | TRUNCATE
             AND t.tgfoid = to_regprocedure(trg)) <> 1 THEN
        missing := missing || ' admin_audit_events has no trg_admin_audit_no_truncate BEFORE TRUNCATE — the log can be wiped (re-run 20261019_30, which promotes nobody);';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = to_regclass(audit)
                    AND tgname IN ('trg_admin_audit_append_only', 'trg_admin_audit_no_truncate')
                    AND tgenabled NOT IN ('O', 'A')) THEN   -- D = disabled, R = replica only
        missing := missing || ' an append-only trigger on admin_audit_events is DISABLED or replica-only (re-run 20261019_30, which promotes nobody);';
      END IF;
    END IF;
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261019_30 staff roles / append-only audit log are broken —%', missing;
  END IF;

  -- data, not drift: reported, never a stop
  SELECT string_agg(pr.id::text, ', ') INTO ids
    FROM public.profiles pr
   WHERE pr.user_type = 'admin'
     AND NOT EXISTS (SELECT 1 FROM public.platform_staff s WHERE s.user_id = pr.id);
  IF ids IS NOT NULL THEN
    RAISE NOTICE '_verify: 20261019_30 — admins with no platform_staff row (they act as auditors until a super_admin gives them a role in the admin console; re-running 20261019_30 promotes nobody): %', ids;
  END IF;
  SELECT string_agg(s.user_id::text, ', ') INTO ids
    FROM public.platform_staff s
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = s.user_id AND pr.user_type = 'admin');
  IF ids IS NOT NULL THEN
    RAISE NOTICE '_verify: 20261019_30 — platform_staff rows whose user is no longer an admin (staff_role() ignores them; remove them, or they return if the account is made an admin again): %', ids;
  END IF;
  RAISE NOTICE '_verify: 20261019_30 OK — platform_staff: RLS on, admins read, service role writes; staff_role() / is_super_admin() definer, admins only, no guest EXECUTE; admin_audit_events append-only (UPDATE / DELETE / TRUNCATE triggers, invoker), no API writes, SELECT kept';
END $$;

-- ====================================================================
-- 2026-10-19 — 20261019_40_library_decree_preamble_lock.sql (owner answer ٢٢١)
-- ====================================================================
-- The decree preamble (decrees_circulars.preamble) is server-only; anon /
-- authenticated read the catalogue columns below and nothing else (fts
-- included: it is built from title, summary and summary_brief, never the
-- preamble). Keyed on the marker comment on library.decrees_circulars, so a
-- run BEFORE the migration passes with a NOTICE (code first, then migration).
-- The allow-list here MUST match the migration's grant list.
SELECT '20261019_40 marker on library.decrees_circulars (decree preamble server-only)' AS check,
       coalesce(obj_description('library.decrees_circulars'::regclass, 'pg_class'), '')
         ILIKE '%preamble server-only since 20261019_40%' AS present;

DO $$
DECLARE
  spec    record;
  r       text;
  col     text;
  missing text := '';
BEGIN
  IF coalesce(obj_description('library.decrees_circulars'::regclass, 'pg_class'), '')
       NOT ILIKE '%preamble server-only since 20261019_40%' THEN
    RAISE NOTICE '_verify: 20261019_40 is not applied yet — the decree preamble is still anon-readable (the pre-lock posture; apply it after the code deploy)';
    RETURN;
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('library.decrees_circulars', ARRAY['id', 'title', 'type', 'issuer', 'ref', 'date', 'summary', 'summary_brief', 'category', 'hashtags', 'official_url', 'fts', 'created_at', 'updated_at', 'instrument_ar'])
    ) AS v(tbl, allowed)
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF has_table_privilege(r, spec.tbl, 'SELECT') THEN
        missing := missing || format(' %s holds table-level SELECT on %s (was 20260922_01 §3 or the self-host schema re-applied? re-run 20261019_40);', r, spec.tbl);
      END IF;
      IF has_table_privilege(r, spec.tbl, 'INSERT') OR has_table_privilege(r, spec.tbl, 'UPDATE')
         OR has_table_privilege(r, spec.tbl, 'DELETE') OR has_any_column_privilege(r, spec.tbl, 'UPDATE') THEN
        missing := missing || format(' %s can write %s (re-run 20261019_40);', r, spec.tbl);
      END IF;
      FOREACH col IN ARRAY spec.allowed
      LOOP
        IF NOT has_column_privilege(r, spec.tbl, col, 'SELECT') THEN
          missing := missing || format(' %s cannot read public column %s.%s (the /laws index and search would fail);', r, spec.tbl, col);
        END IF;
      END LOOP;
      FOR col IN
        SELECT att.attname::text
          FROM pg_attribute att
         WHERE att.attrelid = spec.tbl::regclass
           AND att.attnum > 0
           AND NOT att.attisdropped
      LOOP
        IF NOT (col = ANY (spec.allowed)) AND has_column_privilege(r, spec.tbl, col, 'SELECT') THEN
          missing := missing || format(' %s can read locked column %s.%s (re-run 20261019_40);', r, spec.tbl, col);
        END IF;
      END LOOP;
    END LOOP;
    IF NOT has_table_privilege('service_role', spec.tbl, 'SELECT') THEN
      missing := missing || format(' service_role cannot read %s (every decree page would 500);', spec.tbl);
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = spec.tbl::regclass) THEN
      missing := missing || format(' RLS is off on %s (re-run 20261019_40);', spec.tbl);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname || '.' || tablename = spec.tbl
                      AND cmd IN ('SELECT', 'ALL')
                      AND roles && ARRAY['anon', 'public']::name[]) THEN
      missing := missing || format(' no read policy for anon on %s (every guest read of the decree catalogue returns 0 rows);', spec.tbl);
    END IF;
  END LOOP;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the decree preamble lock is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261019_40 OK — decrees_circulars.preamble is server-only; its 15 catalogue columns (fts included) stay public';
END $$;

-- ====================================================================
-- 2026-10-19 — 20261019_41_library_search_law_articles_page.sql (laws search time limit)
-- ====================================================================
-- The laws search window with its own 4s statement_timeout (PostgREST
-- applies it before the call). service_role only: the function returns the
-- server-only article text, so a GRANT to anon/authenticated (a schema
-- restore replays the default EXECUTE grants) is a leak. A run BEFORE the
-- migration passes with a NOTICE: the route falls back to its inline query.
SELECT '20261019_41 applied (time-limited laws search)' AS check,
       to_regprocedure('library.search_law_articles_page(text, integer, integer, text, text, text)') IS NOT NULL AS present;

DO $$
DECLARE
  fn      CONSTANT text := 'library.search_law_articles_page(text, integer, integer, text, text, text)';
  cfg     text[];
  definer boolean;
  r       text;
  missing text := '';
BEGIN
  IF to_regprocedure(fn) IS NULL THEN
    RAISE NOTICE '_verify: 20261019_41 is not applied yet — law searches run as the service role with no statement_timeout (the route uses its inline query until then)';
    RETURN;
  END IF;

  SELECT p.proconfig, p.prosecdef INTO cfg, definer FROM pg_proc p WHERE p.oid = to_regprocedure(fn);
  IF definer THEN
    missing := missing || ' it is SECURITY DEFINER (expected INVOKER — re-run 20261019_41);';
  END IF;
  IF cfg IS NULL OR NOT ('statement_timeout=4s' = ANY (cfg)) THEN
    missing := missing || format(' proconfig %s lacks statement_timeout=4s (the time limit is gone — re-run 20261019_41);', coalesce(cfg::text, 'NULL'));
  END IF;
  IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
    missing := missing || format(' proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(r, fn, 'EXECUTE') THEN
      missing := missing || format(' %s can EXECUTE it — it returns the server-only article text (a GRANT re-applied? re-run 20261019_41);', r);
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    missing := missing || ' service_role cannot EXECUTE it (every law search would fail);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the time-limited laws search is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261019_41 OK — library.search_law_articles_page: INVOKER, statement_timeout 4s, service_role only';
END $$;

-- ====================================================================
-- 2026-10-21 — 20261021_50_founder_campaign.sql (owner ٢١٨ / dates ٢٢٥)
-- ====================================================================
-- The founder-lawyer campaign: platform_settings founder_campaign
-- {starts_on, ends_on, library_days}, founder_campaign_active(), the
-- lawyer_profiles.founder_badge column (readable by anon / authenticated,
-- written by nobody but the trigger and the service role) and the BEFORE
-- INSERT trigger trg_lawyer_profiles_founder that gives a new lawyer the badge
-- and one lib-founder library grant during the campaign. Keyed on the
-- founder_badge column (information_schema, never has_column_privilege on a
-- missing column), so a run before the migration passes with a NOTICE.
-- RE-RUN HAZARD: a re-run of 20261016_10 revokes founder_badge's SELECT
-- grant; re-run 20261019_20 and 20261021_50 after it.
SELECT '20261021_50 applied (founder campaign: setting + badge + signup grant)' AS check,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                  AND column_name = 'founder_badge') AS present;

DO $$
DECLARE
  tbl     CONSTANT text := 'public.lawyer_profiles';
  fn_act  CONSTANT text := 'public.founder_campaign_active(timestamptz)';
  fn_trg  CONSTANT text := 'public.lawyer_profile_founder_campaign()';
  r       text;
  dfl     text;
  cfg     text[];
  definer boolean;
  owner   text;
  v       jsonb;
  missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'lawyer_profiles'
                    AND column_name = 'founder_badge') THEN
    RAISE NOTICE '_verify: 20261021_50 is not applied yet — lawyers who sign up get neither the founder badge nor the 3 months of library (the campaign starts 25 Oct 2026, Riyadh)';
    RETURN;
  END IF;

  -- the setting
  SELECT value INTO v FROM public.platform_settings WHERE key = 'founder_campaign';
  IF v IS NULL OR jsonb_typeof(v) <> 'object'
     OR NOT (v ? 'starts_on') OR NOT (v ? 'ends_on') OR NOT (v ? 'library_days') THEN
    missing := missing || format(' platform_settings founder_campaign is missing or not {starts_on, ends_on, library_days}: %s (re-run 20261021_50 to re-seed the owner''s dates);', coalesce(v::text, 'no row'));
  END IF;

  -- the column
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO dfl
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = tbl::regclass AND a.attname = 'founder_badge' AND NOT a.attisdropped;
  IF dfl IS DISTINCT FROM 'false'
     OR NOT (SELECT attnotnull FROM pg_attribute WHERE attrelid = tbl::regclass AND attname = 'founder_badge')
     OR (SELECT atttypid FROM pg_attribute WHERE attrelid = tbl::regclass AND attname = 'founder_badge') <> 'boolean'::regtype THEN
    missing := missing || format(' founder_badge is not boolean NOT NULL DEFAULT false (default %s);', coalesce(dfl, 'none'));
  END IF;

  -- the privileges on founder_badge
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_column_privilege(r, tbl, 'founder_badge', 'SELECT') THEN
      missing := missing || format(' %s cannot SELECT founder_badge — a public profile cannot show the founder badge (a re-run of 20261016_10 revokes this grant: re-run 20261021_50 after it);', r);
    END IF;
    IF has_column_privilege(r, tbl, 'founder_badge', 'INSERT, UPDATE, REFERENCES') THEN
      missing := missing || format(' %s can write founder_badge (a lawyer could give himself the badge — a GRANT re-applied? re-run 20261016_10, 20261019_20, then 20261021_50);', r);
    END IF;
  END LOOP;

  -- founder_campaign_active
  SELECT p.proconfig, p.prosecdef INTO cfg, definer FROM pg_proc p WHERE p.oid = to_regprocedure(fn_act);
  IF NOT coalesce(definer, false) THEN
    missing := missing || ' founder_campaign_active is missing or not SECURITY DEFINER (re-run 20261021_50);';
  END IF;
  IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
    missing := missing || format(' founder_campaign_active proconfig %s lacks search_path='''' (re-run 20261021_50);', coalesce(cfg::text, 'NULL'));
  END IF;
  IF to_regprocedure(fn_act) IS NOT NULL THEN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF NOT has_function_privilege(r, fn_act, 'EXECUTE') THEN
        missing := missing || format(' %s cannot EXECUTE founder_campaign_active (re-run 20261021_50);', r);
      END IF;
    END LOOP;
  END IF;

  -- the trigger function
  SELECT p.proconfig, p.prosecdef, pg_get_userbyid(p.proowner)
    INTO cfg, definer, owner
    FROM pg_proc p WHERE p.oid = to_regprocedure(fn_trg);
  IF NOT coalesce(definer, false) THEN
    missing := missing || ' lawyer_profile_founder_campaign is missing or not SECURITY DEFINER (re-run 20261021_50);';
  END IF;
  IF cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
    missing := missing || format(' lawyer_profile_founder_campaign proconfig %s lacks search_path='''' (re-run 20261021_50);', coalesce(cfg::text, 'NULL'));
  END IF;
  IF to_regprocedure(fn_trg) IS NOT NULL THEN
    FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
      IF has_function_privilege(r, fn_trg, 'EXECUTE') THEN
        missing := missing || format(' %s can EXECUTE lawyer_profile_founder_campaign (re-run 20261021_50);', r);
      END IF;
    END LOOP;
  END IF;
  IF owner IS NOT NULL
     AND NOT (has_table_privilege(owner, 'public.platform_settings', 'SELECT')
              AND has_table_privilege(owner, 'public.library_access_grants', 'SELECT')
              AND has_table_privilege(owner, 'public.library_access_grants', 'INSERT')
              AND has_table_privilege(owner, 'public.lawyer_profiles', 'SELECT')) THEN
    missing := missing || format(' the function owner %s cannot read platform_settings / lawyer_profiles or read and insert library_access_grants — the founder grant silently does nothing;', owner);
  END IF;

  -- the trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = tbl::regclass
                    AND t.tgname = 'trg_lawyer_profiles_founder'
                    AND NOT t.tgisinternal
                    AND (t.tgtype & 7) = 7          -- FOR EACH ROW | BEFORE | INSERT
                    AND (t.tgtype & 16) = 0         -- not on UPDATE
                    AND t.tgfoid = to_regprocedure(fn_trg)) THEN
    missing := missing || ' trg_lawyer_profiles_founder is missing or not BEFORE INSERT FOR EACH ROW on lawyer_profile_founder_campaign() (re-run 20261021_50);';
  ELSIF EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = tbl::regclass AND tgname = 'trg_lawyer_profiles_founder' AND tgenabled = 'D') THEN
    missing := missing || ' trg_lawyer_profiles_founder is DISABLED — new lawyers get neither the badge nor the library grant (re-run 20261021_50);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261021_50 founder campaign is broken —%', missing;
  END IF;
  RAISE NOTICE '_verify: 20261021_50 OK — founder_campaign = %; campaign active now (Riyadh): %; founder_badge readable by anon/authenticated, not writable by a session; trg_lawyer_profiles_founder enabled (definer %)',
    v, public.founder_campaign_active(), owner;
END $$;

-- ====================================================================
-- 2026-10-22 — 20261022_10_payments_core.sql (Moyasar payments B1)
-- ====================================================================
-- Orders, saved cards and handled webhook events: a signed-in user reads only
-- their own orders (never metadata) and cards (never the token), webhook
-- events are service role only, no session writes any of them; receipt
-- numbers come from a SECURITY DEFINER function only the service role runs;
-- both tier CHECKs allow shield and enterprise; a library grant can carry the
-- order that bought it (one grant per order). Keyed on the table's existence
-- (to_regclass, never ::regclass), so a run before the migration passes with
-- a NOTICE. Plan prices and an empty billing_company only NOTICE: an admin may
-- edit a price, and live mode itself refuses an incomplete company.
SELECT '20261022_10 applied (public.payment_orders)' AS check,
       to_regclass('public.payment_orders') IS NOT NULL AS present;

DO $$
DECLARE
  r        text;
  p        text;
  col      text;
  v        text;
  def      text;
  tbl      text;
  att      int2;
  cfg      text[];
  definer  boolean;
  company  jsonb;
  drift    text;
  missing  text := '';
  -- the columns authenticated may SELECT (24 and 9): everything but metadata / token
  orders_sel  CONSTANT text[] := array['id','user_id','merchant','kind','item_id','billing','net_halalas','vat_halalas','total_halalas','vat_mode','currency','status','moyasar_intent_id','moyasar_payment_id','live','source','receipt_number','paid_at','fulfilled_at','refunded_at','refunded_halalas','failure_message','created_at','updated_at'];
  methods_sel CONSTANT text[] := array['id','user_id','merchant','brand','last_four','exp_month','exp_year','status','created_at'];
BEGIN
  IF to_regclass('public.payment_orders') IS NULL THEN
    RAISE NOTICE '_verify: 20261022_10 is not applied yet — no online payment (no orders, saved cards or receipt numbers)';
    RETURN;
  END IF;

  IF to_regclass('public.payment_methods') IS NULL OR to_regclass('public.payment_webhook_events') IS NULL
     OR to_regclass('public.payment_receipt_seq') IS NULL
     OR to_regprocedure('public.next_receipt_number()') IS NULL THEN
    RAISE EXCEPTION '_verify: 20261022_10 is half applied — payment_methods, payment_webhook_events, payment_receipt_seq or next_receipt_number() is missing (re-run 20261022_10)';
  END IF;

  FOREACH tbl IN ARRAY ARRAY['payment_orders', 'payment_methods', 'payment_webhook_events'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || tbl)) THEN
      missing := missing || format(' RLS is off on %s (re-run 20261022_10);', tbl);
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_orders') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_orders'
                     AND policyname = 'own payment orders' AND cmd = 'SELECT') THEN
    missing := missing || ' payment_orders: expected exactly one policy, "own payment orders" FOR SELECT;';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_methods') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_methods'
                     AND policyname = 'own payment methods' AND cmd = 'SELECT') THEN
    missing := missing || ' payment_methods: expected exactly one policy, "own payment methods" FOR SELECT;';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_webhook_events') THEN
    missing := missing || ' payment_webhook_events has a policy (it is service role only);';
  END IF;

  -- effective privileges (pg_attribute sweep): no table-level privilege for
  -- the API roles; authenticated SELECTs every column but metadata / token
  FOREACH tbl IN ARRAY ARRAY['payment_orders', 'payment_methods', 'payment_webhook_events'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(r, 'public.' || tbl, p) THEN
          missing := missing || format(' %s holds table %s on %s (a schema restore re-applied GRANT ALL? re-run 20261022_10);', r, p, tbl);
        END IF;
      END LOOP;
      FOR col IN
        SELECT a.attname::text FROM pg_attribute a
         WHERE a.attrelid = to_regclass('public.' || tbl) AND a.attnum > 0 AND NOT a.attisdropped
      LOOP
        IF has_column_privilege(r, 'public.' || tbl, col, 'INSERT, UPDATE, REFERENCES') THEN
          missing := missing || format(' %s can write %s.%s;', r, tbl, col);
        END IF;
        IF has_column_privilege(r, 'public.' || tbl, col, 'SELECT')
           <> (r = 'authenticated'
               AND ((tbl = 'payment_orders' AND col = ANY (orders_sel))
                    OR (tbl = 'payment_methods' AND col = ANY (methods_sel)))) THEN
          missing := missing || format(' %s %s SELECT on %s.%s (re-run 20261022_10);', r,
                       CASE WHEN has_column_privilege(r, 'public.' || tbl, col, 'SELECT') THEN 'holds' ELSE 'lacks' END,
                       tbl, col);
        END IF;
      END LOOP;
    END LOOP;
    IF NOT has_table_privilege('service_role', 'public.' || tbl, 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.' || tbl, 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.' || tbl, 'UPDATE') THEN
      missing := missing || format(' service_role cannot read or write %s (checkout and fulfilment would fail);', tbl);
    END IF;
  END LOOP;

  -- receipt numbers
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
    IF has_sequence_privilege(r, 'public.payment_receipt_seq', 'USAGE, SELECT, UPDATE') THEN
      missing := missing || format(' %s holds a privilege on payment_receipt_seq;', r);
    END IF;
    IF has_function_privilege(r, 'public.next_receipt_number()', 'EXECUTE') THEN
      missing := missing || format(' %s can EXECUTE next_receipt_number() (re-run 20261022_10);', r);
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.next_receipt_number()', 'EXECUTE') THEN
    missing := missing || ' service_role cannot EXECUTE next_receipt_number() (a paid order would get no receipt number);';
  END IF;
  SELECT proconfig, prosecdef INTO cfg, definer FROM pg_proc
   WHERE oid = to_regprocedure('public.next_receipt_number()');
  IF NOT coalesce(definer, false) OR cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
    missing := missing || ' next_receipt_number() is not SECURITY DEFINER with search_path '''' (re-run 20261022_10);';
  END IF;

  -- the tier CHECKs: exactly one CHECK on each tier column, and it allows all 7
  FOREACH tbl IN ARRAY ARRAY['subscription_plans', 'subscriptions'] LOOP
    SELECT a.attnum INTO att FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || tbl) AND a.attname = 'tier' AND NOT a.attisdropped;
    IF (SELECT count(*) FROM pg_constraint WHERE conrelid = to_regclass('public.' || tbl)
         AND contype = 'c' AND conkey = ARRAY[att]) <> 1 THEN
      missing := missing || format(' %s: expected exactly one CHECK on tier (a narrower CHECK left behind would still refuse shield / enterprise — re-run 20261022_10);', tbl);
    END IF;
    SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
     WHERE conrelid = to_regclass('public.' || tbl) AND conname = tbl || '_tier_check';
    FOREACH v IN ARRAY ARRAY['free', 'shield', 'ai', 'pro', 'max', 'corp', 'enterprise'] LOOP
      IF def IS NULL OR position(quote_literal(v) IN def) = 0 THEN
        missing := missing || format(' %s.tier CHECK does not allow %s (re-run 20261022_10);', tbl, v);
      END IF;
    END LOOP;
  END LOOP;

  -- library grants bought by an order
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = to_regclass('public.library_access_grants') AND conname = 'library_access_grants_source_check';
  IF def IS NULL OR position('''purchase''' IN def) = 0 THEN
    missing := missing || ' library_access_grants source CHECK does not allow purchase (re-run 20261022_10);';
  END IF;
  SELECT attnum INTO att FROM pg_attribute
   WHERE attrelid = to_regclass('public.library_access_grants') AND attname = 'order_id' AND NOT attisdropped;
  IF att IS NULL THEN
    missing := missing || ' library_access_grants.order_id is missing (re-run 20261022_10);';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.library_access_grants')
                     AND contype = 'f' AND conkey = ARRAY[att] AND confrelid = to_regclass('public.payment_orders'))
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.library_access_grants')
                     AND contype = 'u' AND conkey = ARRAY[att]) THEN
    missing := missing || ' library_access_grants.order_id lacks its FK to payment_orders or its UNIQUE (one grant per order);';
  END IF;

  -- the 7 plans sold online exist (a paid plan writes subscriptions.plan_id = item id)
  SELECT string_agg(x.id, ', ') INTO drift
    FROM unnest(ARRAY['ind-ai', 'ind-preventive', 'ind-litigation', 'lawyer-pro', 'consultant-independent',
                      'firm-basic', 'firm-enterprise']) AS x(id)
   WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans sp WHERE sp.id = x.id);
  IF drift IS NOT NULL THEN
    missing := missing || format(' subscription_plans lacks %s (a paid plan could not be granted — re-run 20261022_10);', drift);
  END IF;

  -- billing_company
  SELECT value INTO company FROM public.platform_settings WHERE key = 'billing_company';
  IF company IS NULL OR jsonb_typeof(company) <> 'object' THEN
    missing := missing || format(' platform_settings billing_company is missing or not an object: %s (re-run 20261022_10);', coalesce(company::text, 'no row'));
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261022_10 payments schema is broken —%', missing;
  END IF;

  SELECT string_agg(x.id || ' ' || sp.price_monthly || '/' || sp.price_yearly, ', ') INTO drift
    FROM (VALUES ('ind-ai', 39, 390), ('ind-preventive', 149, 1490), ('ind-litigation', 399, 3990),
                 ('lawyer-pro', 399, 3990), ('consultant-independent', 399, 3990),
                 ('firm-basic', 990, 9900), ('firm-enterprise', 1490, 14900)) AS x(id, pm, py)
    JOIN public.subscription_plans sp ON sp.id = x.id
   WHERE sp.price_monthly <> x.pm OR sp.price_yearly <> x.py;
  IF drift IS NOT NULL THEN
    RAISE NOTICE '_verify: 20261022_10 — plan prices differ from the B1 catalog (an admin edit? checkout charges the code catalog, not this table): %', drift;
  END IF;
  IF NOT (company ?& ARRAY['legal_name_ar', 'cr_number', 'vat_number', 'address_ar'])
     OR coalesce(company ->> 'legal_name_ar', '') = '' OR coalesce(company ->> 'cr_number', '') = ''
     OR coalesce(company ->> 'vat_number', '') = '' OR coalesce(company ->> 'address_ar', '') = '' THEN
    RAISE NOTICE '_verify: 20261022_10 — billing_company is not complete yet (legal name, CR, VAT number, address): live payments stay off until an admin fills it';
  END IF;
  RAISE NOTICE '_verify: 20261022_10 OK — payment_orders / payment_methods own-row SELECT without metadata / token, webhook events service role only, no session writes; next_receipt_number() service role only; tiers allow shield + enterprise; library grants take purchase + order_id; 7 sold plans present';
END $$;

-- ====================================================================
-- 2026-10-22 — 20261022_20_points_lots.sql (Moyasar payments B1, Task 2)
-- ====================================================================
-- Points in expiring lots (owner ٢٢٤ / ٢٤٤ / ٢٤٩): a signed-in user reads
-- only their own lots and ledger rows, no session writes either table or the
-- ledger sequence; credit_points / debit_points / revoke_lot are service role
-- only; points_balance is authenticated (own balance) + service role; all four
-- SECURITY DEFINER with search_path ''; debit_points locks the unexpired lots
-- FOR UPDATE nearest-expiry first; points_enforcement is a JSON boolean.
-- Keyed on the table's existence (to_regclass), so a run before the migration
-- passes with a NOTICE. The balance backfill is one-shot (marker
-- points_lots_migrated_at, which must exist); a positive credit_balance
-- without a migrated lot only NOTICEs: admin/credits still writes
-- credit_balance until the B1 points wiring lands.
-- >>> verify:points_lots — supabase/tests/rls/points_lots.test.sql extracts
-- the lines between these two markers; keep them.
SELECT '20261022_20 applied (public.points_lots)' AS check,
       to_regclass('public.points_lots') IS NOT NULL AS present;

DO $$
DECLARE
  r        text;
  p        text;
  col      text;
  tbl      text;
  fn       text;
  cfg      text[];
  definer  boolean;
  v        jsonb;
  n        int;
  missing  text := '';
  lots_cols   CONSTANT text[] := array['id','user_id','source','points_total','points_left','expires_at','order_id','created_at'];
  ledger_cols CONSTANT text[] := array['id','user_id','lot_id','delta','reason','tool','ref','created_at'];
  fns         CONSTANT text[] := array['public.points_balance(uuid)',
                                       'public.credit_points(uuid,integer,text,timestamp with time zone,uuid,text)',
                                       'public.debit_points(uuid,integer,text,text)',
                                       'public.revoke_lot(uuid,text)'];
BEGIN
  IF to_regclass('public.points_lots') IS NULL THEN
    RAISE NOTICE '_verify: 20261022_20 is not applied yet — no points lots (top-ups cannot be credited; balances still live in lawyer_profiles.credit_balance)';
    RETURN;
  END IF;

  IF to_regclass('public.points_ledger') IS NULL OR to_regclass('public.points_ledger_id_seq') IS NULL THEN
    RAISE EXCEPTION '_verify: 20261022_20 is half applied — points_ledger or its id sequence is missing (re-run 20261022_20)';
  END IF;

  -- columns and the lot invariant
  FOREACH col IN ARRAY lots_cols LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.points_lots')
                    AND attname = col AND NOT attisdropped) THEN
      missing := missing || format(' points_lots.%s is missing;', col);
    END IF;
  END LOOP;
  FOREACH col IN ARRAY ledger_cols LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.points_ledger')
                    AND attname = col AND NOT attisdropped) THEN
      missing := missing || format(' points_ledger.%s is missing;', col);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.points_lots')
                  AND conname = 'points_lots_points_left_check') THEN
    missing := missing || ' points_lots_points_left_check is missing (a lot could go negative — re-run 20261022_20);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.points_lots')
                  AND conname = 'points_lots_order_source_key' AND contype = 'u') THEN
    missing := missing || ' points_lots_order_source_key (UNIQUE order_id, source) is missing (fulfilment could credit an order twice);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'points_lots'
                  AND indexname = 'points_lots_user_expires_idx') THEN
    missing := missing || ' points_lots_user_expires_idx is missing (re-run 20261022_20);';
  END IF;

  -- RLS and policies
  FOREACH tbl IN ARRAY ARRAY['points_lots', 'points_ledger'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.' || tbl)) THEN
      missing := missing || format(' RLS is off on %s (re-run 20261022_20);', tbl);
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'points_lots') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'points_lots'
                     AND policyname = 'own points lots' AND cmd = 'SELECT') THEN
    missing := missing || ' points_lots: expected exactly one policy, "own points lots" FOR SELECT;';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'points_ledger') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'points_ledger'
                     AND policyname = 'own points ledger' AND cmd = 'SELECT') THEN
    missing := missing || ' points_ledger: expected exactly one policy, "own points ledger" FOR SELECT;';
  END IF;

  -- effective privileges (pg_attribute sweep): no table-level privilege for
  -- the API roles; authenticated SELECTs exactly the allow-list; no column write
  FOREACH tbl IN ARRAY ARRAY['points_lots', 'points_ledger'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(r, 'public.' || tbl, p) THEN
          missing := missing || format(' %s holds table %s on %s (a schema restore re-applied GRANT ALL? re-run 20261022_20);', r, p, tbl);
        END IF;
      END LOOP;
      FOR col IN
        SELECT a.attname::text FROM pg_attribute a
         WHERE a.attrelid = to_regclass('public.' || tbl) AND a.attnum > 0 AND NOT a.attisdropped
      LOOP
        IF has_column_privilege(r, 'public.' || tbl, col, 'INSERT, UPDATE, REFERENCES') THEN
          missing := missing || format(' %s can write %s.%s (a user could mint points — re-run 20261022_20);', r, tbl, col);
        END IF;
        IF has_column_privilege(r, 'public.' || tbl, col, 'SELECT')
           <> (r = 'authenticated'
               AND ((tbl = 'points_lots' AND col = ANY (lots_cols))
                    OR (tbl = 'points_ledger' AND col = ANY (ledger_cols)))) THEN
          missing := missing || format(' %s %s SELECT on %s.%s (re-run 20261022_20);', r,
                       CASE WHEN has_column_privilege(r, 'public.' || tbl, col, 'SELECT') THEN 'holds' ELSE 'lacks' END,
                       tbl, col);
        END IF;
      END LOOP;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF NOT has_table_privilege('service_role', 'public.' || tbl, p) THEN
        missing := missing || format(' service_role lacks %s on %s (re-run 20261022_20);', p, tbl);
      END IF;
    END LOOP;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
    IF has_sequence_privilege(r, 'public.points_ledger_id_seq', 'USAGE, SELECT, UPDATE') THEN
      missing := missing || format(' %s holds a privilege on points_ledger_id_seq (re-run 20261022_20);', r);
    END IF;
  END LOOP;

  -- the functions
  FOREACH fn IN ARRAY fns LOOP
    IF to_regprocedure(fn) IS NULL THEN
      missing := missing || format(' %s is missing (re-run 20261022_20);', fn);
      CONTINUE;
    END IF;
    SELECT proconfig, prosecdef INTO cfg, definer FROM pg_proc WHERE oid = to_regprocedure(fn);
    IF NOT coalesce(definer, false) OR cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
      missing := missing || format(' %s is not SECURITY DEFINER with search_path '''' (re-run 20261022_20);', fn);
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('public', fn, 'EXECUTE') THEN
      missing := missing || format(' anon or PUBLIC can EXECUTE %s (re-run 20261022_20);', fn);
    END IF;
    IF has_function_privilege('authenticated', fn, 'EXECUTE') <> (fn = 'public.points_balance(uuid)') THEN
      missing := missing || format(' authenticated %s EXECUTE %s (re-run 20261022_20);',
                   CASE WHEN has_function_privilege('authenticated', fn, 'EXECUTE') THEN 'can' ELSE 'cannot' END, fn);
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      missing := missing || format(' service_role cannot EXECUTE %s;', fn);
    END IF;
  END LOOP;
  IF to_regprocedure('public.debit_points(uuid,integer,text,text)') IS NOT NULL
     AND pg_get_functiondef(to_regprocedure('public.debit_points(uuid,integer,text,text)'))
         !~* 'order\s+by\s+pl\.expires_at\s*,\s*pl\.created_at\s*,\s*pl\.id\s+for\s+update' THEN
    missing := missing || ' debit_points no longer locks the lots FOR UPDATE nearest-expiry first (re-run 20261022_20);';
  END IF;

  -- points_enforcement
  SELECT value INTO v FROM public.platform_settings WHERE key = 'points_enforcement';
  IF v IS NULL OR jsonb_typeof(v) <> 'boolean' THEN
    missing := missing || format(' platform_settings points_enforcement is missing or not a JSON boolean: %s (re-run 20261022_20);', coalesce(v::text, 'no row'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'points_lots_migrated_at') THEN
    missing := missing || ' platform_settings points_lots_migrated_at is missing — the one-shot balance backfill is unrecorded, so a re-run of 20261022_20 would migrate balances again;';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261022_20 points lots are broken —%', missing;
  END IF;

  SELECT count(*) INTO n FROM public.lawyer_profiles lp
   WHERE lp.credit_balance > 0
     AND NOT EXISTS (SELECT 1 FROM public.points_lots pl WHERE pl.user_id = lp.user_id AND pl.source = 'migrated');
  IF n > 0 THEN
    RAISE NOTICE '_verify: 20261022_20 — % lawyer(s) hold a positive credit_balance but no migrated lot (credited after the migration ran? admin/credits still writes credit_balance)', n;
  END IF;
  RAISE NOTICE '_verify: 20261022_20 OK — points_lots / points_ledger own-row SELECT, no session writes; points_balance own-or-service, credit / debit / revoke service role only; debit locks nearest-expiry first; points_enforcement = %; % migrated lot(s)',
    v, (SELECT count(*) FROM public.points_lots WHERE source = 'migrated');
END $$;
-- <<< verify:points_lots

-- ====================================================================
-- 2026-10-22 — 20261022_30_claim_payment_order.sql (Moyasar payments B1, Task 5)
-- ====================================================================
-- The claim that turns an order paid exactly once: one conditional UPDATE
-- (created / initiated → paid, the receipt number taken inside it), the
-- metadata merge for traces, both SECURITY DEFINER with search_path '' and
-- EXECUTE for service_role only; the partial UNIQUE index
-- subscriptions_order_id_key (one subscription per paid order). Keyed on the
-- function's existence, so a run before the migration passes with a NOTICE.
-- >>> verify:payments_fulfill_once — supabase/tests/rls/payments_fulfill_once.test.sql
-- extracts the lines between these two markers; keep them.
SELECT '20261022_30 applied (public.claim_payment_order)' AS check,
       to_regprocedure('public.claim_payment_order(uuid, text, boolean)') IS NOT NULL AS present;

DO $$
DECLARE
  fn      CONSTANT text := 'public.claim_payment_order(uuid, text, boolean)';
  mfn     CONSTANT text := 'public.merge_payment_order_metadata(uuid, jsonb)';
  r       text;
  cfg     text[];
  definer boolean;
  ret     text;
  def     text;
  missing text := '';
BEGIN
  IF to_regprocedure(fn) IS NULL THEN
    RAISE NOTICE '_verify: 20261022_30 is not applied yet — no paid order can be claimed (fulfilment answers pending until it runs)';
    RETURN;
  END IF;
  SELECT proconfig, prosecdef, pg_get_function_result(oid) INTO cfg, definer, ret
    FROM pg_proc WHERE oid = to_regprocedure(fn);
  IF NOT coalesce(definer, false) OR cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
    missing := missing || ' the claim is not SECURITY DEFINER with search_path '''' (re-run 20261022_30);';
  END IF;
  IF ret IS DISTINCT FROM 'SETOF payment_orders' THEN
    missing := missing || format(' the claim returns %s, expected SETOF payment_orders (re-run 20261022_30);', ret);
  END IF;
  def := pg_get_functiondef(to_regprocedure(fn));
  IF def !~* 'status\s+in\s*\(\s*''created''\s*,\s*''initiated''\s*\)'
     OR def !~* 'receipt_number\s*=\s*public\.next_receipt_number\(\)' THEN
    missing := missing || ' the claim no longer re-checks the open statuses or takes the receipt number inside the UPDATE — an order could be paid twice (re-run 20261022_30);';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
    IF has_function_privilege(r, fn, 'EXECUTE') THEN
      missing := missing || format(' %s can EXECUTE the claim — a user could mark an order paid (a schema restore re-granted it? re-run 20261022_30);', r);
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    missing := missing || ' service_role cannot EXECUTE the claim (no payment would complete);';
  END IF;

  -- the metadata merge (paid_unmatched / sweep_attempts traces)
  IF to_regprocedure(mfn) IS NULL THEN
    missing := missing || ' merge_payment_order_metadata(uuid, jsonb) is missing — paid payments that bought nothing leave no trace (re-run 20261022_30);';
  ELSE
    SELECT proconfig, prosecdef INTO cfg, definer FROM pg_proc WHERE oid = to_regprocedure(mfn);
    IF NOT coalesce(definer, false) OR cfg IS NULL OR NOT ('search_path=""' = ANY (cfg)) THEN
      missing := missing || ' merge_payment_order_metadata is not SECURITY DEFINER with search_path '''' (re-run 20261022_30);';
    END IF;
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
      IF has_function_privilege(r, mfn, 'EXECUTE') THEN
        missing := missing || format(' %s can EXECUTE merge_payment_order_metadata — a user could rewrite order metadata (re-run 20261022_30);', r);
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', mfn, 'EXECUTE') THEN
      missing := missing || ' service_role cannot EXECUTE merge_payment_order_metadata;';
    END IF;
  END IF;

  -- one subscription per paid order
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                  WHERE i.indrelid = to_regclass('public.subscriptions') AND c.relname = 'subscriptions_order_id_key'
                    AND i.indisunique AND i.indpred IS NOT NULL
                    AND pg_get_indexdef(i.indexrelid) ~* '\(\(metadata ->> ''order_id''::text\)\)') THEN
    missing := missing || ' subscriptions_order_id_key (partial UNIQUE on metadata->>''order_id'') is missing — a paid plan could be inserted twice (re-run 20261022_30);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the 20261022_30 claim is broken —%', missing;
  END IF;
  RAISE NOTICE '_verify: 20261022_30 OK — claim_payment_order: one conditional UPDATE, receipt number inside; merge_payment_order_metadata; both SECURITY DEFINER, service role only; subscriptions_order_id_key present; % paid order(s) not fulfilled yet, % order(s) with a paid payment that bought nothing (metadata.paid_unmatched)',
    (SELECT count(*) FROM public.payment_orders WHERE status = 'paid' AND fulfilled_at IS NULL),
    (SELECT count(*) FROM public.payment_orders WHERE metadata ? 'paid_unmatched');
END $$;
-- <<< verify:payments_fulfill_once

-- >>> verify:payments_billing_refunds_admin_points
-- Final B1 additions: raising verification, read-only, safe to repeat.
do $$ declare fn text; role_name text; col text; privilege_name text; begin
  if to_regclass('public.payment_orders') is null then
    raise notice 'payments B1 not applied yet'; return;
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.payment_methods'::regclass
                  and attname = 'live' and not attisdropped and atttypid = 'boolean'::regtype) then
    raise exception 'B1 verify: apply 20261022_31 before deploying billing';
  end if;
  foreach col in array array['token','live'] loop
    foreach role_name in array array['anon','authenticated'] loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        if has_column_privilege(role_name,'public.payment_methods',col,privilege_name) then
          raise exception 'B1 verify: % can % hidden card column %',role_name,privilege_name,col;
        end if;
      end loop;
    end loop;
  end loop;
  foreach fn in array array['public.claim_payment_refund(uuid,uuid,text)',
    'public.finish_payment_refund(uuid,text,text)','public.release_payment_refund(uuid,text)',
    'public.adjust_admin_points(uuid,int,timestamptz,text)','public.admin_points_balances(uuid[])'] loop
    if to_regprocedure(fn) is null then raise exception 'B1 verify: missing % (apply _32 and _33)',fn; end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,fn,'EXECUTE') then raise exception 'B1 verify: session executes %',fn; end if;
    end loop;
    if not has_function_privilege('service_role',fn,'EXECUTE') or not exists
      (select 1 from pg_proc where oid = fn::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
      raise exception 'B1 verify: unsafe definer or missing service privilege on %',fn;
    end if;
  end loop;
  raise notice 'B1 additions OK: hidden card mode; service-only refund and admin points RPCs';
end $$;

-- <<< verify:payments_billing_refunds_admin_points

-- >>> verify:points_admin_adjustment_reason
-- 2026-10-22 — 20261022_34_points_admin_adjustment_reason.sql (B1 Tasks 8+9 fix round 1).
-- Read-only, safe to repeat. Before _34 runs it only reports; after, it raises
-- when admin deductions could still be recorded (or remain) as usage.
do $$
declare role_name text; body text; mislabelled bigint; fn_owner text;
begin
  if to_regclass('public.points_ledger') is null then
    raise notice '_verify: 20261022_34 — points ledger not applied yet'; return;
  end if;
  select count(*) into mislabelled from public.points_ledger where reason = 'usage' and tool = 'admin_adjustment';
  if to_regprocedure('public.admin_debit_points(uuid,int,text)') is null then
    raise notice '_verify: 20261022_34 is not applied yet — admin deductions are recorded as usage (% row(s) to relabel); run 08_AFTER_RUN_20261022_34', mislabelled;
    return;
  end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(role_name,'public.admin_debit_points(uuid,int,text)','EXECUTE') then
      raise exception '_verify: % can EXECUTE the internal admin_debit_points (re-run 20261022_34)', role_name;
    end if;
  end loop;
  if not exists (select 1 from pg_proc where oid = 'public.admin_debit_points(uuid,int,text)'::regprocedure
                  and prosecdef and proconfig @> array['search_path=""']) then
    raise exception '_verify: admin_debit_points is not SECURITY DEFINER with search_path '''' (re-run 20261022_34)';
  end if;
  -- adjust_admin_points (SECURITY DEFINER) runs as its owner, who must be able to run the helper.
  select pg_get_userbyid(proowner) into fn_owner from pg_proc
   where oid = 'public.adjust_admin_points(uuid,int,timestamptz,text)'::regprocedure;
  if fn_owner is null or not has_function_privilege(fn_owner,'public.admin_debit_points(uuid,int,text)','EXECUTE') then
    raise exception '_verify: %, the owner of adjust_admin_points, cannot EXECUTE admin_debit_points — admin deductions fail; give both functions the same owner', coalesce(fn_owner, '(adjust_admin_points missing)');
  end if;
  select prosrc into body from pg_proc where oid = 'public.adjust_admin_points(uuid,int,timestamptz,text)'::regprocedure;
  if body is null or body not like '%public.admin_debit_points(%' then
    raise exception '_verify: adjust_admin_points does not debit through admin_debit_points — deductions read as usage (re-run 20261022_34)';
  end if;
  if mislabelled > 0 then
    raise exception '_verify: % admin deduction row(s) still labelled usage (re-run 20261022_34)', mislabelled;
  end if;
  raise notice '_verify: 20261022_34 OK — admin deductions are recorded as admin_adjustment; the helper is internal';
end $$;
-- <<< verify:points_admin_adjustment_reason

-- >>> verify:hearing_reminders
-- 2026-10-25 — 20261025_30_hearing_reminders.sql (P4 N3.2). Read-only, safe to
-- repeat. Before _30 runs it only reports; after, it raises when the hearing
-- once-only key, the one-source CHECK, the cascade, the outbox UPDATE policy's
-- WITH CHECK or the service-only recipient function is missing or open to sessions.
do $$
declare r text; fn regprocedure;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'notification_outbox' and column_name = 'hearing_id') then
    raise notice '_verify: 20261025_30 is not applied yet — no hearing reminders are queued; run 10_BEFORE_DEPLOY_20261025_30_hearing_reminders.sql';
    return;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass and contype = 'u'
                    and conname = 'uq_notification_outbox_hearing_once'
                    and pg_get_constraintdef(oid) = 'UNIQUE (hearing_id, recipient_user_id, channel, kind)') then
    raise exception '_verify: uq_notification_outbox_hearing_once is missing or not (hearing_id, recipient_user_id, channel, kind) — the scheduler''s upsert fails (re-run 20261025_30)';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass and contype = 'u'
                    and conname = 'uq_notification_outbox_once'
                    and pg_get_constraintdef(oid) = 'UNIQUE (deadline_id, recipient_user_id, channel, kind)') then
    raise exception '_verify: the deadline once-only key uq_notification_outbox_once changed — deadline reminders would double';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass and contype = 'c'
                    and conname = 'notification_outbox_one_source') then
    raise exception '_verify: notification_outbox_one_source CHECK is missing (re-run 20261025_30)';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass and contype = 'f'
                    and confrelid = 'public.hearings'::regclass and confdeltype = 'c') then
    raise exception '_verify: notification_outbox.hearing_id does not cascade from public.hearings (re-run 20261025_30)';
  end if;
  fn := to_regprocedure('public.hearing_reminder_targets(date,date)');
  if fn is null then
    raise exception '_verify: public.hearing_reminder_targets(date, date) is missing (re-run 20261025_30)';
  end if;
  foreach r in array array['anon','authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      raise exception '_verify: % can EXECUTE hearing_reminder_targets — sessions could list other lawyers'' hearings (re-run 20261025_30)', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception '_verify: service_role cannot EXECUTE hearing_reminder_targets — no hearing reminder is queued (re-run 20261025_30)';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'notification_outbox'
                    and policyname = 'outbox cancellable by deadline owner' and cmd = 'UPDATE'
                    and with_check like '%hearing_id IS NULL%'
                    and with_check like '%can_access_case_row%') then
    raise exception '_verify: the outbox UPDATE policy does not re-test the new row (no hearing_id, an accessible deadline) — a deadline owner could rewrite his row into someone''s hearing reminder (re-run 20261025_30)';
  end if;
  if not exists (select 1 from pg_proc where oid = fn and not prosecdef and proconfig @> array['search_path=""']) then
    raise exception '_verify: hearing_reminder_targets is not SECURITY INVOKER with search_path '''' (re-run 20261025_30)';
  end if;
  raise notice '_verify: 20261025_30 OK — hearing reminders keyed once per (hearing, recipient, channel, kind), one source per row, cascade from hearings, recipients listed by the service role only';
end $$;
-- <<< verify:hearing_reminders

-- >>> verify:dashboard_notes
-- 2026-10-25 — 20261025_31_dashboard_notes.sql (P4 N3.4). Read-only, safe to
-- repeat. Before _31 runs it only reports; after, it raises when the notes
-- table, its RLS, the case-worker rule on its write policies or the
-- service-only case_worker_ok is missing or open to sessions.
do $$
declare bad text; n int;
begin
  if to_regclass('public.dashboard_notes') is null then
    raise notice '_verify: 20261025_31 is not applied yet — the sticky notes wall cannot save; run 12_BEFORE_DEPLOY_20261025_31_dashboard_notes.sql';
    return;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.dashboard_notes'::regclass) then
    raise exception '_verify: RLS is off on public.dashboard_notes (re-run 20261025_31)';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.dashboard_notes'::regclass;
  if n <> 4 then
    raise exception '_verify: public.dashboard_notes carries % policies, expected 4 (re-run 20261025_31)', n;
  end if;
  select string_agg(policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public' and tablename = 'dashboard_notes' and cmd in ('INSERT', 'UPDATE')
     and (coalesce(with_check, '') not like '%is_case_worker%' or coalesce(with_check, '') not like '%case_note_scope_ok%');
  if bad is not null then
    raise exception '_verify: dashboard_notes write policies without the case-worker and scope rule: % — a note could be planted into another case or firm (re-run 20261025_31)', bad;
  end if;
  if to_regprocedure('public.case_worker_ok(text,uuid)') is null
     or to_regprocedure('public.is_case_worker(text)') is null
     or to_regprocedure('public.case_row_scope_ok(text,uuid)') is null then
    raise exception '_verify: a case-worker helper of 20261025_31 is missing (re-run 20261025_31)';
  end if;
  if has_function_privilege('authenticated', 'public.case_worker_ok(text,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.case_worker_ok(text,uuid)', 'EXECUTE') then
    raise exception '_verify: sessions can EXECUTE case_worker_ok — they could probe other accounts'' access to a case (re-run 20261025_31)';
  end if;
  if has_table_privilege('anon', 'public.dashboard_notes', 'SELECT')
     or has_column_privilege('authenticated', 'public.dashboard_notes', 'author_user_id', 'UPDATE') then
    raise exception '_verify: dashboard_notes privileges are open (anon SELECT or author_user_id UPDATE) (re-run 20261025_31)';
  end if;
  raise notice '_verify: 20261025_31 OK — dashboard_notes RLS with the case-worker and scope rule on every write; case_worker_ok service-only';
end $$;
-- <<< verify:dashboard_notes

-- >>> verify:legal_ledger
-- 2026-10-25 — 20261025_33_legal_ledger.sql (P4 N3.7). Read-only, safe to
-- repeat. Before _33 runs it only reports; after, it raises when the register
-- lost its RLS, its case/firm scope rule, its column locks, or gained a
-- session DELETE.
do $$
declare bad text; n int; col text;
begin
  if to_regclass('public.legal_ledger_entries') is null then
    raise notice '_verify: 20261025_33 is not applied yet — the outgoing/incoming register cannot save; run 14_BEFORE_DEPLOY_20261025_33_legal_ledger.sql';
    return;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.legal_ledger_entries'::regclass) then
    raise exception '_verify: RLS is off on public.legal_ledger_entries (re-run 20261025_33)';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.legal_ledger_entries'::regclass;
  if n <> 3 then
    raise exception '_verify: public.legal_ledger_entries carries % policies, expected 3 (re-run 20261025_33)', n;
  end if;
  select string_agg(policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public' and tablename = 'legal_ledger_entries' and cmd in ('INSERT', 'UPDATE')
     and coalesce(with_check, '') not like '%case_row_scope_ok%';
  if bad is not null then
    raise exception '_verify: ledger write policies without case_row_scope_ok: % — an entry could be planted into another firm or case (re-run 20261025_33)', bad;
  end if;
  if has_table_privilege('authenticated', 'public.legal_ledger_entries', 'DELETE')
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'legal_ledger_entries' and cmd in ('DELETE', 'ALL')) then
    raise exception '_verify: sessions can DELETE ledger entries — owner directive 5 says archive only (re-run 20261025_33)';
  end if;
  foreach col in array array['case_request_id', 'firm_id', 'created_by'] loop
    if has_column_privilege('authenticated', 'public.legal_ledger_entries', col, 'UPDATE') then
      raise exception '_verify: authenticated can UPDATE legal_ledger_entries.% — an entry could be moved (re-run 20261025_33)', col;
    end if;
  end loop;
  if has_table_privilege('anon', 'public.legal_ledger_entries', 'SELECT') then
    raise exception '_verify: anon can read the ledger (re-run 20261025_33)';
  end if;
  raise notice '_verify: 20261025_33 OK — legal_ledger_entries: RLS with case_row_scope_ok on every write, case/firm/writer locked, archive only, no guest read';
end $$;
-- <<< verify:legal_ledger

-- >>> verify:case_tracking_links
-- 2026-10-25 — 20261025_32_case_tracking_links.sql (P4 N3.6). Read-only,
-- safe to repeat. Before _32 runs it only reports; after, it raises when the
-- links table lost its RLS or its scope rule, exposes the token hash or lets
-- sessions un-revoke / delete, or when the public snapshot is open to sessions.
do $$
declare n int; r text;
begin
  if to_regclass('public.case_tracking_links') is null then
    raise notice '_verify: 20261025_32 is not applied yet — the client tracking link cannot be created; run 13_BEFORE_DEPLOY_20261025_32_case_tracking_links.sql';
    return;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.case_tracking_links'::regclass) then
    raise exception '_verify: RLS is off on public.case_tracking_links (re-run 20261025_32)';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.case_tracking_links'::regclass;
  if n <> 3 then
    raise exception '_verify: public.case_tracking_links carries % policies, expected 3 (re-run 20261025_32)', n;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'case_tracking_links'
                   and cmd = 'INSERT' and with_check like '%case_row_scope_ok%') then
    raise exception '_verify: the tracking-link INSERT policy lacks case_row_scope_ok — a link could be made on someone else''s case (re-run 20261025_32)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'case_tracking_links'
                   and cmd = 'UPDATE' and with_check ilike '%revoked_at IS NOT NULL%') then
    raise exception '_verify: a revoked tracking link could be brought back (re-run 20261025_32)';
  end if;
  if has_column_privilege('authenticated', 'public.case_tracking_links', 'token_hash', 'SELECT')
     or has_column_privilege('authenticated', 'public.case_tracking_links', 'last_viewed_at', 'UPDATE')
     or has_table_privilege('authenticated', 'public.case_tracking_links', 'DELETE')
     or has_table_privilege('anon', 'public.case_tracking_links', 'SELECT') then
    raise exception '_verify: case_tracking_links privileges are open (hash read, view stamp, delete or guest read) (re-run 20261025_32)';
  end if;
  if to_regprocedure('public.case_tracking_snapshot(text)') is null then
    raise exception '_verify: public.case_tracking_snapshot(text) is missing — /track pages answer 404 (re-run 20261025_32)';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.case_tracking_snapshot(text)', 'EXECUTE') then
      raise exception '_verify: % can EXECUTE case_tracking_snapshot (re-run 20261025_32)', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.case_tracking_snapshot(text)', 'EXECUTE') then
    raise exception '_verify: service_role cannot EXECUTE case_tracking_snapshot — every /track page answers 404 (re-run 20261025_32)';
  end if;
  raise notice '_verify: 20261025_32 OK — case_tracking_links: hashed, scoped, revoke-only; case_tracking_snapshot service-only';
end $$;
-- <<< verify:case_tracking_links
