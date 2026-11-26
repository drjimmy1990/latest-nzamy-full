-- l18_access.test.sql — proves 20261208_40 (batch l18: owner ق٢٦-٢ library
-- open for lawyer + consultant + firm; ق٢٦-٣ the firm's 10 free questions).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261208_40
-- runs TWICE. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260627_platform_settings.sql $R/prelude_l18_access.sql \
--     $M/20261208_40_l18_access_defaults.sql $M/20261208_40_l18_access_defaults.sql \
--     $R/l18_access.test.sql
--   Expect: run 1 «library switch rows changed: 1», «free questions rows
--   changed: 1»; run 2 «… changed: 0» twice; «l18_access verify: OK» both times.
-- NEGATIVE CONTROL (must FAIL): add $R/sabotage_l18_access.sql after the two
--   20261208_40 lines → «A2 consultant open FAIL: got false, want true».
-- The admin-saved case is l18_access_admin_saved.test.sql.
-- Synthetic fixtures only. Every assertion RAISES on failure.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;

-- A. ق٢٦-٢: only consultant + firm flipped; the rest exactly as seeded.
select pg_temp.expect('A1 lawyer open', (select (value ->> 'lawyer') from public.platform_settings where key = 'library_access_by_account_type'), 'true');
select pg_temp.expect('A2 consultant open', (select (value ->> 'consultant') from public.platform_settings where key = 'library_access_by_account_type'), 'true');
select pg_temp.expect('A3 firm open', (select (value ->> 'firm') from public.platform_settings where key = 'library_access_by_account_type'), 'true');
select pg_temp.expect('A4 individual still closed', (select (value ->> 'individual') from public.platform_settings where key = 'library_access_by_account_type'), 'false');
select pg_temp.expect('A5 business still closed', (select (value ->> 'business') from public.platform_settings where key = 'library_access_by_account_type'), 'false');
select pg_temp.expect('A6 provider still closed', (select (value ->> 'provider') from public.platform_settings where key = 'library_access_by_account_type'), 'false');
select pg_temp.expect('A7 no admin stamp written', (select (updated_by is null)::text from public.platform_settings where key = 'library_access_by_account_type'), 'true');

-- B. ق٢٦-٣: firm 10 added, lawyer 10 / individual 5 kept.
select pg_temp.expect('B1 free questions', (select value::text from public.platform_settings where key = 'free_questions_by_account_type'), '{"firm": 10, "lawyer": 10, "individual": 5}');

-- C. the _verify.sql block said f before the migration, t after.
select pg_temp.expect('C1 verify block before (library)', (select ok::text from public.l18_access_verify_before where check_name = 'library'), 'false');
select pg_temp.expect('C2 verify block before (free questions)', (select ok::text from public.l18_access_verify_before where check_name = 'free_questions'), 'false');
select pg_temp.expect('C3 verify block after (library)',
  (select coalesce((select ps.updated_by is not null
                           or ((ps.value -> 'lawyer') = 'true'::jsonb and (ps.value -> 'consultant') = 'true'::jsonb and (ps.value -> 'firm') = 'true'::jsonb)
                      from public.platform_settings ps where ps.key = 'library_access_by_account_type'), false)::text), 'true');
select pg_temp.expect('C4 verify block after (free questions)',
  (select coalesce((select ps.value ? 'firm' from public.platform_settings ps where ps.key = 'free_questions_by_account_type'), false)::text), 'true');
