-- l11_sec_phone.test.sql — proves part D (R6) of 20261201_10: one VERIFIED
--   lawyer / provider account per mobile (profiles.phone); unverified accounts
--   may share a number; duplicates that existed before are left alone.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261201_10
-- runs TWICE. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_lawyer_registry_base.sql $M/20261122_40_lawyer_registry.sql \
--     $R/prelude_l11_sec_phone.sql \
--     $M/20261201_10_l11_sec_fees_scope_device_phone.sql $M/20261201_10_l11_sec_fees_scope_device_phone.sql \
--     $R/l11_sec_phone.test.sql
--   Expect from the migration: «R6 — 1 mobile number(s) are ALREADY shared …».
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261201_10
--   lines → «P1 FAIL: a second verified lawyer took the same mobile».
-- Synthetic fixtures only. Every assertion RAISES on failure.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;
-- Runs one statement: 'ok', or 'refused:' + the refusal's constraint name.
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $$
declare v_con text;
begin
  execute p_sql;
  return 'ok';
exception when unique_violation then
  get stacked diagnostics v_con = constraint_name;
  return 'refused:' || v_con;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000ca1'), ('00000000-0000-0000-0000-000000000ca2'),
  ('00000000-0000-0000-0000-000000000ca3'), ('00000000-0000-0000-0000-000000000ca4'),
  ('00000000-0000-0000-0000-000000000ca5'), ('00000000-0000-0000-0000-000000000ca6'),
  ('00000000-0000-0000-0000-000000000ca7');
insert into public.profiles (id, user_type, display_name, phone) values
  ('00000000-0000-0000-0000-000000000ca1', 'lawyer',   'أ', '+966500000001'),
  ('00000000-0000-0000-0000-000000000ca2', 'lawyer',   'ب', '+966500000001'),
  ('00000000-0000-0000-0000-000000000ca3', 'provider', 'ج', '+966500000001'),
  ('00000000-0000-0000-0000-000000000ca4', 'lawyer',   'د', '+966500000002'),
  ('00000000-0000-0000-0000-000000000ca5', 'lawyer',   'ه', '+966500000005'),
  ('00000000-0000-0000-0000-000000000ca6', 'lawyer',   'و', null),
  ('00000000-0000-0000-0000-000000000ca7', 'lawyer',   'ز', '+966500000001');
insert into public.lawyer_profiles (user_id, license_number) values
  ('00000000-0000-0000-0000-000000000ca1', '99101'), ('00000000-0000-0000-0000-000000000ca2', '99102'),
  ('00000000-0000-0000-0000-000000000ca4', '99104'), ('00000000-0000-0000-0000-000000000ca5', '99105'),
  ('00000000-0000-0000-0000-000000000ca6', '99106');
insert into public.provider_profiles (user_id) values ('00000000-0000-0000-0000-000000000ca3');

-- P0 the pre-existing duplicate pair is untouched and still editable
select pg_temp.expect('P0 old duplicates still verified',
  (select count(*)::text from public.lawyer_profiles where license_number in ('99091', '99092') and verification_status = 'verified'), '2');
select pg_temp.expect('P0 an old duplicate can still be saved',
  pg_temp.try($q$update public.lawyer_profiles set verification_status = 'verified', updated_at = now()
                 where user_id = '00000000-0000-0000-0000-000000000cd1'$q$), 'ok');

-- P1 the first verified lawyer takes the number; the second is refused
select pg_temp.expect('P1 first lawyer verified',
  pg_temp.try($q$update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-000000000ca1'$q$), 'ok');
do $$
begin
  if pg_temp.try($q$update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-000000000ca2'$q$) = 'ok' then
    raise exception 'P1 FAIL: a second verified lawyer took the same mobile';
  end if;
end $$;
select pg_temp.expect('P1 second lawyer refused (constraint name)',
  pg_temp.try($q$update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-000000000ca2'$q$),
  'refused:verified_phone_unique');
select pg_temp.expect('P1 the refused one stays pending',
  (select verification_status from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-000000000ca2'), 'pending');
-- P2 across tables: a provider on the same number is refused too
select pg_temp.expect('P2 provider on the same mobile refused',
  pg_temp.try($q$update public.provider_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-000000000ca3'$q$),
  'refused:verified_phone_unique');
-- P3 a verified lawyer cannot move onto a taken number; a free one is fine
select pg_temp.expect('P3 lawyer D verified',
  pg_temp.try($q$update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-000000000ca4'$q$), 'ok');
select pg_temp.expect('P3 verified D moves onto a taken number',
  pg_temp.try($q$update public.profiles set phone = '+966500000001' where id = '00000000-0000-0000-0000-000000000ca4'$q$),
  'refused:verified_phone_unique');
select pg_temp.expect('P3 verified D moves onto a free number',
  pg_temp.try($q$update public.profiles set phone = '+966500000003' where id = '00000000-0000-0000-0000-000000000ca4'$q$), 'ok');
-- P4 an unverified account may take any number
select pg_temp.expect('P4 unverified E takes a verified number',
  pg_temp.try($q$update public.profiles set phone = '+966500000001' where id = '00000000-0000-0000-0000-000000000ca5'$q$), 'ok');
-- P5 when the holder frees the number, the waiting one can be verified
select pg_temp.expect('P5 holder A changes number',
  pg_temp.try($q$update public.profiles set phone = '+966500000004' where id = '00000000-0000-0000-0000-000000000ca1'$q$), 'ok');
select pg_temp.expect('P5 B verified now',
  pg_temp.try($q$update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-000000000ca2'$q$), 'ok');
-- P6 no mobile on file: nothing to compare
select pg_temp.expect('P6 a lawyer with no mobile verified',
  pg_temp.try($q$update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-000000000ca6'$q$), 'ok');
-- P7 a verified row inserted directly (a seed) is checked too
select pg_temp.expect('P7 a verified INSERT on a taken mobile',
  pg_temp.try($q$insert into public.lawyer_profiles (user_id, verification_status) values ('00000000-0000-0000-0000-000000000ca7', 'verified')$q$),
  'refused:verified_phone_unique');
-- P8 the helpers are not for sessions
select pg_temp.expect('P8 authenticated cannot call verified_phone_taken',
  has_function_privilege('authenticated', 'public.verified_phone_taken(uuid,text)', 'EXECUTE')::text, 'false');

do $$ begin raise notice 'l11_sec_phone: ALL PASS'; end $$;
