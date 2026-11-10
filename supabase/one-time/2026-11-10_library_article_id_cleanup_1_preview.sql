-- =============================================================================
-- ONE-TIME: 2026-11-10_library_article_id_cleanup_1_preview.sql — READ-ONLY
-- =============================================================================
-- Part 1 of 2. The why, the when and the rules are in
-- 2026-11-10_library_article_id_cleanup_2_apply.sql. This file changes nothing.
--
-- Run on the server terminal after the owner's load «🎉 ALL TABLES COMPLETED
-- SUCCESSFULLY» (it prints three results; the SQL editor would show only the
-- last):
--   cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/one-time/2026-11-10_library_article_id_cleanup_1_preview.sql
--
-- Result 1 — one row. Expected: old_articles, old_amendments,
--   old_regulations, old_chapters = the leftBehind numbers in the owner's
--   rows-diff-report.json; old_elsewhere = 0; laws_spread a few minutes;
--   removed_articles_saved = 0.
-- Result 2 — the old articles with no new id: what the owner removed from his
--   files (an article deleted by an amendment, a renumbered section). They
--   are deleted with the rest; show this list to the owner.
-- Result 3 — the old chapters (the owner's report names each one).
-- Anything else: stop and send the output to the team.
-- =============================================================================

create temp table _cleanup_preview_old as
with cutoff as (select min(updated_at) as t from library.laws)
select a.id, a.law_slug, a.number, a.status,
       exists (select 1 from library.articles b, cutoff c
                where b.law_slug = a.law_slug
                  and b.id = regexp_replace(a.id, '-(amended|repealed|suspended|added|merged|status_undeclared)$', '')
                  and b.id <> a.id
                  and b.updated_at >= c.t) as has_new_id
  from library.articles a, cutoff c
 where a.updated_at < c.t;

with cutoff as (
  select min(updated_at) as t, max(updated_at) - min(updated_at) as spread from library.laws
)
select (select t from cutoff)                                                                        as load_started_at,
       (select spread from cutoff)                                                                   as laws_spread,
       (select count(*) from _cleanup_preview_old)                                                   as old_articles,
       (select count(*) from library.article_amendments x, cutoff c where x.updated_at < c.t)        as old_amendments,
       (select count(*) from library.article_regulations x, cutoff c where x.updated_at < c.t)       as old_regulations,
       (select count(*) from library.chapters x, cutoff c where x.updated_at < c.t)                  as old_chapters,
       (select count(*) from _cleanup_preview_old where has_new_id)                                  as with_new_id,
       (select count(*) from _cleanup_preview_old where not has_new_id)                              as removed_articles,
       (select count(*) from library.smart_folder_items i
         where i.entity_type = 'article' and i.entity_id in (select id from _cleanup_preview_old where has_new_id)) as saved_items_to_move,
       (select count(*) from library.issue_reports r
         where r.entity_type = 'article' and r.entity_id in (select id from _cleanup_preview_old where has_new_id)) as issue_reports_to_move,
       (select count(*) from library.smart_folder_items i
         where i.entity_type = 'article' and i.entity_id in (select id from _cleanup_preview_old where not has_new_id))
     + (select count(*) from library.issue_reports r
         where r.entity_type = 'article' and r.entity_id in (select id from _cleanup_preview_old where not has_new_id)) as removed_articles_saved,
       (select count(*) from library.decrees_circulars x, cutoff c where x.updated_at < c.t)
     + (select count(*) from library.decree_pages x, cutoff c where x.updated_at < c.t)
     + (select count(*) from library.judicial_collections x, cutoff c where x.updated_at < c.t)
     + (select count(*) from library.principles x, cutoff c where x.updated_at < c.t)
     + (select count(*) from library.principle_paragraphs x, cutoff c where x.updated_at < c.t)
     + (select count(*) from library.feqh_books x, cutoff c where x.updated_at < c.t)
     + (select count(*) from library.feqh_chapters x, cutoff c where x.updated_at < c.t)
     + (select count(*) from library.feqh_sections x, cutoff c where x.updated_at < c.t)
     + (select count(*) from library.feqh_blocks x, cutoff c where x.updated_at < c.t)          as old_elsewhere;

select law_slug, id as removed_article_id, number, status
  from _cleanup_preview_old
 where not has_new_id
 order by law_slug, id;

select x.law_slug, x.id as old_chapter_id, x.number, x.title
  from library.chapters x
 where x.updated_at < (select min(updated_at) from library.laws)
 order by x.law_slug, x.id;
