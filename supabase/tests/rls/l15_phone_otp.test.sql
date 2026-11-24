-- l15_phone_otp.test.sql — proves 20261205_10 (batch l15, WhatsApp sign-up code).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261205_10
-- runs TWICE. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_l15_phone_otp.sql \
--     $M/20261205_10_phone_otp.sql $M/20261205_10_phone_otp.sql \
--     $R/l15_phone_otp.test.sql
--   Expect from each migration run: «20261205_10 phone_otp verify: OK …».
-- NEGATIVE CONTROL (must FAIL): add $R/sabotage_l15_phone_otp_no_guard.sql
--   after the two migration lines → «P7 … and the trigger refuses it even after an
--   accidental grant FAIL: got ok, want refused:42501».
-- Synthetic fixtures only (no real numbers). Every assertion RAISES on failure.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;
-- Runs one statement as the current role: 'ok', or 'refused:' + SQLSTATE.
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return 'refused:' || sqlstate;
end $$;
create or replace function pg_temp.h(t text) returns text language sql as $$
  select encode(sha256(convert_to(t, 'UTF8')), 'hex')
$$;

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, created_at) values
  ('00000000-0000-0000-0000-0000000015a1', '2026-01-01 00:00+00');   -- old account
insert into public.profiles (id, user_type, display_name, phone) values
  ('00000000-0000-0000-0000-0000000015a1', 'individual', 'قديم', '+966500000101');

-- P1 the switch is off by default; nobody is held
select pg_temp.expect('P1 the setting row exists, off',
  (select value ->> 'enabled' from public.platform_settings where key = 'signup_phone_otp'), 'false');
select pg_temp.expect('P1 enabled_at is null while off',
  (select coalesce(value ->> 'enabled_at', 'null') from public.platform_settings where key = 'signup_phone_otp'), 'null');

-- P2 turning it on stamps enabled_at once; later writes never move it
update public.platform_settings set value = '{"enabled": true}' where key = 'signup_phone_otp';
create temp table t_since as
  select (value ->> 'enabled_at')::timestamptz as since from public.platform_settings where key = 'signup_phone_otp';
select pg_temp.expect('P2 enabled_at stamped on the first switch-on',
  ((select since from t_since) is not null)::text, 'true');
update public.platform_settings set value = '{"enabled": true, "enabled_at": "2000-01-01T00:00:00Z"}' where key = 'signup_phone_otp';
select pg_temp.expect('P2 a posted enabled_at is ignored',
  ((select (value ->> 'enabled_at')::timestamptz from public.platform_settings where key = 'signup_phone_otp') = (select since from t_since))::text, 'true');
update public.platform_settings set value = '{"enabled": false}' where key = 'signup_phone_otp';
select pg_temp.expect('P2 switching off keeps enabled_at',
  ((select (value ->> 'enabled_at')::timestamptz from public.platform_settings where key = 'signup_phone_otp') = (select since from t_since))::text, 'true');
