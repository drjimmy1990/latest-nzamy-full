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

SELECT 'anon DML grants on public.profiles (expect 0)' AS check,
       (SELECT count(*) FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'profiles'
           AND grantee = 'anon'
           AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) AS present;

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
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'profiles' AND grantee = 'anon'
     AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  IF n <> 0 THEN
    RAISE EXCEPTION '_verify: anon still holds % DML grant(s) on public.profiles — 20260921_01 was not applied', n;
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
    RAISE EXCEPTION '_verify: % write grant(s) for authenticated/anon survive on subscriptions/credit_transactions — 20260921_02 was not applied', n;
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
