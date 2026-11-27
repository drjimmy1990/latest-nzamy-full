-- l18_phone_login.test.sql — proves 20261208_20 (batch l18: a Saudi mobile on
-- /login and /forgot-password finds its account only when exactly one account
-- has it confirmed).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261208_20
-- runs TWICE. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_l15_phone_otp.sql $M/20261205_10_phone_otp.sql \
--     $R/prelude_l17_pwreset.sql $M/20261207_10_password_reset_whatsapp.sql \
--     $M/20261208_20_phone_sign_in_resolver.sql $M/20261208_20_phone_sign_in_resolver.sql \
--     $R/l18_phone_login.test.sql
--   Expect from each run of 20261208_20: «l18_phone_login verify: OK …».
-- NEGATIVE CONTROL (must FAIL): add $R/sabotage_l18_phone_login_first_wins.sql
--   after the two 20261208_20 lines → «Q2 a number confirmed on two accounts
--   signs nobody in FAIL: got true, want false».
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

-- ── fixtures ────────────────────────────────────────────────────────────────
insert into auth.users (id, email, banned_until, deleted_at, is_sso_user) values
  ('00000000-0000-0000-0000-0000000018a1', 'phone.one@example.test',    null, null, false), -- one confirmed number
  ('00000000-0000-0000-0000-0000000018a2', 'shared.a@example.test',     null, null, false), -- shares a number
  ('00000000-0000-0000-0000-0000000018a3', 'shared.b@example.test',     null, null, false), -- shares a number
  ('00000000-0000-0000-0000-0000000018a4', 'half.confirmed@example.test', null, null, false), -- confirmed …
  ('00000000-0000-0000-0000-0000000018a5', 'half.other@example.test',   null, null, false), -- … and the same number unconfirmed elsewhere
  ('00000000-0000-0000-0000-0000000018b1', 'unconfirmed@example.test',  null, null, false),
  ('00000000-0000-0000-0000-0000000018b2', 'deleted@example.test',      null, now(), false),
  ('00000000-0000-0000-0000-0000000018b3', 'sso@example.test',          null, null, true),
  ('00000000-0000-0000-0000-0000000018b4', null,                        null, null, false), -- no e-mail
  ('00000000-0000-0000-0000-0000000018c1', 'admin@example.test',        null, null, false), -- staff: may sign in, no reset
  ('00000000-0000-0000-0000-0000000018c2', 'banned@example.test',       now() + interval '30 days', null, false),
  ('00000000-0000-0000-0000-0000000018d1', 'legacy@example.test',       null, null, false); -- stored as 05…
insert into public.profiles (id, user_type, display_name, phone, phone_verified_at) values
  ('00000000-0000-0000-0000-0000000018a1', 'individual', 'أ', '+966500001801', now()),
  ('00000000-0000-0000-0000-0000000018a2', 'individual', 'ب', '+966500001802', now()),
  ('00000000-0000-0000-0000-0000000018a3', 'lawyer',     'ج', '+966500001802', now()),
  ('00000000-0000-0000-0000-0000000018a4', 'individual', 'د', '+966500001804', now()),
  ('00000000-0000-0000-0000-0000000018a5', 'individual', 'ه', '+966500001804', null),
  ('00000000-0000-0000-0000-0000000018b1', 'individual', 'و', '+966500001811', null),
  ('00000000-0000-0000-0000-0000000018b2', 'individual', 'ز', '+966500001812', now()),
  ('00000000-0000-0000-0000-0000000018b3', 'individual', 'ح', '+966500001813', now()),
  ('00000000-0000-0000-0000-0000000018b4', 'individual', 'ط', '+966500001814', now()),
  ('00000000-0000-0000-0000-0000000018c1', 'admin',      'ي', '+966500001821', now()),
  ('00000000-0000-0000-0000-0000000018c2', 'individual', 'ك', '+966500001822', now());
-- A row from before the E.164 CHECK (written past it, as such rows were).
alter table public.profiles disable trigger user;
do $legacy$
begin
  begin
    alter table public.profiles drop constraint if exists profiles_phone_e164_saudi_mobile;
  exception when others then null;
  end;
end
$legacy$;
insert into public.profiles (id, user_type, display_name, phone, phone_verified_at) values
  ('00000000-0000-0000-0000-0000000018d1', 'individual', 'ل', '0500001831', now());
alter table public.profiles enable trigger user;

set role service_role;

-- Q1 exactly one account → its id and e-mail
select pg_temp.expect('Q1 one confirmed number → its account',
  (select public.phone_sign_in_target('+966500001801') ->> 'user_id'), '00000000-0000-0000-0000-0000000018a1');
select pg_temp.expect('Q1 … and its e-mail for the password sign-in',
  (select public.phone_sign_in_target(' +966500001801 ') ->> 'email'), 'phone.one@example.test');
select pg_temp.expect('Q1 a number confirmed on one account and only typed on another → the confirmed one',
  (select public.phone_sign_in_target('+966500001804') ->> 'user_id'), '00000000-0000-0000-0000-0000000018a4');
select pg_temp.expect('Q1 a legacy 05… spelling is still found',
  (select public.phone_sign_in_target('+966500001831') ->> 'user_id'), '00000000-0000-0000-0000-0000000018d1');
select pg_temp.expect('Q1 staff may sign in by number (the password and the two-step still apply)',
  (select public.phone_sign_in_target('+966500001821') ->> 'ok'), 'true');

