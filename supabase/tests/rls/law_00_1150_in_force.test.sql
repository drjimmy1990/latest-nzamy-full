-- law_00_1150_in_force.test.sql — proves the one-time file
-- supabase/one-time/2026-10-19_law_00_1150_in_force.sql (owner answer ٢١٢).
-- Chain (run.sh, postgres:16): the library schema, the status CHECK of
-- 20260911 (so 'active' is checked against the live constraint), the fixture
-- (the target law, three laws to leave alone, a snapshot, the confirmation
-- armed at the database level), then the one-time file TWICE, AS WRITTEN (the
-- second run must change nothing and still pass). Run from the repo root:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260626_legal_library_schema.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql \
--     $R/prelude_law_00_1150_fixture.sql \
--     supabase/one-time/2026-10-19_law_00_1150_in_force.sql \
--     supabase/one-time/2026-10-19_law_00_1150_in_force.sql \
--     $R/law_00_1150_in_force.test.sql
-- The one-time file is the 4th file of the chain, so it is /tmp/mig4.sql in the
-- container; T2–T4 run it again from there with \i.
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the one-time file →
--   bash $R/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql \
--     $R/prelude_law_00_1150_fixture.sql $R/law_00_1150_in_force.test.sql
--   → "T1 FAIL: regulation-364-5-30-1430-11-02 is status_undeclared, not active".
--
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the target law is in force; every other law is exactly as before.
do $$
declare
  s    text;
  diff integer;
begin
  select status into s from library.laws where slug = 'regulation-364-5-30-1430-11-02';
  if s is distinct from 'active' then
    raise exception 'T1 FAIL: regulation-364-5-30-1430-11-02 is %, not active', coalesce(s, '(missing)');
  end if;
  select count(*) into diff from (
    (select slug, title, type, section_code, status, updated_at from library.laws
      where slug <> 'regulation-364-5-30-1430-11-02'
     except select * from public.law1150_before where slug <> 'regulation-364-5-30-1430-11-02')
    union all
    (select * from public.law1150_before where slug <> 'regulation-364-5-30-1430-11-02'
     except select slug, title, type, section_code, status, updated_at from library.laws
      where slug <> 'regulation-364-5-30-1430-11-02')
  ) d;
  if diff <> 0 then raise exception 'T1 FAIL: % other law row(s) changed', diff; end if;
  select count(*) into diff from (
    select slug, title, type, section_code from library.laws where slug = 'regulation-364-5-30-1430-11-02'
    except select slug, title, type, section_code from public.law1150_before
  ) d;
  if diff <> 0 then raise exception 'T1 FAIL: a column other than status moved on the target'; end if;
  raise notice 'T1 PASS: the target is active; the other three laws (and the target''s other columns) are unchanged';
end $$;

-- T2 one more run (the whole file again, still confirmed) changes nothing —
-- not even updated_at, which the update trigger would have moved.
create temp table s1 as select * from library.laws;
\o /dev/null
\i /tmp/mig4.sql
\o
do $$
declare
  diff integer;
begin
  select count(*) into diff from (
    (select slug, status, updated_at from library.laws except select slug, status, updated_at from s1)
    union all (select slug, status, updated_at from s1 except select slug, status, updated_at from library.laws)
  ) d;
  if diff <> 0 then raise exception 'T2 FAIL: a later run changed % row(s)', diff; end if;
  raise notice 'T2 PASS: a later run is a no-op';
end $$;

-- T3/T4 the guards. Re-arm first, so "nothing changed" means something: the
-- target back to «status_undeclared». Then, for each guard, the whole file is
-- run again: block 2 must raise (its message is psql's LAST_ERROR_MESSAGE —
-- block 2 is one DO block, the commit after it turns into ROLLBACK without an
-- error of its own, and blocks 1 and 3 are plain SELECTs) and nothing may change.
-- LAST_ERROR_MESSAGE is cleared before each run, so a run that raised nothing
-- cannot pass on the previous run's message.
update library.laws set status = 'status_undeclared' where slug = 'regulation-364-5-30-1430-11-02';
create temp table s2 as select * from library.laws;

create function pg_temp.law1150_unchanged(label text, expected_error text) returns void
language plpgsql as $$
declare
  err  text := current_setting('test.err', true);
  diff int;
begin
  if coalesce(err, '') not like expected_error then
    raise exception '% FAIL: block 2 did not raise "%" — last error: %', label, expected_error, coalesce(err, '(none)');
  end if;
  select count(*) into diff from (
    (select slug, status, updated_at from library.laws except select slug, status, updated_at from s2)
    union all (select slug, status, updated_at from s2 except select slug, status, updated_at from library.laws)
  ) d;
  if diff <> 0 then raise exception '% FAIL: % law row(s) changed', label, diff; end if;
  raise notice '% PASS: block 2 raised, nothing changed', label;
end $$;

-- T3a no confirmation
set nzamy.confirm_law_1150 = '';
\set LAST_ERROR_MESSAGE ''
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig4.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.confirm_law_1150;
select pg_temp.law1150_unchanged('T3a (no confirmation)', '%NOT confirmed%') \g /dev/null

-- T3b a confirmation that is not the typed one
set nzamy.confirm_law_1150 = 'yes';
\set LAST_ERROR_MESSAGE ''
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig4.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
reset nzamy.confirm_law_1150;
select pg_temp.law1150_unchanged('T3b (wrong confirmation)', '%NOT confirmed%') \g /dev/null

-- T4 the law is missing (a reload under another slug): block 2 raises and
-- nothing else is touched.
delete from library.laws where slug = 'regulation-364-5-30-1430-11-02';
drop table s2;
create temp table s2 as select * from library.laws;
\set LAST_ERROR_MESSAGE ''
\set ON_ERROR_STOP off
\o /dev/null
\i /tmp/mig4.sql
select set_config('test.err', :'LAST_ERROR_MESSAGE', false);
\o
\set ON_ERROR_STOP on
select pg_temp.law1150_unchanged('T4 (law missing)', '%regulation-364-5-30-1430-11-02 is not in library.laws%') \g /dev/null

select 'law_00_1150_in_force: ALL PASS' as result;
