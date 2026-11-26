-- l18_confirmed_phone_unique.test.sql — proves 20261208_50 (batch
-- l18-answers, owner answer ٢٣٥ §2): a mobile CONFIRMED on one account cannot
-- be confirmed on a second one.
--   C1 the first confirmation of a number passes;
--   C2 a second account confirming the same number is refused (23505,
--      «confirmed_phone_taken…») — also when stored as 05… or 9665…;
--   C3 a confirmed account re-saving its row (same number) passes;
--   C4 moving a confirmed account onto a number confirmed elsewhere is NOT a
--      confirmation: it passes and phone_verified_at is cleared (the 20261205_10
--      guard fires first — trigger order);
--   C5 a row INSERTED already confirmed with a taken number is refused;
--   C6 the real flow: phone_otp_verify (20261205_10) on a taken number fails
--      with the guard's 23505 and stamps nothing;
--   C7 the unique index: created on a clean table; with shared confirmed
--      numbers a re-run does NOT create it (NOTICE) and changes no row; after
--      the clean-up a re-run creates it;
--   C8 the helper and the guard are service_role only.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261208_50
-- runs TWICE; the test re-runs it again from /tmp/mig3.sql (its copy in the
-- container). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_l15_phone_otp.sql $M/20261205_10_phone_otp.sql \
--     $M/20261208_50_l18_confirmed_phone_unique.sql $M/20261208_50_l18_confirmed_phone_unique.sql \
--     $R/l18_confirmed_phone_unique.test.sql
--   Expect from each run of 20261208_50: «l18_confirmed_phone_unique verify: OK …».
-- NEGATIVE CONTROL (must FAIL): add $R/sabotage_l18_confirmed_phone_no_guard.sql
--   after the two 20261208_50 lines → «C2 a second confirmation of the same
--   number is refused FAIL: got ok, want refused:23505».
-- Synthetic fixtures only (no real numbers). Every assertion RAISES on failure.
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
  return 'refused:' || sqlstate || case when sqlerrm like 'confirmed_phone_taken%' then '' else ' (' || sqlerrm || ')' end;
end $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000050a1'), ('00000000-0000-0000-0000-0000000050a2'),
  ('00000000-0000-0000-0000-0000000050a3'), ('00000000-0000-0000-0000-0000000050a4'),
  ('00000000-0000-0000-0000-0000000050a5'), ('00000000-0000-0000-0000-0000000050a6'),
  ('00000000-0000-0000-0000-0000000050a7');
insert into public.profiles (id, user_type, display_name, phone) values
  ('00000000-0000-0000-0000-0000000050a1', 'individual', 'أ', '+966500005001'),
  ('00000000-0000-0000-0000-0000000050a2', 'lawyer',     'ب', '+966500005001'),
  ('00000000-0000-0000-0000-0000000050a3', 'individual', 'ج', '0500005001'),
  ('00000000-0000-0000-0000-0000000050a4', 'individual', 'د', '966500005001'),
  ('00000000-0000-0000-0000-0000000050a5', 'individual', 'ه', '+966500005005'),
  ('00000000-0000-0000-0000-0000000050a6', 'individual', 'و', '+966500005006');

