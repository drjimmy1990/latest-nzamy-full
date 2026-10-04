-- library_chapter_levels.test.sql — proves 20261004_02 (two-level chapters).
-- Chain (run.sh, postgres:16) — the migration is listed TWICE to prove it is idempotent:
--   20260626_legal_library_schema.sql → 20260627_platform_settings.sql →
--   20260729_library_status.sql → 20260730_article_regulations.sql →
--   20260824_laws_effective_date_gregorian_columns.sql →
--   20260911_library_laws_enactment_gazette_schema.sql →
--   20260922_01_library_grants.sql → 20260922_04_library_view_security_invoker.sql →
--   20260929_01_library_text_server_only.sql →
--   20261004_02_library_chapter_levels.sql → 20261004_02_library_chapter_levels.sql → this file
-- Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260729_library_status.sql $M/20260730_article_regulations.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql $M/20260911_library_laws_enactment_gazette_schema.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_02_library_chapter_levels.sql $M/20261004_02_library_chapter_levels.sql \
--     supabase/tests/rls/library_chapter_levels.test.sql
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- Fixture: one law; an old-style chapter written WITHOUT the new columns, then a
-- باب › فصل pair written by the new seeder shape.
insert into library.laws (slug, title, type, section_code)
  values ('levels-law', 'نظام اختباري', 'نظام', '00');
insert into library.chapters (id, law_slug, number, title, order_index)
  values ('00000000-0000-5000-8000-000000000001', 'levels-law', 1, 'باب قديم بلا مستوى', 1);
insert into library.chapters (id, law_slug, number, title, order_index, level, parent_chapter_id)
  values ('00000000-0000-5000-8000-000000000010', 'levels-law', 1, 'الباب الأول', 1, 1, null),
         ('00000000-0000-5000-8000-000000000011', 'levels-law', 1, 'الفصل الأول', 1, 2, '00000000-0000-5000-8000-000000000010'),
         ('00000000-0000-5000-8000-000000000012', 'levels-law', 2, 'الفصل الثاني', 2, 2, '00000000-0000-5000-8000-000000000010');

-- T1 an old-style insert reads level 1 / no parent (old writers and readers keep working)
do $$
declare
  lvl smallint;
  par uuid;
begin
  select level, parent_chapter_id into lvl, par
    from library.chapters where id = '00000000-0000-5000-8000-000000000001';
  if lvl is distinct from 1::smallint or par is not null then
    raise exception 'T1 FAIL: old-style chapter reads level=% parent=%', lvl, par;
  end if;
  raise notice 'T1 PASS: a chapter inserted without the new columns is level 1 with no parent';
end $$;

-- T2 level outside 1..2 is refused
do $$
begin
  begin
    insert into library.chapters (law_slug, number, title, level) values ('levels-law', 9, 'مستوى ثالث', 3);
    raise exception 'T2 FAIL: level 3 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into library.chapters (law_slug, number, title, level) values ('levels-law', 9, 'مستوى صفر', 0);
    raise exception 'T2 FAIL: level 0 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into library.chapters (law_slug, number, title, level) values ('levels-law', 9, 'مستوى فارغ', null);
    raise exception 'T2 FAIL: level NULL accepted';
  exception when not_null_violation then null;
  end;
  raise notice 'T2 PASS: level 0, 3 and NULL are refused';
end $$;

-- T3 parent must exist; only a level-2 chapter may have one, never itself
do $$
begin
  begin
    insert into library.chapters (law_slug, number, title, level, parent_chapter_id)
      values ('levels-law', 9, 'أب غير موجود', 2, '00000000-0000-5000-8000-0000000000ff');
    raise exception 'T3 FAIL: a dangling parent_chapter_id was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into library.chapters (law_slug, number, title, level, parent_chapter_id)
      values ('levels-law', 9, 'مستوى أول له أب', 1, '00000000-0000-5000-8000-000000000010');
    raise exception 'T3 FAIL: a level-1 chapter with a parent was accepted';
  exception when check_violation then null;
  end;
  begin
    update library.chapters set parent_chapter_id = id where id = '00000000-0000-5000-8000-000000000011';
    raise exception 'T3 FAIL: a chapter became its own parent';
  exception when check_violation then null;
  end;
  raise notice 'T3 PASS: dangling parent, level-1-with-parent and self-parent are refused';
end $$;

-- T4 the seeder's upsert shape (insert … on conflict (id) do update) writes and resets both columns
set role service_role;
do $$
declare
  lvl smallint;
  par uuid;
begin
  insert into library.chapters (id, law_slug, number, title, order_index, level, parent_chapter_id)
    values ('00000000-0000-5000-8000-000000000012', 'levels-law', 2, 'الفصل الثاني', 2, 1, null)
    on conflict (id) do update
      set level = excluded.level, parent_chapter_id = excluded.parent_chapter_id, title = excluded.title;
  select level, parent_chapter_id into lvl, par from library.chapters where id = '00000000-0000-5000-8000-000000000012';
  if lvl <> 1 or par is not null then
    raise exception 'T4 FAIL: re-seed did not reset the chapter to level 1 (level=% parent=%)', lvl, par;
  end if;
  insert into library.chapters (id, law_slug, number, title, order_index, level, parent_chapter_id)
    values ('00000000-0000-5000-8000-000000000012', 'levels-law', 2, 'الفصل الثاني', 2, 2, '00000000-0000-5000-8000-000000000010')
    on conflict (id) do update
      set level = excluded.level, parent_chapter_id = excluded.parent_chapter_id;
  select level, parent_chapter_id into lvl, par from library.chapters where id = '00000000-0000-5000-8000-000000000012';
  if lvl <> 2 or par is distinct from '00000000-0000-5000-8000-000000000010'::uuid then
    raise exception 'T4 FAIL: re-seed did not restore the link (level=% parent=%)', lvl, par;
  end if;
  raise notice 'T4 PASS: service_role upserts set and reset level / parent_chapter_id';
