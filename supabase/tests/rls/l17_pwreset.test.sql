-- l17_pwreset.test.sql — proves 20261207_10 (batch l17, password reset by a
-- WhatsApp code to the account's confirmed mobile).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261207_10
-- runs TWICE. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_l15_phone_otp.sql $M/20261205_10_phone_otp.sql \
--     $R/prelude_l17_pwreset.sql \
--     $M/20261207_10_password_reset_whatsapp.sql $M/20261207_10_password_reset_whatsapp.sql \
--     $R/l17_pwreset.test.sql
--   Expect from each run of 20261207_10: «l17_pwreset verify: OK …».
-- NEGATIVE CONTROL (must FAIL): add $R/sabotage_l17_pwreset_shared_codes.sql
--   after the two 20261207_10 lines → «Q3 a sign-up code cannot reset a
--   password FAIL: got true, want false».
-- Synthetic fixtures only (no real numbers or addresses). Every assertion RAISES on failure.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;
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
insert into auth.users (id, email, banned_until, deleted_at, is_sso_user) values
  ('00000000-0000-0000-0000-0000000017a1', 'reset.ok@example.test',    null, null, false), -- eligible
  ('00000000-0000-0000-0000-0000000017a2', 'reset.two@example.test',   null, null, false), -- eligible 2
  ('00000000-0000-0000-0000-0000000017b1', 'unconfirmed@example.test', null, null, false), -- mobile not confirmed
  ('00000000-0000-0000-0000-0000000017b2', 'nophone@example.test',     null, null, false), -- no mobile
  ('00000000-0000-0000-0000-0000000017c1', 'admin@example.test',       null, null, false), -- admin
  ('00000000-0000-0000-0000-0000000017c2', 'staff@example.test',       null, null, false), -- platform_staff
  ('00000000-0000-0000-0000-0000000017d1', 'banned@example.test',      now() + interval '30 days', null, false),
  ('00000000-0000-0000-0000-0000000017d2', 'deleted@example.test',     null, now(), false),
  ('00000000-0000-0000-0000-0000000017d3', 'sso@example.test',         null, null, true),
  ('00000000-0000-0000-0000-0000000017d4', 'oldban@example.test',      now() - interval '1 day', null, false);
insert into public.profiles (id, user_type, display_name, phone, phone_verified_at) values
  ('00000000-0000-0000-0000-0000000017a1', 'individual', 'أ', '+966500001701', now()),
  ('00000000-0000-0000-0000-0000000017a2', 'lawyer',     'ب', '+966500001702', now()),
  ('00000000-0000-0000-0000-0000000017b1', 'individual', 'ج', '+966500001703', null),
  ('00000000-0000-0000-0000-0000000017b2', 'individual', 'د', null,            null),
  ('00000000-0000-0000-0000-0000000017c1', 'admin',      'ه', '+966500001705', now()),
  ('00000000-0000-0000-0000-0000000017c2', 'individual', 'و', '+966500001706', now()),
  ('00000000-0000-0000-0000-0000000017d1', 'individual', 'ز', '+966500001707', now()),
  ('00000000-0000-0000-0000-0000000017d2', 'individual', 'ح', '+966500001708', now()),
  ('00000000-0000-0000-0000-0000000017d3', 'individual', 'ط', '+966500001709', now()),
  ('00000000-0000-0000-0000-0000000017d4', 'individual', 'ي', '+966500001710', now());
insert into public.platform_staff (user_id, staff_role) values ('00000000-0000-0000-0000-0000000017c2', 'operations');

-- Q1 who may receive a reset code
set role service_role;
select pg_temp.expect('Q1 eligible (e-mail matched case-insensitively, trimmed)',
  (select public.pw_reset_target('  Reset.OK@Example.TEST ') ->> 'user_id'), '00000000-0000-0000-0000-0000000017a1');
select pg_temp.expect('Q1 the confirmed number comes back to the server',
  (select public.pw_reset_target('reset.ok@example.test') ->> 'phone'), '+966500001701');
select pg_temp.expect('Q1 unknown address', (select public.pw_reset_target('nobody@example.test') ->> 'ok'), 'false');
select pg_temp.expect('Q1 malformed address', (select public.pw_reset_target('not-an-address') ->> 'ok'), 'false');
select pg_temp.expect('Q1 null address', (select public.pw_reset_target(null) ->> 'ok'), 'false');
select pg_temp.expect('Q1 mobile not confirmed', (select public.pw_reset_target('unconfirmed@example.test') ->> 'reason'), 'no_confirmed_phone');
select pg_temp.expect('Q1 no mobile', (select public.pw_reset_target('nophone@example.test') ->> 'reason'), 'no_confirmed_phone');
select pg_temp.expect('Q1 admin refused', (select public.pw_reset_target('admin@example.test') ->> 'reason'), 'staff');
select pg_temp.expect('Q1 platform_staff refused', (select public.pw_reset_target('staff@example.test') ->> 'reason'), 'staff');
select pg_temp.expect('Q1 banned refused', (select public.pw_reset_target('banned@example.test') ->> 'reason'), 'banned');
select pg_temp.expect('Q1 deleted refused', (select public.pw_reset_target('deleted@example.test') ->> 'reason'), 'deleted');
select pg_temp.expect('Q1 SSO row not matched', (select public.pw_reset_target('sso@example.test') ->> 'reason'), 'no_account');
select pg_temp.expect('Q1 an expired ban does not block', (select public.pw_reset_target('oldban@example.test') ->> 'ok'), 'true');

-- Q2 issuing: a sign-up code and a reset code for the same account and number
select pg_temp.expect('Q2 a sign-up code (20261205_10) issued',
  (select public.phone_otp_issue('00000000-0000-0000-0000-0000000017a1',
     pg_temp.h('+966500001701'), '…01', pg_temp.h('signup-111111')) ->> 'ok'), 'true');
select pg_temp.expect('Q2 a reset code issued',
  (select public.pw_reset_issue('00000000-0000-0000-0000-0000000017a1',
     pg_temp.h('+966500001701'), '…01', pg_temp.h('reset-222222')) ->> 'ok'), 'true');
select pg_temp.expect('Q2 60 s cooldown between two reset codes',
  (select public.pw_reset_issue('00000000-0000-0000-0000-0000000017a1',
     pg_temp.h('+966500001701'), '…01', pg_temp.h('reset-999999')) ->> 'reason'), 'cooldown');
reset role;
select pg_temp.expect('Q2 the reset code lives in its own table, not with the sign-up codes',
  (select count(*)::text from public.phone_otp_challenges where code_hash = pg_temp.h('reset-222222')), '0');
insert into public.password_reset_challenges (user_id, target_hash, code_hash, delivery, created_at)
select '00000000-0000-0000-0000-0000000017d4', pg_temp.h('+966500001777'), pg_temp.h('z' || g), 'sent', now() - interval '2 hours'
  from generate_series(1, 10) g;
set role service_role;
select pg_temp.expect('Q2 per-number cap (10 a day)',
  (select public.pw_reset_issue('00000000-0000-0000-0000-0000000017a2',
     pg_temp.h('+966500001777'), '…77', pg_temp.h('reset-000001')) ->> 'reason'), 'target_limit');

-- Q3 the two kinds of code never stand in for each other
select pg_temp.expect('Q3 a sign-up code cannot reset a password',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a1', pg_temp.h('+966500001701'),
     '+966500001701', pg_temp.h('signup-111111')) ->> 'ok'), 'false');
