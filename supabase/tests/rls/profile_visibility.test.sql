-- profile_visibility.test.sql — proves 20261025_50 (P6 N3.8, the profile
-- section switches) on the live lawyer_profiles shape. The migration runs TWICE
-- (idempotent). From the repo root:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261025_50_profile_visibility.sql \
--     $M/20261025_50_profile_visibility.sql \
--     $T/profile_visibility.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-25):
--   NC1 — the chain without 20261025_50 → "T1 FAIL: lawyer_profiles.show_services is missing".
--   NC2 — table-level UPDATE back on (a self-host GRANT ALL):
--     add `grant update on public.lawyer_profiles to authenticated;` to the
--     prelude → the migration refuses: "lawyer_profiles still has table-level
--     INSERT/UPDATE for the API roles".
-- People: …b1 verified + listed lawyer · …b2 pending lawyer · …c1 client.
-- The file runs as the superuser; every role-scoped assertion does `set local role`.
\set ON_ERROR_STOP on

-- T1: the columns, their default and the existing rows.
do $$
declare
  c text;
  n int;
begin
  foreach c in array array['show_services', 'show_education', 'show_courts'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'lawyer_profiles' and column_name = c) then
      raise exception 'T1 FAIL: lawyer_profiles.% is missing', c;
    end if;
  end loop;
  select count(*) into n from public.lawyer_profiles
   where show_services and show_education and show_courts;
  if n <> 2 then
    raise exception 'T1 FAIL: % of 2 existing lawyers show every section — the default must keep today''s profile', n;
  end if;
  raise notice 'T1 PASS: three switches, every existing lawyer starts with every section shown';
end $$;

-- T2: the lawyer switches his own sections off (the PATCH /api/v1/profile shape).
do $$
declare
  uid uuid;
  n   int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  execute 'set local role authenticated';
  update public.lawyer_profiles
     set show_services = false, show_education = false, show_courts = false
   where user_id = '00000000-0000-0000-0000-0000000000b1'
  returning user_id into uid;
  if uid is null then raise exception 'T2 FAIL: the lawyer could not save his switches'; end if;

  -- …but not another lawyer's (the row policy is "lawyers update own profile")
  update public.lawyer_profiles set show_courts = false
   where user_id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T2 FAIL: a lawyer switched off another lawyer''s section (% rows)', n; end if;

  -- the switches are not readable through REST, like show_contact
  begin
    perform show_education from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'T2 FAIL: a session read show_education through REST';
  exception when insufficient_privilege then null;
  end;
  reset role;

  select count(*) into n from public.lawyer_profiles
   where user_id = '00000000-0000-0000-0000-0000000000b2' and show_courts;
  if n <> 1 then raise exception 'T2 FAIL: the other lawyer''s switch moved'; end if;
  raise notice 'T2 PASS: the lawyer saves his own switches, not another''s, and a session cannot read them';
end $$;

-- T3: a guest can neither read nor write the switches.
do $$
begin
  perform set_config('test.uid', '', true);
  execute 'set local role anon';
  begin
    update public.lawyer_profiles set show_services = true;
    raise exception 'T3 FAIL: a guest wrote show_services';
  exception when insufficient_privilege then null;
  end;
  begin
    perform show_services from public.lawyer_profiles;
    raise exception 'T3 FAIL: a guest read show_services';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'T3 PASS: a guest gets 42501 on the switches, both ways';
end $$;

-- T4: the service role (the Next routes) reads them; the existing self-service
-- UPDATE list is intact; verification stays out of reach.
do $$
declare
  rec record;
begin
  execute 'set local role service_role';
  select show_services, show_education, show_courts into rec
    from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
  if rec.show_services or rec.show_education or rec.show_courts then
    raise exception 'T4 FAIL: the service role reads switches that do not match what the lawyer saved';
  end if;
  reset role;
  if not has_column_privilege('authenticated', 'public.lawyer_profiles', 'show_hourly_rate', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.lawyer_profiles', 'show_contact', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.lawyer_profiles', 'bio_ar', 'UPDATE') then
    raise exception 'T4 FAIL: the earlier self-service UPDATE grants were lost';
  end if;
  if has_column_privilege('authenticated', 'public.lawyer_profiles', 'verification_status', 'UPDATE') then
    raise exception 'T4 FAIL: a lawyer can self-verify';
  end if;
  raise notice 'T4 PASS: the service role reads the switches; show_contact / show_hourly_rate / bio grants intact; no self-verification';
end $$;

\echo 'profile_visibility.test.sql: ALL PASS'
