-- test_account_unified_script.test.sql — proves the operator script
-- scripts/sql/2026-11-24_test_account_unified.sql (batch l14-legacyA, old
-- item 05-10: the one «test» account is «everything open» = kind 'unified').
--
-- CHAIN (run.sh, postgres:16): the chain of access_lockout_test_kinds.test.sql
-- without its test, then the script ONCE as a chain step with no -v email (it
-- must print its usage and change nothing). That step is /tmp/mig32.sql, which
-- this file then runs three times with an e-mail. From the repo root, Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql $M/20261021_50_founder_campaign.sql \
--     $M/20261026_01_founder_no_signup_grant.sql $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261022_10_payments_core.sql $T/prelude_points_lots_fixture.sql $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql $M/20261027_10_ai_runs.sql $M/20261030_65_library_grant_admin.sql \
--     $M/20261101_10_founder_membership.sql $T/prelude_founder_membership_between_runs.sql \
--     $M/20261101_10_founder_membership.sql $M/20261107_60_founder_rejoinder_410.sql \
--     $M/20261122_10_founder_campaign_nov18.sql $T/prelude_founder_l2_before.sql \
--     $M/20261124_10_founder_hold_15min_and_library_points.sql $T/prelude_demo_accounts_tables.sql \
--     $M/20261125_50_demo_accounts.sql $M/20261017_44_test_accounts_never_listed.sql \
--     $M/20261127_80_test_account_mode.sql $T/prelude_storage_objects_stub.sql \
--     $T/prelude_test_infra_before.sql $M/20261129_90_test_infra.sql \
--     $M/20261202_20_access_login_lockout_test_kinds.sql \
--     scripts/sql/2026-11-24_test_account_unified.sql \
--     $T/test_account_unified_script.test.sql
--
-- Actors (prelude_test_infra_before.sql): a002 test lawyer (listed, legacy),
-- a004 demo client (is_demo, no row), a005 real lawyer (neither).
--
-- NEGATIVE CONTROL (must FAIL, verified): the same chain with the script step
-- replaced by a second 20261202_20 (so /tmp/mig32.sql is not the script) →
-- "U1 FAIL: the listed test account is not unified". Run twice: both pass.
\set ON_ERROR_STOP on

-- U0: the no-e-mail chain step changed nothing
do $$
begin
  if exists (select 1 from public.test_accounts where kind <> 'legacy') then
    raise exception 'U0 FAIL: the script changed a row without -v email';
  end if;
  raise notice 'U0 PASS: without an e-mail nothing changed';
end $$;

-- U1: a listed test account becomes unified (and re-running keeps it so)
\set email '''QA.Lawyer@team.example.sa'''
\i /tmp/mig32.sql
\i /tmp/mig32.sql
do $$
begin
  if public.test_account_kind('00000000-0000-0000-0000-00000000a002') <> 'unified' then
    raise exception 'U1 FAIL: the listed test account is not unified';
  end if;
  if (select count(*) from public.test_accounts where kind = 'unified') <> 1 then
    raise exception 'U1 FAIL: more than one row changed';
  end if;
  raise notice 'U1 PASS: listed test account → unified, idempotent';
end $$;

-- U2: a demo-flagged account with no row gets one, unified
\set email '''demo.client@team.example.sa'''
\i /tmp/mig32.sql
do $$
begin
  if public.test_account_kind('00000000-0000-0000-0000-00000000a004') <> 'unified' then
    raise exception 'U2 FAIL: the demo account is not unified';
  end if;
  raise notice 'U2 PASS: demo account → unified row';
end $$;

-- U3: a real account is left alone (no row: it is not capped, and a row would sandbox it)
\set email '''real.lawyer@firm.example.sa'''
\i /tmp/mig32.sql
do $$
begin
  if exists (select 1 from public.test_accounts where user_id = '00000000-0000-0000-0000-00000000a005') then
    raise exception 'U3 FAIL: a real account was made a test account';
  end if;
  if public.is_test_account('00000000-0000-0000-0000-00000000a005') then
    raise exception 'U3 FAIL: the real account is a test account';
  end if;
  raise notice 'U3 PASS: real account untouched';
end $$;
