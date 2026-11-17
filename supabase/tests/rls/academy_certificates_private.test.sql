-- academy_certificates_private.test.sql — proves 20261122_50 (N05-A1).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260820_academy_schema.sql \
--     $M/20261109_14_academy_certificates_policy_service_role.sql \
--     $M/20261122_50_academy_certificates_private.sql \
--     $M/20261122_50_academy_certificates_private.sql \
--     $T/academy_certificates_private.test.sql
-- NEGATIVE CONTROL (must FAIL): the chain without the two 20261122_50 files
--   → "T1 FAIL: anon read 2 certificate(s)".
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000ce001'), ('00000000-0000-0000-0000-0000000ce002');
insert into academy.certificates (user_id, user_name, course_title, category_name, score, verify_id,
                                  issued_date_hijri, issued_date_gregorian) values
  ('00000000-0000-0000-0000-0000000ce001', 'سارة أحمد', 'دورة', 'قسم', 90, 'NZ-AAA-111', '١٤٤٨', '2026'),
  ('00000000-0000-0000-0000-0000000ce002', 'خالد علي', 'دورة', 'قسم', 80, 'NZ-BBB-222', '١٤٤٨', '2026');

grant usage on schema academy to anon, authenticated;
grant select on academy.certificates to anon, authenticated;

-- T1 a guest reads nothing
set role anon;
do $$
declare n int;
begin
  select count(*) into n from academy.certificates;
  if n <> 0 then raise exception 'T1 FAIL: anon read % certificate(s)', n; end if;
  raise notice 'T1 PASS: a guest reads no certificate';
end $$;
reset role;

-- T2 a holder reads his own row only
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000ce001', false);
do $$
declare n int; v text;
begin
  select count(*), min(verify_id) into n, v from academy.certificates;
  if n <> 1 or v <> 'NZ-AAA-111' then raise exception 'T2 FAIL: holder read % row(s), %', n, v; end if;
  raise notice 'T2 PASS: a holder reads only his own certificate';
end $$;

-- T3 the lookup is not callable by a session
do $$
begin
  begin
    perform public.academy_verify_certificate('NZ-BBB-222', 'خالد علي');
    raise exception 'T3 FAIL: authenticated called academy_verify_certificate';
  exception when insufficient_privilege then
    raise notice 'T3 PASS: authenticated cannot call the lookup';
  end;
end $$;
reset role;
select set_config('test.uid', '', false);

-- T4 the lookup needs the number AND the name (as the service role / owner)
do $$
declare n int;
begin
  select count(*) into n from public.academy_verify_certificate('NZ-BBB-222', '  خالد   علي ');
  if n <> 1 then raise exception 'T4 FAIL: number + name (loose spacing) found % row(s)', n; end if;
  select count(*) into n from public.academy_verify_certificate('NZ-BBB-222', 'سارة أحمد');
  if n <> 0 then raise exception 'T4 FAIL: a wrong name found % row(s)', n; end if;
  select count(*) into n from public.academy_verify_certificate('NZ-BBB-222', '');
  if n <> 0 then raise exception 'T4 FAIL: an empty name found % row(s)', n; end if;
  select count(*) into n from public.academy_verify_certificate('NZ-XXX-000', 'خالد علي');
  if n <> 0 then raise exception 'T4 FAIL: a wrong number found % row(s)', n; end if;
  raise notice 'T4 PASS: one certificate only with the right number and name';
end $$;

select 'academy_certificates_private: ALL PASS' as result;
