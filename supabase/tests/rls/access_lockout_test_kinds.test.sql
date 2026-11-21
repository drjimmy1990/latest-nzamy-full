-- access_lockout_test_kinds.test.sql — proves 20261202_20 (batch l12-access):
--   A. the per-account sign-in lockout (route counter + GoTrue hook), its
--      setting, its privileges, and that it never says whether an account
--      exists;
--   B. test account kinds (owner ١٠٩): legacy = as before (capped, mail sunk),
--      unified = no cap, standalone = no cap + its own real mail delivered.
--
-- CHAIN (run.sh, postgres:16) — the chain of test_infra.test.sql without its
-- test, then 20261202_20 TWICE (idempotent). From the repo root, in Git Bash:
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
--     $M/20261202_20_access_login_lockout_test_kinds.sql $M/20261202_20_access_login_lockout_test_kinds.sql \
--     $T/access_lockout_test_kinds.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain WITHOUT the two 20261202_20
-- files → "L0 FAIL: …".
\set ON_ERROR_STOP on

create function pg_temp.expect(p_sql text, p_token text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_token or sqlerrm like p_token then
      return;
    end if;
    raise exception '% FAIL: expected %, got % (%)', p_label, p_token, sqlerrm, sqlstate;
  end;
  raise exception '% FAIL: expected %, the statement succeeded', p_label, p_token;
end $$;

-- L0 applied
do $$
begin
  if to_regprocedure('public.auth_login_record(text, text, text, boolean)') is null
     or to_regprocedure('public.hook_password_verification_attempt(jsonb)') is null
     or to_regprocedure('public.test_account_kind(uuid)') is null then
    raise exception 'L0 FAIL: 20261202_20 has not run';
  end if;
  raise notice 'L0 PASS: applied';
end $$;

alter table auth.users add column if not exists phone text;
update auth.users set phone = '966500000005' where id = '00000000-0000-0000-0000-00000000a005';

-- L1 privileges: anon / authenticated reach nothing; service_role the three route functions
do $$
begin
  if has_table_privilege('anon', 'public.auth_login_attempts', 'SELECT')
     or has_table_privilege('authenticated', 'public.auth_login_locks', 'SELECT')
     or has_function_privilege('anon', 'public.auth_login_record(text, text, text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.auth_login_lock_status(text, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.auth_login_claim_notice(text, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.hook_password_verification_attempt(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.auth_login_fail(text, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.test_account_kind(uuid)', 'EXECUTE') then
    raise exception 'L1 FAIL: a session role reaches the lockout';
  end if;
  if not has_function_privilege('service_role', 'public.auth_login_record(text, text, text, boolean)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.auth_login_claim_notice(text, text, text)', 'EXECUTE') then
    raise exception 'L1 FAIL: service_role cannot run the route functions';
  end if;
  raise notice 'L1 PASS: service role only';
end $$;
set role authenticated;
select pg_temp.expect($q$select public.auth_login_record('i:0123456789abcdef', 'x@y.z', null, false)$q$, 'permission denied%', 'L1 authenticated call');
reset role;

-- L2 five wrong passwords on a real account's e-mail: 4 open, the 5th locks; one e-mail, once
set role service_role;
do $$
declare j jsonb; i int; k text := 'i:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
begin
  for i in 1..4 loop
    j := public.auth_login_record(k, 'Real.Lawyer@Firm.Example.SA', null, false);
    if (j ->> 'locked')::boolean then raise exception 'L2 FAIL: locked after % failures', i; end if;
  end loop;
  if (public.auth_login_lock_status(k, 'real.lawyer@firm.example.sa', null) ->> 'locked')::boolean then
    raise exception 'L2 FAIL: locked before the 5th';
  end if;
  j := public.auth_login_record(k, 'real.lawyer@firm.example.sa', null, false);
  if not (j ->> 'just_locked')::boolean then raise exception 'L2 FAIL: the 5th did not lock: %', j; end if;
  if not (public.auth_login_lock_status(k, 'real.lawyer@firm.example.sa', null) ->> 'locked')::boolean then
    raise exception 'L2 FAIL: status not locked';
  end if;
  -- a 6th failure while locked is not counted as a new lock
  j := public.auth_login_record(k, 'real.lawyer@firm.example.sa', null, false);
  if (j ->> 'just_locked')::boolean then raise exception 'L2 FAIL: re-locked while locked'; end if;
  if public.auth_login_claim_notice(k, 'real.lawyer@firm.example.sa', null) is distinct from 'real.lawyer@firm.example.sa' then
    raise exception 'L2 FAIL: the notice e-mail was not handed out';
  end if;
  if public.auth_login_claim_notice(k, 'real.lawyer@firm.example.sa', null) is not null then
    raise exception 'L2 FAIL: the notice was handed out twice';
  end if;
  -- the same account by its mobile is locked too (the identifier differs, the
  -- user key does not — but only once the hook key exists; here the identifier key decides)
  raise notice 'L2 PASS: 5 failures lock, one notice';
end $$;

-- L3 an unknown identifier locks the same way (nothing says it has no account) and gets no e-mail
do $$
declare j jsonb; i int; k text := 'i:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
begin
  for i in 1..5 loop j := public.auth_login_record(k, 'nobody@nowhere.example.sa', null, false); end loop;
  if not (j ->> 'just_locked')::boolean then raise exception 'L3 FAIL: an unknown identifier did not lock'; end if;
  if public.auth_login_claim_notice(k, 'nobody@nowhere.example.sa', null) is not null then
    raise exception 'L3 FAIL: a notice for an account that does not exist';
  end if;
  raise notice 'L3 PASS: unknown identifiers lock alike, no e-mail';
end $$;

-- L4 a success clears the counter; attempts outside the window do not count; the setting is honoured
do $$
declare j jsonb; i int; k text := 'i:cccccccccccccccccccccccccccccccccccccccc';
begin
  for i in 1..4 loop j := public.auth_login_record(k, 'real.client@mail.example.sa', null, false); end loop;
  j := public.auth_login_record(k, 'real.client@mail.example.sa', null, true);
  j := public.auth_login_record(k, 'real.client@mail.example.sa', null, false);
  if (j ->> 'locked')::boolean or (j ->> 'failures')::int <> 1 then raise exception 'L4 FAIL: a success did not reset: %', j; end if;
  -- four old failures (outside the 15-minute window) + one now = 1 in the window
  insert into public.auth_login_attempts (key_hash, source, at)
  select 'i:dddddddddddddddddddddddddddddddddddddddd', 'route', now() - interval '20 minutes' from generate_series(1, 4);
  j := public.auth_login_record('i:dddddddddddddddddddddddddddddddddddddddd', null, null, false);
  if (j ->> 'failures')::int <> 1 then raise exception 'L4 FAIL: old attempts counted: %', j; end if;
  raise notice 'L4 PASS: reset on success, window respected';
end $$;
reset role;
update public.platform_settings set value = '{"max_failures": 2, "window_minutes": 15, "lock_minutes": 1}'::jsonb where key = 'auth_login_lockout';
set role service_role;
do $$
declare j jsonb; k text := 'i:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
begin
  j := public.auth_login_record(k, null, null, false);
  j := public.auth_login_record(k, null, null, false);
  if not (j ->> 'just_locked')::boolean then raise exception 'L4 FAIL: max_failures = 2 not honoured'; end if;
  if (j ->> 'locked_until')::timestamptz > now() + interval '2 minutes' then raise exception 'L4 FAIL: lock_minutes = 1 not honoured'; end if;
  raise notice 'L4 PASS: the admin setting is honoured';
end $$;
reset role;
-- a bad setting reads as 5 / 15 / 15
update public.platform_settings set value = '{"max_failures": "lots", "window_minutes": -3, "lock_minutes": 99999}'::jsonb where key = 'auth_login_lockout';
do $$
declare c record;
begin
  select * into c from public.auth_login_lockout_config();
  if (c.max_failures, c.window_minutes, c.lock_minutes) is distinct from (5, 15, 15) then
    raise exception 'L4 FAIL: a bad setting was not ignored: %', c;
  end if;
end $$;
update public.platform_settings set value = '{"max_failures": 5, "window_minutes": 15, "lock_minutes": 15}'::jsonb where key = 'auth_login_lockout';

-- L5 the GoTrue hook: 5 wrong → the 6th (even the right password) is rejected; the route sees the lock by e-mail
do $$
declare j jsonb; i int;
begin
  for i in 1..5 loop
    j := public.hook_password_verification_attempt('{"user_id":"00000000-0000-0000-0000-00000000a006","valid":false}'::jsonb);
    if j ->> 'decision' <> 'continue' then raise exception 'L5 FAIL: a wrong password was rejected by the hook itself'; end if;
  end loop;
  j := public.hook_password_verification_attempt('{"user_id":"00000000-0000-0000-0000-00000000a006","valid":true}'::jsonb);
  if j ->> 'decision' <> 'reject' or coalesce(j ->> 'message', '') = '' then raise exception 'L5 FAIL: the locked account was let in: %', j; end if;
  if not (public.auth_login_lock_status('i:ffffffffffffffffffffffffffffffffffffffff', 'real.client@mail.example.sa', null) ->> 'locked')::boolean then
    raise exception 'L5 FAIL: the route does not see the hook lock';
  end if;
  -- a different account is untouched; a malformed event never blocks
  j := public.hook_password_verification_attempt('{"user_id":"00000000-0000-0000-0000-00000000a005","valid":true}'::jsonb);
  if j ->> 'decision' <> 'continue' then raise exception 'L5 FAIL: another account was blocked'; end if;
  j := public.hook_password_verification_attempt('{"user_id":"not-a-uuid","valid":false}'::jsonb);
  if j ->> 'decision' <> 'continue' then raise exception 'L5 FAIL: a malformed event blocked'; end if;
  -- the mobile resolves the account too (GoTrue stores it without '+')
  for i in 1..5 loop
    j := public.hook_password_verification_attempt('{"user_id":"00000000-0000-0000-0000-00000000a005","valid":false}'::jsonb);
  end loop;
  if not (public.auth_login_lock_status('i:9999999999999999999999999999999999999999', null, '+966500000005') ->> 'locked')::boolean then
    raise exception 'L5 FAIL: the hook lock is not seen through the mobile';
  end if;
  if (public.auth_login_lock_status('i:9999999999999999999999999999999999999999', null, '+966500000099') ->> 'locked')::boolean then
    raise exception 'L5 FAIL: another mobile is locked';
  end if;
  raise notice 'L5 PASS: the hook locks and the route sees it';
end $$;

-- ── B. test account kinds ──────────────────────────────────────────────────
-- B1 every existing row is legacy; the column refuses an unknown kind
do $$
begin
  if exists (select 1 from public.test_accounts where kind <> 'legacy') then
    raise exception 'B1 FAIL: an existing row is not legacy';
  end if;
end $$;
select pg_temp.expect($q$update public.test_accounts set kind = 'vip' where user_id = '00000000-0000-0000-0000-00000000a003'$q$,
                      '%test_accounts_kind_check%', 'B1 unknown kind');

-- B2 legacy (negative control): still capped at 5 cases
set role service_role;
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver) values
  ('kc-1', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer'),
  ('kc-2', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer'),
  ('kc-3', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer'),
  ('kc-4', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer');
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('kc-6', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer')$q$,
                      'demo_account:limit:cases', 'B2 legacy sixth case');
reset role;

-- B3 the same account as unified: no cap (the 6th and 7th go in, still tagged «تجريبي», still sandboxed)
update public.test_accounts set kind = 'unified' where user_id = '00000000-0000-0000-0000-00000000a003';
set role service_role;
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver) values
  ('kc-6', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer'),
  ('kc-7', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a002', 'assigned', 'lawyer');
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('kc-8', '00000000-0000-0000-0000-00000000a003', 'x', '00000000-0000-0000-0000-00000000a005', 'assigned', 'lawyer')$q$,
                      'demo_account:sandbox', 'B3 unified still sandboxed');
reset role;
do $$
begin
  if (select metadata ->> 'test_account' from public.service_requests where id = 'kc-7') is distinct from 'true' then
    raise exception 'B3 FAIL: the unified row is not tagged';
  end if;
  raise notice 'B2/B3 PASS: legacy capped, unified uncapped, both sandboxed and tagged';
end $$;

-- B4 the mail sink by kind
set role service_role;
do $$
declare j jsonb;
begin
  -- legacy (a002) still sunk
  j := public.test_mail_sink_check('qa.lawyer@team.example.sa', array['00000000-0000-0000-0000-00000000a002']::uuid[], 'رمز', 'نص', 'otp');
  if not (j ->> 'sink')::boolean then raise exception 'B4 FAIL: legacy mail was sent'; end if;
  -- unified (a003) still sunk
  j := public.test_mail_sink_check('qa.client@team.example.sa', array['00000000-0000-0000-0000-00000000a003']::uuid[], 'رمز', 'نص', 'otp');
  if not (j ->> 'sink')::boolean then raise exception 'B4 FAIL: unified mail was sent'; end if;
end $$;
reset role;
update public.test_accounts set kind = 'standalone' where user_id = '00000000-0000-0000-0000-00000000a002';
set role service_role;
do $$
declare j jsonb;
begin
  -- standalone: its OWN address (caused by itself) is really sent
  j := public.test_mail_sink_check('QA.Lawyer@team.example.sa', array['00000000-0000-0000-0000-00000000a002']::uuid[], 'رمز', 'نص', 'otp');
  if (j ->> 'sink')::boolean then raise exception 'B4 FAIL: standalone own mail was sunk: %', j; end if;
  -- standalone causing mail to a real person: still sunk
  j := public.test_mail_sink_check('real.client@mail.example.sa', array['00000000-0000-0000-0000-00000000a002']::uuid[], 'فاتورة', 'نص', 'invoice');
  if not (j ->> 'sink')::boolean then raise exception 'B4 FAIL: standalone mail to a real person was sent'; end if;
  -- a reserved domain is always sunk
  j := public.test_mail_sink_check('anyone@persona.test', array['00000000-0000-0000-0000-00000000a002']::uuid[], 'x', 'y', null);
  if not (j ->> 'sink')::boolean then raise exception 'B4 FAIL: a reserved domain was sent'; end if;
  -- a real account's mail is never touched
  j := public.test_mail_sink_check('real.client@mail.example.sa', array['00000000-0000-0000-0000-00000000a006']::uuid[], 'x', 'y', null);
  if (j ->> 'sink')::boolean then raise exception 'B4 FAIL: real mail was sunk'; end if;
  raise notice 'B4 PASS: legacy/unified sunk, standalone own mail sent, others unchanged';
end $$;
-- standalone: no demo cap either
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
select 'ks-' || g, '00000000-0000-0000-0000-00000000a002', 'x', '00000000-0000-0000-0000-00000000a003', 'assigned', 'lawyer'
  from generate_series(1, 7) g;
reset role;

do $$ begin raise notice 'access_lockout_test_kinds: ALL PASS'; end $$;
