-- library_article_id_cleanup.test.sql — proves
-- supabase/one-time/2026-11-10_library_article_id_cleanup_2_apply.sql with the
-- fixture's four numbers passed (run.sh has no -v, so sed stands in for
-- `-v articles=4 -v amendments=3 -v regulations=2 -v chapters=1`). Without the
-- numbers the file stops on a syntax error.
-- Chain (run.sh, postgres:16), from the repo root:
--   M=supabase/migrations
--   sed -e "s/:'articles'/'4'/" -e "s/:'amendments'/'3'/" -e "s/:'regulations'/'2'/" -e "s/:'chapters'/'1'/" \
--     supabase/one-time/2026-11-10_library_article_id_cleanup_2_apply.sql > /tmp/cleanup_typed.sql
--   bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261004_02_library_chapter_levels.sql \
--     supabase/tests/rls/prelude_library_article_id_cleanup_fixture.sql \
--     supabase/one-time/2026-11-10_library_article_id_cleanup_1_preview.sql \
--     /tmp/cleanup_typed.sql \
--     supabase/tests/rls/library_article_id_cleanup.test.sql
-- Refusals: the same chain with one number changed (each of the four), or
-- with a saved item on idlaw__art-49 added to the fixture, must fail and
-- leave the old rows in place.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

do $$
begin
  -- T1 the four old articles are gone (three moved to a new id, one removed);
  -- the new ones, the shared pair and the articles without a number stay
  if exists (select 1 from library.articles
              where id in ('idlaw__art-2-amended', 'idlaw__art-3-repealed', 'idlaw__art-i0-repealed', 'idlaw__art-49')) then
    raise exception 'T1 FAIL: an old article survived';
  end if;
  if (select count(*) from library.articles) <> 8 then
    raise exception 'T1 FAIL: expected 8 articles, found %', (select count(*) from library.articles);
  end if;
  if (select count(*) from library.articles where id in ('idlaw__art-i0', 'idlaw__art-i1')) <> 2 then
    raise exception 'T1 FAIL: an article without a number was removed';
  end if;
  if (select count(*) from library.articles where id in ('idlaw__art-10', 'idlaw__art-10-added')) <> 2 then
    raise exception 'T1 FAIL: the shared-number pair lost a row';
  end if;

  -- T2 every old amendment is gone — under a removed article and under a
  -- surviving one — and the two new ones stay
  if exists (select 1 from library.article_amendments where summary = 'قديم') then
    raise exception 'T2 FAIL: an old amendment survived';
  end if;
  if (select count(*) from library.article_amendments) <> 2 then
    raise exception 'T2 FAIL: expected 2 amendments, found %', (select count(*) from library.article_amendments);
  end if;

  -- T3 every old regulation is gone, the new one stays
  if (select count(*) from library.article_regulations) <> 1
     or not exists (select 1 from library.article_regulations where id = '00000000-0000-4000-8000-0000000000f2') then
    raise exception 'T3 FAIL: regulations are not exactly the new one';
  end if;

  -- T4 the old chapter is gone, the new one stays with its articles
  if exists (select 1 from library.chapters where id = '00000000-0000-4000-8000-0000000000c0') then
    raise exception 'T4 FAIL: the old chapter survived';
  end if;
  if (select count(*) from library.articles where chapter_id = '00000000-0000-4000-8000-0000000000c1') <> 3 then
    raise exception 'T4 FAIL: the new chapter lost its articles';
  end if;

  -- T5 the saved item and the issue report follow the article to its new id
  if not exists (select 1 from library.smart_folder_items where entity_id = 'idlaw__art-2') then
    raise exception 'T5 FAIL: the saved item was not moved';
  end if;
  if not exists (select 1 from library.smart_folder_items where entity_id = 'idlaw__art-10-added') then
    raise exception 'T5 FAIL: an untouched saved item changed';
  end if;
  if not exists (select 1 from library.issue_reports where entity_id = 'idlaw__art-3') then
    raise exception 'T5 FAIL: the issue report was not moved';
  end if;

  raise notice 'library_article_id_cleanup: T1-T5 passed';
end $$;
