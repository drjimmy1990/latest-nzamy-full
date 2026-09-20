-- ============================================================
-- prelude_seed_phones.sql — chain step for profiles_phone_e164.test.sql
--
-- NOT a migration. Seeds the six `profiles.phone` shapes that
-- 20260921_04_profiles_phone_e164_check.sql has to deal with, and it must run
-- BETWEEN 20260827_signup_contact_fields.sql and 20260921_04 — the harness
-- runs every chain step before the test file, so a backfill cannot be tested
-- from the test file itself.
--
-- The phone column is set explicitly rather than left to whatever
-- handle_new_user() happens to be at this point in the chain: the seed is the
-- input to the migration under test and must not move when that function does.
--
-- ⚠ It ALSO works around a defect that is not this work package's to fix.
-- `20260603_phase1_001_profiles.sql:70-77` defines
--
--     create policy "admins read all profiles" on public.profiles for select
--       using (exists (select 1 from public.profiles p
--                       where p.id = auth.uid() and p.user_type = 'admin'));
--
-- — a SELECT policy on `public.profiles` whose USING clause selects from
-- `public.profiles`. Evaluating it re-enters itself, so as ANY non-superuser
-- every statement on the table raises 42P17 «infinite recursion detected in
-- policy for relation "profiles"». That is the same recursion class appendix
-- 01 §4 documents for the entity tables, and the fix belongs to WP-1's
-- `20260921_01_profiles_rls_lockdown.sql`, which re-creates the three
-- sanctioned policies. Until that lands, no test can touch profiles as
-- `app_user` at all, so the policy is restated below through the existing
-- SECURITY DEFINER helper `public.is_admin()` (stubs.sql), which is exactly
-- how every other admin policy in this repo is written and which cannot
-- recurse. Nothing is weakened: the predicate is the same one.
-- ============================================================

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles" on public.profiles for select
  using (public.is_admin());

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-0000-0000-0000-000000000001', 'local@example.test',   '{"user_type":"individual","full_name":"صيغة محلية"}'::jsonb),
  ('22222222-0000-0000-0000-000000000002', 'arabic@example.test',  '{"user_type":"individual","full_name":"أرقام عربية"}'::jsonb),
  ('33333333-0000-0000-0000-000000000003', 'intl00@example.test',  '{"user_type":"individual","full_name":"صيغة 00966"}'::jsonb),
  ('44444444-0000-0000-0000-000000000004', 'e164@example.test',    '{"user_type":"individual","full_name":"صيغة E.164"}'::jsonb),
  ('55555555-0000-0000-0000-000000000005', 'blank@example.test',   '{"user_type":"individual","full_name":"فراغ"}'::jsonb),
  ('66666666-0000-0000-0000-000000000006', 'garbage@example.test', '{"user_type":"individual","full_name":"قيمة تالفة"}'::jsonb);

-- These six rows exist because handle_new_user() created them. Set the phone
-- to the exact string each case is about.
update public.profiles set phone = '0512345678'                    where id = '11111111-0000-0000-0000-000000000001';
update public.profiles set phone = '٠٥١٢٣٤٥٦٧٨'                     where id = '22222222-0000-0000-0000-000000000002';
update public.profiles set phone = '00966512345678'                where id = '33333333-0000-0000-0000-000000000003';
update public.profiles set phone = '+966512345678'                 where id = '44444444-0000-0000-0000-000000000004';
update public.profiles set phone = ' '                             where id = '55555555-0000-0000-0000-000000000005';
update public.profiles set phone = 'letters-and-email@example.test' where id = '66666666-0000-0000-0000-000000000006';

do $$
declare v_seeded bigint;
begin
  select count(*) into v_seeded from public.profiles
   where id in ('11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002',
                '33333333-0000-0000-0000-000000000003','44444444-0000-0000-0000-000000000004',
                '55555555-0000-0000-0000-000000000005','66666666-0000-0000-0000-000000000006');
  if v_seeded <> 6 then
    raise exception 'seed prelude: expected 6 profiles rows from handle_new_user(), found %', v_seeded;
  end if;
end $$;
