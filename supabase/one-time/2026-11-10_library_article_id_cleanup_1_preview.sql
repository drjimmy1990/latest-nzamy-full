-- =============================================================================
-- ONE-TIME: 2026-11-10_library_article_id_cleanup_1_preview.sql — READ-ONLY
-- =============================================================================
-- Part 1 of 2. The why, the when and the rules are in
-- 2026-11-10_library_article_id_cleanup_2_apply.sql. This file changes nothing.
--
-- Run on the server terminal after the owner's load «🎉 ALL TABLES COMPLETED
-- SUCCESSFULLY» (the whole result shows there; the SQL editor hides parts):
--   cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/one-time/2026-11-10_library_article_id_cleanup_1_preview.sql
--
-- Expected: old_articles = the articles leftBehind in the owner's
-- rows-diff-report.json (about 8,100); with_partner = old_articles;
-- without_partner = 0; laws_spread a few minutes. Anything else: stop and send
-- the row to the team.
-- =============================================================================

with cutoff as (
  select min(updated_at) as load_started_at,
         max(updated_at) - min(updated_at) as laws_spread
    from library.laws
), old as (
  select a.id, a.law_slug
    from library.articles a, cutoff c
   where a.updated_at < c.load_started_at
), paired as (
  select o.id,
         exists (select 1 from library.articles b, cutoff c
                  where b.law_slug = o.law_slug
                    and b.id = regexp_replace(o.id, '-(amended|repealed|suspended|added|merged|status_undeclared)$', '')
                    and b.id <> o.id
                    and b.updated_at >= c.load_started_at) as has_partner
    from old o
)
select (select load_started_at from cutoff)                   as load_started_at,
       (select laws_spread from cutoff)                       as laws_spread,
       (select count(*) from old)                             as old_articles,
       (select count(*) from paired where has_partner)        as with_partner,
       (select count(*) from paired where not has_partner)    as without_partner,
       (select count(*) from library.smart_folder_items i
         where i.entity_type = 'article' and i.entity_id in (select id from old)) as saved_items_to_move,
       (select count(*) from library.issue_reports r
         where r.entity_type = 'article' and r.entity_id in (select id from old)) as issue_reports_to_move;
