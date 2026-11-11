-- =============================================================================
-- REUSABLE: library_left_behind_cleanup.sql
-- =============================================================================
-- WHY
--   The owner's loader (scripts/seed-library-from-owner.mjs) only upserts; it
--   never deletes. When his files drop or renumber rows (a fiqh book
--   reorganised, a GACAR part renumbered), the old rows stay live beside the
--   new ones, and his comparison (scripts/library-rows-diff.mjs) says
--   «NEEDS THE TEAM» with a «left-behind» count per table. This file removes
--   exactly those rows, after his load, guarded by his numbers.
--   (2026-11-10_library_article_id_cleanup_2_apply.sql was the first,
--   articles-only version of the same idea.)
--
-- WHEN — only after the owner's load has finished
--   1. His comparison before the load had no ↺ line, unicodeTwins 0
--      everywhere, and laws left-behind 0.
--   2. His load ended «🎉 ALL TABLES COMPLETED SUCCESSFULLY».
--   3. library_left_behind_preview.sql (read-only). Its counts must equal his
--      left-behind numbers.
--   4. This file, passing each table whose left-behind is not 0, e.g.
--        cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v feqh_chapters=1 -v feqh_sections=329 -v feqh_blocks=2926 < supabase/one-time/library_left_behind_cleanup.sql
--      A table not passed counts as 0. The names: articles, article_amendments,
--      article_regulations, chapters, decrees_circulars, decree_pages,
--      judicial_collections, principles, principle_paragraphs, feqh_books,
--      feqh_chapters, feqh_sections, feqh_blocks. In the SQL editor it stops
--      at the first «\if» and changes nothing.
--   5. It refreshes library.cross_section_search itself. Then redeploy, and
--      the owner's comparison again: ✅ CLEAN.
--
-- WHAT COUNTS AS AN OLD ROW
--   The loader upserts every row in its files and the update trigger stamps
--   each with the time of the write; laws are written first. So after a
--   complete load, a row older than the earliest library.laws.updated_at is a
--   row his files no longer have. The file refuses, changing nothing, unless:
--   - the laws were all written by one recent load (none left behind — a
--     removed law is a team decision, never this file);
--   - each table has exactly the number of old rows passed (0 if not passed);
--   - no new article or chapter sits under an old chapter;
--   - no user's saved item or issue report points at an old row (an old
--     article whose id only lost its status suffix is moved, not refused).
--   The delete must not touch any row the load wrote; it rolls back if it did.
--
-- SAFE TO RE-RUN: a second run finds 0 old rows; pass nothing.
-- =============================================================================

\if :{?articles}
\else
  \set articles 0
\endif
\if :{?article_amendments}
\else
  \set article_amendments 0
\endif
\if :{?article_regulations}
\else
  \set article_regulations 0
\endif
\if :{?chapters}
\else
  \set chapters 0
\endif
\if :{?decrees_circulars}
\else
  \set decrees_circulars 0
\endif
\if :{?decree_pages}
\else
  \set decree_pages 0
\endif
\if :{?judicial_collections}
\else
  \set judicial_collections 0
\endif
\if :{?principles}
\else
  \set principles 0
\endif
\if :{?principle_paragraphs}
\else
  \set principle_paragraphs 0
\endif
\if :{?feqh_books}
\else
  \set feqh_books 0
\endif
\if :{?feqh_chapters}
\else
  \set feqh_chapters 0
\endif
\if :{?feqh_sections}
\else
  \set feqh_sections 0
\endif
\if :{?feqh_blocks}
\else
  \set feqh_blocks 0
\endif

begin;

set local nzamy.exp_articles             = :'articles';
set local nzamy.exp_article_amendments   = :'article_amendments';
set local nzamy.exp_article_regulations  = :'article_regulations';
set local nzamy.exp_chapters             = :'chapters';
set local nzamy.exp_decrees_circulars    = :'decrees_circulars';
set local nzamy.exp_decree_pages         = :'decree_pages';
set local nzamy.exp_judicial_collections = :'judicial_collections';
set local nzamy.exp_principles           = :'principles';
set local nzamy.exp_principle_paragraphs = :'principle_paragraphs';
set local nzamy.exp_feqh_books           = :'feqh_books';
set local nzamy.exp_feqh_chapters        = :'feqh_chapters';
set local nzamy.exp_feqh_sections        = :'feqh_sections';
set local nzamy.exp_feqh_blocks          = :'feqh_blocks';

do $$
declare
  -- children before parents: the order the deletes run in
  v_tables text[] := array['article_regulations', 'article_amendments', 'articles', 'chapters',
                           'decree_pages', 'decrees_circulars',
                           'principle_paragraphs', 'principles', 'judicial_collections',
                           'feqh_blocks', 'feqh_sections', 'feqh_chapters', 'feqh_books'];
  t text;
  v_exp text;
  v_cutoff timestamptz;
  v_spread interval;
  v_old bigint;
  v_new bigint;
  v_del bigint;
  v_bad text := '';
  v_report text := '';
  v_total bigint := 0;
  v_hits bigint;
  v_items bigint;
  v_reports bigint;
  v_exp_n jsonb := '{}';
  v_new_n jsonb := '{}';