select pg_temp.expect('P2 off → nobody held',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015a1') ->> 'reason'), 'off');
update public.platform_settings set value = '{"enabled": true}' where key = 'signup_phone_otp';
select pg_temp.expect('P2 on again keeps the first enabled_at',
  ((select (value ->> 'enabled_at')::timestamptz from public.platform_settings where key = 'signup_phone_otp') = (select since from t_since))::text, 'true');

-- accounts created after the switch-on
insert into auth.users (id, created_at) values
  ('00000000-0000-0000-0000-0000000015b1', now() + interval '1 second'),  -- new client
  ('00000000-0000-0000-0000-0000000015b2', now() + interval '1 second'),  -- new client 2
  ('00000000-0000-0000-0000-0000000015c1', now() + interval '1 second'),  -- admin
  ('00000000-0000-0000-0000-0000000015c2', now() + interval '1 second'),  -- platform_staff row
  ('00000000-0000-0000-0000-0000000015d1', now() + interval '1 second'),  -- listed test account
  ('00000000-0000-0000-0000-0000000015d2', now() + interval '1 second');  -- is_demo
insert into public.profiles (id, user_type, display_name, phone, is_demo) values
  ('00000000-0000-0000-0000-0000000015b1', 'individual', 'ب', '+966500000201', false),
  ('00000000-0000-0000-0000-0000000015b2', 'lawyer',     'ج', '+966500000202', false),
  ('00000000-0000-0000-0000-0000000015c1', 'admin',      'د', '+966500000301', false),
  ('00000000-0000-0000-0000-0000000015c2', 'individual', 'ه', '+966500000302', false),
  ('00000000-0000-0000-0000-0000000015d1', 'individual', 'و', '+966500000401', false),
  ('00000000-0000-0000-0000-0000000015d2', 'individual', 'ز', '+966500000402', true);
insert into public.platform_staff (user_id, staff_role) values ('00000000-0000-0000-0000-0000000015c2', 'operations');
insert into public.test_accounts (user_id) values ('00000000-0000-0000-0000-0000000015d1');

-- P3 who is held
select pg_temp.expect('P3 new account held',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015b1') ->> 'gated'), 'true');
select pg_temp.expect('P3 old account exempt',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015a1') ->> 'reason'), 'before_switch');
select pg_temp.expect('P3 admin exempt',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015c1') ->> 'reason'), 'staff');
select pg_temp.expect('P3 platform_staff exempt',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015c2') ->> 'reason'), 'staff');
select pg_temp.expect('P3 listed test account exempt',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015d1') ->> 'reason'), 'test_account');
select pg_temp.expect('P3 is_demo exempt',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015d2') ->> 'reason'), 'test_account');

-- P4 issuing: cooldown, failed deliveries count for nothing, the per-number cap
set role service_role;
create temp table t_ids (n int, id uuid);
insert into t_ids select 1, (public.phone_otp_issue('00000000-0000-0000-0000-0000000015b1',
  pg_temp.h('+966500000201'), '…01', pg_temp.h('code-111111')) ->> 'id')::uuid;
reset role;
select pg_temp.expect('P4 first code issued', ((select id from t_ids where n = 1) is not null)::text, 'true');
update public.phone_otp_challenges set delivery = 'failed', consumed_at = now() where id = (select id from t_ids where n = 1);
set role service_role;
select pg_temp.expect('P4 a failed delivery does not start the cooldown',
  (select public.phone_otp_issue('00000000-0000-0000-0000-0000000015b1',
     pg_temp.h('+966500000201'), '…01', pg_temp.h('code-222222')) ->> 'ok'), 'true');
select pg_temp.expect('P4 60 s cooldown after a sent/pending code',
  (select public.phone_otp_issue('00000000-0000-0000-0000-0000000015b1',
     pg_temp.h('+966500000201'), '…01', pg_temp.h('code-333333')) ->> 'reason'), 'cooldown');
reset role;
-- The second code stays 'pending' on purpose: the send went out but the
-- server's «sent» stamp did not land — the code must still verify (P5).
-- ten codes to one number from other accounts in 24 h → the number is capped
insert into public.phone_otp_challenges (user_id, target_hash, code_hash, delivery, created_at)
select '00000000-0000-0000-0000-0000000015a1', pg_temp.h('+966500000999'), pg_temp.h('x' || g), 'sent', now() - interval '2 hours'
  from generate_series(1, 10) g;
insert into public.phone_otp_challenges (user_id, target_hash, code_hash, delivery, consumed_at, created_at)
select '00000000-0000-0000-0000-0000000015a1', pg_temp.h('+966500000888'), pg_temp.h('y' || g), 'failed', now(), now() - interval '2 hours'
  from generate_series(1, 10) g;
set role service_role;
select pg_temp.expect('P4 per-number cap across accounts',
  (select public.phone_otp_issue('00000000-0000-0000-0000-0000000015b2',
     pg_temp.h('+966500000999'), '…99', pg_temp.h('code-444444')) ->> 'reason'), 'target_limit');
select pg_temp.expect('P4 failed deliveries do not count toward the per-number cap',
  (select public.phone_otp_issue('00000000-0000-0000-0000-0000000015b2',
     pg_temp.h('+966500000888'), '…88', pg_temp.h('code-555555')) ->> 'ok'), 'true');
reset role;

-- P5 verifying
set role service_role;
select pg_temp.expect('P5 a wrong code',
  (select public.phone_otp_verify('00000000-0000-0000-0000-0000000015b1', pg_temp.h('+966500000201'),
     '+966500000201', pg_temp.h('code-000000')) ->> 'reason'), 'wrong');
select pg_temp.expect('P5 the right code for another number does not pass',
  (select public.phone_otp_verify('00000000-0000-0000-0000-0000000015b1', pg_temp.h('+966500000777'),
     '+966500000777', pg_temp.h('code-222222')) ->> 'reason'), 'wrong');
select pg_temp.expect('P5 the profile no longer holds that number',
  (select public.phone_otp_verify('00000000-0000-0000-0000-0000000015b1', pg_temp.h('+966500000201'),
     '+966500000209', pg_temp.h('code-222222')) ->> 'reason'), 'phone_changed');
select pg_temp.expect('P5 the right code',
  (select public.phone_otp_verify('00000000-0000-0000-0000-0000000015b1', pg_temp.h('+966500000201'),
     '+966500000201', pg_temp.h('code-222222')) ->> 'ok'), 'true');
select pg_temp.expect('P5 a used code cannot pass again',
  (select public.phone_otp_verify('00000000-0000-0000-0000-0000000015b1', pg_temp.h('+966500000201'),
     '+966500000201', pg_temp.h('code-222222')) ->> 'ok'), 'false');
reset role;
select pg_temp.expect('P5 phone_verified_at stamped',
  ((select phone_verified_at from public.profiles where id = '00000000-0000-0000-0000-0000000015b1') is not null)::text, 'true');
select pg_temp.expect('P5 the confirmed account is no longer held',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015b1') ->> 'reason'), 'verified');

-- P6 five misses lock the code
update public.phone_otp_challenges set delivery = 'sent' where user_id = '00000000-0000-0000-0000-0000000015b2';
set role service_role;
select public.phone_otp_verify('00000000-0000-0000-0000-0000000015b2', pg_temp.h('+966500000888'), '+966500000202', pg_temp.h('nope'))
  from generate_series(1, 5);
select pg_temp.expect('P6 the sixth try is locked',
  (select public.phone_otp_verify('00000000-0000-0000-0000-0000000015b2', pg_temp.h('+966500000888'),
     '+966500000202', pg_temp.h('code-555555')) ->> 'reason'), 'locked');
reset role;

-- P7 a session cannot confirm itself; a new number clears the confirmation
select set_config('test.uid', '00000000-0000-0000-0000-0000000015b2', false);
set role authenticated;
select pg_temp.expect('P7 a session cannot write phone_verified_at (column privilege)',
  pg_temp.try($q$update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000015b2'$q$),
  'refused:42501');
reset role;
grant update (phone_verified_at) on public.profiles to authenticated;   -- an accidental grant
set role authenticated;
select pg_temp.expect('P7 … and the trigger refuses it even after an accidental grant',
  pg_temp.try($q$update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000015b2'$q$),
  'refused:42501');
reset role;
revoke update (phone_verified_at) on public.profiles from authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000015b1', false);
set role authenticated;
select pg_temp.expect('P7 the user may change his own number',
  pg_temp.try($q$update public.profiles set phone = '+966500000203' where id = '00000000-0000-0000-0000-0000000015b1'$q$), 'ok');
reset role;
do $$
begin
  if (select phone_verified_at from public.profiles where id = '00000000-0000-0000-0000-0000000015b1') is not null then
    raise exception 'P7 FAIL: a new number kept its confirmation';
  end if;
  raise notice 'P7 PASS: a new number clears the confirmation';
end $$;
select pg_temp.expect('P7 held again after the change',
  (select public.phone_otp_gate('00000000-0000-0000-0000-0000000015b1') ->> 'gated'), 'true');

-- P8 nothing here is reachable from a session
set role authenticated;
select pg_temp.expect('P8 a session cannot read the codes',
  pg_temp.try('select count(*) from public.phone_otp_challenges'), 'refused:42501');
select pg_temp.expect('P8 a session cannot call the gate',
  pg_temp.try($q$select public.phone_otp_gate('00000000-0000-0000-0000-0000000015b1')$q$), 'refused:42501');
select pg_temp.expect('P8 a session cannot issue a code',
  pg_temp.try($q$select public.phone_otp_issue('00000000-0000-0000-0000-0000000015b1', repeat('a', 64), null, repeat('b', 64))$q$), 'refused:42501');
select pg_temp.expect('P8 a session cannot verify',
  pg_temp.try($q$select public.phone_otp_verify('00000000-0000-0000-0000-0000000015b1', repeat('a', 64), '+966500000203', repeat('b', 64))$q$), 'refused:42501');
reset role;
set role anon;
select pg_temp.expect('P8 a guest cannot call the gate',
  pg_temp.try($q$select public.phone_otp_gate('00000000-0000-0000-0000-0000000015b1')$q$), 'refused:42501');
reset role;

do $$ begin raise notice 'l15_phone_otp: ALL PASS'; end $$;
