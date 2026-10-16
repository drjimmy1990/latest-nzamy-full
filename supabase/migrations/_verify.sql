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

SELECT 'platform_settings.payments_gateway status (expect disabled or live, never test/stub)' AS check,
       coalesce((SELECT value->>'status' FROM public.platform_settings
                  WHERE key = 'payments_gateway'), '(row missing)') AS present;

SELECT 'is_active_firm_member overloads taking p_firm_id (expect 0)' AS check,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'is_active_firm_member'
           AND pg_get_function_arguments(p.oid) ILIKE '%p_firm_id%') AS present;

DO $$
DECLARE
  v_status   text;
  v_provider text;
  n          int;
BEGIN
  -- _staging_only_20260916_enable_test_payment_gateway.sql flips the LIVE
  -- gateway to a stub with ON CONFLICT DO UPDATE, i.e. it overwrites whatever
  -- is there. Live value verified 2026-09-20: {"status":"disabled",
  -- "provider":null}. 'live' is the other legitimate value (20260628).
  SELECT value->>'status', value->>'provider' INTO v_status, v_provider
    FROM public.platform_settings WHERE key = 'payments_gateway';

  -- A stub gateway is LEGITIMATE on staging (20260628 documents `test`), so
  -- this is a hard stop only when the deploy declares itself production:
  --   PGOPTIONS="-c nzamy.env=production" psql … -f supabase/migrations/_verify.sql
  -- Everywhere else it is a loud WARNING in the deploy log, never a silent pass.
  IF v_status IN ('test', 'stub') THEN
    IF current_setting('nzamy.env', true) = 'production' THEN
      RAISE EXCEPTION '_verify: platform_settings.payments_gateway is status=% provider=% on PRODUCTION — _staging_only_20260916_enable_test_payment_gateway.sql was applied here, and every payment flow is now running against a stub',
        v_status, coalesce(v_provider, 'null');
    ELSE
      RAISE WARNING '_verify: platform_settings.payments_gateway is status=% provider=% — acceptable on staging only; it must read disabled/live before a production deploy (set nzamy.env=production to make this fatal)',
        v_status, coalesce(v_provider, 'null');
    END IF;
  END IF;

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
-- The column list here MUST match the migration's grant list.
SELECT '20261016_10 applied (lawyer_profiles column-locked for the API roles)' AS check,
       NOT has_table_privilege('anon', 'public.lawyer_profiles', 'SELECT') AS present;

DO $$
DECLARE
  public_cols text[] := ARRAY[
    'user_id', 'slug', 'specialties', 'years_experience', 'bio_ar', 'bio_en',
    'headline_ar', 'education', 'courts', 'languages', 'verification_status',
    'marketplace_visible', 'is_accepting_clients'];
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
      IF NOT (col = ANY (public_cols)) AND has_column_privilege(r, 'public.lawyer_profiles', col, 'SELECT') THEN
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
     AND NOT (att.attname::text = ANY (public_cols));
  IF leaks IS NOT NULL THEN
    missing := missing || format(' policies read a locked lawyer_profiles column, so every API-role query of their table fails with 42501: %s;', leaks);
  END IF;

  IF NOT has_table_privilege('service_role', 'public.lawyer_profiles', 'SELECT') THEN
    missing := missing || ' service_role cannot read lawyer_profiles (the directory and GET /api/v1/profile would fail);';
  END IF;

  IF missing <> '' THEN
    RAISE EXCEPTION '_verify: the lawyer_profiles column lock is broken —%', missing;
  END IF;

  RAISE NOTICE '_verify: 20261016_10 OK — anon/authenticated read the 13 public lawyer_profiles columns only; no policy reads a locked column';
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
