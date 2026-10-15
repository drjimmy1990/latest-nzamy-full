-- profiles_members_write_lock.test.sql — proves 20261016_02 (owner decisions ٢٩ + ٣٠).
--
-- TWO CHAINS run this same file; each half skips itself when its tables are
-- not the real ones.
--
-- A) profiles (the real table and policies):
--   M=supabase/migrations; R=supabase/tests/rls; bash $R/run.sh \
--     $R/prelude_profiles_rls_chain.sql $M/20260603_phase1_001_profiles.sql \
--     $M/20260625_fix_rls_recursion.sql $R/prelude_profiles_leak_injection.sql \
--     $M/20260921_01_profiles_rls_lockdown.sql $R/prelude_profiles_live_columns.sql \
--     $M/20261016_02_profiles_members_write_lock.sql $M/20261016_02_profiles_members_write_lock.sql \
--     $R/profiles_members_write_lock.test.sql
-- B) the four entity membership tables (the real tables and policies):
--   M=supabase/migrations; R=supabase/tests/rls; bash $R/run.sh \
--     $R/prelude_entity_rls_chain.sql $M/20260616_entities_setup_and_rls_fix.sql \
--     $M/20260617_fix_remaining_rls.sql $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260914_entity_memberships_and_business_requests.sql \
--     $M/20260921_03_entity_rls_recursion_fix.sql $M/20260922_02_members_accept_own_invitation.sql \
--     $R/prelude_profiles_live_columns.sql \
--     $M/20261016_02_profiles_members_write_lock.sql $M/20261016_02_profiles_members_write_lock.sql \
--     $R/profiles_members_write_lock.test.sql
--
-- Privileges are exercised as role `authenticated` itself (what PostgREST runs a
-- signed-in request as): app_user holds direct grants on every public table in
-- this harness, so it cannot show a revoke. auth.uid() reads test.uid.
-- Every assertion RAISES on failure.

-- ── A) profiles ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                     and policyname = 'users update own profile') then
    raise notice 'A) skipped — not the profiles chain';
    return;
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'verified_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'nafath_verified', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'metadata', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'user_type', 'UPDATE') then
    raise exception 'A1 FAIL: authenticated can still UPDATE a protected profiles column';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.profiles', 'nationality', 'UPDATE') then
    raise exception 'A1 FAIL: authenticated lost an editable profiles column';
  end if;
  raise notice 'A1 PASS: email / verified_at / nafath_verified / metadata / user_type not updatable; the 11 settings columns are';
end $$;

set role authenticated;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare
  n int;
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                  and policyname = 'users update own profile') then
    return;
  end if;
  -- The settings write PATCH /api/v1/profile makes still works on one's own row.
  update public.profiles set display_name = 'الاسم الجديد', city = 'الرياض', theme = 'dark'
   where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'A2 FAIL: own settings update touched % rows', n;
  end if;
  -- The protected columns are refused outright.
  begin
    update public.profiles set email = 'a@example.test' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    raise exception 'A2 FAIL: email was self-updated';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set nafath_verified = true, verified_at = now()
     where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    raise exception 'A2 FAIL: verification was self-set';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set metadata = '{"role":"judge"}' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    raise exception 'A2 FAIL: metadata was self-updated';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    raise exception 'A2 FAIL: a profile was self-deleted';
  exception when insufficient_privilege then null;
  end;
  -- Another user's row is still out of reach (RLS).
  update public.profiles set display_name = 'x' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'A2 FAIL: updated another user''s profile (% rows)', n;
  end if;
  raise notice 'A2 PASS: own settings update works; email / verification / metadata / delete raise insufficient_privilege; a foreign row is untouched';
end $$;
reset role;

set role service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                  and policyname = 'users update own profile') then
    return;
  end if;
  update public.profiles set email = 'b2@example.test', nafath_verified = true
   where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise notice 'A3 PASS: the service role (admin tools, server routes) still writes email and verification';
end $$;
reset role;

-- ── B) the entity membership tables ──────────────────────────────────────────
do $$
declare
  t text;
begin
  if to_regclass('public.government_members') is null then
    raise notice 'B) skipped — not the entity chain';
    return;
  end if;
  foreach t in array array['firm_members', 'business_members', 'government_members', 'ngo_members']
  loop
    if has_table_privilege('authenticated', 'public.' || t, 'DELETE')
       or has_table_privilege('anon', 'public.' || t, 'DELETE') then
      raise exception 'B1 FAIL: an API role can DELETE public.%', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                and cmd in ('DELETE', 'ALL') and roles && array['anon', 'authenticated', 'public']::name[]) then
      raise exception 'B1 FAIL: a DELETE policy survives on public.%', t;
    end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT')
       or not has_table_privilege('authenticated', 'public.' || t, 'UPDATE') then
      raise exception 'B1 FAIL: authenticated lost SELECT / UPDATE on public.% (the status-change removal needs UPDATE)', t;
    end if;
  end loop;
  raise notice 'B1 PASS: no API-role DELETE privilege or policy on the four membership tables; SELECT / UPDATE kept';
end $$;

-- A DELETE is refused at the privilege check, before any row or policy is
-- looked at, so no fixture rows are needed here.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
declare
  t text;
begin
  if to_regclass('public.government_members') is null then
    return;
  end if;
  -- The entity OWNER — whose policy used to allow it — cannot hard-delete.
  foreach t in array array['firm_members', 'business_members', 'government_members', 'ngo_members']
  loop
    begin
      execute format('delete from public.%I', t);
      raise exception 'B2 FAIL: the owner hard-deleted rows of public.%', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'B2 PASS: an entity owner''s DELETE on every membership table raises insufficient_privilege';
end $$;
reset role;
