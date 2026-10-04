-- Chain step (NOT a migration) for entity_members_no_recursion.test.sql.
--
-- Runs AFTER 20260914_entity_memberships_and_business_requests.sql and BEFORE
-- 20260921_03_entity_rls_recursion_fix.sql, and proves that the chain of REAL
-- migrations reproduces UAT-TEAM-001 — `42P17 infinite recursion detected in
-- policy for relation "<x>_members"` — on all four membership tables, exactly
-- as the live probe of 2026-09-20 observed it (audit 06, probe B).
--
-- If any of the four does NOT recurse here, the run fails: the test that
-- follows would then be proving that 20260921_03 fixed something that was
-- never broken in this harness.
--
-- No fixtures are needed. The cycle is detected while the query is rewritten,
-- before a single row is read, so an empty table raises it too. RLS is skipped
-- for superusers, so the probe runs as app_user.

set role app_user;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);

do $$
declare
  t         text;
  n         int;
  recursed  text[] := '{}';
  clean     text[] := '{}';
begin
  foreach t in array array[
    'firm_members', 'business_members', 'government_members', 'ngo_members'
  ] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      clean := clean || t;
    exception
      when sqlstate '42P17' then
        recursed := recursed || t;
        raise notice 'DEFECT REPRODUCED (UAT-TEAM-001): select from public.% → 42P17 infinite recursion', t;
      when others then
        raise exception 'defect proof: public.% failed with % (%), which is not the defect under test', t, sqlstate, sqlerrm;
    end;
  end loop;

  if array_length(recursed, 1) is distinct from 4 then
    raise exception
      'defect proof: expected 42P17 on all four membership tables, got it on % (these did not recurse: %)',
      recursed, clean;
  end if;
end $$;

-- The same cycle is visible from the profile side; reported, not asserted,
-- because the <x>_profiles arm of the cycle is the one 20260916 partly moved.
do $$
declare
  t text;
  n int;
begin
  foreach t in array array[
    'firm_profiles', 'business_profiles', 'government_profiles', 'ngo_profiles'
  ] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      raise notice 'before 20260921_03: select from public.% succeeded (% rows)', t, n;
    exception when others then
      raise notice 'before 20260921_03: select from public.% → % %', t, sqlstate, sqlerrm;
    end;
  end loop;
end $$;

reset role;
select set_config('test.uid', '', false);
