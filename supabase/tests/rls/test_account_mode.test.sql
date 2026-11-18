-- test_account_mode.test.sql — proves 20261127_80 (batch l7, decision 3): ONE
-- test-account mode for profiles.is_demo and the public.test_accounts list
-- (staff excluded): test-mode payments only (tagged), the sandbox and the
-- open-request refusal, the caps 5 cases / 5 consultations, the «تجريبي» tag
-- on rows, and the tag of existing rows when an account joins the list.
-- Every refusal is proved as service_role (BYPASSRLS): triggers hold them.
--
-- CHAIN (run.sh, postgres:16) — the chain of demo_accounts.test.sql without
-- its test, then 20261017_44 and 20261127_80 TWICE (idempotent). From the
-- repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261022_10_payments_core.sql \
--     $T/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261101_10_founder_membership.sql \
--     $T/prelude_founder_membership_between_runs.sql \
--     $M/20261101_10_founder_membership.sql \
--     $M/20261107_60_founder_rejoinder_410.sql \
--     $M/20261122_10_founder_campaign_nov18.sql \
--     $T/prelude_founder_l2_before.sql \
--     $M/20261124_10_founder_hold_15min_and_library_points.sql \
--     $T/prelude_demo_accounts_tables.sql \
--     $M/20261125_50_demo_accounts.sql \
--     $M/20261017_44_test_accounts_never_listed.sql \
--     $M/20261127_80_test_account_mode.sql \
--     $M/20261127_80_test_account_mode.sql \
--     $T/test_account_mode.test.sql
--
-- NEGATIVE CONTROL / RED (must FAIL) — the same chain without the two
-- 20261127_80 files → "T0 FAIL: is_test_account is missing".
\set ON_ERROR_STOP on

create function pg_temp.expect(p_sql text, p_token text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_token then
      return;
    end if;
    raise exception '% FAIL: expected %, got % (%)', p_label, p_token, sqlerrm, sqlstate;
  end;
  raise exception '% FAIL: expected %, the statement succeeded', p_label, p_token;
end $$;

-- T0 applied, once
do $$
begin
  if to_regprocedure('public.is_test_account(uuid)') is null then
    raise exception 'T0 FAIL: is_test_account is missing';
  end if;
  if (select count(*) from pg_catalog.pg_trigger where tgname = 'trg_demo_guard' and not tgisinternal) <> 12 then
    raise exception 'T0 FAIL: % trg_demo_guard triggers, expected 12',
      (select count(*) from pg_catalog.pg_trigger where tgname = 'trg_demo_guard' and not tgisinternal);
  end if;
  if has_function_privilege('authenticated', 'public.is_test_account(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.is_test_account(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.test_account_stamp_rows(uuid)', 'EXECUTE') then
    raise exception 'T0 FAIL: privileges';
  end if;
  raise notice 'T0 PASS: is_test_account + 12 guard triggers (no duplicate on re-run), service role only';
end $$;

-- actors: A admin (listed), L test-listed lawyer, C test-listed client,
-- D demo client (is_demo), R1 real lawyer, R2 real client, R3 real lawyer listed later
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000a001'), ('00000000-0000-0000-0000-00000000a002'),
  ('00000000-0000-0000-0000-00000000a003'), ('00000000-0000-0000-0000-00000000a004'),
  ('00000000-0000-0000-0000-00000000a005'), ('00000000-0000-0000-0000-00000000a006'),
  ('00000000-0000-0000-0000-00000000a007');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000a001', 'admin',  'مسؤول'),
  ('00000000-0000-0000-0000-00000000a002', 'lawyer', 'محامٍ اختبار'),
  ('00000000-0000-0000-0000-00000000a003', 'client', 'عميل اختبار'),
  ('00000000-0000-0000-0000-00000000a004', 'client', 'عميل تجريبي'),
  ('00000000-0000-0000-0000-00000000a005', 'lawyer', 'محامٍ'),
  ('00000000-0000-0000-0000-00000000a006', 'client', 'عميل'),
  ('00000000-0000-0000-0000-00000000a007', 'lawyer', 'محامٍ ثالث');
insert into public.lawyer_profiles (user_id, verification_status, practice_kind, marketplace_visible) values
  ('00000000-0000-0000-0000-00000000a002', 'verified', 'advocate', false),
  ('00000000-0000-0000-0000-00000000a005', 'verified', 'advocate', true),
  ('00000000-0000-0000-0000-00000000a007', 'verified', 'advocate', true);
insert into public.test_accounts (user_id, source) values
  ('00000000-0000-0000-0000-00000000a001', 'seed-clean-test-accounts'),
  ('00000000-0000-0000-0000-00000000a002', 'manual'),
  ('00000000-0000-0000-0000-00000000a003', 'manual');
update public.profiles set is_demo = true where id = '00000000-0000-0000-0000-00000000a004';
-- R3's own case BEFORE R3 is listed (T6 tags it)
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
  values ('r3-own', '00000000-0000-0000-0000-00000000a007', 'قضية', '00000000-0000-0000-0000-00000000a007', 'assigned', 'lawyer');

-- T1 the predicate
do $$
begin
  if public.is_test_account('00000000-0000-0000-0000-00000000a001') then
    raise exception 'T1 FAIL: a listed admin is a test account (staff must never be sandboxed)';
  end if;
  if not public.is_test_account('00000000-0000-0000-0000-00000000a002')
     or not public.is_test_account('00000000-0000-0000-0000-00000000a003')
     or not public.is_test_account('00000000-0000-0000-0000-00000000a004') then
    raise exception 'T1 FAIL: a listed account or a demo account is not a test account';
  end if;
  if public.is_test_account('00000000-0000-0000-0000-00000000a005') or public.is_test_account(null) then
    raise exception 'T1 FAIL: a real account (or null) is a test account';
  end if;
  raise notice 'T1 PASS: is_demo + listed (not admin) = test account; real and null are not';
end $$;

-- T2 money: test mode only, tagged; everyone else untouched
set role service_role;
select pg_temp.expect($q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status)
                         values ('00000000-0000-0000-0000-00000000a003', 'topup', 'points-100', 'once', 100, 15, 115, 'exclusive', 'created')$q$,
                      'demo_account:live_payment', 'T2 listed client, no mode');