begin
  foreach t in array v_tables loop
    v_exp := coalesce(current_setting('nzamy.exp_' || t, true), '');
    if v_exp !~ '^[0-9]+$' then
      raise exception 'library cleanup: -v %=% is not a number — nothing was changed.', t, v_exp;
    end if;
    v_exp_n := v_exp_n || jsonb_build_object(t, v_exp::bigint);
  end loop;

  select min(updated_at), max(updated_at) - min(updated_at) into v_cutoff, v_spread from library.laws;
  if v_cutoff is null or v_cutoff < now() - interval '3 days' then
    raise exception 'library cleanup: the laws were last written % — not a load of the last three days (or a law was left behind). Nothing was changed. Send this to the team.', v_cutoff;
  end if;
  if v_spread > interval '6 hours' then
    raise exception 'library cleanup: library.laws rows come from loads % apart (a law was left behind?) — nothing was changed. Send this to the team.', v_spread;
  end if;

  create temp table _old_row (tbl text, id text) on commit drop;
  foreach t in array v_tables loop
    execute format('insert into _old_row select %L, id::text from library.%I where updated_at < $1', t, t) using v_cutoff;
    get diagnostics v_old = row_count;
    execute format('select count(*) from library.%I where updated_at >= $1', t) using v_cutoff into v_new;
    v_new_n := v_new_n || jsonb_build_object(t, v_new);
    if v_old > 0 then
      v_report := v_report || format(' %s %s,', t, v_old);
      v_total := v_total + v_old;
    end if;
    if v_old <> (v_exp_n ->> t)::bigint then
      v_bad := v_bad || format(' %s: %s here, %s passed;', t, v_old, v_exp_n ->> t);
    end if;
  end loop;
  if v_bad <> '' then
    raise exception 'library cleanup: the old rows do not match the numbers passed —% nothing was changed. Send this line to the team.', v_bad;
  end if;

  if exists (select 1 from library.articles a join library.chapters c on c.id = a.chapter_id
              where a.updated_at >= v_cutoff and c.updated_at < v_cutoff)
     or exists (select 1 from library.chapters a join library.chapters c on c.id = a.parent_chapter_id
              where a.updated_at >= v_cutoff and c.updated_at < v_cutoff) then
    raise exception 'library cleanup: a new article or chapter sits under an old chapter — nothing was changed. Send this to the team.';
  end if;

  -- An old article whose id only lost its status suffix (the 2026-11-10 id
  -- rule): saved items and issue reports follow it to the new id.
  create temp table _moved_article on commit drop as
  select o.id as old_id, b.id as new_id
    from _old_row o
    join library.articles b
      on b.id = regexp_replace(o.id, '-(amended|repealed|suspended|added|merged|status_undeclared)$', '')
     and b.id <> o.id
     and b.updated_at >= v_cutoff
   where o.tbl = 'articles';

  update library.smart_folder_items i set entity_id = m.new_id
    from _moved_article m where i.entity_type = 'article' and i.entity_id = m.old_id;
  get diagnostics v_items = row_count;
  update library.issue_reports r set entity_id = m.new_id
    from _moved_article m where r.entity_type = 'article' and r.entity_id = m.old_id;
  get diagnostics v_reports = row_count;

  select (select count(*) from library.smart_folder_items i where i.entity_id in (select id from _old_row))
       + (select count(*) from library.issue_reports r where r.entity_id in (select id from _old_row))
    into v_hits;
  if v_hits > 0 then
    raise exception 'library cleanup: % saved items or issue reports point at rows the owner''s files no longer have — nothing was changed. Send this to the team.', v_hits;
  end if;

  foreach t in array v_tables loop
    execute format('delete from library.%I where updated_at < $1', t) using v_cutoff;
    get diagnostics v_del = row_count;
    if v_del <> (v_exp_n ->> t)::bigint then
      raise exception 'library cleanup: % — deleted % of % — rolling back.', t, v_del, v_exp_n ->> t;
    end if;
  end loop;

  foreach t in array v_tables loop
    execute format('select count(*) from library.%I where updated_at >= $1', t) using v_cutoff into v_new;
    if v_new <> (v_new_n ->> t)::bigint then
      raise exception 'library cleanup: % — a row written by this load was removed (% before, % after) — rolling back.', t, v_new_n ->> t, v_new;
    end if;
    execute format('select count(*) from library.%I where updated_at < $1', t) using v_cutoff into v_old;
    if v_old > 0 then
      raise exception 'library cleanup: % — old rows remain after the delete — rolling back.', t;
    end if;
  end loop;

  raise notice 'library cleanup: removed % old rows (%); moved % saved items and % issue reports.',
    v_total, coalesce(nullif(trim(trailing ',' from v_report), ''), ' none'), v_items, v_reports;
end $$;

commit;

refresh materialized view library.cross_section_search;

-- CHECK — expect old_rows = 0.
select (select count(*) from library.articles where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.article_amendments where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.article_regulations where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.chapters where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.decrees_circulars where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.decree_pages where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.judicial_collections where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.principles where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.principle_paragraphs where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.feqh_books where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.feqh_chapters where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.feqh_sections where updated_at < (select min(updated_at) from library.laws))
     + (select count(*) from library.feqh_blocks where updated_at < (select min(updated_at) from library.laws)) as old_rows;
