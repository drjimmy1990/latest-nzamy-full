-- l18_access_admin_saved.test.sql — 20261208_40 never overwrites an admin's
-- choice (owner ق٢٦-٢ / ق٢٦-٣: change only what no admin decided).
--
-- CHAIN (run.sh, postgres:16). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260627_platform_settings.sql $R/prelude_l18_access_admin_saved.sql \
--     $M/20261208_40_l18_access_defaults.sql $M/20261208_40_l18_access_defaults.sql \
--     $R/l18_access_admin_saved.test.sql
--   Expect: «library switch rows changed: 0 (saved by an admin: true)» plus the
--   «an admin saved the library switch» notice, «free questions rows changed: 0».
-- Synthetic fixtures only. Every assertion RAISES on failure.
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;

select pg_temp.expect('S1 admin library switch kept',
  (select value::text from public.platform_settings where key = 'library_access_by_account_type'),
  '{"firm": false, "lawyer": true, "business": false, "provider": false, "consultant": false, "individual": true}');
select pg_temp.expect('S2 admin stamp kept',
  (select updated_by::text from public.platform_settings where key = 'library_access_by_account_type'),
  '00000000-0000-4000-8000-0000000018a1');
select pg_temp.expect('S3 admin firm 0 kept',
  (select value::text from public.platform_settings where key = 'free_questions_by_account_type'),
  '{"firm": 0, "lawyer": 10, "individual": 5}');