end $$;
reset role;

-- T5 anon (the law-detail route reads chapters with the request client, select *) reads both columns
set role anon;
do $$
declare
  n_children int;
  n_all      int;
begin
  select count(*) into n_all from library.chapters where law_slug = 'levels-law';
  select count(*) into n_children
    from library.chapters
   where law_slug = 'levels-law' and level = 2 and parent_chapter_id = '00000000-0000-5000-8000-000000000010';
  if n_all <> 4 or n_children <> 2 then
    raise exception 'T5 FAIL: anon reads % chapters and % children (expected 4 and 2)', n_all, n_children;
  end if;
  perform * from library.chapters limit 1;  -- the route's select('*') shape
  raise notice 'T5 PASS: anon reads level and parent_chapter_id (4 chapters, 2 children of the باب)';
end $$;
reset role;

set role app_user;
do $$
declare n int;
begin
  select count(*) into n from library.chapters where level = 2;
  if n <> 2 then
    raise exception 'T5b FAIL: a signed-in reader sees % level-2 chapters (expected 2)', n;
  end if;
  raise notice 'T5b PASS: a signed-in (authenticated) reader reads the hierarchy too';
end $$;
reset role;

-- T6 anon still cannot write chapters
set role anon;
do $$
begin
  begin
    update library.chapters set level = 2 where id = '00000000-0000-5000-8000-000000000001';
    raise exception 'T6 FAIL: anon updated library.chapters';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T6 PASS: anon cannot write library.chapters';
end $$;
reset role;

-- T7 deleting a باب keeps its فصول (parent set to NULL), never their articles
insert into library.articles (id, law_slug, chapter_id, number, text, status)
  values ('levels-law__art-1', 'levels-law', '00000000-0000-5000-8000-000000000011', '1', 'نص المادة الأولى', 'active');
delete from library.chapters where id = '00000000-0000-5000-8000-000000000010';
do $$
declare
  n_children int;
  n_orphans  int;
  art_chapter uuid;
begin
  select count(*) into n_children from library.chapters where level = 2;
  select count(*) into n_orphans from library.chapters where level = 2 and parent_chapter_id is null;
  select chapter_id into art_chapter from library.articles where id = 'levels-law__art-1';
  if n_children <> 2 or n_orphans <> 2 or art_chapter is distinct from '00000000-0000-5000-8000-000000000011'::uuid then
    raise exception 'T7 FAIL: after deleting the باب: children=% orphans=% article chapter=%', n_children, n_orphans, art_chapter;
  end if;
  raise notice 'T7 PASS: deleting a level-1 chapter leaves its level-2 chapters (parent NULL) and their articles';
end $$;

-- T8 constraints, FK action, indexes and column grants are as the migration states
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'library.chapters'::regclass
                  and conname = 'chapters_parent_chapter_id_fkey' and confdeltype = 'n') then
    raise exception 'T8 FAIL: parent FK missing or not ON DELETE SET NULL';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'library.chapters'::regclass
       and conname in ('chapters_level_check', 'chapters_parent_shape_check', 'chapters_parent_chapter_id_fkey')) <> 3 then
    raise exception 'T8 FAIL: a constraint is missing or duplicated after two runs';
  end if;
  if to_regclass('library.idx_chapters_law_slug_order_index') is null
     or to_regclass('library.idx_chapters_parent_order_index') is null then
    raise exception 'T8 FAIL: an index is missing';
  end if;
  if not has_column_privilege('anon', 'library.chapters', 'parent_chapter_id', 'SELECT')
     or not has_column_privilege('authenticated', 'library.chapters', 'level', 'SELECT') then
    raise exception 'T8 FAIL: the column grants are missing';
  end if;
  raise notice 'T8 PASS: constraints (once each after two runs), FK on delete set null, both indexes, column grants';
end $$;

-- T9 the explicit column grants are recorded on the two columns themselves (not
-- only implied by the table grant), so a later move of chapters to column-level
-- grants that re-grants per column keeps them readable.
do $$
declare
  c text;
begin
  foreach c in array array['level', 'parent_chapter_id']
  loop
    if not exists (
      select 1
        from pg_attribute a, aclexplode(a.attacl) acl
       where a.attrelid = 'library.chapters'::regclass and a.attname = c
         and acl.grantee = 'anon'::regrole and acl.privilege_type = 'SELECT'
    ) then
      raise exception 'T9 FAIL: no explicit anon column grant on chapters.%', c;
    end if;
  end loop;
  raise notice 'T9 PASS: anon holds explicit column-level SELECT on level and parent_chapter_id';
end $$;
