-- profiles_national_address.test.sql — proves 20261017_10 (owner decisions ٥٦ / ٥٧).
--
-- POSITIVE (must pass; the migration runs twice to prove it is idempotent):
--   M=supabase/migrations; R=supabase/tests/rls; bash $R/run.sh \
--     $R/prelude_profiles_rls_chain.sql $M/20260603_phase1_001_profiles.sql \
--     $M/20260625_fix_rls_recursion.sql $R/prelude_profiles_leak_injection.sql \
--     $M/20260921_01_profiles_rls_lockdown.sql $R/prelude_profiles_live_columns.sql \
--     $M/20261016_02_profiles_members_write_lock.sql \
--     $M/20261017_10_profiles_national_address.sql $M/20261017_10_profiles_national_address.sql \
--     $R/profiles_national_address.test.sql
--
-- NEGATIVE CONTROL (must FAIL at N0 — the same chain without 20261017_10):
--   … $M/20261016_02_profiles_members_write_lock.sql $R/profiles_national_address.test.sql
--
-- RE-RUN HAZARD (must FAIL at N1 — 20261016_02 re-run after 20261017_10 takes
-- the column grant away; the migration header and the run order say so):
--   … $M/20261016_02_profiles_members_write_lock.sql \
--     $M/20261017_10_profiles_national_address.sql \
--     $M/20261016_02_profiles_members_write_lock.sql $R/profiles_national_address.test.sql
--
-- Privileges are exercised as role `authenticated` itself (what PostgREST runs
-- a signed-in request as). auth.uid() reads test.uid. Every assertion RAISES.

-- ── N0/N1: the column exists and its owner may write it ──────────────────────
do $$
begin
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.profiles'::regclass and attname = 'national_address'
                    and not attisdropped) then
    raise exception 'N0 FAIL: public.profiles.national_address does not exist (20261017_10 not applied)';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'national_address', 'UPDATE') then
    raise exception 'N1 FAIL: authenticated cannot UPDATE public.profiles.national_address (was 20261016_02 re-run after 20261017_10?)';
  end if;
  raise notice 'N0/N1 PASS: national_address exists and is self-editable';
end $$;

-- ── N2: the 20261016_02 lock is otherwise unchanged ──────────────────────────
do $$
begin
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'verified_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'nafath_verified', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'metadata', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'user_type', 'UPDATE') then
    raise exception 'N2 FAIL: a protected profiles column became writable';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'nationality', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.profiles', 'city', 'UPDATE') then
    raise exception 'N2 FAIL: a settings column lost its UPDATE grant';
  end if;
  if has_column_privilege('anon', 'public.profiles', 'national_address', 'UPDATE') then
    raise exception 'N2 FAIL: anon can write national_address';
  end if;
  raise notice 'N2 PASS: email / verification / metadata / user_type still locked; nationality and city still editable; anon cannot write';
end $$;

-- ── N3: own row — set, clear; another user's row — neither read nor written ──
set role authenticated;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare
  n int;
  v text;
begin
  update public.profiles
     set national_address = 'RRRD2929 — مبنى 2929، شارع الأمير محمد بن سلمان، حي الملقا، الرياض 13524، الرقم الإضافي 7788'
   where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'N3 FAIL: own national_address update touched % rows', n;
  end if;
  select national_address into v from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if v is null or v not like 'RRRD2929%' then
    raise exception 'N3 FAIL: own national_address did not read back (%)', v;
  end if;
  update public.profiles set national_address = null where id = 'bbbbbbbb-0000-0000-0000-000000000002';

  -- Someone else's row: RLS hides it for both read and write.
  update public.profiles set national_address = 'x' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'N3 FAIL: wrote another user''s national_address (% rows)', n;
  end if;
  select count(*) into n from public.profiles
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'N3 FAIL: read another user''s profile row';
  end if;
  raise notice 'N3 PASS: own national_address set, read back and cleared; another user''s row neither written nor read';
end $$;

-- ── N4: the shape — blank and over-long values are refused ───────────────────
do $$
begin
  begin
    update public.profiles set national_address = '   ' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    raise exception 'N4 FAIL: a blank national_address was stored';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set national_address = repeat('ع', 301) where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    raise exception 'N4 FAIL: a 301-character national_address was stored';
  exception when check_violation then null;
  end;
  update public.profiles set national_address = repeat('ع', 300) where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise notice 'N4 PASS: blank and >300 characters raise check_violation; 300 is accepted';
end $$;
reset role;
