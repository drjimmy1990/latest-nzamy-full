-- library_fts_statistics.test.sql — proves 20261017_21 (optional search tuning).
-- Chain (run.sh, postgres:16) — the library schema chain, the fixture, then
-- 20261017_21 TWICE (idempotent). Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_article_history_columns.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     supabase/tests/rls/prelude_fts_statistics_fixture.sql \
--     $M/20261017_21_library_fts_statistics.sql $M/20261017_21_library_fts_statistics.sql \
--     supabase/tests/rls/library_fts_statistics.test.sql
--
-- NEGATIVE CONTROL: the same chain without the two 20261017_21 files → T1 fails
-- (the targets are still the default).
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the three fts columns carry statistics target 1000 (-1 / NULL = default)
do $$
declare
  t text;
  target integer;
begin
  foreach t in array array['library.articles', 'library.feqh_blocks', 'library.principles'] loop
    select coalesce(attstattarget::integer, -1) into target
      from pg_attribute where attrelid = t::regclass and attname = 'fts';
    if target is distinct from 1000 then
      raise exception 'T1 FAIL: %.fts statistics target is %', t, target;
    end if;
  end loop;
  raise notice 'T1 PASS: articles / feqh_blocks / principles fts at statistics target 1000';
end $$;

-- T2 the migration's ANALYZE collected word statistics for articles.fts
do $$
declare
  n integer;
begin
  select coalesce(array_length(most_common_elems::text::text[], 1), 0) into n
    from pg_stats where schemaname = 'library' and tablename = 'articles' and attname = 'fts';
  if n is null or n <= 1000 then
    raise exception 'T2 FAIL: articles.fts lists % words (expected more than the default 1,000)', n;
  end if;
  raise notice 'T2 PASS: articles.fts lists % words', n;
end $$;

-- T3 the effect: a word seen in one row is estimated far lower at 1000 than
-- at the default target (the ~933 of production in miniature).
create function pg_temp.est(q text) returns integer language plpgsql as $$
declare
  j json;
begin
  execute format('explain (format json) select 1 from library.articles where fts @@ to_tsquery(%L, %L)', 'simple', q) into j;
  return (j -> 0 -> 'Plan' ->> 'Plan Rows')::integer;
end $$;
do $$
declare
  at_1000 integer := pg_temp.est('''نادرة17''');
  at_default integer;
begin
  alter table library.articles alter column fts set statistics -1;
  analyze library.articles (fts);
  at_default := pg_temp.est('''نادرة17''');
  -- put the migration's state back for anything after this block
  alter table library.articles alter column fts set statistics 1000;
  analyze library.articles (fts);
  if at_1000 >= at_default then
    raise exception 'T3 FAIL: rare word estimated % rows at target 1000, % at the default (8,000 rows, true count 1)', at_1000, at_default;
  end if;
  raise notice 'T3 PASS: rare word «نادرة17» (1 row of 8,000) estimated at % rows at target 1000, % at the default', at_1000, at_default;
end $$;

select 'library_fts_statistics: ALL PASS' as result;