select pg_temp.expect($q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
                         values ('00000000-0000-0000-0000-00000000a002', 'topup', 'points-100', 'once', 100, 15, 115, 'exclusive', 'created', '{"gateway_mode":"live"}')$q$,
                      'demo_account:live_payment', 'T2 listed lawyer, live mode');
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a002', 'topup', 'points-100', 'once', 100, 15, 115, 'exclusive', 'created', '{"gateway_mode":"test"}'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a004', 'topup', 'points-100', 'once', 100, 15, 115, 'exclusive', 'created', '{"gateway_mode":"test"}'),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000a006', 'topup', 'points-100', 'once', 100, 15, 115, 'exclusive', 'created', '{}'),
  ('00000000-0000-0000-0000-00000000b004', '00000000-0000-0000-0000-00000000a001', 'topup', 'points-100', 'once', 100, 15, 115, 'exclusive', 'created', '{"gateway_mode":"live"}');
reset role;
do $$
begin
  if (select count(*) from public.payment_orders
       where id in ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b002')
         and metadata ->> 'test_account' = 'true') <> 2 then
    raise exception 'T2 FAIL: a test-mode order of a test account is not tagged';
  end if;
  if exists (select 1 from public.payment_orders
              where id in ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000b004')
                and metadata ? 'test_account') then
    raise exception 'T2 FAIL: a real account''s / the admin''s order was tagged';
  end if;
  raise notice 'T2 PASS: a test account pays in TEST mode only (tagged), a demo account too; real buyers and staff untouched';
end $$;