select pg_temp.expect('Q3 a reset code cannot confirm a mobile',
  (select public.phone_otp_verify('00000000-0000-0000-0000-0000000017a1', pg_temp.h('+966500001701'),
     '+966500001701', pg_temp.h('reset-222222')) ->> 'ok'), 'false');
reset role;
select pg_temp.expect('Q3 the reset code is still open after those misses',
  (select count(*)::text from public.password_reset_challenges
    where user_id = '00000000-0000-0000-0000-0000000017a1' and consumed_at is null and attempts = 1), '1');

-- Q4 the right reset code passes once
set role service_role;
select pg_temp.expect('Q4 a wrong reset code',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a1', pg_temp.h('+966500001701'),
     '+966500001701', pg_temp.h('reset-000000')) ->> 'reason'), 'wrong');
select pg_temp.expect('Q4 the right code for another number does not pass',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a1', pg_temp.h('+966500001799'),
     '+966500001799', pg_temp.h('reset-222222')) ->> 'ok'), 'false');
select pg_temp.expect('Q4 the right reset code',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a1', pg_temp.h('+966500001701'),
     '+966500001701', pg_temp.h('reset-222222')) ->> 'ok'), 'true');
select pg_temp.expect('Q4 a used code cannot pass again',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a1', pg_temp.h('+966500001701'),
     '+966500001701', pg_temp.h('reset-222222')) ->> 'ok'), 'false');
reset role;
select pg_temp.expect('Q4 no reset code of the account is left open',
  (select count(*)::text from public.password_reset_challenges
    where user_id = '00000000-0000-0000-0000-0000000017a1' and consumed_at is null), '0');
select pg_temp.expect('Q4 the sign-up code was not touched',
  (select count(*)::text from public.phone_otp_challenges
    where user_id = '00000000-0000-0000-0000-0000000017a1' and consumed_at is null), '1');

-- Q5 a code sent to a number the profile no longer holds confirmed
update public.password_reset_challenges set created_at = created_at - interval '2 minutes'
 where user_id = '00000000-0000-0000-0000-0000000017a1';
