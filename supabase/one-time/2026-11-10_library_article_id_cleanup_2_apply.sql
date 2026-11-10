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
--   (and their amendments and regulations) under new ids. The old rows stay
--   behind, because the loader never deletes. The same load also drops what
--   the owner removed from his files since the last load (an article deleted
--   by an amendment, a GACAR chapter restructured away). His comparison
--   (rows-diff-report.json, verdict NEEDS THE TEAM) counts all of these as
--   «left-behind», table by table. This file removes exactly those rows once,
--   after his load, and moves any saved item or issue report that pointed at
--   an old article id to the article's new id.
--
-- WHEN — only after the owner's load has finished
--   1. pg_dump of the library schemas (the team's steps give the command).
--   2. The owner's load «🎉 ALL TABLES COMPLETED SUCCESSFULLY».
--   3. Part 1 (…_1_preview.sql, read-only). Its four counts must equal the
--      owner's leftBehind numbers for articles, article_amendments,
--      article_regulations and chapters.
--   4. This file, with those four numbers passed on the command line:
--        cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v articles=N1 -v amendments=N2 -v regulations=N3 -v chapters=N4 < supabase/one-time/2026-11-10_library_article_id_cleanup_2_apply.sql
--      Without all four -v values (or in the SQL editor) it stops at a syntax
--      error and changes nothing.
--   5. Refresh library.cross_section_search, redeploy, and the owner's
--      comparison again: ✅ CLEAN.
--
-- WHAT COUNTS AS AN OLD ROW
--   The loader upserts every row in its files, and the update trigger stamps
--   each one with the time of the write. So after a complete load every row
--   that is still in the owner's files carries a time after the load began
--   (the earliest library.laws.updated_at — laws are written first), and a row
--   with an earlier time is exactly a row his comparison called left-behind.
--   The file refuses, changing nothing, unless:
--   - the laws were all written by one load after 2026-11-10;
--   - the ten other loaded tables have no old row (the load ran to the end);
--   - each of the four tables has exactly the number of old rows passed;
--   - no new article or chapter points at an old chapter;
--   - no saved item or issue report points at an old article that has no
--     new id (a real removal — the team decides those by hand).
--   An old article «has a new id» when the same law has, written by this load,
--   the old id without its status suffix.
--
-- SAFE TO RE-RUN: a second run finds 0 old rows; pass 0 for all four.
-- =============================================================================

begin;

set local nzamy.expected_articles    = :'articles';
set local nzamy.expected_amendments  = :'amendments';
set local nzamy.expected_regulations = :'regulations';
set local nzamy.expected_chapters    = :'chapters';

do $$
declare
  v_cutoff timestamptz;
  v_spread interval;
  v_exp_art text := coalesce(current_setting('nzamy.expected_articles', true), '');
  v_exp_amd text := coalesce(current_setting('nzamy.expected_amendments', true), '');
  v_exp_reg text := coalesce(current_setting('nzamy.expected_regulations', true), '');
  v_exp_ch  text := coalesce(current_setting('nzamy.expected_chapters', true), '');
  v_old_art bigint;
  v_old_amd bigint;
  v_old_reg bigint;
  v_old_ch  bigint;
  v_new_amd bigint;
  v_new_reg bigint;
  v_unpaired bigint;
  v_stray text;
  v_bad bigint;
  v_items bigint;
  v_reports bigint;
  v_del_reg bigint;
  v_del_amd bigint;
  v_del_art bigint;
  v_del_ch  bigint;
begin
  if v_exp_art !~ '^[0-9]+$' or v_exp_amd !~ '^[0-9]+$'
     or v_exp_reg !~ '^[0-9]+$' or v_exp_ch !~ '^[0-9]+$' then
    raise exception 'library cleanup: pass the owner''s four leftBehind numbers as -v articles=… -v amendments=… -v regulations=… -v chapters=… — nothing was changed.';
  end if;

  select min(updated_at), max(updated_at) - min(updated_at) into v_cutoff, v_spread from library.laws;
  if v_cutoff is null or v_cutoff < timestamptz '2026-11-10 00:00+00' then
    raise exception 'library cleanup: the library has not been loaded with the 2026-11-10 code yet (laws written %) — nothing was changed.', v_cutoff;
  end if;
  if v_spread > interval '6 hours' then
    raise exception 'library cleanup: library.laws rows come from loads % apart (a law was left behind?) — nothing was changed. Send this to the team.', v_spread;
  end if;

  -- The load ran to the end: every other loaded table was fully rewritten.
  select string_agg(t || ' ' || n, ', ') into v_stray from (
    select 'decrees_circulars' t, count(*) n from library.decrees_circulars where updated_at < v_cutoff
    union all select 'decree_pages', count(*) from library.decree_pages where updated_at < v_cutoff
    union all select 'judicial_collections', count(*) from library.judicial_collections where updated_at < v_cutoff
    union all select 'principles', count(*) from library.principles where updated_at < v_cutoff
    union all select 'principle_paragraphs', count(*) from library.principle_paragraphs where updated_at < v_cutoff
    union all select 'feqh_books', count(*) from library.feqh_books where updated_at < v_cutoff
    union all select 'feqh_chapters', count(*) from library.feqh_chapters where updated_at < v_cutoff
    union all select 'feqh_sections', count(*) from library.feqh_sections where updated_at < v_cutoff
    union all select 'feqh_blocks', count(*) from library.feqh_blocks where updated_at < v_cutoff
  ) s where n > 0;
  if v_stray is not null then
    raise exception 'library cleanup: old rows in tables this file does not touch (%) — the load did not finish, or the owner''s comparison was not left-behind 0 there. Nothing was changed. Send this to the team.', v_stray;
  end if;

  select count(*) into v_old_art from library.articles where updated_at < v_cutoff;
  select count(*) into v_old_amd from library.article_amendments where updated_at < v_cutoff;
  select count(*) into v_old_reg from library.article_regulations where updated_at < v_cutoff;
  select count(*) into v_old_ch  from library.chapters where updated_at < v_cutoff;
  if v_old_art <> v_exp_art::bigint or v_old_amd <> v_exp_amd::bigint
     or v_old_reg <> v_exp_reg::bigint or v_old_ch <> v_exp_ch::bigint then
    raise exception 'library cleanup: old rows here — articles %, amendments %, regulations %, chapters % — but % / % / % / % was passed. Nothing was changed. Send both lines to the team.',
      v_old_art, v_old_amd, v_old_reg, v_old_ch, v_exp_art, v_exp_amd, v_exp_reg, v_exp_ch;
  end if;

  if exists (select 1 from library.articles a join library.chapters c on c.id = a.chapter_id
              where a.updated_at >= v_cutoff and c.updated_at < v_cutoff)
     or exists (select 1 from library.chapters a join library.chapters c on c.id = a.parent_chapter_id
              where a.updated_at >= v_cutoff and c.updated_at < v_cutoff) then
    raise exception 'library cleanup: a new article or chapter sits under an old chapter — nothing was changed. Send this to the team.';
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

  select count(*) into v_unpaired from _old_article where new_id is null;

  select count(*) into v_bad
    from _old_article o
   where o.new_id is null
     and (exists (select 1 from library.smart_folder_items i
                   where i.entity_type = 'article' and i.entity_id = o.old_id)
          or exists (select 1 from library.issue_reports r
                      where r.entity_type = 'article' and r.entity_id = o.old_id));
  if v_bad > 0 then
    raise exception 'library cleanup: % removed articles (no new id) are in a user''s saved items or issue reports — nothing was changed. Send this to the team.', v_bad;
  end if;

  update library.smart_folder_items i
     set entity_id = o.new_id
    from _old_article o
   where o.new_id is not null and i.entity_type = 'article' and i.entity_id = o.old_id;
  get diagnostics v_items = row_count;

  update library.issue_reports r
     set entity_id = o.new_id
    from _old_article o
   where o.new_id is not null and r.entity_type = 'article' and r.entity_id = o.old_id;
  get diagnostics v_reports = row_count;

  select count(*) into v_new_amd from library.article_amendments where updated_at >= v_cutoff;
  select count(*) into v_new_reg from library.article_regulations where updated_at >= v_cutoff;

  -- Children first, by their own time; then articles; then chapters.
  delete from library.article_regulations where updated_at < v_cutoff;
  get diagnostics v_del_reg = row_count;
  delete from library.article_amendments where updated_at < v_cutoff;
  get diagnostics v_del_amd = row_count;
  delete from library.articles where updated_at < v_cutoff;
  get diagnostics v_del_art = row_count;
  delete from library.chapters where updated_at < v_cutoff;
  get diagnostics v_del_ch = row_count;

  if v_del_art <> v_old_art or v_del_amd <> v_old_amd
     or v_del_reg <> v_old_reg or v_del_ch <> v_old_ch then
    raise exception 'library cleanup: deleted % / % / % / % but expected % / % / % / % — rolling back.',
      v_del_art, v_del_amd, v_del_reg, v_del_ch, v_old_art, v_old_amd, v_old_reg, v_old_ch;
  end if;
  if (select count(*) from library.article_amendments) <> v_new_amd
     or (select count(*) from library.article_regulations) <> v_new_reg then
    raise exception 'library cleanup: a row written by this load was removed — rolling back.';
  end if;
  if exists (select 1 from library.articles where updated_at < v_cutoff)
     or exists (select 1 from library.article_amendments where updated_at < v_cutoff)
     or exists (select 1 from library.article_regulations where updated_at < v_cutoff)
     or exists (select 1 from library.chapters where updated_at < v_cutoff) then
    raise exception 'library cleanup: old rows remain after the delete — rolling back.';
  end if;

  raise notice 'library cleanup: removed % articles (% moved to a new id, % removed from the owner''s files), % amendments, % regulations, % chapters; moved % saved items and % issue reports.',
    v_del_art, v_del_art - v_unpaired, v_unpaired, v_del_amd, v_del_reg, v_del_ch, v_items, v_reports;
end $$;

commit;

-- CHECK — expect 0 in all four old_* columns.
select (select count(*) from library.articles a where a.updated_at < (select min(updated_at) from library.laws))            as old_articles,
       (select count(*) from library.article_amendments a where a.updated_at < (select min(updated_at) from library.laws))  as old_amendments,
       (select count(*) from library.article_regulations a where a.updated_at < (select min(updated_at) from library.laws)) as old_regulations,
       (select count(*) from library.chapters a where a.updated_at < (select min(updated_at) from library.laws))            as old_chapters,
       (select count(*) from library.articles) as articles;
