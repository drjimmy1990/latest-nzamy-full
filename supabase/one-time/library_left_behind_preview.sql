-- =============================================================================
-- REUSABLE: library_left_behind_preview.sql — READ-ONLY
-- =============================================================================
-- Part 1 of library_left_behind_cleanup.sql (the why and the rules are
-- there). This file changes nothing. Run on the server terminal after the
-- owner's load «🎉 ALL TABLES COMPLETED SUCCESSFULLY»:
--   cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/one-time/library_left_behind_preview.sql
--
-- Result 1 — one row per table with old rows (rows the owner's files no longer
--   have). Each must equal his left-behind number for that table.
-- Result 2 — load_started_at, laws_spread (a few minutes), saved_or_reported
--   (must be 0: users' saved items / issue reports on an old row, other than
--   articles that only lost a status suffix).
-- Result 3 — the old rows by law or fiqh book, to tell the owner what goes.
-- =============================================================================

create temp table _lb_old (tbl text, id text, owner_key text);

insert into _lb_old
select 'articles', id, law_slug from library.articles where updated_at < (select min(updated_at) from library.laws)
union all select 'article_amendments', a.id::text, b.law_slug from library.article_amendments a left join library.articles b on b.id = a.article_id where a.updated_at < (select min(updated_at) from library.laws)
union all select 'article_regulations', id::text, law_slug from library.article_regulations where updated_at < (select min(updated_at) from library.laws)
union all select 'chapters', id::text, law_slug from library.chapters where updated_at < (select min(updated_at) from library.laws)
union all select 'decrees_circulars', id::text, title from library.decrees_circulars where updated_at < (select min(updated_at) from library.laws)
union all select 'decree_pages', p.id::text, d.title from library.decree_pages p left join library.decrees_circulars d on d.id = p.decree_id where p.updated_at < (select min(updated_at) from library.laws)
union all select 'judicial_collections', id, id from library.judicial_collections where updated_at < (select min(updated_at) from library.laws)
union all select 'principles', id, collection_id from library.principles where updated_at < (select min(updated_at) from library.laws)
union all select 'principle_paragraphs', id::text, principle_id from library.principle_paragraphs where updated_at < (select min(updated_at) from library.laws)
union all select 'feqh_books', id, id from library.feqh_books where updated_at < (select min(updated_at) from library.laws)
union all select 'feqh_chapters', c.id::text, c.book_id from library.feqh_chapters c where c.updated_at < (select min(updated_at) from library.laws)
union all select 'feqh_sections', s.id::text, c.book_id from library.feqh_sections s left join library.feqh_chapters c on c.id = s.chapter_id where s.updated_at < (select min(updated_at) from library.laws)
union all select 'feqh_blocks', b.id, c.book_id from library.feqh_blocks b left join library.feqh_sections s on s.id = b.section_id left join library.feqh_chapters c on c.id = s.chapter_id where b.updated_at < (select min(updated_at) from library.laws);

select tbl as "table", count(*) as old_rows from _lb_old group by tbl order by tbl;

select min(updated_at) as load_started_at,
       max(updated_at) - min(updated_at) as laws_spread,
       (select count(*) from library.smart_folder_items i
         where i.entity_id in (select id from _lb_old)
           and not exists (select 1 from library.articles b
                            where b.id = regexp_replace(i.entity_id, '-(amended|repealed|suspended|added|merged|status_undeclared)$', '')
                              and b.id <> i.entity_id
                              and b.updated_at >= (select min(updated_at) from library.laws)))
     + (select count(*) from library.issue_reports r
         where r.entity_id in (select id from _lb_old)
           and not exists (select 1 from library.articles b
                            where b.id = regexp_replace(r.entity_id, '-(amended|repealed|suspended|added|merged|status_undeclared)$', '')
                              and b.id <> r.entity_id
                              and b.updated_at >= (select min(updated_at) from library.laws))) as saved_or_reported
  from library.laws;

select tbl as "table", owner_key as law_or_book, count(*) as old_rows
  from _lb_old group by tbl, owner_key order by tbl, owner_key;
