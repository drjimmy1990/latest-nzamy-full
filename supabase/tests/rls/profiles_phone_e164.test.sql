-- Acceptance tests for 20260921_04_profiles_phone_e164_check.sql (UAT-REG-002).
--
-- Chain (run-local.sh / run.sh, in this order):
--   prelude_profiles_phone.sql
--   ../../migrations/20260603_phase1_001_profiles.sql
--   ../../migrations/20260827_signup_contact_fields.sql
--   prelude_seed_phones.sql
--   ../../migrations/20260921_04_profiles_phone_e164_check.sql
--   profiles_phone_e164.test.sql
--
-- The two preludes are NOT migrations: stubs.sql models public.profiles with
-- four columns and auth.users with one, and the backfill under test needs rows
-- that exist before the migration runs. See each prelude's header.
--
-- Users: the six seeded rows (T1) plus A (T3, the direct-PostgREST-PATCH case
-- from scripts/uat/verify-profile-write-guards.ps1). Non-superuser for T3.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

-- ── T1 · backfill: the four salvageable shapes all became one value ─────────
select 'T1 0512345678 (expect +966512345678): ' || coalesce(phone, 'NULL')
  from public.profiles where id = '11111111-0000-0000-0000-000000000001';
select 'T1 ٠٥١٢٣٤٥٦٧٨ (expect +966512345678): ' || coalesce(phone, 'NULL')
  from public.profiles where id = '22222222-0000-0000-0000-000000000002';
select 'T1 00966512345678 (expect +966512345678): ' || coalesce(phone, 'NULL')
  from public.profiles where id = '33333333-0000-0000-0000-000000000003';
select 'T1 +966512345678 (expect +966512345678): ' || coalesce(phone, 'NULL')
  from public.profiles where id = '44444444-0000-0000-0000-000000000004';

-- ── T2 · the blank became NULL, the garbage was quarantined, not deleted ────
select 'T2 blank row phone (expect NULL): ' || coalesce(phone, 'NULL')
  from public.profiles where id = '55555555-0000-0000-0000-000000000005';
select 'T2 blank row quarantined (expect f): ' || (metadata ? 'invalid_phone_quarantined')::text
  from public.profiles where id = '55555555-0000-0000-0000-000000000005';
select 'T2 garbage row phone (expect NULL): ' || coalesce(phone, 'NULL')
  from public.profiles where id = '66666666-0000-0000-0000-000000000006';
select 'T2 garbage row quarantined value (expect letters-and-email@example.test): '
       || coalesce(metadata->>'invalid_phone_quarantined', 'MISSING')
  from public.profiles where id = '66666666-0000-0000-0000-000000000006';
select 'T2 garbage row quarantine timestamp present (expect t): '
       || (metadata ? 'invalid_phone_quarantined_at')::text
  from public.profiles where id = '66666666-0000-0000-0000-000000000006';

-- ── T3 · the constraint itself, as the user PostgREST would be acting as ────
-- scripts/uat/verify-profile-write-guards.ps1:49-61 PATCHes
-- /rest/v1/profiles?id=eq.<A> with the anon key and A's own JWT. The policy
-- "users update own profile" permits it. Only the CHECK can refuse it.
select 'T3 constraint exists and is validated (expect t|t): '
       || (count(*) > 0)::text || '|' || coalesce(bool_and(convalidated)::text, 'NULL')
  from pg_constraint
 where conrelid = 'public.profiles'::regclass
   and conname = 'profiles_phone_e164_saudi_mobile';

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@example.test', '{"user_type":"individual","full_name":"أ"}'::jsonb);

set role app_user;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-00000000000a', false);

do $$ begin
  update public.profiles set phone = 'abc@example.com'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  raise notice 'T3 FAIL: an email address was stored in profiles.phone';
exception when check_violation then
  raise notice 'T3 PASS: an email address in phone is refused (23514) — UAT-REG-002';
