-- =============================================================================
-- ONE-TIME: 2026-11-10_library_article_id_cleanup_2_apply.sql
-- =============================================================================
-- WHY (owner report 2026-11-09, problem 2)
--   Until 2026-11-10 an article's status was part of its id: «law__art-7» became
--   «law__art-7-amended» the day article 7 was amended, so every amendment or
--   repeal left the old row behind on the site. scripts/seed-library.ts now
--   keeps «law__art-7» whatever the status (articleIdentityCore); the status
--   suffix stays only where two articles of one law share a number.
--
--   The FIRST library load made with that code writes about 8,100 articles
--   under their new id (the old id minus its status suffix). Their old rows
--   — and, through ON DELETE CASCADE, the old rows' amendments and
--   regulations — stay behind. This file removes them once, after that load,
--   and moves any saved item or issue report that pointed at an old id.
--
-- WHEN — only after the owner's load has finished
--   1. pg_dump of the library schemas (the team's steps give the command).
--   2. The owner's load «🎉 ALL TABLES COMPLETED SUCCESSFULLY».
--   3. Part 1 (…_1_preview.sql, read-only). Its old_articles must equal the
--      owner's articles leftBehind (rows-diff-report.json).
--   4. This file, with that number passed on the command line:
--        cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v expected=NUMBER < supabase/one-time/2026-11-10_library_article_id_cleanup_2_apply.sql
--      Without -v expected=… (or in the SQL editor) it stops at a syntax
--      error and changes nothing.
--   5. Refresh library.cross_section_search, redeploy, and the owner's
--      comparison again: ✅ CLEAN.
--
-- WHAT COUNTS AS AN OLD ROW
--   "This load" = every library.laws row was written by it (the owner's
--   comparison shows laws leftBehind 0), so the earliest laws.updated_at is the
--   load's start. An article the load did not write (updated_at before that)
--   is old. Each old article must have its partner: the same law, the id
--   without the status suffix, written by this load. An old article without
--   one is a real removal, and this file stops: the team decides those by hand.
--
-- SAFE TO RE-RUN: a second run finds 0 old articles; pass -v expected=0.
-- =============================================================================

begin;

set local nzamy.expected_old_articles = :'expected';

do $$
declare
  v_expected text := coalesce(current_setting('nzamy.expected_old_articles', true), '');
  v_cutoff timestamptz;
  v_spread interval;
  v_old bigint;
  v_bad bigint;
  v_items bigint;
  v_reports bigint;
  v_deleted bigint;
begin
  if v_expected !~ '^[0-9]+$' then
    raise exception 'article id cleanup: pass the owner''s articles leftBehind number as -v expected=NUMBER — nothing was changed.';
  end if;

  select min(updated_at), max(updated_at) - min(updated_at) into v_cutoff, v_spread from library.laws;
  if v_cutoff is null or v_cutoff < timestamptz '2026-11-10 00:00+00' then
    raise exception 'article id cleanup: the library has not been loaded with the 2026-11-10 code yet (laws written %) — nothing was changed.', v_cutoff;
  end if;
  if v_spread > interval '6 hours' then
    raise exception 'article id cleanup: library.laws rows come from loads % apart (a law was left behind?) — nothing was changed. Send this to the team.', v_spread;
  end if;

  create temp table _old_article on commit drop as
  select a.id as old_id,
         (select b.id from library.articles b
           where b.law_slug = a.law_slug
             and b.id = regexp_replace(a.id, '-(amended|repealed|suspended|added|merged|status_undeclared)$', '')
             and b.id <> a.id
             and b.updated_at >= v_cutoff) as new_id
    from library.articles a
   where a.updated_at < v_cutoff;

  select count(*) into v_old from _old_article;
  if v_old <> v_expected::bigint then
    raise exception 'article id cleanup: % old articles here, but % was passed — nothing was changed. Send both numbers to the team.', v_old, v_expected;
  end if;

  select count(*) into v_bad from _old_article where new_id is null;
  if v_bad > 0 then
    raise exception 'article id cleanup: % old articles have no new partner (a real removal) — nothing was changed. Send this to the team.', v_bad;
  end if;

  update library.smart_folder_items i
     set entity_id = o.new_id
    from _old_article o
   where i.entity_type = 'article' and i.entity_id = o.old_id;
  get diagnostics v_items = row_count;

  update library.issue_reports r
     set entity_id = o.new_id
    from _old_article o
   where r.entity_type = 'article' and r.entity_id = o.old_id;
  get diagnostics v_reports = row_count;

  -- article_amendments / article_regulations of the old rows go with them
  -- (ON DELETE CASCADE); the load already wrote them under the new ids.
  delete from library.articles a using _old_article o where a.id = o.old_id;
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_old then
    raise exception 'article id cleanup: deleted % of % — rolling back.', v_deleted, v_old;
  end if;
  if exists (select 1 from library.articles where updated_at < v_cutoff) then
    raise exception 'article id cleanup: old articles remain after the delete — rolling back.';
  end if;

  raise notice 'article id cleanup: % old articles removed, % saved items and % issue reports moved.', v_deleted, v_items, v_reports;
end $$;

commit;

-- CHECK — expect old_articles = 0.
select count(*) filter (where a.updated_at < (select min(updated_at) from library.laws)) as old_articles,
       count(*) as articles
  from library.articles a;
