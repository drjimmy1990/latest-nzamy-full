-- feqh_books_series.test.sql — proves 20261026_51 (L-B, owner ٢٦٢: a fiqh
-- book's series and volume number) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The _verify
-- block runs before the migration (must only NOTICE) and after the second run
-- (must pass). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_feqh_books_series_block.sql
--   sed -n '/^-- >>> verify:feqh_books_series/,/^-- <<< verify:feqh_books_series/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260626_legal_library_schema.sql \
--     $R/prelude_feqh_books_series_fixture.sql \
--     "$B" \
--     $M/20261026_51_feqh_books_series.sql \
--     $M/20261026_51_feqh_books_series.sql \
--     "$B" \
--     $R/feqh_books_series.test.sql
--
-- NEGATIVE CONTROL (must FAIL; recorded 2026-10-26): the chain without the
--   two 20261026_51 files → the test stops at T1 (column series_id does not exist).
-- The file runs as the superuser; every role-scoped assertion does `set role`.
\set ON_ERROR_STOP on

-- T1 the old rows are untouched and read NULL in both new columns.
do $$
declare r record;
begin
  select title, total_volumes, series_id, volume_number into r from library.feqh_books where id = 'book-old';
  if r.title <> 'المغني — الجزء 1' or r.total_volumes <> 1 or r.series_id is not null or r.volume_number is not null then
    raise exception 'T1 FAIL: the existing row changed: %', r;
  end if;
  raise notice 'T1 PASS: an existing book keeps its values; series_id / volume_number are NULL';
end $$;

-- T2 the catalogue role reads both columns (table-level SELECT covers them).
set role anon;
do $$
declare n int;
begin
  select count(*) into n from library.feqh_books where series_id is null and volume_number is null;
  if n < 1 then raise exception 'T2 FAIL: anon read nothing'; end if;
  raise notice 'T2 PASS: anon reads series_id / volume_number';
end $$;
reset role;

-- T3 the anon role still cannot write the table.
set role anon;
do $$
begin
  begin
    insert into library.feqh_books (id, title) values ('book-anon', 'x');
    raise exception 'T3 FAIL: anon inserted a book';
  exception when insufficient_privilege then
    raise notice 'T3 PASS: anon cannot insert';
  end;
end $$;
reset role;

-- T4 the limits: volume 1–9999, no blank series label.
do $$
begin
  insert into library.feqh_books (id, title, series_id, volume_number) values ('book-ok', 'الإنصاف — الجزء 7', 'mardawi-insaf', 7);
  begin
    insert into library.feqh_books (id, title, volume_number) values ('book-v0', 'x', 0);
    raise exception 'T4 FAIL: volume 0 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into library.feqh_books (id, title, volume_number) values ('book-vbig', 'x', 10000);
    raise exception 'T4 FAIL: volume 10000 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into library.feqh_books (id, title, series_id) values ('book-blank', 'x', '   ');
    raise exception 'T4 FAIL: a blank series label accepted';
  exception when check_violation then null;
  end;
  raise notice 'T4 PASS: volume 1–9999, series label not blank, NULL allowed';
end $$;

-- T5 the partial index exists.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'library' and indexname = 'idx_feqh_books_series_id') then
    raise exception 'T5 FAIL: idx_feqh_books_series_id missing';
  end if;
  raise notice 'T5 PASS: idx_feqh_books_series_id';
end $$;