end $$;

do $$ begin
  update public.profiles set phone = '٠٥١٢٣٤٥٦٧٨'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  raise notice 'T3 FAIL: Arabic-Indic digits were stored raw in profiles.phone';
exception when check_violation then
  raise notice 'T3 PASS: the column stores E.164 only; normalising is the app''s job (23514)';
end $$;

do $$ begin
  update public.profiles set phone = '0512345678'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  raise notice 'T3 FAIL: a local 05… form was stored unnormalised';
exception when check_violation then
  raise notice 'T3 PASS: a local 05… form is refused unnormalised (23514)';
end $$;

update public.profiles set phone = '+966512345678'
 where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select 'T3 E.164 accepted (expect +966512345678): ' || coalesce(phone, 'NULL')
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a';

update public.profiles set phone = null
 where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
select 'T3 NULL still allowed (expect NULL): ' || coalesce(phone, 'NULL')
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a';

reset role;

-- ── T4 · handle_new_user(): clamp, never raise ──────────────────────────────
-- Signup is an INSERT on auth.users. If the trigger raised 23514 the whole
-- account creation would roll back, so a bad number must become NULL and the
-- account must still exist.
select 'T4 function carries the v_phone clamp (expect t): '
       || (position('v_phone' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) > 0)::text;

insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@example.test',
   '{"user_type":"individual","full_name":"ب","phone":"0512345678"}'::jsonb),
  ('cccccccc-0000-0000-0000-00000000000c', 'c@example.test',
   '{"user_type":"individual","full_name":"ج","phone":"garbage"}'::jsonb),
  ('dddddddd-0000-0000-0000-00000000000d', 'd@example.test',
   '{"user_type":"individual","full_name":"د","phone":"٠٥١٢٣٤٥٦٧٨"}'::jsonb),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'e@example.test',
   '{"user_type":"individual","full_name":"هـ","phone":""}'::jsonb);

select 'T4 signup with 0512345678 (expect +966512345678): ' || coalesce(phone, 'NULL')
  from public.profiles where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select 'T4 signup with garbage (expect NULL): ' || coalesce(phone, 'NULL')
  from public.profiles where id = 'cccccccc-0000-0000-0000-00000000000c';
select 'T4 signup with ٠٥١٢٣٤٥٦٧٨ (expect +966512345678): ' || coalesce(phone, 'NULL')
  from public.profiles where id = 'dddddddd-0000-0000-0000-00000000000d';
select 'T4 signup with empty phone (expect NULL): ' || coalesce(phone, 'NULL')
  from public.profiles where id = 'eeeeeeee-0000-0000-0000-00000000000e';
select 'T4 all four accounts were still created (expect 4): ' || count(*)
  from public.profiles
 where id in ('bbbbbbbb-0000-0000-0000-00000000000b','cccccccc-0000-0000-0000-00000000000c',
              'dddddddd-0000-0000-0000-00000000000d','eeeeeeee-0000-0000-0000-00000000000e');

-- ── T5 · the 20260827 clamps survived the carry-forward ─────────────────────
-- The ⚠ warning in 20260827: losing v_sub_role or v_rep_capacity breaks
-- provider and corporate signup with a 23502 that aborts the auth.users insert.
select 'T5 whitelist|sub_role|rep_capacity|country_code intact (expect t|t|t|t): '
       || (position('''micro'', ''provider'', ''government'', ''ngo''' in prosrc) > 0)::text || '|'
       || (position('v_sub_role' in prosrc) > 0)::text || '|'
       || (position('v_rep_capacity' in prosrc) > 0)::text || '|'
       || (position('country_code' in prosrc) > 0)::text
  from pg_proc where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace;

-- ── T6 · nothing in the table violates the constraint ───────────────────────
select 'T6 rows violating the constraint (expect 0): ' || count(*)
  from public.profiles where phone is not null and phone !~ '^\+9665[0-9]{8}$';