-- C1 / C2
select pg_temp.expect('C1 the first confirmation of a number passes',
  pg_temp.try($$update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000050a1'$$), 'ok');
select pg_temp.expect('C2 a second confirmation of the same number is refused',
  pg_temp.try($$update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000050a2'$$), 'refused:23505');
select pg_temp.expect('C2 … also when the second account stores it as 05…',
  pg_temp.try($$update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000050a3'$$), 'refused:23505');
select pg_temp.expect('C2 … and as 9665…',
  pg_temp.try($$update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000050a4'$$), 'refused:23505');
select pg_temp.expect('C2 … nothing was stamped',
  (select count(*)::text from public.profiles where phone_verified_at is not null), '1');

-- C3
select pg_temp.expect('C3 a confirmed account re-saving its row passes',
  pg_temp.try($$update public.profiles set display_name = 'أأ', phone = '+966500005001', phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000050a1'$$), 'ok');

-- C4
update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000050a5';
select pg_temp.expect('C4 moving a confirmed account onto a number confirmed elsewhere passes',
  pg_temp.try($$update public.profiles set phone = '+966500005001' where id = '00000000-0000-0000-0000-0000000050a5'$$), 'ok');
select pg_temp.expect('C4 … and leaves it unconfirmed',
  (select (phone_verified_at is null)::text from public.profiles where id = '00000000-0000-0000-0000-0000000050a5'), 'true');

-- C5
select pg_temp.expect('C5 a row inserted already confirmed with a taken number is refused',
  pg_temp.try($$insert into public.profiles (id, user_type, display_name, phone, phone_verified_at)
                 values ('00000000-0000-0000-0000-0000000050a7', 'individual', 'ز', '+966500005001', now())$$), 'refused:23505');

-- C6 the real flow (phone_otp_verify stamps through the same UPDATE)
insert into public.phone_otp_challenges (user_id, target_hash, target_hint, code_hash, expires_at, delivery)
  values ('00000000-0000-0000-0000-0000000050a2', repeat('a', 64), '…001', repeat('b', 64), now() + interval '10 minutes', 'sent');
select pg_temp.expect('C6 phone_otp_verify on a number confirmed elsewhere is refused by the guard',
  pg_temp.try($$select public.phone_otp_verify('00000000-0000-0000-0000-0000000050a2', repeat('a', 64), '+966500005001', repeat('b', 64))$$), 'refused:23505');
select pg_temp.expect('C6 … and stamps nothing',
  (select (phone_verified_at is null)::text from public.profiles where id = '00000000-0000-0000-0000-0000000050a2'), 'true');

-- C7 the unique index
select pg_temp.expect('C7 the index exists after a run on a table with no shared confirmed number',
  (to_regclass('public.profiles_confirmed_phone_unique') is not null)::text, 'true');
-- make a shared confirmed number the way old data could hold one (before the guard)
drop index public.profiles_confirmed_phone_unique;
alter table public.profiles disable trigger trg_phone_verified_unique;
update public.profiles set phone_verified_at = now() where id = '00000000-0000-0000-0000-0000000050a2';
alter table public.profiles enable trigger trg_phone_verified_unique;
create temp table c7_before as select id, phone, phone_verified_at from public.profiles;
\i /tmp/mig3.sql
select pg_temp.expect('C7 with a shared confirmed number a re-run does NOT create the index',
  (to_regclass('public.profiles_confirmed_phone_unique') is not null)::text, 'false');
select pg_temp.expect('C7 … and changes no row',
  (select count(*)::text from public.profiles p join c7_before b using (id)
    where p.phone is distinct from b.phone or p.phone_verified_at is distinct from b.phone_verified_at), '0');
-- the operator's clean-up (by hand), then a re-run
update public.profiles set phone_verified_at = null where id = '00000000-0000-0000-0000-0000000050a2';
\i /tmp/mig3.sql
select pg_temp.expect('C7 after the clean-up a re-run creates the index',
  (to_regclass('public.profiles_confirmed_phone_unique') is not null)::text, 'true');

-- C8 privileges
select pg_temp.expect('C8 a session cannot call the helper',
  (has_function_privilege('authenticated', 'public.confirmed_phone_taken(uuid, text)', 'EXECUTE')
   or has_function_privilege('anon', 'public.confirmed_phone_taken(uuid, text)', 'EXECUTE'))::text, 'false');
select pg_temp.expect('C8 the helper answers for the service role',
  public.confirmed_phone_taken('00000000-0000-0000-0000-0000000050a6', '+966500005001')::text, 'true');
select pg_temp.expect('C8 … and not for the number''s own account',
  public.confirmed_phone_taken('00000000-0000-0000-0000-0000000050a1', '+966500005001')::text, 'false');

select 'l18_confirmed_phone_unique: ALL OK' as result;
