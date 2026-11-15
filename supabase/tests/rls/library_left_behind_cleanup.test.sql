-- library_left_behind_cleanup.test.sql — proves
-- supabase/one-time/library_left_behind_cleanup.sql on
-- prelude_library_left_behind_fixture.sql. run.sh has no -v, so \set lines
-- prepended to a copy stand in for `-v articles=1 -v chapters=1
-- -v feqh_chapters=1 -v feqh_sections=2 -v feqh_blocks=3`; the other eight
-- tables take the file's default 0. Chain (run.sh, postgres:16), repo root:
-- the migration chain listed in library_article_id_cleanup.test.sql, then
--   supabase/tests/rls/prelude_library_left_behind_fixture.sql
--   supabase/one-time/library_left_behind_preview.sql
--   <the cleanup with the five \set lines prepended>
--   supabase/tests/rls/library_left_behind_cleanup.test.sql
-- Refusals (same chain, must fail and change nothing): feqh_blocks not
-- passed; nothing passed; a saved item on blk-old1; an old law (the cutoff
-- is then two days old).

do $$
begin
  if exists (select 1 from library.articles where id = 'lbl__art-2-amended')
     or exists (select 1 from library.chapters where id = '00000000-0000-4000-8000-0000000000c0')
     or exists (select 1 from library.feqh_chapters where id = '00000000-0000-4000-8000-0000000000d0')
     or exists (select 1 from library.feqh_sections where id in ('00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000e2'))
     or exists (select 1 from library.feqh_blocks where id like 'blk-old%') then
    raise exception 'T1 FAIL: an old row survived';
  end if;
  if (select count(*) from library.articles) <> 1 or (select count(*) from library.chapters) <> 1
     or (select count(*) from library.feqh_chapters) <> 1 or (select count(*) from library.feqh_sections) <> 1
     or (select count(*) from library.feqh_blocks) <> 1 or (select count(*) from library.feqh_books) <> 1 then
    raise exception 'T2 FAIL: a row written by the load was removed';
  end if;
  if not exists (select 1 from library.smart_folder_items where entity_id = 'lbl__art-2')
     or not exists (select 1 from library.smart_folder_items where entity_id = 'blk-new') then
    raise exception 'T3 FAIL: saved items not moved / an untouched one changed';
  end if;
  raise notice 'library_left_behind_cleanup: T1-T3 passed';
end $$;