-- T3 sandbox + open requests (service role)
set role service_role;
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('c-real', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a005', 'assigned', 'lawyer')$q$,
                      'demo_account:sandbox', 'T3 listed client → real lawyer');
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('c-open', '00000000-0000-0000-0000-00000000a003', 'x', null, 'pending_assignment', 'lawyer')$q$,
                      'demo_account:open_request', 'T3 listed client open request');
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('c-open2', '00000000-0000-0000-0000-00000000a003', 'x', null, 'pending', 'lawyer')$q$,
                      'demo_account:open_request', 'T3 listed client open request (pending)');
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
  values ('c-1', '00000000-0000-0000-0000-00000000a003', 'قضية ١', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer');
-- a real intake request is untouched
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
  values ('r-open', '00000000-0000-0000-0000-00000000a006', 'طلب', null, 'pending_assignment', 'lawyer');
select pg_temp.expect($q$update public.service_requests set assigned_to = '00000000-0000-0000-0000-00000000a002' where id = 'r-open'$q$,
                      'demo_account:sandbox', 'T3 test lawyer claims a real request');
reset role;
do $$
begin
  if (select metadata ->> 'test_account' from public.service_requests where id = 'c-1') is distinct from 'true' then
    raise exception 'T3 FAIL: the test case is not tagged';
  end if;
  if (select metadata ? 'test_account' from public.service_requests where id = 'r-open') then
    raise exception 'T3 FAIL: a real request was tagged';
  end if;
  raise notice 'T3 PASS: sandbox both ways, no open request, test rows tagged, real rows untouched';
end $$;

-- T4 the tag survives a metadata overwrite (an app UPDATE that replaces the object)
update public.service_requests set metadata = '{"note":"x"}'::jsonb where id = 'c-1';
do $$
begin
  if (select metadata from public.service_requests where id = 'c-1') <> '{"note":"x","test_account":true}'::jsonb then
    raise exception 'T4 FAIL: the tag was lost on an overwrite: %', (select metadata from public.service_requests where id = 'c-1');
  end if;
  raise notice 'T4 PASS: a metadata overwrite keeps the tag and the new keys';
end $$;

-- T5 caps: 5 cases, 5 consultations (all rows, any status)
set role service_role;
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver) values
  ('c-2', '00000000-0000-0000-0000-00000000a003', 'قضية ٢', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer'),
  ('c-3', '00000000-0000-0000-0000-00000000a003', 'قضية ٣', '00000000-0000-0000-0000-00000000a002', 'cancelled', 'lawyer'),
  ('c-4', '00000000-0000-0000-0000-00000000a003', 'قضية ٤', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer'),
  ('c-5', '00000000-0000-0000-0000-00000000a003', 'قضية ٥', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer');
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('c-6', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer')$q$,
                      'demo_account:limit:cases', 'T5 sixth case');
-- consultations of the test lawyer (either side counts): 5 then refused
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver) values
  ('k-1', '00000000-0000-0000-0000-00000000a002', 'k', '00000000-0000-0000-0000-00000000a002', 'assigned', 'ai_workspace'),
  ('k-2', '00000000-0000-0000-0000-00000000a002', 'k', '00000000-0000-0000-0000-00000000a002', 'assigned', 'ai_workspace'),
  ('k-3', '00000000-0000-0000-0000-00000000a002', 'k', '00000000-0000-0000-0000-00000000a002', 'assigned', 'ai_workspace'),
  ('k-4', '00000000-0000-0000-0000-00000000a002', 'k', '00000000-0000-0000-0000-00000000a002', 'assigned', 'ai_workspace'),
  ('k-5', '00000000-0000-0000-0000-00000000a002', 'k', '00000000-0000-0000-0000-00000000a002', 'assigned', 'ai_workspace'),
  ('k-6', '00000000-0000-0000-0000-00000000a002', 'k', '00000000-0000-0000-0000-00000000a002', 'assigned', 'ai_workspace');
insert into public.consultations (id, request_id, requester_user_id, lawyer_user_id, status) values
  ('q-1', 'k-1', '00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a002', 'requested'),
  ('q-2', 'k-2', '00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a002', 'requested'),
  ('q-3', 'k-3', null, '00000000-0000-0000-0000-00000000a002', 'requested'),
  ('q-4', 'k-4', null, '00000000-0000-0000-0000-00000000a002', 'requested'),
  ('q-5', 'k-5', null, '00000000-0000-0000-0000-00000000a002', 'requested');
select pg_temp.expect($q$insert into public.consultations (id, request_id, requester_user_id, lawyer_user_id, status)
                         values ('q-6', 'k-6', null, '00000000-0000-0000-0000-00000000a002', 'requested')$q$,
                      'demo_account:limit:consultations', 'T5 sixth consultation');
reset role;
do $$
begin
  if (select count(*) from public.consultations where metadata ->> 'test_account' = 'true') <> 5 then
    raise exception 'T5 FAIL: the test consultations are not all tagged';
  end if;
  raise notice 'T5 PASS: 5 cases / 5 consultations, the 6th refused; consultations tagged';
end $$;

-- T6 a real account joins the list: its existing rows are tagged; staff never
insert into public.test_accounts (user_id, source) values ('00000000-0000-0000-0000-00000000a007', 'manual');
do $$
begin
  if (select metadata ->> 'test_account' from public.service_requests where id = 'r3-own') is distinct from 'true' then
    raise exception 'T6 FAIL: joining test_accounts did not tag the existing case';
  end if;
  if public.test_account_stamp_rows('00000000-0000-0000-0000-00000000a001') <> 0 then
    raise exception 'T6 FAIL: the admin''s rows were tagged';
  end if;
  raise notice 'T6 PASS: joining the list tags existing rows; staff are never tagged';
end $$;

-- T7 a session (authenticated) is held too, and cannot call the helpers
select set_config('test.uid', '00000000-0000-0000-0000-00000000a003', false);
set role authenticated;
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('c-sess', '00000000-0000-0000-0000-00000000a003', 'x', null, 'pending_assignment', 'lawyer')$q$,
                      'demo_account:open_request', 'T7 session open request');
do $$
begin
  begin
    perform public.is_test_account('00000000-0000-0000-0000-00000000a003');
    raise exception 'T7 FAIL: a session ran is_test_account';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
do $$ begin raise notice 'T7 PASS: a session is held by the same triggers and cannot read the predicate'; end $$;

do $$ begin raise notice 'ALL PASS: test_account_mode'; end $$;
