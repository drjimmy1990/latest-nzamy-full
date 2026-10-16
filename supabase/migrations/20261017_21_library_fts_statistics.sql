-- =============================================================================
-- Migration: 20261017_21_library_fts_statistics.sql   — OPTIONAL (search tuning)
-- =============================================================================
-- PURPOSE
--   Better row estimates for full-text searches on rare words. Raises the
--   planner statistics target of the three `fts` columns the library search
--   filters on, then re-collects their statistics:
--
--     library.articles.fts      (laws section)
--     library.feqh_blocks.fts   (fiqh section)
--     library.principles.fts    (precedents section)
--
-- WHAT IT FIXES
--   For a tsvector column Postgres keeps a list of its most common words
--   (statistics target × 10 of them; 1,000 at the default target of 100). A
--   word OUTSIDE that list is estimated at min(0.5%, half the frequency of the
--   least common listed word) of the table. On library.articles (93,494 rows)
--   that put every rare word at about 933 matches (two spellings of one word,
--   ~467 each; measured 2026-10-16, see f8bafa01 and the sibling session's
--   notes), when the truth was 0–46. With a category or law-type filter the
--   laws window still joins `laws` and orders by id, and at 933 estimated
--   matches the planner prefers walking the whole articles primary key over
--   the full-text index: rare words cost seconds cold (the same trap on the
--   fiqh and precedents windows' embeds).
--   At target 1000 the list holds 10,000 words, so the least common listed
--   word is far rarer and an unlisted word is estimated at a few dozen rows
--   instead of hundreds. The code already avoids the join for unfiltered laws
--   searches (lawWindowNeedsJoin); this is the database-side cure for the
--   filtered ones.
--
-- OPTIONAL — nothing depends on it. No code change, no deploy order. Skip it
--   and searches behave exactly as today.
--
-- COST
--   * ANALYZE samples 300 × target rows: at 1000 that is the whole of each of
--     the three tables. It takes a SHARE UPDATE EXCLUSIVE lock (reads and
--     writes continue) and typically runs seconds to a minute on articles.
--     If the SQL Editor times out, the transaction rolls back and nothing
--     changes: run the three ALTER + ANALYZE pairs of the ROLLBACK section
--     with 1000 instead of -1, one table at a time.
--   * pg_statistic keeps up to 10,000 words per column (a few MB in all);
--     planning a full-text query reads them, a sub-millisecond cost.
--   * Autovacuum's own ANALYZE runs keep using the new target from now on.
--
-- WHEN IT IS LOST
--   Dropping and re-creating an `fts` column (as 20260729_article_history_columns
--   did to rebuild it) resets its target to the default. Re-run this file after
--   any migration that does that. A library reload (TRUNCATE + load) keeps it;
--   autovacuum re-analyzes after the load (or re-run this file).
--
-- IDEMPOTENT — ALTER ... SET STATISTICS and ANALYZE can run any number of times.
--   A table or `fts` column missing here is skipped with a NOTICE.
--
-- CHECK (optional, before and after, in the SQL Editor):
--   explain select id from library.articles
--    where fts @@ to_tsquery('simple', '''شفعة'' | ''الشفعة''');
--   The «rows=» of the top line drops from ~933 to a few dozen.
--
-- ROLLBACK
--   alter table library.articles    alter column fts set statistics -1;
--   alter table library.feqh_blocks alter column fts set statistics -1;
--   alter table library.principles  alter column fts set statistics -1;
--   analyze library.articles (fts); analyze library.feqh_blocks (fts); analyze library.principles (fts);
-- =============================================================================

begin;

-- 1. The target, then fresh statistics at it. SET STATISTICS takes the same
--    SHARE UPDATE EXCLUSIVE lock as ANALYZE: reads and writes go on.
do $$
declare
  t text;
begin
  foreach t in array array['library.articles', 'library.feqh_blocks', 'library.principles'] loop
    if to_regclass(t) is null
       or not exists (select 1 from pg_catalog.pg_attribute
                       where attrelid = to_regclass(t) and attname = 'fts' and not attisdropped) then
      raise notice '20261017_21: %.fts does not exist here — skipped', t;
      continue;
    end if;
    execute format('alter table %s alter column fts set statistics 1000', t);
    execute format('analyze %s (fts)', t);
    raise notice '20261017_21: %.fts — statistics target 1000, analyzed', t;
  end loop;
end $$;

-- 2. Verify (raises → rolls back). attstattarget is -1 by default up to
--    Postgres 16 and NULL by default from 17; both mean "the default target".
--    A table with rows must now have a most-common-words list for fts.
do $$
declare
  t        text;
  target   integer;
  has_rows boolean;
  missing  text := '';
begin
  foreach t in array array['library.articles', 'library.feqh_blocks', 'library.principles'] loop
    continue when to_regclass(t) is null;
    select coalesce(a.attstattarget::integer, -1) into target
      from pg_catalog.pg_attribute a
     where a.attrelid = to_regclass(t) and a.attname = 'fts' and not a.attisdropped;
    continue when not found;
    if target < 1000 then
      missing := missing || format(' %s.fts statistics target is %s (expected 1000);', t, target);
    end if;
    execute format('select exists (select 1 from %s where fts <> ''''::tsvector)', t) into has_rows;
    if has_rows and not exists (
         select 1 from pg_catalog.pg_stats s
          where format('%I.%I', s.schemaname, s.tablename) = t
            and s.attname = 'fts' and s.most_common_elems is not null) then
      missing := missing || format(' %s.fts has no word statistics after ANALYZE;', t);
    end if;
  end loop;
  if missing <> '' then
    raise exception '20261017_21 verify failed —%', missing;
  end if;
  raise notice '20261017_21 OK — statistics target 1000 and fresh word statistics on every library fts column present';
end $$;

commit;
