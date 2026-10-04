-- ════════════════════════════════════════════════════════════════════════════
-- One-time operation — empty the library CONTENT before a clean full reload.
-- Written 2026-10-04. Run by the team in the Supabase SQL Editor, block by block.
-- The owner never runs this; his side is section ٨ of
-- دليل_المالك_تحميل_المكتبة_٢٠٢٦-١٠-٠٤.md (he dry-runs, we wipe, he loads at once).
-- Tested on a throwaway Postgres: supabase/tests/rls/library_clean_wipe.test.sql
-- (the 14 tables empty; user tables, grants, column lock, chapter levels kept;
-- reload inserts cleanly; an outside foreign key blocks the TRUNCATE; the file
-- as written — confirm line still commented out — wipes nothing).
--
-- library-toolkit/library-clear.mjs is NOT the tool for this: it stays disabled
-- (it deletes over HTTP one table per request, falls back to old cloud keys in
-- .env.vps, and its "laws" group misses article_regulations).
--
-- WHY: the loader (scripts/seed-library-from-owner.mjs) only upserts — it
-- never deletes. A reload after files were renamed, moved, renumbered or
-- removed leaves the old rows live beside the new ones. With no real users
-- yet, the simplest clean state is: empty the 14 content tables, then load
-- the new rows in full.
--
-- WHAT IT EMPTIES (one TRUNCATE, all-or-nothing, seconds):
--   laws, chapters, articles, article_amendments, article_regulations,
--   decrees_circulars, decree_pages, judicial_collections, principles,
--   principle_paragraphs, feqh_books, feqh_chapters, feqh_sections, feqh_blocks
-- WHAT IT KEEPS: library.smart_folders, smart_folder_items, issue_reports,
--   invitations (users' data — 0 rows each on 2026-10-04), every table in
--   other schemas, grants, RLS, the column lock, functions, migrations.
--   No table outside these 14 has a foreign key into them (checked
--   2026-10-04), so no CASCADE is used — if one is ever added, the TRUNCATE
--   fails instead of silently emptying it. The only triggers on these tables
--   maintain updated_at.
--
-- THE SITE IS EMPTY BETWEEN BLOCK 2 AND THE END OF THE LOAD (law pages,
-- search, the library). So, BEFORE block 2:
--   1. the new rows folder is ready, and
--        node scripts/seed-library-from-owner.mjs --rows <dir>
--      (dry run) ended with "DRY RUN — no writes. All rows parsed cleanly.";
--   2. the diff report (<dir>/rows-diff-report.json, from
--        node scripts/library-rows-diff.mjs --rows <dir>
--      — its verdict is "needs-team" here, expected: the wipe removes what is
--      left behind) shows:
--        - "missing_files": []  — all 14 tables have a file; a missing one
--          would be emptied by the wipe and never refilled;
--        - per table, "incoming" close to that export's REFERENCE counts — a
--          table far below its reference means a partial parse; stop. NOT
--          "close to loaded": the 2026-10-03 export legitimately shrinks laws
--          5,899 → 4,399 (1,175 moved to decrees, 335 duplicates dropped).
--          Reference for the 2026-10-03 export (rehearsal 2026-10-05; small
--          differences are fine if the owner edited after 3 Oct):
--            laws 4,399 · chapters 12,097 · articles 94,199
--            article_amendments 6,524 · article_regulations 15,685
--            decrees_circulars 4,398 · decree_pages 12,256
--            judicial_collections 216 · principles 19,604 · principle_paragraphs 1,443
--            feqh_books 189 · feqh_chapters 96,960 · feqh_sections 140,586 · feqh_blocks 210,724
--          (also in إصلاحات_المكتبة_للمالك_٢٠٢٦-١٠-٠٥.md, section ٤);
--        - no "resurrected" keys (the console's "↺ deleted on purpose" lines):
--          any → take those files out of the source first.
--   3. a way back: the previous rows folder (production was loaded from the
--      owner's 2026-09-20 rows, minus the two junk laws), and optionally a
--      database dump on the server:
--        docker ps --format '{{.Names}}' | grep -i db          # e.g. supabase-db
--        docker exec <db container> pg_dump -U postgres -n library --data-only -Fc \
--          -T library.smart_folders -T library.smart_folder_items \
--          -T library.issue_reports -T library.invitations > ~/library-$(date +%F).dump
--      (pg_dump warns about circular foreign keys on library.chapters — expected:
--      parent_chapter_id points inside the same table; the restore below works
--      without --disable-triggers.)
--      To go back with it: run block 2 again (empty), then
--        docker exec -i <db container> pg_restore -U postgres -d postgres --data-only < ~/library-<date>.dump
--      and block 4. Without a dump: block 2, then reload the previous rows folder.
--      (Dump → wipe → restore round trip tested 2026-10-04 on postgres:16: every
--      content row back, parent chapters intact, user tables untouched, 0 errors.)
--
-- AFTER block 3, whoever loads (the owner, guide section ٨), at once:
--   node scripts/library-rows-diff.mjs --rows <dir>        # expect ✅ ADDS AND UPDATES ONLY, loaded 0 everywhere
--   node scripts/seed-library-from-owner.mjs --rows <dir> --apply --confirm-host auth.nezamy.sa
--   node scripts/library-rows-diff.mjs --rows <dir>        # expect ✅ CLEAN
-- then block 4 here, then on the app server:
--   bash deploy.sh
-- A rebuild, not only an nginx purge: /api/library/stats keeps its counts ~24h
-- in the build folder's data cache (a visitor during the empty window can pin
-- zeros), and /sitemap.xml is rendered at build time with the law slugs of
-- that moment. deploy.sh builds into a fresh folder, reloads pm2 and purges
-- the nginx cache.
--
-- IF STUDIO THEN SAYS "current transaction is aborted": run   rollback;
-- (an error inside block 2 leaves its transaction open on that connection).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — what is there now (run alone).
select 'laws' as t, count(*) from library.laws
union all select 'chapters', count(*) from library.chapters
union all select 'articles', count(*) from library.articles
union all select 'article_amendments', count(*) from library.article_amendments
union all select 'article_regulations', count(*) from library.article_regulations
union all select 'decrees_circulars', count(*) from library.decrees_circulars
union all select 'decree_pages', count(*) from library.decree_pages
union all select 'judicial_collections', count(*) from library.judicial_collections
union all select 'principles', count(*) from library.principles
union all select 'principle_paragraphs', count(*) from library.principle_paragraphs
union all select 'feqh_books', count(*) from library.feqh_books
union all select 'feqh_chapters', count(*) from library.feqh_chapters
union all select 'feqh_sections', count(*) from library.feqh_sections
union all select 'feqh_blocks', count(*) from library.feqh_blocks
union all select '(kept) smart_folders', count(*) from library.smart_folders
union all select '(kept) smart_folder_items', count(*) from library.smart_folder_items
union all select '(kept) issue_reports', count(*) from library.issue_reports
union all select '(kept) invitations', count(*) from library.invitations;

-- 2) WIPE — one transaction; rolls back unless all 14 are empty afterwards.
--    It wipes NOTHING until you remove the two dashes at the start of the
--    `set local` line below, so pasting the whole file and pressing Run (to
--    look at block 1) cannot empty the library by accident.
begin;

-- set local nzamy.confirm_wipe = 'auth.nezamy.sa';

do $$
begin
  if coalesce(current_setting('nzamy.confirm_wipe', true), '') <> 'auth.nezamy.sa' then
    raise exception 'library clean wipe: NOT confirmed — nothing was emptied. Remove the two dashes before "set local nzamy.confirm_wipe" in block 2, then run block 2 alone.';
  end if;
end $$;

truncate table
  library.article_amendments,
  library.article_regulations,
  library.articles,
  library.chapters,
  library.laws,
  library.decree_pages,
  library.decrees_circulars,
  library.principle_paragraphs,
  library.principles,
  library.judicial_collections,
  library.feqh_blocks,
  library.feqh_sections,
  library.feqh_chapters,
  library.feqh_books;

do $$
declare
  t text;
  n bigint;
  left_over text := '';
begin
  foreach t in array array[
    'laws', 'chapters', 'articles', 'article_amendments', 'article_regulations',
    'decrees_circulars', 'decree_pages', 'judicial_collections', 'principles',
    'principle_paragraphs', 'feqh_books', 'feqh_chapters', 'feqh_sections', 'feqh_blocks']
  loop
    execute format('select count(*) from library.%I', t) into n;
    if n > 0 then left_over := left_over || format(' %s=%s', t, n); end if;
  end loop;
  if left_over <> '' then
    raise exception 'library clean wipe: rows left —% — rolling back', left_over;
  end if;
  raise notice 'library clean wipe: OK — the 14 library content tables are empty; users'' folders, reports and invitations untouched. Load the new rows now.';
end $$;

commit;

-- 3) VERIFY — expect 0 on the 14 content tables, and the (kept) counts of block 1.
select 'laws' as t, count(*) from library.laws
union all select 'articles', count(*) from library.articles
union all select 'decrees_circulars', count(*) from library.decrees_circulars
union all select 'principles', count(*) from library.principles
union all select 'feqh_blocks', count(*) from library.feqh_blocks
union all select '(kept) smart_folders', count(*) from library.smart_folders
union all select '(kept) invitations', count(*) from library.invitations;

-- 4) AFTER THE LOAD — rebuild the search snapshot (a materialized view over
-- the library; the site does not read it today, but it must not stay empty).
do $$
begin
  if to_regclass('library.cross_section_search') is not null then
    refresh materialized view library.cross_section_search;
    raise notice 'library.cross_section_search refreshed';
  else
    raise notice 'library.cross_section_search does not exist here — nothing to refresh';
  end if;
end $$;