set role service_role;
select pg_temp.expect('Q5 a new reset code after the cooldown',
  (select public.pw_reset_issue('00000000-0000-0000-0000-0000000017a1',
     pg_temp.h('+966500001701'), '…01', pg_temp.h('reset-333333')) ->> 'ok'), 'true');
reset role;
update public.profiles set phone = '+966500001798' where id = '00000000-0000-0000-0000-0000000017a1';
set role service_role;
select pg_temp.expect('Q5 refused once the number changed',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a1', pg_temp.h('+966500001701'),
     '+966500001701', pg_temp.h('reset-333333')) ->> 'reason'), 'phone_changed');
select pg_temp.expect('Q5 … and the account no longer qualifies (the new number is unconfirmed)',
  (select public.pw_reset_target('reset.ok@example.test') ->> 'reason'), 'no_confirmed_phone');
reset role;
select pg_temp.expect('Q5 the stale code is spent',
  (select count(*)::text from public.password_reset_challenges
    where user_id = '00000000-0000-0000-0000-0000000017a1' and consumed_at is null), '0');

-- Q6 five misses kill the code
set role service_role;
select pg_temp.expect('Q6 a reset code for the second account',
  (select public.pw_reset_issue('00000000-0000-0000-0000-0000000017a2',
     pg_temp.h('+966500001702'), '…02', pg_temp.h('reset-444444')) ->> 'ok'), 'true');
select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a2', pg_temp.h('+966500001702'), '+966500001702', pg_temp.h('nope'))
  from generate_series(1, 5);
select pg_temp.expect('Q6 the right code after five misses is refused',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a2', pg_temp.h('+966500001702'),
     '+966500001702', pg_temp.h('reset-444444')) ->> 'ok'), 'false');
reset role;

-- Q7 an expired code is refused; a failed delivery never verifies
update public.password_reset_challenges set created_at = created_at - interval '2 minutes'
 where user_id = '00000000-0000-0000-0000-0000000017a2';
set role service_role;
select pg_temp.expect('Q7 another code',
  (select public.pw_reset_issue('00000000-0000-0000-0000-0000000017a2',
     pg_temp.h('+966500001702'), '…02', pg_temp.h('reset-555555')) ->> 'ok'), 'true');
reset role;
update public.password_reset_challenges set expires_at = now() - interval '1 second'
 where code_hash = pg_temp.h('reset-555555');
set role service_role;
select pg_temp.expect('Q7 an expired code',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a2', pg_temp.h('+966500001702'),
     '+966500001702', pg_temp.h('reset-555555')) ->> 'ok'), 'false');
reset role;
update public.password_reset_challenges set created_at = created_at - interval '2 minutes'
 where user_id = '00000000-0000-0000-0000-0000000017a2';
set role service_role;
select pg_temp.expect('Q7 a code whose delivery will fail',
  (select public.pw_reset_issue('00000000-0000-0000-0000-0000000017a2',
     pg_temp.h('+966500001702'), '…02', pg_temp.h('reset-666666')) ->> 'ok'), 'true');
reset role;
update public.password_reset_challenges set delivery = 'failed' where code_hash = pg_temp.h('reset-666666');
set role service_role;
select pg_temp.expect('Q7 a failed delivery never verifies',
  (select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a2', pg_temp.h('+966500001702'),
     '+966500001702', pg_temp.h('reset-666666')) ->> 'ok'), 'false');
reset role;

-- Q8 nothing here is reachable from a session
set role authenticated;
select pg_temp.expect('Q8 a session cannot read the reset codes',
  pg_temp.try('select count(*) from public.password_reset_challenges'), 'refused:42501');
select pg_temp.expect('Q8 a session cannot look an address up',
  pg_temp.try($q$select public.pw_reset_target('reset.two@example.test')$q$), 'refused:42501');
select pg_temp.expect('Q8 a session cannot issue a reset code',
  pg_temp.try($q$select public.pw_reset_issue('00000000-0000-0000-0000-0000000017a2', repeat('a', 64), null, repeat('b', 64))$q$), 'refused:42501');
select pg_temp.expect('Q8 a session cannot verify a reset code',
  pg_temp.try($q$select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a2', repeat('a', 64), '+966500001702', repeat('b', 64))$q$), 'refused:42501');
reset role;
set role anon;
select pg_temp.expect('Q8 a guest cannot look an address up',
  pg_temp.try($q$select public.pw_reset_target('reset.two@example.test')$q$), 'refused:42501');
select pg_temp.expect('Q8 a guest cannot verify a reset code',
  pg_temp.try($q$select public.pw_reset_verify('00000000-0000-0000-0000-0000000017a2', repeat('a', 64), '+966500001702', repeat('b', 64))$q$), 'refused:42501');
select pg_temp.expect('Q8 a guest cannot read the reset codes',
  pg_temp.try('select count(*) from public.password_reset_challenges'), 'refused:42501');
reset role;

do $$ begin raise notice 'l17_pwreset: ALL PASS'; end $$;
