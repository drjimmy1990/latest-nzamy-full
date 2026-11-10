-- library_article_id_cleanup.test.sql — proves
-- supabase/one-time/2026-11-10_library_article_id_cleanup_2_apply.sql with the
-- number passed (3 here; run.sh has no -v, so sed stands in for
-- `-v expected=3`). Without the number the file stops on a syntax error.
-- Chain (run.sh, postgres:16), from the repo root:
--   M=supabase/migrations
--   sed "s/:'expected'/'3'/" supabase/one-time/2026-11-10_library_article_id_cleanup_2_apply.sql > /tmp/cleanup_typed.sql
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
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

do $$
begin
  -- T1 the three old rows are gone; the new ones, the shared pair and the
  -- articles without a number stay
  if exists (select 1 from library.articles where id in ('idlaw__art-2-amended', 'idlaw__art-3-repealed', 'idlaw__art-i0-repealed')) then
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

  -- T2 the old amendment went with its article, the new one stays
  if exists (select 1 from library.article_amendments where article_id = 'idlaw__art-2-amended') then
    raise exception 'T2 FAIL: the old amendment survived';
  end if;
  if not exists (select 1 from library.article_amendments where article_id = 'idlaw__art-2') then
    raise exception 'T2 FAIL: the new amendment was removed';
  end if;

  -- T3 the saved item and the issue report follow the article to its new id
  if not exists (select 1 from library.smart_folder_items where entity_id = 'idlaw__art-2') then
    raise exception 'T3 FAIL: the saved item was not moved';
  end if;
  if not exists (select 1 from library.smart_folder_items where entity_id = 'idlaw__art-10-added') then
    raise exception 'T3 FAIL: an untouched saved item changed';
  end if;
  if not exists (select 1 from library.issue_reports where entity_id = 'idlaw__art-3') then
    raise exception 'T3 FAIL: the issue report was not moved';
  end if;

  raise notice 'library_article_id_cleanup: T1-T3 passed';
end $$;
