-- admin_mfa.test.sql — proves 20261127_50 (batch l7-admin2fa, owner item 18).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_admin_mfa.sql \
--     $M/20261127_50_admin_mfa.sql $M/20261127_50_admin_mfa.sql \
--     $T/admin_mfa.test.sql
--
-- NEGATIVE CONTROL (must FAIL): without the migration —
--   bash $T/run.sh $T/prelude_admin_mfa.sql $T/admin_mfa.test.sql
--   → "T1 FAIL" / a missing relation: nothing of 20261127_50 exists.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),   -- admin, enrolled
  ('00000000-0000-0000-0000-0000000000a2'),   -- admin, not enrolled
  ('00000000-0000-0000-0000-0000000000b1');   -- lawyer
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', 'lawyer');
insert into auth.mfa_factors (user_id, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'verified'),
  ('00000000-0000-0000-0000-0000000000a2', 'unverified');  -- an abandoned enrolment does not count

-- T1: catalog — service role only.
do $$
begin
  if to_regclass('public.admin_mfa_backup_codes') is null then
    raise exception 'T1 FAIL: admin_mfa_backup_codes is missing';
  end if;
  if has_table_privilege('authenticated', 'public.admin_mfa_backup_codes', 'SELECT')
     or has_table_privilege('anon', 'public.admin_mfa_backup_codes', 'SELECT')
     or has_table_privilege('authenticated', 'public.admin_mfa_events', 'SELECT')
     or has_function_privilege('authenticated', 'public.admin_mfa_backup_code_consume(uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_mfa_backup_codes_replace(uuid, text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_login_seen(uuid, uuid, text, text, text)', 'EXECUTE') then
    raise exception 'T1 FAIL: a user role reaches the MFA tables or functions';
  end if;
  if not has_function_privilege('service_role', 'public.admin_mfa_backup_code_consume(uuid, text)', 'EXECUTE') then
    raise exception 'T1 FAIL: service_role cannot consume a code';
  end if;
  raise notice 'T1 PASS: service role only';
end $$;

-- T2: is_admin() — enrolled admin needs aal2; unenrolled admin unchanged; lawyer never.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
select set_config('test.jwt', '{"aal":"aal1"}', false);
do $$ begin
  if public.is_admin() or (select count(*) from public.admin_only_notes) <> 0 then
    raise exception 'T2 FAIL: an enrolled admin on an aal1 session is still admin';
  end if;
end $$;
select set_config('test.jwt', '{"aal":"aal2"}', false);
do $$ begin
  if not public.is_admin() or (select count(*) from public.admin_only_notes) <> 1 then
    raise exception 'T2 FAIL: an enrolled admin on an aal2 session is not admin';
  end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', false);
select set_config('test.jwt', '{"aal":"aal1"}', false);
do $$ begin
  if not public.is_admin() or (select count(*) from public.admin_only_notes) <> 1 then
    raise exception 'T2 FAIL: an unenrolled admin lost admin';
  end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
select set_config('test.jwt', '{"aal":"aal2"}', false);
do $$ begin
  if public.is_admin() or (select count(*) from public.admin_only_notes) <> 0 then
    raise exception 'T2 FAIL: a lawyer with aal2 became admin';
  end if;
  raise notice 'T2 PASS: is_admin() asks aal2 only of an enrolled admin';
end $$;
reset role;

-- T3: codes — replace needs 10 distinct hashes and a staff account; consume once.
set role service_role;
do $$
declare
  hs text[] := array(select encode(sha256(('c' || g)::bytea), 'hex') from generate_series(1, 10) g);
  n int;
  r text;
begin
  begin
    perform public.admin_mfa_backup_codes_replace('00000000-0000-0000-0000-0000000000a1', hs[1:9]);
    raise exception 'T3 FAIL: 9 hashes accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.admin_mfa_backup_codes_replace('00000000-0000-0000-0000-0000000000b1', hs);
    raise exception 'T3 FAIL: a lawyer got backup codes';
  exception when sqlstate '42501' then null;
  end;
  n := public.admin_mfa_backup_codes_replace('00000000-0000-0000-0000-0000000000a1', hs);
  if n <> 10 then raise exception 'T3 FAIL: replace wrote %', n; end if;
  n := public.admin_mfa_backup_codes_replace('00000000-0000-0000-0000-0000000000a1', hs);  -- regenerate
  if (select count(*) from public.admin_mfa_backup_codes where user_id = '00000000-0000-0000-0000-0000000000a1') <> 10 then
    raise exception 'T3 FAIL: regenerate did not replace the set';
  end if;
  r := public.admin_mfa_backup_code_consume('00000000-0000-0000-0000-0000000000a1', hs[3]);
  if r <> 'ok' then raise exception 'T3 FAIL: first use answered %', r; end if;
  r := public.admin_mfa_backup_code_consume('00000000-0000-0000-0000-0000000000a1', hs[3]);
  if r <> 'invalid' then raise exception 'T3 FAIL: second use answered %', r; end if;
  if (select count(*) from public.admin_mfa_backup_codes
       where user_id = '00000000-0000-0000-0000-0000000000a1' and used_at is null) <> 9 then
    raise exception 'T3 FAIL: unused count is not 9';
  end if;
  raise notice 'T3 PASS: 10 codes, regenerate replaces, each usable once';
end $$;

-- T4: lockout after 5 refused codes in 15 minutes (the one above counted once).
do $$
declare r text; i int;
begin
  for i in 1..4 loop
    r := public.admin_mfa_backup_code_consume('00000000-0000-0000-0000-0000000000a1', repeat('0', 64));
    if r <> 'invalid' then raise exception 'T4 FAIL: refusal % answered %', i, r; end if;
  end loop;
  r := public.admin_mfa_backup_code_consume('00000000-0000-0000-0000-0000000000a1', encode(sha256('c4'::bytea), 'hex'));
  if r <> 'locked' then raise exception 'T4 FAIL: a valid code after 5 refusals answered %', r; end if;
  raise notice 'T4 PASS: locked after 5 refusals';
end $$;

-- T5: one login row per session.
do $$ begin
  if not public.admin_login_seen('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001',
                                 '203.0.113.9', 'Chrome', 'login') then
    raise exception 'T5 FAIL: first sight answered false';
  end if;
  if public.admin_login_seen('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001',
                             '203.0.113.9', 'Chrome', 'admin_api') then
    raise exception 'T5 FAIL: second sight answered true';
  end if;
  raise notice 'T5 PASS: the new-login alert fires once per session';
end $$;
reset role;