-- Q2 nobody, or more than one → no account
select pg_temp.expect('Q2 a number confirmed on two accounts signs nobody in',
  (select public.phone_sign_in_target('+966500001802') ->> 'ok'), 'false');
select pg_temp.expect('Q2 … reason shared',
  (select public.phone_sign_in_target('+966500001802') ->> 'reason'), 'shared');
select pg_temp.expect('Q2 unknown number', (select public.phone_sign_in_target('+966500001899') ->> 'reason'), 'no_account');
select pg_temp.expect('Q2 number typed but never confirmed', (select public.phone_sign_in_target('+966500001811') ->> 'reason'), 'no_account');
select pg_temp.expect('Q2 deleted account', (select public.phone_sign_in_target('+966500001812') ->> 'reason'), 'no_account');
select pg_temp.expect('Q2 SSO row', (select public.phone_sign_in_target('+966500001813') ->> 'reason'), 'sso');
select pg_temp.expect('Q2 no e-mail', (select public.phone_sign_in_target('+966500001814') ->> 'reason'), 'no_email');
select pg_temp.expect('Q2 not E.164 (05…)', (select public.phone_sign_in_target('0500001801') ->> 'reason'), 'bad_number');
select pg_temp.expect('Q2 not a Saudi mobile', (select public.phone_sign_in_target('+201000001801') ->> 'reason'), 'bad_number');
select pg_temp.expect('Q2 null', (select public.phone_sign_in_target(null) ->> 'reason'), 'bad_number');
select pg_temp.expect('Q2 an e-mail is not a number', (select public.phone_sign_in_target('phone.one@example.test') ->> 'reason'), 'bad_number');

-- Q3 the WhatsApp reset by number keeps every rule of the reset by e-mail
select pg_temp.expect('Q3 reset by number: the account and its stored number',
  (select public.pw_reset_target_by_phone('+966500001801') ->> 'user_id'), '00000000-0000-0000-0000-0000000018a1');
select pg_temp.expect('Q3 … the number comes back to the server',
  (select public.pw_reset_target_by_phone('+966500001801') ->> 'phone'), '+966500001801');
select pg_temp.expect('Q3 the same answer as the reset by e-mail',
  (select public.pw_reset_target_by_phone('+966500001801')::text), (select public.pw_reset_target('phone.one@example.test')::text));
select pg_temp.expect('Q3 shared number → no code', (select public.pw_reset_target_by_phone('+966500001802') ->> 'ok'), 'false');
select pg_temp.expect('Q3 staff → no code', (select public.pw_reset_target_by_phone('+966500001821') ->> 'reason'), 'staff');
select pg_temp.expect('Q3 banned → no code', (select public.pw_reset_target_by_phone('+966500001822') ->> 'reason'), 'banned');
select pg_temp.expect('Q3 unknown → no code', (select public.pw_reset_target_by_phone('+966500001899') ->> 'ok'), 'false');
select pg_temp.expect('Q3 unconfirmed → no code', (select public.pw_reset_target_by_phone('+966500001811') ->> 'ok'), 'false');

-- Q3b a recent change of confirmed number (the 7-day rule of 20261207_10) also holds by number
reset role;
insert into public.phone_otp_challenges (user_id, target_hash, code_hash, delivery, consumed_at, created_at) values
  ('00000000-0000-0000-0000-0000000018a1', repeat('a', 64), repeat('1', 64), 'sent', now() - interval '20 days', now() - interval '20 days'),
  ('00000000-0000-0000-0000-0000000018a1', repeat('b', 64), repeat('2', 64), 'sent', now() - interval '2 days',  now() - interval '2 days');
set role service_role;
select pg_temp.expect('Q3b a number confirmed in place of another 2 days ago → no code by number',
  (select public.pw_reset_target_by_phone('+966500001801') ->> 'reason'), 'recent_phone_change');
select pg_temp.expect('Q3b … but the sign-in by number still finds the account (the password is still needed)',
  (select public.phone_sign_in_target('+966500001801') ->> 'ok'), 'true');

-- Q4 sessions may not call either function
reset role;
set role anon;
select pg_temp.expect('Q4 anon cannot resolve a number',
  pg_temp.try($q$select public.phone_sign_in_target('+966500001801')$q$), 'refused:42501');
select pg_temp.expect('Q4 anon cannot ask the reset by number',
  pg_temp.try($q$select public.pw_reset_target_by_phone('+966500001801')$q$), 'refused:42501');
reset role;
set role authenticated;
select pg_temp.expect('Q4 a signed-in session cannot resolve a number',
  pg_temp.try($q$select public.phone_sign_in_target('+966500001801')$q$), 'refused:42501');
select pg_temp.expect('Q4 a signed-in session cannot ask the reset by number',
  pg_temp.try($q$select public.pw_reset_target_by_phone('+966500001801')$q$), 'refused:42501');
reset role;

-- Q5 nothing was written
select pg_temp.expect('Q5 the functions are read-only (stable)',
  (select bool_and(p.provolatile = 's')::text from pg_proc p
    where p.oid in ('public.phone_sign_in_target(text)'::regprocedure, 'public.pw_reset_target_by_phone(text)'::regprocedure)), 'true');

do $$ begin raise notice 'l18_phone_login: ALL PASS'; end $$;
