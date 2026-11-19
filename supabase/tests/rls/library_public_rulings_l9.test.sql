-- library_public_rulings_l9.test.sql — proves 20261129_50 (batch l9-reader):
--   * public_full_rulings_per_collection goes from batch 8's
--     {"full":0,"excerpt_chars":180} to {"full":2} (explicit UPDATE);
--   * an admin's later value ({"full":3}, the .setup.sql step) is replaced by
--     a re-run (the header says so);
--   * chain B: the row is created when 20261128_30 never ran.
--
-- CHAIN A (run.sh, postgres:16; stubs.sql loads first by itself). From the
-- repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260627_platform_settings.sql \
--     $M/20261030_80_library_read_quota.sql \
--     $M/20261031_10_library_activity_monitor.sql \
--     $M/20261103_10_library_auto_lock_hours.sql \
--     $M/20261107_20_library_caps_owner_426.sql \
--     $M/20261128_30_library_public_guard.sql \
--     $M/20261129_50_library_public_rulings_two.sql \
--     $T/library_public_rulings_l9.setup.sql \
--     $M/20261129_50_library_public_rulings_two.sql \
--     $M/20261129_50_library_public_rulings_two.sql \
--     $T/library_public_rulings_l9.test.sql
-- CHAIN B (the insert path): bash $T/run.sh $M/20260627_platform_settings.sql \
--     $M/20261129_50_library_public_rulings_two.sql $T/library_public_rulings_l9.test.sql
--
-- NEGATIVE CONTROLS (must FAIL): chain A without its last two 20261129_50
-- lines → T1 (the admin's {"full":3} is still there); chain B without
-- 20261129_50 → T1 (no row).

\set ON_ERROR_STOP on

-- T1: the owner's value, whatever was stored before.
do $$
begin
  if (select value from public.platform_settings where key = 'public_full_rulings_per_collection') is distinct from '{"full":2}'::jsonb then
    raise exception 'T1: public_full_rulings_per_collection is not {"full":2}: %',
      (select value from public.platform_settings where key = 'public_full_rulings_per_collection');
  end if;
end $$;

-- T2: no excerpt key is left.
do $$
begin
  if exists (select 1 from public.platform_settings where key = 'public_full_rulings_per_collection' and value ? 'excerpt_chars') then
    raise exception 'T2: the cancelled excerpt key is still stored';
  end if;
end $$;

select 'library_public_rulings_l9: all assertions passed' as result;
