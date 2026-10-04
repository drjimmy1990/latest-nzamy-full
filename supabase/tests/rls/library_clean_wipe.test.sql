-- library_clean_wipe.test.sql — proves supabase/one-time/2026-10-04_library_clean_wipe.sql.
-- The one-time file runs AS WRITTEN (all 4 blocks, as the team pastes it), after a
-- fixture that fills the 14 content tables and the 4 user tables.
-- Chain (run.sh, postgres:16):
--   the 20261004_01 column-lock chain → 20261004_02_library_chapter_levels.sql →
--   prelude_library_clean_wipe_fixture.sql → 2026-10-04_library_clean_wipe.sql → this file
-- Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261004_02_library_chapter_levels.sql \
--     supabase/tests/rls/prelude_library_clean_wipe_fixture.sql \
--     supabase/one-time/2026-10-04_library_clean_wipe.sql \
--     supabase/tests/rls/library_clean_wipe.test.sql
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the 14 content tables are empty.
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'laws', 'chapters', 'articles', 'article_amendments', 'article_regulations',
    'decrees_circulars', 'decree_pages', 'judicial_collections', 'principles',
    'principle_paragraphs', 'feqh_books', 'feqh_chapters', 'feqh_sections', 'feqh_blocks']
  loop
    execute format('select count(*) from library.%I', t) into n;
    if n <> 0 then raise exception 'T1: library.% still has % rows', t, n; end if;
  end loop;
  raise notice 'T1 ok — 14 content tables empty';
end $$;

-- T2 the 4 user tables are untouched (folder item still points at the old article id).
do $$
begin
  if (select count(*) from library.smart_folders) <> 1 then raise exception 'T2: smart_folders lost'; end if;
  if (select count(*) from library.smart_folder_items where entity_id = 'wipe-law__art-1') <> 1 then
    raise exception 'T2: smart_folder_items lost';
  end if;
  if (select count(*) from library.issue_reports) <> 1 then raise exception 'T2: issue_reports lost'; end if;
  if (select count(*) from library.invitations where code = 'WIPE-TEST') <> 1 then
    raise exception 'T2: invitations lost';
  end if;
  if (select count(*) from auth.users) <> 1 then raise exception 'T2: auth.users touched'; end if;
  raise notice 'T2 ok — users'' folders, items, reports and invitations kept';
end $$;

-- T3 the wipe kept the schema: grants, the column lock and the chapter levels.
do $$
begin
  if not has_table_privilege('anon', 'library.laws', 'SELECT')
     and not has_any_column_privilege('anon', 'library.laws', 'SELECT') then
    raise exception 'T3: anon lost its read on library.laws';
  end if;
  if has_column_privilege('anon', 'library.laws', 'preamble', 'SELECT')
     or has_column_privilege('anon', 'library.judicial_collections', 'metadata', 'SELECT') then
    raise exception 'T3: the column lock (laws.preamble, judicial_collections.metadata) is gone';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'library' and table_name = 'chapters' and column_name = 'level') then
    raise exception 'T3: chapters.level is gone';
  end if;
  raise notice 'T3 ok — grants, column lock and chapter levels kept';
end $$;

-- T4 the tables load again right after the wipe (no leftover identity/constraint trouble).
insert into library.laws (slug, title, type, section_code) values ('wipe-law', 'نظام اختباري', 'نظام', '00');
insert into library.articles (id, law_slug, number, text, status)
  values ('wipe-law__art-1', 'wipe-law', '1', 'نص المادة', 'active');
do $$
begin
  if (select count(*) from library.articles) <> 1 then raise exception 'T4: reload failed'; end if;
  raise notice 'T4 ok — a reload after the wipe inserts cleanly';
end $$;

-- T5 a foreign key from OUTSIDE the 14 into them makes the TRUNCATE fail (no CASCADE),
-- instead of silently emptying that table too.
create table library.wipe_probe (law_slug text references library.laws(slug));
insert into library.wipe_probe values ('wipe-law');
do $$
begin
  begin
    truncate table library.article_amendments, library.article_regulations, library.articles,
      library.chapters, library.laws, library.decree_pages, library.decrees_circulars,
      library.principle_paragraphs, library.principles, library.judicial_collections,
      library.feqh_blocks, library.feqh_sections, library.feqh_chapters, library.feqh_books;
    raise exception 'T5: TRUNCATE went through despite an outside foreign key';
  exception when feature_not_supported then
    null; -- 0A000 "cannot truncate a table referenced in a foreign key constraint"
  end;
  if (select count(*) from library.wipe_probe) <> 1 then raise exception 'T5: outside table emptied'; end if;
  raise notice 'T5 ok — an outside foreign key blocks the wipe instead of being cascaded';
end $$;
drop table library.wipe_probe;

-- T6 the file AS WRITTEN (the `set local` confirm line still commented out) wipes
-- nothing: the whole file is run again — like Run in Studio with no selection —
-- with the confirmation cleared. /tmp/mig17.sql is the one-time file: it is the
-- 17th file of the chain above (15 migrations, the fixture, the wipe).
-- Its expected output: ERROR "library clean wipe: NOT confirmed", then
-- "current transaction is aborted" for the statements after it, and ROLLBACK.
set nzamy.confirm_wipe = '';
\set ON_ERROR_STOP off
\i /tmp/mig17.sql
\set ON_ERROR_STOP on
reset nzamy.confirm_wipe;
do $$
begin
  if (select count(*) from library.laws) <> 1 or (select count(*) from library.articles) <> 1 then
    raise exception 'T6: the unconfirmed file emptied the library';
  end if;
  raise notice 'T6 ok — the file as written (confirm line commented out) wiped nothing';
end $$;
