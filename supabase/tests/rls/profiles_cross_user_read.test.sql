-- RLS acceptance test for 20260921_01_profiles_rls_lockdown.sql — UAT-SEC-001.
--
-- CHAIN (run.sh / run-local.sh, in this order):
--   supabase/tests/rls/prelude_profiles_rls_chain.sql        ← drops the stub
--       `public.profiles` from stubs.sql so the REAL table/policies are used,
--       adds the auth.users columns handle_new_user() reads, and stubs
--       public.groups/group_members for 20260625.
--   supabase/migrations/20260603_phase1_001_profiles.sql     ← real profiles + 3 policies
--   supabase/migrations/20260625_fix_rls_recursion.sql       ← is_admin() + non-recursive admin policy
--   supabase/tests/rls/prelude_profiles_leak_injection.sql   ← actors + the live
--       defect ("Enable read access for all users", to authenticated, using (true)),
--       and the proof that A can read B WITH the defect in place.
--   supabase/migrations/20260921_01_profiles_rls_lockdown.sql
--   supabase/tests/rls/profiles_cross_user_read.test.sql     ← this file
--
-- Actors (created by the injection prelude, through the real handle_new_user):
--   A  aaaaaaaa-…001  lawyer      B  bbbbbbbb-…002  individual
--   D  dddddddd-…004  admin       C  eeeeeeee-…005  individual
--
-- No `\set ON_ERROR_STOP 0` here on purpose: the runner passes
-- ON_ERROR_STOP=1, so every `raise exception` below fails the run.
\pset format unaligned
\pset tuples_only on

-- ── the defect is gone, by name and by count ───────────────────────────────
do $$
declare
  n int;
  names text;
begin
  select count(*) into n from pg_policy
   where polrelid = 'public.profiles'::regclass
     and polname = 'Enable read access for all users';
  if n <> 0 then
    raise exception 'T1 FAIL: the out-of-band permissive policy survived 20260921_01';
  end if;

  select count(*), string_agg(polname, ' · ' order by polname) into n, names
    from pg_policy where polrelid = 'public.profiles'::regclass;
  if n <> 3 then
    raise exception 'T1 FAIL: expected 3 policies on public.profiles, found % (%)', n, names;
  end if;
  raise notice 'T1 PASS: the dynamic drop removed the unsanctioned policy; survivors = %', names;
end $$;

select 'T1 policies on public.profiles (expect 3): ' || count(*)
  from pg_policy where polrelid = 'public.profiles'::regclass;

-- ── from here on: app_user (a member of `authenticated`), RLS enforced ─────
set role app_user;

-- A
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select 'T2 A reads own profile (expect 1): ' || count(*)
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select 'T2 A reads B''s profile (expect 0): ' || count(*)
  from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select 'T2 A reads the whole table (expect 1 — its own row): ' || count(*)
  from public.profiles;

do $$
declare n int;
begin
  select count(*) into n from public.profiles
   where id <> 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'T2 FAIL: A still sees % foreign profile row(s) — UAT-SEC-001 is open', n;
  end if;
  raise notice 'T2 PASS: A sees no foreign profile row (UAT-SEC-001 closed for the leaking policy)';
end $$;

-- B, the other direction
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T3 B reads own profile (expect 1): ' || count(*)
  from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select 'T3 B reads A''s profile (expect 0): ' || count(*)
  from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- admin still reads everything, through public.is_admin()
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
select 'T4 admin reads A and B (expect 2): ' || count(*)
  from public.profiles
 where id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n <> 4 then
    raise exception 'T4 FAIL: admin sees % of the 4 profile rows', n;
  end if;
  raise notice 'T4 PASS: admin reads all 4 rows via public.is_admin()';
end $$;

-- own-row UPDATE still works; a foreign UPDATE still matches nothing
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
update public.profiles set display_name = 'العميل ب (محدَّث)'
 where id = 'bbbbbbbb-0000-0000-0000-000000000002';
select 'T5 B updated own display_name (expect 1): ' || count(*)
  from public.profiles
 where id = 'bbbbbbbb-0000-0000-0000-000000000002' and display_name = 'العميل ب (محدَّث)';
do $$
declare n int;
begin
  update public.profiles set display_name = 'اختراق'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'T5 FAIL: B updated % row(s) of A''s profile', n;
  end if;
  raise notice 'T5 PASS: B''s UPDATE of A''s profile touched 0 rows';
end $$;

-- ── anon has no grant at all any more ──────────────────────────────────────
reset role;
set role anon;
select set_config('test.uid', '', false);
do $$
begin
  perform 1 from public.profiles;
  raise exception 'T6 FAIL: anon can still SELECT public.profiles';
exception
  when insufficient_privilege then
    raise notice 'T6 PASS: anon SELECT on public.profiles refused (42501 — grant revoked)';
end $$;

reset role;

-- ── footer: what the live DB should look like after this migration ─────────
select 'policies: ' || string_agg(polname || '[' || polcmd::text || ']', ' · ' order by polname)
  from pg_policy where polrelid = 'public.profiles'::regclass;
select 'anon DML grants on public.profiles (expect 0): ' || count(*)
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'profiles'
   and grantee = 'anon' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');
select 'relrowsecurity (expect t): ' || relrowsecurity::text
  from pg_class where oid = 'public.profiles'::regclass;
