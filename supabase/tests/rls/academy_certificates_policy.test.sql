-- academy_certificates_policy.test.sql — proves 20261109_14 (X-4): the
-- «Service role manage certificates» policy on academy.certificates applies
-- to service_role only, so a signed-in user who somehow holds write grants on
-- the table still cannot issue a certificate. 20261109_14 runs TWICE.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260820_academy_schema.sql \
--     $T/prelude_academy_write_grants.sql \
--     $M/20261109_14_academy_certificates_policy_service_role.sql \
--     $M/20261109_14_academy_certificates_policy_service_role.sql \
--     $T/academy_certificates_policy.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261109_14 lines fails at
-- T1 (authenticated issues a certificate through the open policy).
-- NO ACADEMY SCHEMA: `bash $T/run.sh $M/20261109_14_… <any test file>` on
-- the bare stubs shows the file is a no-op there (NOTICE «nothing to do», its
-- check row true) — recorded in the task report.
--
-- Every assertion RAISES on failure.

-- T1 a signed-in user with a write grant (prelude) cannot insert a certificate
select set_config('test.uid', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;
do $$
begin
  begin
    insert into academy.certificates (user_id, user_name, course_title, category_name, score, verify_id,
                                      issued_date_hijri, issued_date_gregorian)
    values (null, 'x', 'x', 'x', 100, 'FORGED-1', 'x', 'x');
    raise exception 'T1 FAIL: authenticated issued a certificate';
  exception when insufficient_privilege then null;   -- RLS: new row violates row-level security policy (42501)
  end;
end $$;
reset role;

-- T2 the policy is TO service_role, and the public verification read is kept
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'academy' and tablename = 'certificates'
                    and policyname = 'Service role manage certificates'
                    and roles = array['service_role']::name[] and cmd = 'ALL') then
    raise exception 'T2 FAIL: «Service role manage certificates» is not FOR ALL TO service_role';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'academy' and tablename = 'certificates'
                    and policyname = 'Public verify certificates' and cmd = 'SELECT') then
    raise exception 'T2 FAIL: the public verification read policy is gone';
  end if;
end $$;

-- T3 service_role still writes
set role service_role;
insert into academy.certificates (user_id, user_name, course_title, category_name, score, verify_id,
                                  issued_date_hijri, issued_date_gregorian)
values (null, 'x', 'x', 'x', 100, 'REAL-1', 'x', 'x');
reset role;
select set_config('test.uid', '', false);

do $$ begin raise notice 'academy_certificates_policy: ALL PASS (T1–T3)'; end $$;
